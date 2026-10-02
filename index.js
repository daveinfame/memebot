// ========= ⚡️M3M3B0T⚡️ REAL TRADING — v3 (refactor final) =========
require('dotenv').config();

// ---------- Dependencies ----------
const http = require('http');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const { Pool } = require('pg');
const {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const bs58 = require('bs58');

// ---------- Logger ----------
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = process.env.LOG_LEVEL
  ? (LOG_LEVELS[process.env.LOG_LEVEL.toLowerCase()] ?? LOG_LEVELS.info)
  : LOG_LEVELS.info;

function log(level, ...args) {
  if ((LOG_LEVELS[level] ?? LOG_LEVELS.info) <= CURRENT_LEVEL) {
    const prefix = `[${new Date().toISOString()}][${level.toUpperCase()}]`;
    console.log(prefix, ...args);
  }
}

// ---------- Validación de variables de entorno ----------
const REQUIRED_ENV = [
  'TELEGRAM_TOKEN',
  'CHAT_ID',
  'DATABASE_URL',
  'HELIUS_RPC_URL',
  'WALLET_PRIVATE_KEY',
  'JUPITER_API_KEY',
  'HELIUS_WEBHOOK_URL',
  'HELIUS_WEBHOOK_SECRET'
];

const FALTANTES = REQUIRED_ENV.filter((v) => !process.env[v]);
if (FALTANTES.length > 0) {
  for (const v of FALTANTES) {
    log('error', `Variable de entorno requerida falta: ${v}`);
  }
  process.exit(1);
}

if (process.env.HELIUS_WEBHOOK_SECRET.length < 32) {
  log('error', 'HELIUS_WEBHOOK_SECRET debe tener al menos 32 caracteres.');
  process.exit(1);
}

// ---------- Configuración ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const CHAT_ID = process.env.CHAT_ID;
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID || process.env.CHAT_ID);
const NOMBRE_BOT = '⚡️M3M3B0T⚡️';

const PUMP_PORTAL_WS = `wss://pumpportal.fun/api/data?api-key=${process.env.PUMPPORTAL_API_KEY}`;
const PUMP_PORTAL_TRADE = 'https://pumpportal.fun/api/trade-local';
const JUPITER_BASE = 'https://quote-api.jup.ag/v6';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PUMPPORTAL_WALLET = 'Guao96aNr7GUj3CSspwLy3tEccL3RUh5xVT4W3KNfBUH';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

const HELIUS_WEBHOOK_URL = process.env.HELIUS_WEBHOOK_URL;
const HELIUS_WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET;

const MINTS_A_IGNORAR = new Set([SOL_MINT, USDC_MINT]);

const LIVE = process.env.LIVE_TRADING === 'true';
const MODO_ACTUAL = LIVE ? 'real' : 'paper';

const DUST_MIN_SOL = parseFloat(process.env.DUST_MIN_SOL || '0.05');
const INITIAL_PAPER_BALANCE = parseFloat(process.env.INITIAL_USDC || '1000');
const PUMPFUN_FEE_PCT = parseFloat(process.env.PUMPFUN_FEE_PCT || '0.0125');
const NETWORK_FEE_SOL = parseFloat(process.env.NETWORK_FEE_SOL || '0.0005');
const RENT_CUENTA_NUEVA_SOL = parseFloat(process.env.RENT_CUENTA_NUEVA_SOL || '0.00204');
const OVERHEAD_RED_SOL = NETWORK_FEE_SOL + RENT_CUENTA_NUEVA_SOL;
const CONFIRMACIONES_NECESARIAS = parseInt(process.env.CONFIRMACIONES_NECESARIAS || '2', 10);
const ESPERA_LECTURA_SALDO_MS = parseInt(process.env.ESPERA_LECTURA_SALDO_MS || '1500', 10);
const STOP_LOSS_PCT = parseFloat(process.env.STOP_LOSS_PCT || '0.50');
const RETRASO_AVISO_MS = parseInt(process.env.RETRASO_AVISO_MS || '10000', 10);
const JUPITER_TIMEOUT_MS = parseInt(process.env.JUPITER_TIMEOUT_MS || '8000', 10);
const JUPITER_MAX_INTENTOS = parseInt(process.env.JUPITER_MAX_INTENTOS || '3', 10);
const DEFAULT_SLIPPAGE_BPS = parseInt(process.env.DEFAULT_SLIPPAGE_BPS || '10', 10);
const MAX_CACHE_SIZE = 500;
const MAX_BODY_BYTES = 512 * 1024;

// ---------- Estado global ----------
let connection = null;
let walletKeypair = null;
let ws = null;
let wsReconnectTimer = null;
let wsReconnectAttempts = 0;
let creandoWebhook = false;

const cacheTokenInfo = new Map();
const webhookRateMap = new Map();
const intervals = [];

// ---------- Utilidades ----------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function horaLocal(ms) {
  return new Date(ms).toLocaleTimeString('es-MX', {
    timeZone: 'America/Mexico_City',
    hour12: false
  });
}

function chequearRetraso(horaDeteccionMs, alias, symbol) {
  if (!horaDeteccionMs) return;
  const ahora = Date.now();
  const retrasoMs = ahora - horaDeteccionMs;
  if (retrasoMs > RETRASO_AVISO_MS) {
    log(
      'warn',
      `⚠️ DELAY DETECTADO: ${alias} (${symbol}) detectado a las ${horaLocal(horaDeteccionMs)} pero la copia se envió a las ${horaLocal(ahora)} (${Math.round(retrasoMs / 1000)}s de retraso) - posible saturación/rate limit`
    );
  }
}

function getHeliusApiKey() {
  try {
    const url = new URL(process.env.HELIUS_RPC_URL);
    return url.searchParams.get('api-key');
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function esAdmin(msg) {
  return String(msg?.chat?.id) === ADMIN_CHAT_ID;
}

function cacheSet(map, key, value) {
  if (map.size >= MAX_CACHE_SIZE) {
    const firstKey = map.keys().next().value;
    map.delete(firstKey);
  }
  map.set(key, value);
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array(Math.min(limit, items.length))
    .fill(0)
    .map(async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          results[idx] = await fn(items[idx], idx);
        } catch (e) {
          results[idx] = { error: e };
        }
      }
    });
  await Promise.all(workers);
  return results;
}

function numeroSeguro(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function linkTx(sig) {
  return `https://solscan.io/tx/${sig}`;
}

// ---------- Cadena ----------
const CHAIN_CONFIG = {
  sol: { id: 'solana', name: 'SOLANA' },
  solana: { id: 'solana', name: 'SOLANA' },
  eth: { id: 'eth', name: 'ETH' },
  base: { id: 'base', name: 'BASE' },
  bsc: { id: 'bnb', name: 'BSC' },
  bnb: { id: 'bnb', name: 'BSC' },
  rh: { id: 'rh', name: 'ROBINHOOD CHAIN 4663' },
  robinhood: { id: 'rh', name: 'ROBINHOOD CHAIN 4663' },
  hype: { id: 'hyperliquid', name: 'HYPE EVM 999' },
  hyperliquid: { id: 'hyperliquid', name: 'HYPE EVM 999' }
};

function normalizeChain(c) {
  const key = (c || 'sol').toLowerCase();
  const cfg = CHAIN_CONFIG[key];
  if (!cfg) {
    log('warn', `Chain desconocida "${c}", usando solana por defecto`);
    return 'solana';
  }
  return cfg.id;
}

function getLabel(c) {
  const f = Object.values(CHAIN_CONFIG).find((v) => v.id === c);
  return f ? f.name : String(c || '').toUpperCase();
}

// ---------- Inicialización de Solana ----------
try {
  if (process.env.HELIUS_RPC_URL) {
    connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
  }
  if (process.env.WALLET_PRIVATE_KEY) {
    walletKeypair = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY));
  }
  if (walletKeypair) {
    log('info', `Wallet Solana cargada: ${walletKeypair.publicKey.toBase58()}`);
  }
} catch (e) {
  log('error', `Error cargando wallet/RPC de Solana: ${e.message}`);
  process.exit(1);
}

// ---------- Jupiter con reintento ----------
async function fetchJupiterConReintento(url, opts = {}) {
  let ultimoError = null;
  for (let intento = 1; intento <= JUPITER_MAX_INTENTOS; intento++) {
    try {
      const res = await fetch(url, {
        ...opts,
        signal: AbortSignal.timeout(JUPITER_TIMEOUT_MS)
      });
      if (res.status === 429) {
        const espera = 1000 * Math.pow(2, intento);
        log(
          'warn',
          `Jupiter rate limited (429), esperando ${espera}ms (intento ${intento}/${JUPITER_MAX_INTENTOS})`
        );
        await sleep(espera);
        continue;
      }
      return res;
    } catch (e) {
      ultimoError = e;
      const espera = 1000 * Math.pow(2, intento);
      log(
        'warn',
        `Jupiter fetch falló (${e.message}), esperando ${espera}ms (intento ${intento}/${JUPITER_MAX_INTENTOS})`
      );
      if (intento < JUPITER_MAX_INTENTOS) await sleep(espera);
    }
  }
  throw ultimoError || new Error('Jupiter: se agotaron los reintentos');
}

// ---------- Error on-chain ----------
function describirErrorOnChain(errValue) {
  try {
    if (errValue && errValue.InstructionError) {
      const [idx, detalle] = errValue.InstructionError;
      if (detalle && typeof detalle === 'object' && 'Custom' in detalle) {
        const codigoDecimal = detalle.Custom;
        const codigoHex = '0x' + codigoDecimal.toString(16);
        return {
          texto: `Instrucción #${idx} falló con código ${codigoHex} (${codigoDecimal})`,
          codigoHex
        };
      }
      return {
        texto: `Instrucción #${idx} falló: ${JSON.stringify(detalle)}`,
        codigoHex: null
      };
    }
    return { texto: JSON.stringify(errValue), codigoHex: null };
  } catch {
    return { texto: String(errValue), codigoHex: null };
  }
}

async function confirmarYVerificarTx(sig) {
  const confirmacion = await connection.confirmTransaction(sig, 'confirmed');
  if (confirmacion.value.err) {
    const info = describirErrorOnChain(confirmacion.value.err);
    throw new Error(
      `ON_CHAIN_FAIL ${info.codigoHex || ''}: ${info.texto} (tx: ${sig})`
    );
  }
}

function mensajeAmigableError(e) {
  const msgOriginal = (e && e.message) || '';
  const msg = msgOriginal.toLowerCase();

  if (/0x1786\b/.test(msgOriginal) || msg.includes('sellzeroamount')) {
    return '⚠️ Tu wallet no tiene nada de este token para vender (probablemente una compra anterior nunca se llegó a ejecutar de verdad).';
  }
  if (/0x1775\b/.test(msgOriginal) || msg.includes('bondingcurvecomplete')) {
    return '⚠️ Este token ya no está en la curva de pump.fun (se movió a otro exchange) y no se pudo enrutar automáticamente.';
  }
  if (/0x17af\b/.test(msgOriginal) || msg.includes('unsupportedquotemint')) {
    return '⚠️ Este token usa un pool con una moneda base distinta a SOL — no se pudo operar automáticamente.';
  }
  if (/0x1774\b/.test(msgOriginal) || msg.includes('exceededslippage')) {
    return '⚠️ El precio se movió más de lo permitido (slippage) y la operación no se completó.';
  }
  if (msg.includes('insufficient') || msg.includes('debit an account')) {
    return '⚠️ No había suficiente SOL en la wallet para completar esta operación.';
  }
  if (msg.includes('slippage')) {
    return '⚠️ El precio se movió demasiado rápido (slippage) y la operación no se pudo completar.';
  }
  const codigoMatch = msgOriginal.match(/0x[0-9a-f]{2,6}\b/i);
  const codigo = codigoMatch ? codigoMatch[0] : null;
  return codigo
    ? `⚠️ No se pudo completar la operación (código: ${codigo}). Detalle completo en los logs de Railway.`
    : '⚠️ No se pudo completar la operación. Detalle completo en los logs de Railway.';
}

function esSellZeroAmount(e) {
  const msgOriginal = (e && e.message) || '';
  return /0x1786\b/.test(msgOriginal) || msgOriginal.toLowerCase().includes('sellzeroamount');
}

// ---------- Cálculos ----------
function estimarFees(costBasisSol, proceedsSol) {
  const feePumpFun = (costBasisSol + proceedsSol) * PUMPFUN_FEE_PCT;
  const feeRed = NETWORK_FEE_SOL * 2;
  return feePumpFun + feeRed;
}

function calcularResultado(costBasisSol, proceedsSolBruto, solPriceActual, netoDeFees) {
  const cost = Number.isFinite(costBasisSol) ? costBasisSol : 0;
  const proceeds = Number.isFinite(proceedsSolBruto) ? proceedsSolBruto : 0;
  const fees = netoDeFees ? estimarFees(cost, proceeds) : 0;
  const proceedsNetoSol = Math.max(proceeds - fees, 0);
  const profitSol = proceedsNetoSol - cost;
  const multiplicador = cost > 0 ? proceedsNetoSol / cost : 0;
  const pct = (multiplicador - 1) * 100;
  const profitUsd = solPriceActual ? profitSol * solPriceActual : null;
  return { fees, proceedsNetoSol, profitSol, multiplicador, pct, profitUsd };
}

function formatearResultado(r) {
  const emoji = r.profitSol < 0 ? '❌ PÉRDIDA' : '✅ Ganancia';
  const signo = r.profitSol < 0 ? '-' : '+';
  const usdTxt = r.profitUsd !== null ? ` (${signo}$${Math.abs(r.profitUsd).toFixed(2)})` : '';
  const pctTxt = `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%`;
  const multTxt = `${r.multiplicador.toFixed(2)}x`;
  return `${emoji}: ${Math.abs(r.profitSol).toFixed(4)} SOL${usdTxt} · ${pctTxt} · ${multTxt}`;
}

function usdToSolNeto(usd, solPrice) {
  const solBruto = usd / solPrice;
  const solMenosFeePump = solBruto / (1 + PUMPFUN_FEE_PCT);
  return Math.max(solMenosFeePump - OVERHEAD_RED_SOL, 0);
}

function bondingCurvePriceSol(trade) {
  if (!trade.vSolInBondingCurve || !trade.vTokensInBondingCurve) return null;
  return trade.vSolInBondingCurve / trade.vTokensInBondingCurve;
}

// ===== FIN BLOQUE 1 =====

// ---------- Cache de info de token ----------
async function getTokenInfoHelius(mint) {
  const cached = cacheTokenInfo.get(mint);
  if (cached) return cached;

  let symbol = mint.slice(0, 6) + '...';
  let decimals = 6;

  try {
    if (process.env.HELIUS_RPC_URL) {
      const res = await fetch(process.env.HELIUS_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'symbol-lookup',
          method: 'getAsset',
          params: { id: mint }
        })
      });
      const data = await res.json();
      if (data?.error) {
        log('warn', `DAS getAsset error para ${mint.slice(0, 6)}: ${JSON.stringify(data.error)}`);
      }
      const meta = data?.result?.content?.metadata;
      if (meta?.symbol) symbol = meta.symbol;
      else if (meta?.name) symbol = meta.name;
      if (data?.result?.token_info?.decimals !== undefined) {
        decimals = data.result.token_info.decimals;
      }
    }
  } catch (e) {
    log('warn', `No se pudo obtener info de ${mint.slice(0, 6)}: ${e.message}`);
  }

  const info = { symbol, decimals };
  cacheSet(cacheTokenInfo, mint, info);
  return info;
}

async function getTokenSymbol(mint) {
  const info = await getTokenInfoHelius(mint);
  return info.symbol;
}

// ---------- Holdings ----------
async function getHoldings(address) {
  if (!connection) {
    log('error', 'No hay conexión RPC, no se puede hacer snapshot real');
    return [];
  }
  try {
    const owner = new PublicKey(address);
    const [legacy, token2022] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
      connection
        .getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID })
        .catch(() => ({ value: [] }))
    ]);
    const todasLasCuentas = [...legacy.value, ...token2022.value];

    const conSaldo = todasLasCuentas
      .map((acc) => acc.account.data.parsed.info)
      .filter((info) => {
        const amt = parseFloat(info.tokenAmount?.uiAmount || 0);
        const dec = info.tokenAmount?.decimals ?? 0;
        if (amt <= 0) return false;
        if (dec === 0 && amt === 1) return false;
        return true;
      })
      .map((info) => ({ mint: info.mint }));

    return conSaldo;
  } catch (e) {
    log('error', `Error haciendo snapshot real de holdings: ${e.message}`);
    return [];
  }
}

async function getBalanceDeTokenEnWallet(walletAddress, mint) {
  if (!connection) return null;
  try {
    const owner = new PublicKey(walletAddress);
    const mintKey = new PublicKey(mint);
    const cuentas = await connection.getParsedTokenAccountsByOwner(owner, { mint: mintKey });
    let total = 0;
    for (const c of cuentas.value) {
      total += parseFloat(c.account.data.parsed.info.tokenAmount.uiAmount || 0);
    }
    return total;
  } catch (e) {
    log('error', `Error consultando balance de token en wallet: ${e.message}`);
    return null;
  }
}

// ---------- Balance SOL ----------
async function getWalletSolBalance() {
  if (!connection || !walletKeypair) return 0;
  const lamports = await connection.getBalance(walletKeypair.publicKey);
  return lamports / LAMPORTS_PER_SOL;
}

// ---------- Precio SOL (Fix 4: Jupiter + cache + fallback) ----------
let cachedSolPrice = { value: null, timestamp: 0 };
const SOL_PRICE_CACHE_MS = 60_000; // 1 minuto

async function getSolPriceUSD() {
  const ahora = Date.now();

  // 1. Si hay cache fresco (menos de 1 min), devolverlo
  if (
    cachedSolPrice.value !== null &&
    ahora - cachedSolPrice.timestamp < SOL_PRICE_CACHE_MS
  ) {
    return cachedSolPrice.value;
  }

  // 2. Intentar Jupiter Price API (rápida, confiable, la misma que usan Phantom/Solflare)
  if (process.env.JUPITER_API_KEY) {
    try {
      const url = 'https://api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112';
      const res = await fetch(url, {
        headers: { 'x-api-key': process.env.JUPITER_API_KEY },
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const data = await res.json();
        const solData = data?.So11111111111111111111111111111111111111112;
        const precio = solData?.usdPrice ? parseFloat(solData.usdPrice) : null;
        if (precio && Number.isFinite(precio) && precio > 0) {
          cachedSolPrice = { value: precio, timestamp: ahora };
          return precio;
        }
      } else {
        log('warn', `Jupiter price API respondió ${res.status}`);
      }
    } catch (e) {
      log('warn', `Jupiter price API falló: ${e.message}`);
    }
  }

  // 3. Fallback: usar el último precio cacheado aunque sea viejo
  if (cachedSolPrice.value !== null) {
    const edadMin = Math.round((ahora - cachedSolPrice.timestamp) / 60000);
    log('warn', `⚠️ Usando precio cacheado de hace ${edadMin} min: $${cachedSolPrice.value}`);
    return cachedSolPrice.value;
  }

  // 4. Si nunca se obtuvo precio, devolver null (el bot decidirá)
  log('error', 'No se pudo obtener precio de SOL de ninguna fuente');
  return null;
}

// ---------- Extraer cambios de balance (cuenta directa) ----------
function extraerCambiosDeBalance(acc) {
  const resultados = [];
  const nativeSol = Math.abs((acc.nativeBalanceChange || 0) / LAMPORTS_PER_SOL);

  for (const tbc of acc.tokenBalanceChanges || []) {
    if (MINTS_A_IGNORAR.has(tbc.mint)) continue;
    const decimals = tbc.rawTokenAmount?.decimals ?? 6;
    const rawAmount = parseFloat(tbc.rawTokenAmount?.tokenAmount ?? '0');
    const delta = rawAmount / Math.pow(10, decimals);
    if (delta === 0) continue;

    let solAmount = nativeSol;
    if (solAmount === 0) {
      const wsol = (acc.tokenBalanceChanges || []).find((t) => t.mint === SOL_MINT);
      if (wsol) {
        solAmount = Math.abs(
          parseFloat(wsol.rawTokenAmount?.tokenAmount ?? '0') /
            Math.pow(10, wsol.rawTokenAmount?.decimals ?? 9)
        );
      }
    }

    resultados.push({
      mint: tbc.mint,
      tokenAmount: Math.abs(delta),
      solAmount,
      direction: delta > 0 ? 'buy' : 'sell'
    });
  }
  return resultados;
}

// ---------- Parser de description de Helius (Fix 5: fallback cuando no hay wSOL ni SOL nativo) ----------
// Helius manda un campo `description` tipo:
//   BUY:  "<wallet> swapped 0.3 SOL for 12884.28 <MINT>"
//   SELL: "<wallet> swapped 12884.28 <MINT> for 0.298520232 SOL"
// Lo usamos como fuente de verdad cuando el parser no encuentra wSOL ni SOL nativo.
function extraerMontoDeDescription(description, walletAddress) {
  if (!description || typeof description !== 'string') return null;

  // Normalizamos: quitamos comas de miles si las hay
  const desc = description.replace(/,/g, '');

  // Caso BUY: "<wallet> swapped <SOL> SOL for <tokens> <MINT>"
  const regexBuy = /swapped\s+([\d.]+)\s+SOL\s+for\s+([\d.]+)\s+(\S+)/i;
  // Caso SELL: "<wallet> swapped <tokens> <MINT> for <SOL> SOL"
  const regexSell = /swapped\s+([\d.]+)\s+(\S+)\s+for\s+([\d.]+)\s+SOL/i;

  const mBuy = desc.match(regexBuy);
  if (mBuy) {
    const solAmount = parseFloat(mBuy[1]);
    const tokenAmount = parseFloat(mBuy[2]);
    const mint = mBuy[3];
    if (Number.isFinite(solAmount) && Number.isFinite(tokenAmount) && mint) {
      return { direction: 'buy', solAmount, tokenAmount, mint };
    }
  }

  const mSell = desc.match(regexSell);
  if (mSell) {
    const tokenAmount = parseFloat(mSell[1]);
    const mint = mSell[2];
    const solAmount = parseFloat(mSell[3]);
    if (Number.isFinite(solAmount) && Number.isFinite(tokenAmount) && mint) {
      return { direction: 'sell', solAmount, tokenAmount, mint };
    }
  }

  return null;
}

// ---------- Extraer cambios de tx completa para una wallet (Fix 3 + Fix 5) ----------
function extraerCambiosDeTxParaWallet(tx, walletAddress) {
  const porMint = new Map();
  const sumarToken = (mint, tokenDelta, decimals = 6) => {
    if (!mint || MINTS_A_IGNORAR.has(mint)) return;
    const prev = porMint.get(mint) || { tokenDelta: 0, decimals };
    prev.tokenDelta += tokenDelta;
    prev.decimals = decimals;
    porMint.set(mint, prev);
  };

  // 1. Movimiento de wSOL (para Jupiter, Raydium, Meteora, Orca, PumpSwap)
  let wsolInLamports = 0;
  let wsolOutLamports = 0;

  const wsolAmountToLamports = (amount, decimals) => {
    const n = numeroSeguro(amount);
    if (!n) return 0;
    const dec = decimals ?? 9;
    if (dec === 9) return Math.round(n * LAMPORTS_PER_SOL);
    if (dec === 0) return Math.round(n);
    return Math.round((n / Math.pow(10, dec)) * LAMPORTS_PER_SOL);
  };

  for (const tt of tx.tokenTransfers || []) {
    if (tt.mint !== SOL_MINT) continue;
    const amtLamports = wsolAmountToLamports(tt.tokenAmount, tt.decimals ?? 9);
    if (amtLamports <= 0) continue;
    if (tt.fromUserAccount === walletAddress) wsolOutLamports += amtLamports;
    if (tt.toUserAccount === walletAddress) wsolInLamports += amtLamports;
  }

  for (const acc of tx.accountData || []) {
    for (const tbc of acc.tokenBalanceChanges || []) {
      if (tbc.mint !== SOL_MINT) continue;
      const owner = tbc.userAccount || tbc.owner || acc.account;
      if (owner !== walletAddress) continue;

      const rawStr = String(tbc.rawTokenAmount?.tokenAmount ?? '0');
      let lamports;
      if (rawStr.includes('.')) {
        lamports = Math.round(parseFloat(rawStr) * LAMPORTS_PER_SOL);
      } else {
        lamports = Math.round(Number(rawStr));
      }
      if (!Number.isFinite(lamports) || lamports === 0) continue;

      if (lamports > 0) wsolInLamports += lamports;
      else wsolOutLamports += Math.abs(lamports);
    }
  }

  let wsolAbsLamports = wsolInLamports + wsolOutLamports;

  // 2. Fix 3: Si no hay wSOL, leer SOL NATIVO (para pump.fun bonding curve y casos raros)
  let nativeSolInLamports = 0;
  let nativeSolOutLamports = 0;

  if (wsolAbsLamports === 0) {
    for (const nt of tx.nativeTransfers || []) {
      const amount = numeroSeguro(nt.amount);
      if (amount <= 0) continue;
      if (nt.fromUserAccount === walletAddress) nativeSolOutLamports += amount;
      if (nt.toUserAccount === walletAddress) nativeSolInLamports += amount;
    }

    for (const acc of tx.accountData || []) {
      if (acc.account !== walletAddress) continue;
      const nativeDelta = numeroSeguro(acc.nativeBalanceChange);
      if (nativeDelta < 0) nativeSolOutLamports += Math.abs(nativeDelta);
      else if (nativeDelta > 0) nativeSolInLamports += nativeDelta;
    }
  }

  let solAbsLamports = wsolAbsLamports > 0
    ? wsolAbsLamports
    : (nativeSolInLamports + nativeSolOutLamports);

  // 3. Acumulamos cambios de tokens (no-SOL, no-USDC)
  for (const tt of tx.tokenTransfers || []) {
    if (tt.mint === SOL_MINT || MINTS_A_IGNORAR.has(tt.mint)) continue;
    const amount = numeroSeguro(tt.tokenAmount);
    if (!amount) continue;
    const decimals = tt.decimals ?? 6;
    if (tt.fromUserAccount === walletAddress) sumarToken(tt.mint, -amount, decimals);
    if (tt.toUserAccount === walletAddress) sumarToken(tt.mint, amount, decimals);
  }

  for (const acc of tx.accountData || []) {
    for (const tbc of acc.tokenBalanceChanges || []) {
      if (tbc.mint === SOL_MINT || MINTS_A_IGNORAR.has(tbc.mint)) continue;
      const owner = tbc.userAccount || tbc.owner || acc.account;
      if (owner !== walletAddress) continue;
      const decimals = tbc.rawTokenAmount?.decimals ?? 6;
      const rawAmount = numeroSeguro(tbc.rawTokenAmount?.tokenAmount);
      const delta = rawAmount / Math.pow(10, decimals);
      if (delta !== 0) sumarToken(tbc.mint, delta, decimals);
    }
  }

  // 4. Emparejar
  const cambios = [];
  const candidatos = [];
  for (const [mint, info] of porMint.entries()) {
    if (!info.tokenDelta || info.tokenDelta === 0) continue;
    candidatos.push({
      mint,
      info,
      direction: info.tokenDelta > 0 ? 'buy' : 'sell'
    });
  }

  if (candidatos.length === 0) return [];

  // Fix 5: si no encontramos SOL por ninguna vía, intentar leer la `description` de Helius
  if (solAbsLamports === 0 && tx.description) {
    const parsed = extraerMontoDeDescription(tx.description, walletAddress);
    if (parsed) {
      log(
        'info',
        `🎯 Parser: usando description de Helius para calcular monto: ${parsed.direction} ${parsed.solAmount} SOL / ${parsed.tokenAmount} tokens (${parsed.mint.slice(0, 6)}...)`
      );
      solAbsLamports = Math.round(parsed.solAmount * LAMPORTS_PER_SOL);
    }
  }

  const totalAbsTokens = candidatos.reduce((acc, c) => acc + Math.abs(c.info.tokenDelta), 0);

  for (const c of candidatos) {
    let lamportsAsignados = 0;
    if (candidatos.length === 1) {
      lamportsAsignados = solAbsLamports;
    } else if (totalAbsTokens > 0) {
      const proporcion = Math.abs(c.info.tokenDelta) / totalAbsTokens;
      lamportsAsignados = Math.round(solAbsLamports * proporcion);
    }

    if (lamportsAsignados === 0) {
      lamportsAsignados = 1_000_000;
      log(
        'warn',
        `⚠️ Parser: no se encontró SOL (ni wSOL, ni nativo, ni description) para ${c.mint.slice(0, 6)}..., usando fallback 0.001 SOL`
      );
    }

    cambios.push({
      mint: c.mint,
      tokenAmount: Math.abs(c.info.tokenDelta),
      solAmount: lamportsAsignados / LAMPORTS_PER_SOL,
      direction: c.direction,
      solAmountEstimado: lamportsAsignados === 1_000_000 && solAbsLamports === 0
    });
  }

  return cambios;
}

// ---------- DB ----------
async function initDB() {
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS tracked_wallets (alias TEXT PRIMARY KEY, address TEXT, amount REAL, chain TEXT)`
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS seen_tokens (wallet_address TEXT, token_mint TEXT, PRIMARY KEY (wallet_address, token_mint))`
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS bot_positions (token_mint TEXT, symbol TEXT, chain TEXT, amount REAL)`
    );
    await pool.query(`ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS cost_basis_sol REAL`);
    await pool.query(`ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS wallet_alias TEXT`);
    await pool.query(`ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS ceros_seguidos INT DEFAULT 0`);
    await pool.query(`ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS modo TEXT DEFAULT 'paper'`);
    await pool.query(
      `CREATE TABLE IF NOT EXISTS global_balance (id INT PRIMARY KEY, initial_usdc REAL, current_usdc REAL)`
    );
    await pool.query(`ALTER TABLE global_balance ADD COLUMN IF NOT EXISTS real_initial_sol REAL`);
    await pool.query(`ALTER TABLE global_balance ADD COLUMN IF NOT EXISTS helius_webhook_id TEXT`);
    await pool.query(
      `INSERT INTO global_balance (id, initial_usdc, current_usdc) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING`,
      [INITIAL_PAPER_BALANCE, INITIAL_PAPER_BALANCE]
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS trade_history (
        id SERIAL PRIMARY KEY,
        wallet_alias TEXT,
        symbol TEXT,
        profit_sol REAL,
        closed_at TIMESTAMP DEFAULT NOW()
      )`
    );
    await pool.query(`ALTER TABLE trade_history ADD COLUMN IF NOT EXISTS modo TEXT DEFAULT 'paper'`);

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_positions_mint_alias ON bot_positions(token_mint, wallet_alias)`
    );
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_positions_modo ON bot_positions(modo)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_history_alias ON trade_history(wallet_alias)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_history_modo ON trade_history(modo)`);

    await pool.query(
      `UPDATE global_balance SET initial_usdc = $1 WHERE initial_usdc IS NULL`,
      [INITIAL_PAPER_BALANCE]
    );
    await pool.query(
      `UPDATE global_balance SET current_usdc = COALESCE(initial_usdc, $1) WHERE current_usdc IS NULL`,
      [INITIAL_PAPER_BALANCE]
    );

    log('info', 'DB OK');
  } catch (e) {
    log('error', `DB Error: ${e.message}`);
  }

  try {
    await pool.query(`DELETE FROM bot_positions WHERE wallet_alias IS NULL`);
    await pool.query(`UPDATE bot_positions SET modo='paper' WHERE modo IS NULL`);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name='bot_positions' AND constraint_name='bot_positions_pkey_v2'
        ) THEN
          ALTER TABLE bot_positions DROP CONSTRAINT IF EXISTS bot_positions_pkey;
          ALTER TABLE bot_positions ADD CONSTRAINT bot_positions_pkey_v2 PRIMARY KEY (token_mint, wallet_alias);
        END IF;
      END $$;
    `);
    log('info', `Migración de posiciones OK — modo actual: ${MODO_ACTUAL.toUpperCase()}`);
  } catch (e) {
    log('error', `Error migrando bot_positions: ${e.message}`);
  }
}

// ---------- Baseline real ----------
async function initBaselineReal() {
  if (!LIVE || !connection || !walletKeypair) return;
  try {
    const { rows } = await pool.query('SELECT real_initial_sol FROM global_balance WHERE id=1');
    if (!rows[0] || rows[0].real_initial_sol === null) {
      const saldoInicial = await getWalletSolBalance();
      await pool.query('UPDATE global_balance SET real_initial_sol=$1 WHERE id=1', [saldoInicial]);
      log('info', `📌 Baseline REAL establecido: ${saldoInicial.toFixed(4)} SOL`);
    }
  } catch (e) {
    log('error', `Error estableciendo baseline real: ${e.message}`);
  }
}

// ---------- Historial ----------
async function registrarTradeCerrado(walletAlias, symbol, profitSol) {
  try {
    await pool.query(
      'INSERT INTO trade_history (wallet_alias, symbol, profit_sol, modo) VALUES ($1,$2,$3,$4)',
      [walletAlias, symbol, profitSol, MODO_ACTUAL]
    );
  } catch (e) {
    log('error', `Error registrando historial de trade: ${e.message}`);
  }
}

// ---------- Balance paper ----------
async function getPaperBalance() {
  try {
    const { rows } = await pool.query('SELECT * FROM global_balance WHERE id=1');
    const row = rows[0] || {};
    return {
      initial_usdc: Number(row.initial_usdc ?? INITIAL_PAPER_BALANCE),
      current_usdc: Number(row.current_usdc ?? INITIAL_PAPER_BALANCE)
    };
  } catch (e) {
    log('error', `Error leyendo balance paper: ${e.message}`);
    return {
      initial_usdc: INITIAL_PAPER_BALANCE,
      current_usdc: INITIAL_PAPER_BALANCE
    };
  }
}

async function adjustPaperBalance(deltaUsd) {
  try {
    const { rows } = await pool.query(
      `UPDATE global_balance
       SET current_usdc = COALESCE(current_usdc, $2) + $1
       WHERE id=1
       RETURNING current_usdc`,
      [deltaUsd, INITIAL_PAPER_BALANCE]
    );
    const valor = Number(rows[0]?.current_usdc);
    if (Number.isFinite(valor)) return valor;
    return INITIAL_PAPER_BALANCE;
  } catch (e) {
    log('error', `Error ajustando balance paper: ${e.message}`);
    return INITIAL_PAPER_BALANCE;
  }
}

// ===== FIN BLOQUE 2 =====

// ---------- Webhook Helius: crear o actualizar ----------
async function crearOActualizarWebhookHelius() {
  if (creandoWebhook) {
    log('info', 'Webhook ya en proceso, se omite llamada concurrente');
    return;
  }
  creandoWebhook = true;
  try {
    const apiKey = getHeliusApiKey();
    if (!apiKey) {
      log('error', '⚠️ No se pudo extraer el api-key de HELIUS_RPC_URL — el webhook no se puede configurar');
      return;
    }

    const { rows: walletRows } = await pool.query('SELECT address, alias FROM tracked_wallets');
    const direcciones = walletRows.map((r) => r.address);
    const aliases = walletRows.map((r) => r.alias);

    await pool.query('INSERT INTO global_balance (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    const { rows: gb } = await pool.query('SELECT helius_webhook_id FROM global_balance WHERE id=1');
    let webhookIdExistente = gb[0]?.helius_webhook_id;

    const payload = {
      webhookURL: HELIUS_WEBHOOK_URL,
      transactionTypes: ['ANY'],
      accountAddresses: direcciones,
      webhookType: 'enhanced',
      authHeader: HELIUS_WEBHOOK_SECRET
    };

    let exito = false;

    if (webhookIdExistente) {
      try {
        const res = await fetch(
          `https://api.helius.xyz/v0/webhooks/${webhookIdExistente}?api-key=${apiKey}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, active: true })
          }
        );
        if (res.ok) {
          log('info', `🌐 Webhook (ANY) actualizado: ${direcciones.length} wallets (${aliases.join(', ')})`);
          exito = true;
        } else {
          log('warn', `⚠️ No se pudo actualizar webhook ${webhookIdExistente} (${res.status}), se creará uno nuevo`);
        }
      } catch (err) {
        log('warn', `⚠️ Error haciendo PUT a webhook existente: ${err.message}`);
      }
    }

    if (!exito) {
      const res = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        throw new Error(`Error creando webhook de Helius: ${res.status} ${await res.text()}`);
      }
      const data = await res.json();
      await pool.query('UPDATE global_balance SET helius_webhook_id=$1 WHERE id=1', [data.webhookID]);
      webhookIdExistente = data.webhookID;
      log('info', `🌐 Webhook (ANY) creado: ${direcciones.length} wallets, id=${data.webhookID}`);
    }

    if (webhookIdExistente) {
      await verificarEstadoWebhook(apiKey, webhookIdExistente);
    }
  } catch (e) {
    log('error', `Error configurando webhook de Helius: ${e.message}`);
  } finally {
    creandoWebhook = false;
  }
}

// ---------- Verificar estado del webhook ----------
async function verificarEstadoWebhook(apiKey, webhookId) {
  try {
    const res = await fetch(`https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${apiKey}`);
    const data = await res.json();
    const activo = data.active;

    if (activo === false) {
      log('warn', '⚠️ Webhook de Helius está DESHABILITADO — intentando reactivar...');
      const react = await fetch(
        `https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${apiKey}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: true })
        }
      );
      if (!react.ok) {
        log('error', `⚠️ No se pudo reactivar el webhook: ${react.status} ${await react.text()}`);
        if (CHAT_ID) {
          bot
            .sendMessage(
              CHAT_ID,
              `⚠️ El webhook de Helius está deshabilitado y no pude reactivarlo (${react.status}). Los trades NO están llegando — revisa el authHeader.`,
              { disable_notification: true }
            )
            .catch(() => {});
        }
        return false;
      }
      log('info', '✅ Webhook de Helius REACTIVADO (era active:false)');
      if (CHAT_ID) {
        bot
          .sendMessage(
            CHAT_ID,
            '✅ Webhook de Helius reactivado automáticamente. Vuelve a recibir eventos.',
            { disable_notification: true }
          )
          .catch(() => {});
      }
      return true;
    }

    log('info', `🪝 Webhook de Helius verificado: ${activo ? 'ACTIVO' : 'inactivo'}`);
    return activo;
  } catch (e) {
    log('error', `Error verificando estado del webhook: ${e.message}`);
    return null;
  }
}

// ---------- Monitoreo automático de webhook ----------
async function monitoreoAutomaticoWebhook() {
  try {
    const apiKey = getHeliusApiKey();
    if (!apiKey) {
      log('warn', '⚠️ No se pudo extraer api-key para monitoreo');
      return;
    }

    const { rows: gb } = await pool.query('SELECT helius_webhook_id FROM global_balance WHERE id=1');
    const webhookId = gb[0]?.helius_webhook_id;

    if (!webhookId) {
      log('warn', '⚠️ No hay webhookId guardado — creando webhook...');
      await crearOActualizarWebhookHelius();
      return;
    }

    const res = await fetch(`https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${apiKey}`);
    if (!res.ok) {
      log('warn', `⚠️ GET webhook en Helius falló con status ${res.status} — recreando webhook...`);
      await pool.query('UPDATE global_balance SET helius_webhook_id=NULL WHERE id=1');
      await crearOActualizarWebhookHelius();
      return;
    }
    const webhookInfo = await res.json();

    const failureRate = webhookInfo.failureRate ?? null;
    const lastSentAt = webhookInfo.lastSentAt ? new Date(webhookInfo.lastSentAt) : null;
    const active = webhookInfo.active ?? null;

    const necesitaRecrear = active === false || (failureRate !== null && failureRate > 0.5);

    if (necesitaRecrear) {
      log('warn', '🪝 Webhook detectado como inactivo o con alta tasa de fallos — recreando...');
      await pool.query('UPDATE global_balance SET helius_webhook_id=NULL WHERE id=1');
      await crearOActualizarWebhookHelius();
      if (CHAT_ID) {
        try {
          await bot.sendMessage(
            CHAT_ID,
            '🪝 Webhook auto-recreado: Helius lo tenía inactivo o con fallos.'
          );
        } catch (_) {}
      }
    } else {
      log(
        'info',
        `✅ Monitoreo webhook: OK — failureRate=${failureRate}, último envío=${
          lastSentAt
            ? lastSentAt.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
            : 'nunca'
        }`
      );
    }
  } catch (e) {
    log('error', `Error en monitoreo automático de webhook: ${e.message}`);
  }
}

// ---------- Diagnóstico ----------
async function diagnosticoHelius(alias) {
  const apiKey = getHeliusApiKey();
  if (!apiKey) return { error: 'No se pudo extraer el api-key de HELIUS_RPC_URL' };

  const { rows } = await pool.query('SELECT * FROM tracked_wallets WHERE alias=$1', [alias]);
  if (!rows[0]) return { error: `No existe ninguna wallet trackeada con el alias "${alias}"` };

  const address = rows[0].address;
  let webhookInfo = null;
  try {
    const { rows: gb } = await pool.query('SELECT helius_webhook_id FROM global_balance WHERE id=1');
    const webhookId = gb[0]?.helius_webhook_id;
    if (webhookId) {
      const res = await fetch(`https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${apiKey}`);
      webhookInfo = await res.json();
    } else {
      webhookInfo = { error: 'No hay webhookId guardado en la base de datos' };
    }
  } catch (e) {
    webhookInfo = { error: e.message };
  }

  const saludWebhook = {
    failureRate: null,
    isUnderCooldown: null,
    lastSentAt: null,
    lastError: null,
    active: null
  };
  try {
    if (webhookInfo && !webhookInfo.error && typeof webhookInfo === 'object') {
      saludWebhook.failureRate = webhookInfo.failureRate ?? null;
      saludWebhook.isUnderCooldown = webhookInfo.isUnderCooldown ?? null;
      saludWebhook.lastSentAt = webhookInfo.lastSentAt
        ? new Date(webhookInfo.lastSentAt).toLocaleString('es-MX', {
            timeZone: 'America/Mexico_City'
          })
        : null;
      saludWebhook.lastError = webhookInfo.lastError ?? null;
      saludWebhook.active = webhookInfo.active ?? null;
    }
  } catch (_) {}

  let historial = [];
  try {
    const res = await fetch(
      `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&limit=10`
    );
    historial = await res.json();
  } catch (e) {
    historial = { error: e.message };
  }

  return { webhookInfo, historial, address, alias, saludWebhook };
}

// ---------- Servidor HTTP para webhooks ----------
function iniciarServidorWebhook() {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }

    const ip = req.socket.remoteAddress || 'unknown';
    const ahora = Date.now();
    const timestamps = (webhookRateMap.get(ip) || []).filter((t) => ahora - t < 1000);
    if (timestamps.length >= 10) {
      res.writeHead(429, { 'Content-Type': 'text/plain' });
      res.end('Too Many Requests');
      return;
    }
    timestamps.push(ahora);
    webhookRateMap.set(ip, timestamps);

    let body = '';
    let bodySize = 0;
    let abortado = false;

    req.on('data', (chunk) => {
      if (abortado) return;
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_BYTES) {
        abortado = true;
        res.writeHead(413, { 'Content-Type': 'text/plain' });
        res.end('Payload too large');
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      if (abortado) return;

      const auth =
        req.headers['x-authheader'] ||
        req.headers['x-auth-header'] ||
        req.headers['authheader'] ||
        req.headers['authorization'];

      if (!safeEqual(auth, HELIUS_WEBHOOK_SECRET)) {
        log('warn', '⚠️ Webhook rechazado: authHeader no coincide.');
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Unauthorized');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');

      procesarWebhookHelius(body).catch((e) =>
        log('error', `Error procesando webhook de Helius: ${e.message}, ${e.stack}`)
      );
    });
  });

  const port = process.env.PORT || 3000;

  server.on('error', (e) => {
    log('error', `❌ Servidor de webhooks NO pudo escuchar en el puerto ${port}: ${e.message} (${e.code})`);
    if (CHAT_ID) {
      bot
        .sendMessage(
          CHAT_ID,
          `❌ El servidor de webhooks no pudo levantarse (${e.code}) — los trades de DEX que NO son pump no llegarán. Revisa logs.`,
          { disable_notification: true }
        )
        .catch(() => {});
    }
  });

  server.listen(port, () =>
    log('info', `🌐 Servidor de webhooks escuchando en el puerto ${port} (tipo ANY, cualquier DEX)`)
  );
}

// ---------- Deduplicación por signature ----------
const signaturesProcesadas = new Map(); // signature -> timestamp ms
const DEDUP_TTL_MS = 60 * 60 * 1000; // 1 hora

function limpiarSignaturesViejas() {
  const ahora = Date.now();
  for (const [sig, ts] of signaturesProcesadas.entries()) {
    if (ahora - ts > DEDUP_TTL_MS) signaturesProcesadas.delete(sig);
  }
}

function yaProcesadaSignature(sig) {
  if (!sig) return false;
  const ts = signaturesProcesadas.get(sig);
  if (!ts) return false;
  if (Date.now() - ts > DEDUP_TTL_MS) {
    signaturesProcesadas.delete(sig);
    return false;
  }
  return true;
}

function marcarSignatureProcesada(sig) {
  if (!sig) return;
  signaturesProcesadas.set(sig, Date.now());
}

// ---------- Log compacto de TX (v2: solo cuentas con cambios + 1200 chars) ----------
function logRawTxCompacto(tx) {
  try {
    // Filtrar SOLO cuentas con cambios reales (balance nativo o de tokens)
    const cuentasRelevantes = (tx.accountData || [])
      .filter(
        (a) =>
          (a.nativeBalanceChange && a.nativeBalanceChange !== 0) ||
          (a.tokenBalanceChanges && a.tokenBalanceChanges.length > 0)
      )
      .map((a) => ({
        account: a.account,
        nativeBalanceChange: a.nativeBalanceChange,
        tokenBalanceChanges: (a.tokenBalanceChanges || []).map((t) => ({
          mint: t.mint,
          tokenAmount: t.rawTokenAmount?.tokenAmount,
          decimals: t.rawTokenAmount?.decimals,
          userAccount: t.userAccount
        }))
      }));

    // Solo tokenTransfers y nativeTransfers que tengan movimiento
    const tokenTransfersFiltrados = (tx.tokenTransfers || [])
      .filter((t) => t.tokenAmount && Number(t.tokenAmount) > 0)
      .map((t) => ({
        mint: t.mint,
        from: t.fromUserAccount,
        to: t.toUserAccount,
        amount: t.tokenAmount,
        decimals: t.decimals
      }));

    const nativeTransfersFiltrados = (tx.nativeTransfers || [])
      .filter((n) => n.amount && Number(n.amount) > 0)
      .map((n) => ({
        from: n.fromUserAccount,
        to: n.toUserAccount,
        amount: n.amount
      }));

    const resumen = {
      sig: tx.signature ? String(tx.signature).slice(0, 16) + '...' : null,
      desc: tx.description || null,
      type: tx.type || null,
      source: tx.source || null,
      feePayer: tx.feePayer || null,
      cuentasRelevantes,
      tokenTransfers: tokenTransfersFiltrados,
      nativeTransfers: nativeTransfersFiltrados
    };

    const json = JSON.stringify(resumen);
    const recortado = json.length > 1200 ? json.slice(0, 1200) + '...[cortado]' : json;
    log('debug', `📨 RAW TX (${tx.type || '?'}/${tx.source || '?'}) [${cuentasRelevantes.length} cuentas]: ${recortado}`);
  } catch (e) {
    log('warn', `No se pudo serializar RAW TX: ${e.message}`);
  }
}

// ---------- Procesar webhook de Helius ----------
async function procesarWebhookHelius(rawBody) {
  log('info', `📨 Webhook Helius recibido: ${rawBody.length} bytes`);

  let eventos;
  try {
    eventos = JSON.parse(rawBody);
  } catch (e) {
    log(
      'error',
      `📨 Webhook Helius: el body NO es JSON válido: ${e.message} — primeros 300 chars: ${rawBody.slice(0, 300)}`
    );
    return;
  }

  if (!Array.isArray(eventos)) {
    const esPumpPortal =
      eventos.signature &&
      eventos.mint &&
      eventos.traderPublicKey &&
      eventos.txType &&
      eventos.tokenAmount !== undefined &&
      eventos.solAmount !== undefined;

    if (esPumpPortal) {
      log('info', '📨 Webhook Helius: objeto estilo PumpPortal detectado, procesando directamente.');

      const sig = eventos.signature;
      if (yaProcesadaSignature(sig)) {
        log('info', `📨 Signature ${sig.slice(0, 12)}... ya procesada, se omite (dup PumpPortal)`);
        return;
      }
      marcarSignatureProcesada(sig);

      const { mint, traderPublicKey, txType, tokenAmount, solAmount } = eventos;

      const { rows: buscado } = await pool.query(
        'SELECT * FROM tracked_wallets WHERE address=$1',
        [traderPublicKey]
      );
      if (buscado.length === 0) {
        log('warn', `📨 Objeto PumpPortal pero ${traderPublicKey} no está en tracked_wallets, se ignora.`);
        return;
      }
      const tracked = buscado[0];
      const direccion = (txType || '').toLowerCase() === 'buy' ? 'buy' : 'sell';
      const trade = {
        mint,
        solAmount: Number(solAmount),
        tokenAmount: Number(tokenAmount),
        vSolInBondingCurve: eventos.vSolInBondingCurve
          ? Number(eventos.vSolInBondingCurve)
          : undefined,
        vTokensInBondingCurve: eventos.vTokensInBondingCurve
          ? Number(eventos.vTokensInBondingCurve)
          : undefined,
        traderPublicKey,
        chain: 'solana',
        txType: direccion
      };
      const horaDeteccion = eventos.timestamp ? eventos.timestamp * 1000 : Date.now();
      const origen =
        !eventos.source || eventos.source === 'PUMP_FUN' ? 'PumpPortal' : eventos.source;

      if (direccion === 'buy') await handleTrackedBuy(tracked, trade, origen, horaDeteccion);
      else await handleTrackedSell(tracked, trade, origen, horaDeteccion);
      return;
    }

    log('info', `📨 Webhook Helius: el body es un objeto simple, se envuelve en arreglo.`);
    eventos = [eventos];
  }

  log('info', `📨 Webhook Helius: ${eventos.length} transacción(es) en este lote`);

  const { rows: trackedRows } = await pool.query('SELECT * FROM tracked_wallets');
  const trackedMap = new Map(trackedRows.map((r) => [r.address, r]));

  for (const tx of eventos) {
    const signature = tx.signature;
    if (yaProcesadaSignature(signature)) {
      log('info', `📨 Signature ${signature?.slice(0, 12)}... ya procesada, se omite (dup lote)`);
      continue;
    }
    marcarSignatureProcesada(signature);

    const cuentasEnTx = (tx.accountData || []).map((a) => a.account);
    const participantesExtra = [];

    for (const tt of tx.tokenTransfers || []) {
      if (tt.fromUserAccount) participantesExtra.push(tt.fromUserAccount);
      if (tt.toUserAccount) participantesExtra.push(tt.toUserAccount);
    }
    for (const nt of tx.nativeTransfers || []) {
      if (nt.fromUserAccount) participantesExtra.push(nt.fromUserAccount);
      if (nt.toUserAccount) participantesExtra.push(nt.toUserAccount);
    }

    const cuentasDetectadas = [...new Set([...cuentasEnTx, ...participantesExtra])];
    const walletsInvolucradas = cuentasDetectadas
      .filter((a) => trackedMap.has(a))
      .map((a) => trackedMap.get(a).alias);

    log(
      'info',
      `📨 TX recibida: type=${tx.type || '(sin type)'} source=${tx.source || '(sin source)'} accountData.length=${cuentasEnTx.length} wallets-trackeadas=[${walletsInvolucradas.join(', ')}]`
    );

    if (trackedRows.length === 0) continue;
    if (walletsInvolucradas.length === 0) continue;

    // Log compacto (filtrado)
    logRawTxCompacto(tx);

    // FILTRO: si es un TRANSFER de SYSTEM_PROGRAM sin tokenTransfers, ignorar.
    const esTransferSinToken =
      (tx.type || '').toUpperCase() === 'TRANSFER' &&
      (tx.source || '').toUpperCase() === 'SYSTEM_PROGRAM' &&
      (!tx.tokenTransfers || tx.tokenTransfers.length === 0);
    if (esTransferSinToken) {
      log(
        'info',
        `📨 TX ignorada: TRANSFER de SYSTEM_PROGRAM sin tokenTransfers (probable fee o transferencia simple)`
      );
      continue;
    }

    const horaDeteccion = tx.timestamp ? tx.timestamp * 1000 : Date.now();
    const cambiosProcesados = new Set();

    // 1. accountData directo
    for (const acc of tx.accountData || []) {
      const tracked = trackedMap.get(acc.account);
      if (!tracked) continue;

      const cambios = extraerCambiosDeBalance(acc);
      if (cambios.length === 0) {
        log(
          'info',
          `📨 ${tracked.alias} apareció en esta TX pero SIN cambio directo de balance — probando fallback global de Helius.`
        );
      }

      for (const cambio of cambios) {
        const key = `${tracked.address}:${cambio.mint}:${cambio.direction}`;
        cambiosProcesados.add(key);
        log(
          'info',
          `🌐 Actividad detectada: ${tracked.alias} ${cambio.direction} ${cambio.mint.slice(0, 6)}... · ${cambio.solAmount.toFixed(4)} SOL (fuente: ${tx.source || 'desconocida'})`
        );

        const tradeCompatible = {
          mint: cambio.mint,
          solAmount: cambio.solAmount,
          tokenAmount: cambio.tokenAmount,
          solAmountEstimado: cambio.solAmountEstimado,
          traderPublicKey: tracked.address,
          txType: cambio.direction
        };
        const origen = tx.source && tx.source !== 'PUMP_FUN' ? tx.source : 'OnChain';

        if (cambio.direction === 'buy') await handleTrackedBuy(tracked, tradeCompatible, origen, horaDeteccion);
        else await handleTrackedSell(tracked, tradeCompatible, origen, horaDeteccion);
      }
    }

    // 2. Fallback global
    for (const tracked of trackedRows) {
      if (!cuentasDetectadas.includes(tracked.address)) continue;

      const cambiosFallback = extraerCambiosDeTxParaWallet(tx, tracked.address);
      for (const cambio of cambiosFallback) {
        const key = `${tracked.address}:${cambio.mint}:${cambio.direction}`;
        if (cambiosProcesados.has(key)) continue;

        const yaProcesadoMismoMint = [...cambiosProcesados].some((k) =>
          k.startsWith(`${tracked.address}:${cambio.mint}:`)
        );
        if (yaProcesadoMismoMint) {
          log(
            'info',
            `📨 Fallback: ${tracked.alias} ${cambio.mint.slice(0, 6)} ya procesado en accountData, se omite`
          );
          continue;
        }

        cambiosProcesados.add(key);
        log(
          'info',
          `🌐 Actividad detectada (fallback Helius): ${tracked.alias} ${cambio.direction} ${cambio.mint.slice(0, 6)}... · ${cambio.solAmount.toFixed(4)} SOL (fuente: ${tx.source || 'desconocida'})`
        );

        const tradeCompatible = {
          mint: cambio.mint,
          solAmount: cambio.solAmount,
          tokenAmount: cambio.tokenAmount,
          solAmountEstimado: cambio.solAmountEstimado,
          traderPublicKey: tracked.address,
          txType: cambio.direction
        };
        const origen = tx.source && tx.source !== 'PUMP_FUN' ? tx.source : 'OnChain';

        if (cambio.direction === 'buy') await handleTrackedBuy(tracked, tradeCompatible, origen, horaDeteccion);
        else await handleTrackedSell(tracked, tradeCompatible, origen, horaDeteccion);
      }
    }
  }
}

// ---------- Purga periódica de signatures viejas ----------
setInterval(limpiarSignaturesViejas, 15 * 60 * 1000).unref?.();

// ===== FIN BLOQUE 3 =====

// ---------- PumpPortal trade ----------
async function pumpPortalTrade({ action, mint, amount, denominatedInSol, slippage = 10, priorityFee = 0.0005, pool: poolName = 'auto' }) {
  if (!walletKeypair) throw new Error('Wallet no cargada: no se puede tradear');
  if (!connection) throw new Error('Sin conexión RPC: no se puede tradear');

  const res = await fetch(PUMP_PORTAL_TRADE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: walletKeypair.publicKey.toBase58(),
      action,
      mint,
      amount,
      denominatedInSol: denominatedInSol ? 'true' : 'false',
      slippage,
      priorityFee,
      pool: poolName
    })
  });

  if (res.status !== 200) {
    throw new Error('PumpPortal: ' + (await res.text()));
  }

  const data = await res.arrayBuffer();
  if (!data || data.byteLength === 0) throw new Error('PumpPortal: respuesta vacía');

  let tx;
  try {
    tx = VersionedTransaction.deserialize(new Uint8Array(data));
  } catch (e) {
    throw new Error('PumpPortal: no se pudo deserializar la tx: ' + e.message);
  }

  tx.sign([walletKeypair]);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3
  });
  await confirmarYVerificarTx(sig);
  return sig;
}

// ---------- Jupiter swap genérico (buy o sell) ----------
async function ejecutarSwapViaJupiter({ action, mint, amount, slippage = DEFAULT_SLIPPAGE_BPS }) {
  if (!process.env.JUPITER_API_KEY) throw new Error('Falta JUPITER_API_KEY para ejecutar swaps vía Jupiter');
  if (!walletKeypair) throw new Error('Wallet no cargada');
  if (!connection) throw new Error('Sin conexión RPC');

  const tokenInfo = await getTokenInfoHelius(mint);
  const decimals = tokenInfo.decimals;

  let inputMint, outputMint, rawAmount;
  if (action === 'buy') {
    inputMint = SOL_MINT;
    outputMint = mint;
    rawAmount = Math.floor(amount * LAMPORTS_PER_SOL);
  } else {
    inputMint = mint;
    outputMint = SOL_MINT;
    rawAmount = Math.floor(amount * Math.pow(10, decimals));
  }

  const quoteUrl = `${JUPITER_BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rawAmount}&slippageBps=${slippage}`;
  const quoteRes = await fetchJupiterConReintento(quoteUrl, {
    headers: { 'x-api-key': process.env.JUPITER_API_KEY }
  });
  if (!quoteRes.ok) {
    throw new Error(`Jupiter quote failed: ${quoteRes.status} ${await quoteRes.text()}`);
  }
  const quoteData = await quoteRes.json();

  const swapRes = await fetch(`${JUPITER_BASE}/swap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.JUPITER_API_KEY
    },
    body: JSON.stringify({
      userPublicKey: walletKeypair.publicKey.toBase58(),
      quoteResponse: quoteData
    })
  });
  if (!swapRes.ok) {
    throw new Error(`Jupiter swap failed: ${swapRes.status} ${await swapRes.text()}`);
  }
  const swapData = await swapRes.json();
  const txBuf = Buffer.from(swapData.swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([walletKeypair]);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3
  });
  await confirmarYVerificarTx(sig);
  return sig;
}

// ---------- Dispatcher de ejecución ----------
async function ejecutarTrade({ action, mint, amount, origen, slippage = DEFAULT_SLIPPAGE_BPS }) {
  const origenesPump = new Set(['PumpPortal', 'PUMP_FUN', 'PUMP_AMM', 'OnChain', 'pump.fun', 'pumpswap']);
  const esPump = origenesPump.has(origen);

  try {
    if (esPump) {
      return await pumpPortalTrade({
        action,
        mint,
        amount: action === 'buy' ? amount : '100%',
        denominatedInSol: action === 'buy',
        slippage,
        priorityFee: 0.0005,
        pool: 'auto'
      });
    }
    return await ejecutarSwapViaJupiter({ action, mint, amount, slippage });
  } catch (primerError) {
    if (action === 'sell') {
      log(
        'warn',
        `Ruta PumpPortal falló para venta (${mint.slice(0, 6)}...), intentando Jupiter como respaldo: ${primerError.message}`
      );
      return await ejecutarSwapViaJupiter({ action, mint, amount, slippage });
    }
    if (esPump && (origen === 'OnChain' || origen === 'PumpPortal')) {
      log(
        'warn',
        `Ruta PumpPortal falló para compra (${mint.slice(0, 6)}...), intentando Jupiter como respaldo: ${primerError.message}`
      );
      return await ejecutarSwapViaJupiter({ action, mint, amount, slippage });
    }
    throw primerError;
  }
}

// ---------- Valor estimado en SOL (para stop-loss) ----------
async function estimarValorEnSol(mint, cantidadTokens, decimals) {
  if (!process.env.JUPITER_API_KEY) return null;
  try {
    const rawAmount = Math.floor(cantidadTokens * Math.pow(10, decimals));
    if (rawAmount <= 0) return null;

    const url = `${JUPITER_BASE}/quote?inputMint=${mint}&outputMint=${SOL_MINT}&amount=${rawAmount}&slippageBps=${DEFAULT_SLIPPAGE_BPS}`;
    const res = await fetchJupiterConReintento(url, {
      headers: { 'x-api-key': process.env.JUPITER_API_KEY }
    });
    if (!res.ok) {
      log('warn', `Jupiter /quote (stop-loss) respondió mal: ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!data.outAmount) return null;
    return parseFloat(data.outAmount) / LAMPORTS_PER_SOL;
  } catch (e) {
    log('warn', `No se pudo cotizar valor para stop-loss (${mint.slice(0, 6)}...): ${e.message}`);
    return null;
  }
}

// ---------- Swap de ganancia a USDC ----------
async function swapProfitToUsdc(amountSol) {
  if (!process.env.JUPITER_API_KEY) {
    log('error', 'Falta JUPITER_API_KEY, no se puede convertir a USDC');
    return null;
  }
  if (!amountSol || amountSol <= 0) return null;
  if (!walletKeypair || !connection) return null;

  try {
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
    if (lamports <= 0) return null;

    const quoteUrl = `${JUPITER_BASE}/quote?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=${lamports}&slippageBps=${DEFAULT_SLIPPAGE_BPS}`;
    const quoteRes = await fetchJupiterConReintento(quoteUrl, {
      headers: { 'x-api-key': process.env.JUPITER_API_KEY }
    });
    if (!quoteRes.ok) {
      log('error', `Jupiter quote USDC: ${quoteRes.status} ${await quoteRes.text()}`);
      return null;
    }
    const quote = await quoteRes.json();

    const swapRes = await fetch(`${JUPITER_BASE}/swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.JUPITER_API_KEY
      },
      body: JSON.stringify({
        userPublicKey: walletKeypair.publicKey.toBase58(),
        quoteResponse: quote
      })
    });
    if (!swapRes.ok) {
      log('error', `Jupiter swap USDC: ${swapRes.status} ${await swapRes.text()}`);
      return null;
    }
    const swapData = await swapRes.json();
    const tx = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64'));
    tx.sign([walletKeypair]);
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3
    });
    await confirmarYVerificarTx(sig);
    return sig;
  } catch (e) {
    log('error', `Error swap a USDC: ${e.message}`);
    return null;
  }
}

// ---------- Cerrar cuenta de token (recuperar rent) ----------
async function cerrarCuentaDelToken(mint) {
  if (!connection || !walletKeypair) return null;
  try {
    const mintKey = new PublicKey(mint);
    const cuentas = await connection.getParsedTokenAccountsByOwner(walletKeypair.publicKey, {
      mint: mintKey
    });
    let recuperadoSol = 0;

    for (const c of cuentas.value) {
      const balance = parseFloat(c.account.data.parsed.info.tokenAmount.uiAmount || 0);
      if (balance > 0) continue;

      const antesSol = await getWalletSolBalance();
      const closeIx = new TransactionInstruction({
        programId: c.account.owner,
        keys: [
          { pubkey: c.pubkey, isSigner: false, isWritable: true },
          { pubkey: walletKeypair.publicKey, isSigner: false, isWritable: true },
          { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: false }
        ],
        data: Buffer.from([9])
      });
      const tx = new Transaction().add(closeIx);
      tx.feePayer = walletKeypair.publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.sign(walletKeypair);

      const sig = await connection.sendRawTransaction(tx.serialize());
      await confirmarYVerificarTx(sig);
      await sleep(ESPERA_LECTURA_SALDO_MS);
      const despuesSol = await getWalletSolBalance();
      const delta = Math.max(despuesSol - antesSol, 0);
      recuperadoSol += delta;
      log(
        'info',
        `♻️ Cuenta de token cerrada (${mint.slice(0, 6)}...), recuperado: ${delta.toFixed(5)} SOL`
      );
    }

    return recuperadoSol > 0 ? recuperadoSol : null;
  } catch (e) {
    log('warn', `No se pudo cerrar la cuenta del token (no crítico): ${e.message}`);
    return null;
  }
}

// ---------- WebSocket PumpPortal ----------
function conectarWS() {
  if (!process.env.PUMPPORTAL_API_KEY) {
    log('warn', 'PUMPPORTAL_API_KEY no está definida; se omite conexión WS a PumpPortal');
    return;
  }
  if (ws && ws.readyState === WebSocket.OPEN) return;

  log('info', 'Conectando WebSocket a PumpPortal...');
  ws = new WebSocket(PUMP_PORTAL_WS);

  ws.on('open', () => {
    log('info', 'WebSocket PumpPortal conectado');
    wsReconnectAttempts = 0;
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    resyncSubscriptions();
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.pong) return;
      procesarWebhookHelius(JSON.stringify(msg));
    } catch (e) {
      log('error', `Error procesando mensaje WS: ${e.message}`);
    }
  });

  ws.on('error', (err) => {
    log('error', `WebSocket error: ${err.message}`);
  });

  ws.on('close', (code, reason) => {
    log('warn', `WebSocket cerrado (${code}): ${reason}. Intentando reconexión...`);
    ws = null;
    scheduleWSReconnect();
  });
}

function scheduleWSReconnect() {
  if (wsReconnectTimer) return;
  const delay = Math.min(1000 * 2 ** ++wsReconnectAttempts, 30000);
  log('info', `Reconexión WS en ${delay}ms (intento ${wsReconnectAttempts})`);
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    conectarWS();
  }, delay);
}

function resyncSubscriptions() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    log('info', 'WS no está listo todavía, se sincronizará completo en la próxima conexión');
    return;
  }
  pool
    .query('SELECT alias, address FROM tracked_wallets')
    .then(({ rows }) => {
      if (rows.length > 0) {
        ws.send(
          JSON.stringify({
            method: 'subscribeAccountTrade',
            keys: rows.map((r) => r.address)
          })
        );
        const aliases = rows.map((r) => r.alias).join(', ') || 'ninguna';
        log('info', `🔁 Resincronizado (PumpPortal): escuchando ${rows.length} wallets (${aliases})`);
      }
    })
    .catch((e) => log('error', `Error resincronizando suscripciones: ${e.message}`));
}

// ---------- Reconciliación de posiciones ----------
async function reconciliarPosiciones(forzado = false) {
  const marca = new Date().toISOString();
  if (!connection) {
    log('info', `🔍 [${marca}] Reconciliación: sin conexión RPC, se salta este ciclo`);
    return;
  }
  try {
    const { rows: posiciones } = await pool.query(
      `SELECT bp.*, tw.address AS wallet_address
       FROM bot_positions bp
       JOIN tracked_wallets tw ON tw.alias = bp.wallet_alias
       WHERE bp.modo = $1`,
      [MODO_ACTUAL]
    );

    if (posiciones.length === 0) {
      log(
        'info',
        `🔍 [${marca}] Reconciliación${forzado ? ' (manual)' : ''}: 0 posiciones abiertas en modo ${MODO_ACTUAL.toUpperCase()}, nada que revisar.`
      );
      return;
    }

    let cerradas = 0;

    for (const pos of posiciones) {
      const balanceActual = await getBalanceDeTokenEnWallet(pos.wallet_address, pos.token_mint);
      if (balanceActual === null) continue;

      if (balanceActual > 0) {
        if (pos.ceros_seguidos > 0) {
          await pool.query(
            'UPDATE bot_positions SET ceros_seguidos=0 WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
            [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]
          );
        }
        continue;
      }

      if (!forzado) {
        const nuevosCeros = (pos.ceros_seguidos || 0) + 1;
        if (nuevosCeros < CONFIRMACIONES_NECESARIAS) {
          await pool.query(
            'UPDATE bot_positions SET ceros_seguidos=$1 WHERE token_mint=$2 AND wallet_alias=$3 AND modo=$4',
            [nuevosCeros, pos.token_mint, pos.wallet_alias, MODO_ACTUAL]
          );
          log(
            'info',
            `🔍 ${pos.wallet_alias} ${pos.symbol}: balance en 0 (confirmación ${nuevosCeros}/${CONFIRMACIONES_NECESARIAS}), esperando siguiente ciclo antes de cerrar`
          );
          continue;
        }
      } else {
        log(
          'info',
          `🔍 ${pos.wallet_alias} ${pos.symbol}: balance en 0, cerrando de inmediato (reconciliación manual forzada)`
        );
      }

      cerradas++;
      log(
        'info',
        `🔄 Reconciliación [${MODO_ACTUAL.toUpperCase()}]: ${pos.wallet_alias} ya no tiene ${pos.symbol} - cerrando posición`
      );

      if (LIVE && pos.chain === 'solana' && walletKeypair && connection) {
        try {
          const before = await getWalletSolBalance();
          const sig = await ejecutarTrade({
            action: 'sell',
            mint: pos.token_mint,
            amount: pos.amount,
            origen: 'OnChain',
            slippage: DEFAULT_SLIPPAGE_BPS
          });
          await sleep(ESPERA_LECTURA_SALDO_MS);
          const after = await getWalletSolBalance();
          const proceedsSol = after - before;
          const solPrice = await getSolPriceUSD();
          const r = calcularResultado(pos.cost_basis_sol, proceedsSol, solPrice, false);

          await pool.query(
            'DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
            [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]
          );
          await pool.query(
            'DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
            [pos.wallet_address, pos.token_mint]
          );
          await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);

          let msg = `🔄⚠️ Venta atrasada detectada y ejecutada [${pos.wallet_alias}] ${pos.symbol} · Salí con: ${proceedsSol.toFixed(4)} SOL · ${formatearResultado(r)} · tx: ${linkTx(sig)}`;
          if (r.profitSol > 0) {
            const usdcSig = await swapProfitToUsdc(r.profitSol);
            msg += usdcSig
              ? `\n💵 Ganancia convertida a USDC · tx: ${linkTx(usdcSig)}`
              : `\n⚠️ No se pudo convertir la ganancia a USDC`;
          }
          const rentRecuperado = await cerrarCuentaDelToken(pos.token_mint);
          if (rentRecuperado) {
            msg += `\n♻️ Cuenta cerrada, recuperado: ${rentRecuperado.toFixed(5)} SOL de rent`;
          }
          const saldoFinal = await getWalletSolBalance();
          msg += `\n💰 Saldo total: ${saldoFinal.toFixed(4)} SOL`;
          if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);
        } catch (e) {
          log('error', `Error en venta real de reconciliación: ${e.message}`);
          if (esSellZeroAmount(e)) {
            await pool.query(
              'DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
              [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]
            );
            await pool.query(
              'DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
              [pos.wallet_address, pos.token_mint]
            );
            if (CHAT_ID) {
              bot.sendMessage(
                CHAT_ID,
                `🧹 [${pos.wallet_alias}] ${pos.symbol}: posición fantasma eliminada — la compra original nunca se ejecutó de verdad. No se cuenta como pérdida.`
              );
            }
          } else {
            if (CHAT_ID) {
              bot.sendMessage(
                CHAT_ID,
                `⚠️🔄 [${pos.wallet_alias}] ${pos.symbol}: ${mensajeAmigableError(e)} Se reintentará en el próximo ciclo, la posición sigue abierta.`
              );
            }
          }
        }
      } else {
        const { decimals } = await getTokenInfoHelius(pos.token_mint);
        const valorEstimado = await estimarValorEnSol(pos.token_mint, pos.amount, decimals);
        const proceedsSol = valorEstimado ?? 0;
        const solPrice = await getSolPriceUSD();
        const r = calcularResultado(pos.cost_basis_sol, proceedsSol, solPrice, true);
        const proceedsUsd = solPrice ? r.proceedsNetoSol * solPrice : 0;

        await pool.query(
          'DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
          [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]
        );
        await pool.query(
          'DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
          [pos.wallet_address, pos.token_mint]
        );
        await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
        const nuevoSaldo = await adjustPaperBalance(proceedsUsd);

        if (CHAT_ID) {
          bot.sendMessage(
            CHAT_ID,
            `🔄⚠️ PAPER: venta atrasada [${pos.wallet_alias}] ${pos.symbol} · Estimado: ${r.proceedsNetoSol.toFixed(4)} SOL · ${formatearResultado(r)} · Saldo: $${nuevoSaldo.toFixed(2)}`
          );
        }
      }
    }

    log(
      'info',
      `🔍 [${marca}] Reconciliación completa [${MODO_ACTUAL.toUpperCase()}]${forzado ? ' (manual)' : ''}: ${posiciones.length} posiciones revisadas, ${cerradas} cerradas por venta atrasada.`
    );
  } catch (e) {
    log('error', `Error en reconciliación de posiciones: ${e.message}`);
  }
}

// ---------- Stop-loss ----------
async function revisarStopLoss() {
  try {
    const { rows: posiciones } = await pool.query(
      `SELECT bp.*, tw.address AS wallet_address
       FROM bot_positions bp
       JOIN tracked_wallets tw ON tw.alias = bp.wallet_alias
       WHERE bp.modo = $1`,
      [MODO_ACTUAL]
    );

    await mapLimit(posiciones, 5, async (pos) => {
      if (!pos.cost_basis_sol || pos.cost_basis_sol <= 0 || !pos.amount || pos.amount <= 0) return;
      const { decimals } = await getTokenInfoHelius(pos.token_mint);
      const valorActualSol = await estimarValorEnSol(pos.token_mint, pos.amount, decimals);
      if (valorActualSol === null) return;

      const ratio = valorActualSol / pos.cost_basis_sol;
      if (ratio > STOP_LOSS_PCT) return;

      log(
        'info',
        `🛑 STOP-LOSS activado: ${pos.wallet_alias} ${pos.symbol} · valor actual ${valorActualSol.toFixed(4)} SOL vs costo ${pos.cost_basis_sol.toFixed(4)} SOL (${(ratio * 100).toFixed(1)}%)`
      );
      await ejecutarStopLoss(pos, valorActualSol);
    });
  } catch (e) {
    log('error', `Error revisando stop-loss: ${e.message}`);
  }
}

async function ejecutarStopLoss(pos, valorEstimadoSol) {
  if (LIVE && pos.chain === 'solana' && walletKeypair && connection) {
    try {
      const before = await getWalletSolBalance();
      const sig = await ejecutarTrade({
        action: 'sell',
        mint: pos.token_mint,
        amount: pos.amount,
        origen: 'OnChain',
        slippage: DEFAULT_SLIPPAGE_BPS
      });
      await sleep(ESPERA_LECTURA_SALDO_MS);
      const after = await getWalletSolBalance();
      const proceedsSol = after - before;
      const solPrice = await getSolPriceUSD();
      const r = calcularResultado(pos.cost_basis_sol, proceedsSol, solPrice, false);

      await pool.query(
        'DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
        [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]
      );
      await pool.query(
        'DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
        [pos.wallet_address, pos.token_mint]
      );
      await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);

      let msg = `🛑 STOP-LOSS ejecutado [${pos.wallet_alias}] ${pos.symbol} · Salí con: ${proceedsSol.toFixed(4)} SOL · ${formatearResultado(r)} · tx: ${linkTx(sig)}`;
      if (r.profitSol > 0) {
        const usdcSig = await swapProfitToUsdc(r.profitSol);
        msg += usdcSig
          ? `\n💵 Ganancia convertida a USDC · tx: ${linkTx(usdcSig)}`
          : `\n⚠️ No se pudo convertir la ganancia a USDC`;
      }
      const rentRecuperado = await cerrarCuentaDelToken(pos.token_mint);
      if (rentRecuperado) {
        msg += `\n♻️ Cuenta cerrada, recuperado: ${rentRecuperado.toFixed(5)} SOL de rent`;
      }
      const saldoFinal = await getWalletSolBalance();
      msg += `\n💰 Saldo total: ${saldoFinal.toFixed(4)} SOL`;
      if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);
    } catch (e) {
      log('error', `Error ejecutando stop-loss real: ${e.message}`);
      if (esSellZeroAmount(e)) {
        await pool.query(
          'DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
          [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]
        );
        await pool.query(
          'DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
          [pos.wallet_address, pos.token_mint]
        );
        if (CHAT_ID) {
          bot.sendMessage(
            CHAT_ID,
            `🧹 [${pos.wallet_alias}] ${pos.symbol}: posición fantasma eliminada al intentar el stop-loss. No se cuenta como pérdida.`
          );
        }
      } else {
        if (CHAT_ID) {
          bot.sendMessage(
            CHAT_ID,
            `⚠️🛑 [${pos.wallet_alias}] ${pos.symbol}: intento de stop-loss falló (${mensajeAmigableError(e)}). Se reintentará en el próximo ciclo; si sigue fallando, la reconciliación se hará cargo.`
          );
        }
      }
    }
  } else {
    const solPrice = await getSolPriceUSD();
    const r = calcularResultado(pos.cost_basis_sol, valorEstimadoSol, solPrice, true);
    const proceedsUsd = solPrice ? r.proceedsNetoSol * solPrice : 0;

    await pool.query(
      'DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
      [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]
    );
    await pool.query(
      'DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
      [pos.wallet_address, pos.token_mint]
    );
    await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
    const nuevoSaldo = await adjustPaperBalance(proceedsUsd);

    if (CHAT_ID) {
      bot.sendMessage(
        CHAT_ID,
        `🛑 PAPER STOP-LOSS: ${pos.symbol} vía ${pos.wallet_alias} · Salí con (estimado, neto de fees): ${r.proceedsNetoSol.toFixed(4)} SOL (~$${proceedsUsd.toFixed(2)}) · ${formatearResultado(r)} · Saldo ficticio: $${nuevoSaldo.toFixed(2)}`
      );
    }
  }
}

// ---------- Compra ----------
async function handleTrackedBuy(tracked, trade, origen = 'PumpPortal', horaDeteccion = null) {
  const solPaid = trade.solAmount || 0;
  if (solPaid < DUST_MIN_SOL) {
    log('info', `Dust ignorado ${tracked.alias} (${solPaid} SOL) [${origen}]`);
    return;
  }

  const symbol = await getTokenSymbol(trade.mint);
  const link = `https://dexscreener.com/solana/${trade.mint}`;
  const etiquetaOrigen = origen !== 'PumpPortal' ? ` 🌐${origen}` : '';
  const solTxt = trade.solAmountEstimado
    ? 'SOL no reportado por Helius'
    : `${solPaid.toFixed(3)} SOL`;

  if (CHAT_ID) {
    bot.sendMessage(
      CHAT_ID,
      `👀 [${getLabel(tracked.chain)}${etiquetaOrigen}] ${tracked.alias} compró ${symbol} · ${solTxt}\n🔗 ${link}`
    );
  }

  const seen = await pool.query(
    'SELECT 1 FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
    [trade.traderPublicKey, trade.mint]
  );
  if (seen.rows.length > 0) {
    log('info', `R2: recompra/ya visto ignorado ${tracked.alias} ${symbol}`);
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `↪️ No copiado (recompra o ya visto)`);
    return;
  }

  const existingPos = await pool.query(
    'SELECT 1 FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
    [trade.mint, tracked.alias, MODO_ACTUAL]
  );
  if (existingPos.rows.length > 0) {
    log('info', 'R2: posición ya abierta con esta wallet en modo actual, ignorado');
    if (CHAT_ID) {
      bot.sendMessage(
        CHAT_ID,
        `↪️ No copiado (ya tienes posición abierta en este token vía ${tracked.alias})`
      );
    }
    return;
  }

  if (tracked.chain !== 'solana') {
    if (CHAT_ID) {
      bot.sendMessage(CHAT_ID, `↪️ No copiado (esta cadena solo genera alertas, no ejecución)`);
    }
    return;
  }

  let solPrice = await getSolPriceUSD();
  if (!solPrice) {
    log('warn', '⚠️ Sin precio de SOL disponible, usando fallback 150 USD para no abortar la compra');
    solPrice = 150;
  }

  const amountSol = usdToSolNeto(tracked.amount, solPrice);

  let tokensBought = 0;
  if (trade.tokenAmount && trade.solAmount > 0) {
    const factorEscala = amountSol / trade.solAmount;
    tokensBought = trade.tokenAmount * factorEscala;
  } else {
    const priceAtBuy = bondingCurvePriceSol(trade);
    tokensBought = priceAtBuy ? amountSol / priceAtBuy : 0;
  }

  if (LIVE && walletKeypair && connection) {
    const saldoActual = await getWalletSolBalance();
    const totalNecesario = amountSol + OVERHEAD_RED_SOL;
    if (saldoActual < totalNecesario) {
      log(
        'warn',
        `Fondos insuficientes para copiar a ${tracked.alias}: saldo ${saldoActual.toFixed(4)} SOL, se necesitan ${totalNecesario.toFixed(4)} SOL`
      );
      if (CHAT_ID) {
        bot.sendMessage(
          CHAT_ID,
          `⚠️ No copiado (${tracked.alias} → ${symbol}): saldo insuficiente. Tienes ${saldoActual.toFixed(4)} SOL, se necesitan ${totalNecesario.toFixed(4)} SOL (fee + red incluidos).`
        );
      }
      return;
    }

    try {
      const sig = await ejecutarTrade({
        action: 'buy',
        mint: trade.mint,
        amount: amountSol,
        origen,
        slippage: DEFAULT_SLIPPAGE_BPS
      });

      await pool.query(
        'INSERT INTO bot_positions (token_mint,symbol,chain,amount,cost_basis_sol,wallet_alias,modo) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [trade.mint, symbol, tracked.chain, tokensBought, amountSol, tracked.alias, MODO_ACTUAL]
      );
      await pool.query(
        'INSERT INTO seen_tokens VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [trade.traderPublicKey, trade.mint]
      );

      try {
        const saldoFinal = await getWalletSolBalance();
        if (CHAT_ID) {
          await bot.sendMessage(
            CHAT_ID,
            `✅ COMPRA REAL [${tracked.alias}] ${symbol} · ${amountSol.toFixed(4)} SOL (~$${tracked.amount} todo incluido) · tx: ${linkTx(sig)}\n💰 Saldo total: ${saldoFinal.toFixed(4)} SOL`
          );
        }
      } catch (e) {
        log('warn', `No se pudo enviar mensaje de compra: ${e.message}`);
      }

      chequearRetraso(horaDeteccion, tracked.alias, symbol);
    } catch (e) {
      log('error', `Error comprando real: ${e.message}`);
      if (CHAT_ID) {
        bot.sendMessage(CHAT_ID, `❌ No copiado (${tracked.alias} → ${symbol}): ${mensajeAmigableError(e)}`);
      }
    }
  } else {
    await pool.query(
      'INSERT INTO bot_positions (token_mint,symbol,chain,amount,cost_basis_sol,wallet_alias,modo) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [trade.mint, symbol, tracked.chain, tokensBought, amountSol, tracked.alias, MODO_ACTUAL]
    );
    await pool.query(
      'INSERT INTO seen_tokens VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [trade.traderPublicKey, trade.mint]
    );
    const nuevoSaldo = await adjustPaperBalance(-tracked.amount);
    const saldoSeguro = Number.isFinite(nuevoSaldo) ? nuevoSaldo : INITIAL_PAPER_BALANCE;

    if (CHAT_ID) {
      bot.sendMessage(
        CHAT_ID,
        `🧪 PAPER: ${NOMBRE_BOT} copió a ${tracked.alias} - compró ${symbol} con ${amountSol.toFixed(4)} SOL (~$${tracked.amount} todo incluido) · Saldo ficticio: $${saldoSeguro.toFixed(2)}`
      );
    }
    chequearRetraso(horaDeteccion, tracked.alias, symbol);
  }
}

// ---------- Venta ----------
async function handleTrackedSell(tracked, trade, origen = 'PumpPortal', horaDeteccion = null) {
  const symbol = await getTokenSymbol(trade.mint);
  const etiquetaOrigen = origen !== 'PumpPortal' ? ` 🌐${origen}` : '';

  const posRes = await pool.query(
    'SELECT * FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
    [trade.mint, tracked.alias, MODO_ACTUAL]
  );

  if (posRes.rows.length === 0) {
    if (CHAT_ID) {
      bot.sendMessage(
        CHAT_ID,
        `👀 [${getLabel(tracked.chain)}${etiquetaOrigen}] ${tracked.alias} vendió ${symbol} (no tenías posición vía esta wallet, nada que copiar)`
      );
    }
    return;
  }

  // Módulo C: consultar el balance real de la wallet trackeada después de la venta
  let walletQuedoSinTokens = true;
  try {
    const balanceTrasVenta = await getBalanceDeTokenEnWallet(tracked.address, trade.mint);
    if (balanceTrasVenta !== null && balanceTrasVenta > 0) {
      walletQuedoSinTokens = false;
    }
  } catch (e) {
    log('warn', `No se pudo verificar balance post-venta de ${tracked.alias} para ${symbol}: ${e.message}. Asumiendo venta total.`);
  }

  if (walletQuedoSinTokens) {
    await pool.query('DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [
      trade.traderPublicKey,
      trade.mint
    ]);
    log('info', `🧹 seen_tokens limpiado para ${tracked.alias} ${symbol} (venta total confirmada)`);
  } else {
    log('info', `🔒 seen_tokens conservado para ${tracked.alias} ${symbol} (venta parcial, wallet aún tiene tokens)`);
  }

  const position = posRes.rows[0];

  if (LIVE && tracked.chain === 'solana' && walletKeypair && connection) {
    try {
      const before = await getWalletSolBalance();
      const sig = await ejecutarTrade({
        action: 'sell',
        mint: trade.mint,
        amount: position.amount,
        origen,
        slippage: DEFAULT_SLIPPAGE_BPS
      });
      await sleep(ESPERA_LECTURA_SALDO_MS);
      const after = await getWalletSolBalance();
      const proceedsSol = after - before;
      const solPrice = await getSolPriceUSD();
      const r = calcularResultado(position.cost_basis_sol, proceedsSol, solPrice, false);

      await pool.query(
        'DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
        [trade.mint, tracked.alias, MODO_ACTUAL]
      );
      await registrarTradeCerrado(tracked.alias, symbol, r.profitSol);

      let msg = `📤 VENTA REAL [${tracked.alias}] ${symbol} 100% · Salí con: ${proceedsSol.toFixed(4)} SOL · ${formatearResultado(r)} · tx: ${linkTx(sig)}`;
      if (r.profitSol > 0) {
        const usdcSig = await swapProfitToUsdc(r.profitSol);
        msg += usdcSig
          ? `\n💵 Ganancia convertida a USDC · tx: ${linkTx(usdcSig)}`
          : `\n⚠️ No se pudo convertir la ganancia a USDC`;
      }
      const rentRecuperado = await cerrarCuentaDelToken(trade.mint);
      if (rentRecuperado) {
        msg += `\n♻️ Cuenta cerrada, recuperado: ${rentRecuperado.toFixed(5)} SOL de rent`;
      }
      const saldoFinal = await getWalletSolBalance();
      msg += `\n💰 Saldo total: ${saldoFinal.toFixed(4)} SOL`;
      if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);

      chequearRetraso(horaDeteccion, tracked.alias, symbol);
    } catch (e) {
      log('error', `Error vendiendo real: ${e.message}`);
      if (esSellZeroAmount(e)) {
        await pool.query(
          'DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
          [trade.mint, tracked.alias, MODO_ACTUAL]
        );
        if (CHAT_ID) {
          bot.sendMessage(
            CHAT_ID,
            `🧹 [${tracked.alias}] ${symbol}: posición fantasma eliminada — la compra original nunca se ejecutó de verdad. No se cuenta como pérdida.`
          );
        }
      } else {
        if (CHAT_ID) {
          bot.sendMessage(
            CHAT_ID,
            `❌ Error al vender ${symbol}: ${mensajeAmigableError(e)}\n(la posición sigue abierta, se reintentará con la próxima reconciliación)`
          );
        }
      }
    }
  } else {
    let proceedsSol;
    if (trade.tokenAmount && trade.solAmount > 0) {
      const precioPorToken = trade.solAmount / trade.tokenAmount;
      proceedsSol = position.amount * precioPorToken;
    } else {
      const priceAtSell = bondingCurvePriceSol(trade);
      proceedsSol = priceAtSell ? position.amount * priceAtSell : position.cost_basis_sol;
    }

    const costBasis = Number(position.cost_basis_sol) || 0;
    if (costBasis > 0 && proceedsSol > costBasis * 100) {
      log(
        'warn',
        `⚠️ proceedsSol absurdo detectado para ${symbol}: ${proceedsSol.toFixed(4)} SOL vs cost_basis ${costBasis.toFixed(4)} SOL. Usando cost_basis (sin ganancia) para no contaminar el balance.`
      );
      proceedsSol = costBasis;
    }
    if (costBasis > 0 && proceedsSol < 0) {
      log(
        'warn',
        `⚠️ proceedsSol negativo detectado para ${symbol}: ${proceedsSol.toFixed(4)} SOL. Usando 0.`
      );
      proceedsSol = 0;
    }

    let solPrice = await getSolPriceUSD();
    if (!solPrice) {
      log('warn', '⚠️ Sin precio de SOL disponible, usando fallback 150 USD para no abortar la venta');
      solPrice = 150;
    }

    const r = calcularResultado(position.cost_basis_sol, proceedsSol, solPrice, true);
    const proceedsUsd = solPrice ? r.proceedsNetoSol * solPrice : tracked.amount;

    await pool.query(
      'DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
      [trade.mint, tracked.alias, MODO_ACTUAL]
    );
    await registrarTradeCerrado(tracked.alias, symbol, r.profitSol);
    const nuevoSaldo = await adjustPaperBalance(proceedsUsd);
    const saldoSeguro = Number.isFinite(nuevoSaldo) ? nuevoSaldo : INITIAL_PAPER_BALANCE;

    let msg = `🧪 PAPER: ${NOMBRE_BOT} vendió 100% ${symbol} (copiando a ${tracked.alias}) · Salí con (neto de fees): ${r.proceedsNetoSol.toFixed(4)} SOL (~$${proceedsUsd.toFixed(2)}) · ${formatearResultado(r)} · Saldo ficticio: $${saldoSeguro.toFixed(2)}`;
    if (r.profitSol > 0) {
      msg += `\n💵 (simulado) ${r.profitSol.toFixed(4)} SOL de ganancia se convertirían a USDC`;
    }
    if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);

    chequearRetraso(horaDeteccion, tracked.alias, symbol);
  }
}

// ---------- Módulo B: detección automática de ventas manuales (solo modo REAL) ----------
let ultimaSignatureManualCheck = null;

async function detectarVentasManuales() {
  if (!LIVE || !connection || !walletKeypair) return;

  try {
    const apiKey = getHeliusApiKey();
    if (!apiKey) return;

    const wallet = walletKeypair.publicKey.toBase58();
    const res = await fetch(
      `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${apiKey}&limit=25`
    );
    if (!res.ok) return;
    const txs = await res.json();
    if (!Array.isArray(txs) || txs.length === 0) return;

    const { rows: posiciones } = await pool.query(
      `SELECT * FROM bot_positions WHERE modo = 'real'`
    );
    if (posiciones.length === 0) return;

    const mintsAbiertos = new Set(posiciones.map((p) => p.token_mint));

    for (const tx of txs) {
      if (!tx.signature) continue;
      if (yaProcesadaSignature(tx.signature)) continue;
      if (ultimaSignatureManualCheck === tx.signature) break;

      const cambios = extraerCambiosDeTxParaWallet(tx, wallet);
      for (const cambio of cambios) {
        if (cambio.direction !== 'sell') continue;
        if (!mintsAbiertos.has(cambio.mint)) continue;

        const pos = posiciones
          .filter((p) => p.token_mint === cambio.mint)
          .sort((a, b) => new Date(a.closed_at || 0) - new Date(b.closed_at || 0))[0];
        if (!pos) continue;

        const { rows: existente } = await pool.query(
          `SELECT 1 FROM trade_history
           WHERE wallet_alias=$1 AND symbol=$2 AND modo='real'
             AND closed_at > NOW() - INTERVAL '15 minutes'`,
          [pos.wallet_alias, pos.symbol]
        );
        if (existente.length > 0) continue;

        const solPrice = await getSolPriceUSD();
        const proceedsSol = cambio.solAmount;
        const r = calcularResultado(pos.cost_basis_sol, proceedsSol, solPrice, false);

        await pool.query(
          'DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
          [pos.token_mint, pos.wallet_alias, 'real']
        );
        await pool.query(
          'DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
          [pos.wallet_address, pos.token_mint]
        );
        await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
        marcarSignatureProcesada(tx.signature);

        log(
          'info',
          `🖐️ Venta MANUAL detectada [${pos.wallet_alias}] ${pos.symbol} · proceeds ${proceedsSol.toFixed(4)} SOL · ${formatearResultado(r)}`
        );

        if (CHAT_ID) {
          bot.sendMessage(
            CHAT_ID,
            `🖐️ Venta MANUAL detectada [${pos.wallet_alias}] ${pos.symbol}\nSalí con: ${proceedsSol.toFixed(4)} SOL · ${formatearResultado(r)}\ntx: ${linkTx(tx.signature)}`
          );
        }
      }
    }

    if (txs[0]?.signature) ultimaSignatureManualCheck = txs[0].signature;
  } catch (e) {
    log('error', `Error detectando ventas manuales: ${e.message}`);
  }
}

// ===== FIN BLOQUE 4 =====

// ---------- Comandos de Telegram ----------

// /add <alias> <dirección> <montoUSD> [cadena]
bot.onText(/\/add (.+)/, async (msg, match) => {
  if (!esAdmin(msg)) return;
  try {
    const args = match[1].trim().split(/\s+/);
    const [alias, address, amountStr, chainRaw] = args;

    if (!alias || !address || !amountStr) {
      bot.sendMessage(msg.chat.id, '⚠️ Uso: /add <alias> <dirección> <montoUSD> [cadena]');
      return;
    }

    const amount = parseFloat(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      bot.sendMessage(msg.chat.id, '⚠️ Monto inválido. Debe ser un número mayor a 0.');
      return;
    }

    const chain = normalizeChain(chainRaw);

    if (chain === 'solana') {
      try {
        new PublicKey(address);
      } catch {
        bot.sendMessage(msg.chat.id, '⚠️ Dirección de Solana inválida.');
        return;
      }
    }

    await pool.query(
      'INSERT INTO tracked_wallets VALUES ($1,$2,$3,$4) ON CONFLICT(alias) DO UPDATE SET address=$2, amount=$3, chain=$4',
      [alias, address, amount, chain]
    );
    await crearOActualizarWebhookHelius();

    bot.sendMessage(msg.chat.id, `⏳ Snapshot ${alias} en ${getLabel(chain)}...`);

    const holdings = await getHoldings(address);
    for (const h of holdings) {
      if (!h.mint) continue;
      await pool.query('INSERT INTO seen_tokens VALUES ($1,$2) ON CONFLICT DO NOTHING', [
        address,
        h.mint
      ]);
    }

    bot.sendMessage(
      msg.chat.id,
      `✅ ${alias} agregado [${getLabel(chain)}] $${amount} USD por compra (fees y red incluidos). Snapshot real: ${holdings.length} tokens vistos. Escuchando pump.fun ✅ y cualquier DEX ✅`
    );
  } catch (e) {
    log('error', `Error en /add: ${e.message}`);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// /setamount <alias> <nuevoMontoUSD>
bot.onText(/\/setamount (\S+) (\S+)/, async (msg, match) => {
  if (!esAdmin(msg)) return;
  try {
    const alias = match[1];
    const nuevoMonto = parseFloat(match[2]);
    if (!Number.isFinite(nuevoMonto) || nuevoMonto <= 0) {
      bot.sendMessage(msg.chat.id, '⚠️ Monto inválido. Usa: /setamount alias nuevo_monto (ej. /setamount CAP 6)');
      return;
    }
    const result = await pool.query(
      'UPDATE tracked_wallets SET amount=$1 WHERE alias=$2 RETURNING alias, amount',
      [nuevoMonto, alias]
    );
    if (result.rows.length > 0) {
      bot.sendMessage(msg.chat.id, `✅ ${alias} ahora usa $${nuevoMonto} USD por compra (efectivo desde la próxima señal).`);
    } else {
      bot.sendMessage(msg.chat.id, `⚠️ No encontré ninguna wallet con el alias "${alias}"`);
    }
  } catch (e) {
    log('error', `Error en /setamount: ${e.message}`);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// /remove <alias>
bot.onText(/\/remove (.+)/, async (msg, match) => {
  if (!esAdmin(msg)) return;
  try {
    const alias = match[1].trim();
    const result = await pool.query('DELETE FROM tracked_wallets WHERE alias=$1 RETURNING alias', [alias]);
    if (result.rows.length > 0) {
      bot.sendMessage(msg.chat.id, `✅ ${alias} eliminado de tracked_wallets.`);
      await crearOActualizarWebhookHelius();
    } else {
      bot.sendMessage(msg.chat.id, `⚠️ No encontré ninguna wallet con el alias "${alias}"`);
    }
  } catch (e) {
    log('error', `Error en /remove: ${e.message}`);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// /list
bot.onText(/\/list/, async (msg) => {
  if (!esAdmin(msg)) return;
  try {
    const { rows } = await pool.query(
      'SELECT alias, address, amount, chain FROM tracked_wallets ORDER BY alias'
    );
    if (rows.length === 0) {
      bot.sendMessage(msg.chat.id, '📭 No hay wallets trackeadas.');
      return;
    }
    const lines = rows.map(
      (r) => `• ${r.alias} [${getLabel(r.chain)}] ${r.address} ($${r.amount})`
    );
    bot.sendMessage(msg.chat.id, `📋 Wallets trackeadas:\n${lines.join('\n')}`);
  } catch (e) {
    log('error', `Error en /list: ${e.message}`);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// /diag <alias>
bot.onText(/\/diag (.+)/, async (msg, match) => {
  if (!esAdmin(msg)) return;
  try {
    const alias = match[1].trim();
    const diag = await diagnosticoHelius(alias);
    if (diag.error) {
      bot.sendMessage(msg.chat.id, `❌ Error en diagnóstico: ${diag.error}`);
      return;
    }
    const { webhookInfo, historial, address, alias: diagAlias, saludWebhook } = diag;

    let txt = `🔍 Diagnóstico de ${diagAlias} (${address})\n`;
    txt += `🪝 Webhook registrado: ${webhookInfo.error ? '❌ ' + webhookInfo.error : '✅ OK'}\n`;
    if (!webhookInfo.error && webhookInfo.webhookURL) txt += `🔗 URL: ${webhookInfo.webhookURL}\n`;
    if (!webhookInfo.error && webhookInfo.transactionTypes) {
      txt += `📦 Tipos: ${webhookInfo.transactionTypes.join(', ')}\n`;
    }
    if (saludWebhook) {
      txt += `\n📈 Salud del webhook:\n`;
      txt += `• Activo: ${saludWebhook.active === null ? 'n/d' : saludWebhook.active ? '✅ sí' : '❌ NO'}\n`;
      txt += `• Failure rate (24h): ${saludWebhook.failureRate === null ? 'n/d' : (saludWebhook.failureRate * 100).toFixed(1) + '%'}\n`;
      txt += `• Cooldown: ${saludWebhook.isUnderCooldown === null ? 'n/d' : saludWebhook.isUnderCooldown ? '🔴 SÍ (Helius suspendió envíos)' : 'no'}\n`;
      txt += `• Último envío: ${saludWebhook.lastSentAt || 'nunca'}\n`;
      if (saludWebhook.lastError) txt += `• Último error: ${saludWebhook.lastError}\n`;
    }
    txt += `📜 Últimas 10 tx: ${historial.error ? '❌ ' + historial.error : `✅ ${historial.length} transacciones obtenidas`}`;
    bot.sendMessage(msg.chat.id, txt);
  } catch (e) {
    log('error', `Error en /diag: ${e.message}`);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// /status
bot.onText(/\/status/, async (msg) => {
  if (!esAdmin(msg)) return;
  try {
    const modo = MODO_ACTUAL.toUpperCase();
    const solPrice = await getSolPriceUSD();
    const solBal = LIVE ? await getWalletSolBalance() : 'N/A (paper)';
    const paper = await getPaperBalance();

    let txt = `🤖 Estado del bot\n`;
    txt += `⚙️ Modo: ${modo}\n`;
    txt += `💵 Precio SOL: $${solPrice?.toFixed(2) ?? 'N/A'}\n`;
    txt += `💰 SOL en wallet: ${typeof solBal === 'number' ? solBal.toFixed(4) : solBal}\n`;
    txt += `📄 Balance paper: $${paper.current_usdc.toFixed(2)} (inicial $${paper.initial_usdc.toFixed(2)})\n`;
    bot.sendMessage(msg.chat.id, txt);
  } catch (e) {
    log('error', `Error en /status: ${e.message}`);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// /help
bot.onText(/\/help/, async (msg) => {
  if (!esAdmin(msg)) return;
  const ayuda = `
🤖 Comandos disponibles:

📋 GESTIÓN DE WALLETS:
/add <alias> <dirección> <montoUSD> [cadena] – Agrega una wallet a seguir
/setamount <alias> <nuevoMontoUSD> – Cambia el monto USD por compra
/remove <alias> – Elimina una wallet de seguimiento
/list – Lista todas las wallets trackeadas
/diag <alias> – Diagnóstico de webhook y últimas tx

📊 ANÁLISIS:
/ranking [real|paper] – Ranking de wallets activas con recomendación
/wallets [real|paper] – Resumen rápido de todas las wallets
/wallet <alias> – Detalle completo de una wallet específica
/pnl – PnL realizado + no realizado + total
/positions – Posiciones abiertas del bot (incluye mint para /close)

🔧 CIERRE MANUAL:
/close <alias> <mint> – Cierra manualmente una posición
/closeall <alias> – Cierra todas las posiciones de una wallet

⚙️ SISTEMA:
/status – Estado general del bot
/cleanup – Limpia posiciones de wallets borradas
/fixwebhook – Fuerza la recreación del webhook en Helius
/help – Esta ayuda
`;
  bot.sendMessage(msg.chat.id, ayuda);
});

// /positions (ahora incluye mint para facilitar /close)
bot.onText(/\/positions/, async (msg) => {
  if (!esAdmin(msg)) return;
  try {
    const { rows } = await pool.query(
      `SELECT bp.token_mint, bp.symbol, bp.chain, bp.amount, bp.cost_basis_sol, bp.wallet_alias, bp.modo
       FROM bot_positions bp
       WHERE bp.modo = $1`,
      [MODO_ACTUAL]
    );
    if (rows.length === 0) {
      bot.sendMessage(msg.chat.id, `📭 No hay posiciones abiertas en modo ${MODO_ACTUAL.toUpperCase()}.`);
      return;
    }
    const lines = rows.map((r) => {
      const modoTag = r.modo === 'real' ? '🟢 REAL' : '🟡 PAPER';
      const amount = Number(r.amount || 0).toFixed(4);
      const cost = Number(r.cost_basis_sol || 0).toFixed(4);
      return `• ${r.symbol} (${r.chain}) – ${amount} tokens – costo ${cost} SOL – wallet: ${r.wallet_alias} [${modoTag}]\n  mint: ${r.token_mint}`;
    });
    bot.sendMessage(
      msg.chat.id,
      `📊 Posiciones abiertas (${MODO_ACTUAL.toUpperCase()}):\n${lines.join('\n')}`
    );
  } catch (e) {
    log('error', `Error en /positions: ${e.message}`);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// ---------- Comandos de cierre manual ----------

// /close <alias> <mint>
bot.onText(/\/close (\S+) (\S+)/, async (msg, match) => {
  if (!esAdmin(msg)) return;
  try {
    const alias = match[1].trim();
    const mint = match[2].trim();

    const posRes = await pool.query(
      'SELECT * FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
      [mint, alias, MODO_ACTUAL]
    );
    if (posRes.rows.length === 0) {
      bot.sendMessage(
        msg.chat.id,
        `⚠️ No encontré posición abierta con alias "${alias}" y mint "${mint}" en modo ${MODO_ACTUAL.toUpperCase()}.`
      );
      return;
    }

    const pos = posRes.rows[0];
    const { decimals } = await getTokenInfoHelius(pos.token_mint);
    const valorEstimado = await estimarValorEnSol(pos.token_mint, pos.amount, decimals);

    // Buscar la dirección de la wallet para limpiar seen_tokens correctamente
    const { rows: trackedRows } = await pool.query('SELECT address FROM tracked_wallets WHERE alias=$1', [alias]);
    const walletAddress = trackedRows[0]?.address || alias;

    if (MODO_ACTUAL === 'paper' && valorEstimado !== null) {
      const solPrice = await getSolPriceUSD();
      const r = calcularResultado(pos.cost_basis_sol, valorEstimado, solPrice, true);
      const proceedsUsd = solPrice ? r.proceedsNetoSol * solPrice : 0;

      await pool.query(
        'DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
        [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]
      );
      await pool.query(
        'DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
        [walletAddress, pos.token_mint]
      );
      await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
      const nuevoSaldo = await adjustPaperBalance(proceedsUsd);
      const saldoSeguro = Number.isFinite(nuevoSaldo) ? nuevoSaldo : INITIAL_PAPER_BALANCE;

      bot.sendMessage(
        msg.chat.id,
        `🖐️ CIERRE MANUAL [${pos.wallet_alias}] ${pos.symbol}\nSalí con (estimado, neto de fees): ${r.proceedsNetoSol.toFixed(4)} SOL (~$${proceedsUsd.toFixed(2)})\n${formatearResultado(r)}\nSaldo ficticio: $${saldoSeguro.toFixed(2)}`
      );
      log('info', `🖐️ Cierre manual (paper) [${pos.wallet_alias}] ${pos.symbol}: ${formatearResultado(r)}`);
    } else {
      await pool.query(
        'DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
        [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]
      );
      await pool.query(
        'DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
        [walletAddress, pos.token_mint]
      );

      bot.sendMessage(
        msg.chat.id,
        `🖐️ Posición cerrada manualmente [${pos.wallet_alias}] ${pos.symbol}.\n\n⚠️ En modo REAL, el PnL se calculará automáticamente cuando el bot detecte la venta on-chain (módulo de detección de ventas manuales). Si ya vendiste, en los próximos 2 minutos debería llegar el mensaje de "🖐️ Venta MANUAL detectada" con el PnL real.`
      );
      log('info', `🖐️ Cierre manual (real) [${pos.wallet_alias}] ${pos.symbol}: solo limpia DB, PnL por detector`);
    }
  } catch (e) {
    log('error', `Error en /close: ${e.message}`);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// /closeall <alias>
bot.onText(/\/closeall (\S+)/, async (msg, match) => {
  if (!esAdmin(msg)) return;
  try {
    const alias = match[1].trim();

    const posRes = await pool.query(
      'SELECT * FROM bot_positions WHERE wallet_alias=$1 AND modo=$2',
      [alias, MODO_ACTUAL]
    );
    if (posRes.rows.length === 0) {
      bot.sendMessage(
        msg.chat.id,
        `⚠️ No hay posiciones abiertas para "${alias}" en modo ${MODO_ACTUAL.toUpperCase()}.`
      );
      return;
    }

    const { rows: trackedRows } = await pool.query('SELECT address FROM tracked_wallets WHERE alias=$1', [alias]);
    const walletAddress = trackedRows[0]?.address || alias;

    const solPrice = await getSolPriceUSD();
    let cerradas = 0;
    let pnlTotalSol = 0;
    let usdTotal = 0;
    const simbolos = [];

    for (const pos of posRes.rows) {
      const { decimals } = await getTokenInfoHelius(pos.token_mint);
      const valorEstimado = await estimarValorEnSol(pos.token_mint, pos.amount, decimals);

      if (MODO_ACTUAL === 'paper' && valorEstimado !== null) {
        const r = calcularResultado(pos.cost_basis_sol, valorEstimado, solPrice, true);
        const proceedsUsd = solPrice ? r.proceedsNetoSol * solPrice : 0;
        await adjustPaperBalance(proceedsUsd);
        await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
        pnlTotalSol += r.profitSol;
        usdTotal += proceedsUsd;
      }

      await pool.query(
        'DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
        [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]
      );
      await pool.query(
        'DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
        [walletAddress, pos.token_mint]
      );
      cerradas++;
      simbolos.push(pos.symbol);
    }

    const emoji = pnlTotalSol >= 0 ? '🟢' : '🔴';
    let txt = `🖐️ ${cerradas} posiciones cerradas manualmente [${alias}]\n`;
    txt += `Tokens: ${simbolos.join(', ')}\n`;
    if (MODO_ACTUAL === 'paper') {
      txt += `PnL total estimado: ${emoji} ${pnlTotalSol >= 0 ? '+' : ''}${pnlTotalSol.toFixed(4)} SOL`;
      if (solPrice) txt += ` (~$${usdTotal.toFixed(2)})`;
    } else {
      txt += `⚠️ Modo REAL: PnL se calculará cuando el detector detecte las ventas on-chain.`;
    }
    bot.sendMessage(msg.chat.id, txt);
    log('info', `🖐️ /closeall ${alias}: ${cerradas} posiciones cerradas`);
  } catch (e) {
    log('error', `Error en /closeall: ${e.message}`);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// ---------- Funciones auxiliares para /ranking, /wallets, /wallet ----------
async function obtenerStatsWallets(modo) {
  const { rows: activas } = await pool.query('SELECT alias FROM tracked_wallets');
  const aliasesActivos = activas.map((r) => r.alias);
  if (aliasesActivos.length === 0) return [];

  const { rows: hist } = await pool.query(
    `SELECT
       wallet_alias,
       COUNT(*)::int as trades,
       SUM(CASE WHEN profit_sol > 0 THEN 1 ELSE 0 END)::int as wins,
       SUM(CASE WHEN profit_sol < 0 THEN 1 ELSE 0 END)::int as losses,
       SUM(profit_sol) as total_profit_sol,
       AVG(profit_sol) as avg_profit_sol,
       MAX(profit_sol) as best_trade,
       MIN(profit_sol) as worst_trade,
       MAX(closed_at) as ultima_actividad
     FROM trade_history
     WHERE modo = $1 AND wallet_alias = ANY($2::text[])
     GROUP BY wallet_alias`,
    [modo, aliasesActivos]
  );

  const statsMap = new Map();
  for (const r of hist) {
    statsMap.set(r.wallet_alias, r);
  }

  const resultado = [];
  for (const alias of aliasesActivos) {
    const s = statsMap.get(alias) || {
      wallet_alias: alias,
      trades: 0,
      wins: 0,
      losses: 0,
      total_profit_sol: 0,
      avg_profit_sol: 0,
      best_trade: null,
      worst_trade: null,
      ultima_actividad: null
    };
    resultado.push(s);
  }

  return resultado;
}

function calcularRecomendacion(stats) {
  const trades = Number(stats.trades) || 0;
  const total = Number(stats.total_profit_sol) || 0;
  const wins = Number(stats.wins) || 0;
  const wr = trades > 0 ? wins / trades : 0;

  if (trades === 0) {
    return { emoji: '⚪', texto: 'SIN DATOS' };
  }

  let horasInactiva = null;
  if (stats.ultima_actividad) {
    horasInactiva = (Date.now() - new Date(stats.ultima_actividad).getTime()) / 3600000;
  }

  if (horasInactiva !== null && horasInactiva > 7 * 24) {
    return { emoji: '💤', texto: 'INACTIVA >7d' };
  }
  if (total > 0 && wr >= 0.5) {
    return { emoji: '✅', texto: 'MANTENER' };
  }
  if (total < 0 && wr < 0.4) {
    return { emoji: '❌', texto: 'REMOVER' };
  }
  return { emoji: '⚠️', texto: 'VIGILAR' };
}

function formatearTiempoRelativo(fecha) {
  if (!fecha) return 'nunca';
  const ms = Date.now() - new Date(fecha).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// /ranking [real|paper]
bot.onText(/\/ranking(?:\s+(\S+))?/, async (msg, match) => {
  if (!esAdmin(msg)) return;
  try {
    const modoFiltro = match[1]?.toLowerCase();
    const modo = modoFiltro === 'real' ? 'real' : modoFiltro === 'paper' ? 'paper' : MODO_ACTUAL;

    const stats = await obtenerStatsWallets(modo);
    if (stats.length === 0) {
      bot.sendMessage(msg.chat.id, `📭 No hay wallets trackeadas en modo ${modo.toUpperCase()}.`);
      return;
    }

    stats.sort((a, b) => Number(b.total_profit_sol || 0) - Number(a.total_profit_sol || 0));

    const solPrice = await getSolPriceUSD();
    let totalGlobalSol = 0;
    let totalGlobalTrades = 0;
    let activasMantener = 0;
    let activasVigilar = 0;
    let activasRemover = 0;

    const lineas = stats.map((s, i) => {
      const total = Number(s.total_profit_sol || 0);
      const trades = Number(s.trades) || 0;
      const wins = Number(s.wins) || 0;
      const wr = trades > 0 ? ((wins / trades) * 100).toFixed(0) : '—';
      const promedio = trades > 0 ? Number(s.avg_profit_sol || 0) : 0;
      const ultima = formatearTiempoRelativo(s.ultima_actividad);
      const reco = calcularRecomendacion(s);

      totalGlobalSol += total;
      totalGlobalTrades += trades;

      if (reco.texto === 'MANTENER') activasMantener++;
      else if (reco.texto === 'REMOVER') activasRemover++;
      else if (reco.texto === 'VIGILAR') activasVigilar++;

      const totalTxt = `${total >= 0 ? '+' : ''}${total.toFixed(4)} SOL`;
      const usdTxt = solPrice ? ` (${total >= 0 ? '+' : '-'}$${Math.abs(total * solPrice).toFixed(2)})` : '';
      const promTxt = trades > 0 ? `${promedio >= 0 ? '+' : ''}${promedio.toFixed(4)}/trade` : 'sin trades';
      const best = s.best_trade !== null ? `+${Number(s.best_trade).toFixed(3)}` : '—';
      const worst = s.worst_trade !== null ? `${Number(s.worst_trade).toFixed(3)}` : '—';

      return `${reco.emoji} ${i + 1}. ${s.wallet_alias} — ${reco.texto}
   PnL: ${totalTxt}${usdTxt}
   Trades: ${trades} · WR ${wr}% · Prom ${promTxt}
   Mejor: ${best} · Peor: ${worst} · Última: ${ultima}`;
    });

    const emojiGlobal = totalGlobalSol >= 0 ? '🟢' : '🔴';
    const usdGlobal = solPrice ? ` (~$${(totalGlobalSol * solPrice).toFixed(2)})` : '';

    let header = `🏆 Ranking WALLETS ACTIVAS (${modo.toUpperCase()}) ${emojiGlobal}\n`;
    header += `PnL total: ${totalGlobalSol >= 0 ? '+' : ''}${totalGlobalSol.toFixed(4)} SOL${usdGlobal}\n`;
    header += `Trades totales: ${totalGlobalTrades}\n`;
    header += `✅ ${activasMantener} · ⚠️ ${activasVigilar} · ❌ ${activasRemover}\n`;
    header += `─────────────────────`;

    bot.sendMessage(msg.chat.id, `${header}\n\n${lineas.join('\n\n')}`);
  } catch (e) {
    log('error', `Error en /ranking: ${e.message}`);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// /wallets [real|paper]
bot.onText(/\/wallets(?:\s+(\S+))?/, async (msg, match) => {
  if (!esAdmin(msg)) return;
  try {
    const modoFiltro = match[1]?.toLowerCase();
    const modo = modoFiltro === 'real' ? 'real' : modoFiltro === 'paper' ? 'paper' : MODO_ACTUAL;

    const stats = await obtenerStatsWallets(modo);
    if (stats.length === 0) {
      bot.sendMessage(msg.chat.id, `📭 No hay wallets trackeadas en modo ${modo.toUpperCase()}.`);
      return;
    }

    stats.sort((a, b) => Number(b.total_profit_sol || 0) - Number(a.total_profit_sol || 0));

    const solPrice = await getSolPriceUSD();
    let totalSol = 0;
    let totalTrades = 0;
    let ganadoras = 0;
    let perdedoras = 0;
    let neutras = 0;

    const lineas = stats.map((s) => {
      const total = Number(s.total_profit_sol || 0);
      const trades = Number(s.trades) || 0;
      const wins = Number(s.wins) || 0;
      const wr = trades > 0 ? ((wins / trades) * 100).toFixed(0) : '—';
      const ultima = formatearTiempoRelativo(s.ultima_actividad);

      totalSol += total;
      totalTrades += trades;
      if (total > 0.001) ganadoras++;
      else if (total < -0.001) perdedoras++;
      else neutras++;

      const emoji = total > 0.001 ? '🟢' : total < -0.001 ? '🔴' : '⚪';
      const totalTxt = `${total >= 0 ? '+' : ''}${total.toFixed(3)} SOL`;

      return `${emoji} ${s.wallet_alias.padEnd(15)} ${totalTxt.padStart(11)} · ${wr.padStart(3)}% WR · ${ultima}`;
    });

    const emojiGlobal = totalSol >= 0 ? '🟢' : '🔴';
    const usdGlobal = solPrice ? ` (~$${(totalSol * solPrice).toFixed(2)})` : '';

    let txt = `📋 Wallets activas (${modo.toUpperCase()}) — ${stats.length}\n\n`;
    txt += lineas.join('\n');
    txt += `\n\n─────────────────────\n`;
    txt += `Total: ${emojiGlobal} ${totalSol >= 0 ? '+' : ''}${totalSol.toFixed(4)} SOL${usdGlobal}\n`;
    txt += `${totalTrades} trades · ${ganadoras} ganadoras · ${perdedoras} perdedoras · ${neutras} neutras`;

    bot.sendMessage(msg.chat.id, txt);
  } catch (e) {
    log('error', `Error en /wallets: ${e.message}`);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// /wallet <alias>
bot.onText(/\/wallet (\S+)/, async (msg, match) => {
  if (!esAdmin(msg)) return;
  try {
    const alias = match[1].trim();

    const { rows: tracked } = await pool.query('SELECT * FROM tracked_wallets WHERE alias=$1', [alias]);
    if (tracked.length === 0) {
      bot.sendMessage(msg.chat.id, `⚠️ No existe la wallet "${alias}" en tracked_wallets.`);
      return;
    }

    const { rows: hist } = await pool.query(
      `SELECT profit_sol, symbol, closed_at FROM trade_history
       WHERE wallet_alias=$1 AND modo=$2
       ORDER BY closed_at DESC`,
      [alias, MODO_ACTUAL]
    );

    if (hist.length === 0) {
      bot.sendMessage(
        msg.chat.id,
        `📊 ${alias} — sin trades cerrados en modo ${MODO_ACTUAL.toUpperCase()} todavía.`
      );
      return;
    }

    const trades = hist.length;
    const wins = hist.filter((r) => Number(r.profit_sol) > 0).length;
    const losses = hist.filter((r) => Number(r.profit_sol) < 0).length;
    const totalSol = hist.reduce((acc, r) => acc + Number(r.profit_sol || 0), 0);
    const promedio = totalSol / trades;
    const mejor = hist.reduce((max, r) => Math.max(max, Number(r.profit_sol || 0)), -Infinity);
    const peor = hist.reduce((min, r) => Math.min(min, Number(r.profit_sol || 0)), Infinity);
    const wr = (wins / trades) * 100;
    const ultima = formatearTiempoRelativo(hist[0].closed_at);

    const statsFake = {
      trades,
      total_profit_sol: totalSol,
      wins,
      ultima_actividad: hist[0].closed_at
    };
    const reco = calcularRecomendacion(statsFake);

    const solPrice = await getSolPriceUSD();
    const usdTotal = solPrice ? ` (~${totalSol >= 0 ? '+' : '-'}$${Math.abs(totalSol * solPrice).toFixed(2)})` : '';

    let txt = `📊 ${alias} — Detalle (${MODO_ACTUAL.toUpperCase()})\n\n`;
    txt += `PnL total: ${totalSol >= 0 ? '+' : ''}${totalSol.toFixed(4)} SOL${usdTotal}\n`;
    txt += `Trades: ${trades} · ${wins} ganadores, ${losses} perdedores · WR ${wr.toFixed(1)}%\n`;
    txt += `Promedio: ${promedio >= 0 ? '+' : ''}${promedio.toFixed(4)} SOL/trade\n`;
    txt += `Mejor trade: +${mejor.toFixed(4)} SOL (${hist.find((r) => Number(r.profit_sol) === mejor)?.symbol || '?'})\n`;
    txt += `Peor trade: ${peor.toFixed(4)} SOL (${hist.find((r) => Number(r.profit_sol) === peor)?.symbol || '?'})\n`;
    txt += `Última actividad: hace ${ultima}\n`;
    txt += `Recomendación: ${reco.emoji} ${reco.texto}\n\n`;
    txt += `Últimos ${Math.min(5, hist.length)} trades:\n`;

    const ultimos = hist.slice(0, 5);
    ultimos.forEach((r, i) => {
      const p = Number(r.profit_sol || 0);
      const emoji = p > 0 ? '🟢' : p < 0 ? '🔴' : '⚪';
      const tiempo = formatearTiempoRelativo(r.closed_at);
      txt += `${i + 1}. ${emoji} ${p >= 0 ? '+' : ''}${p.toFixed(4)} SOL · ${r.symbol || '?'} · hace ${tiempo}\n`;
    });

    bot.sendMessage(msg.chat.id, txt);
  } catch (e) {
    log('error', `Error en /wallet: ${e.message}`);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// /pnl
bot.onText(/\/pnl/, async (msg) => {
  if (!esAdmin(msg)) return;
  try {
    const { rows: hist } = await pool.query(
      `SELECT SUM(profit_sol) as realized_sol FROM trade_history WHERE modo = $1`,
      [MODO_ACTUAL]
    );
    const realizedSol = Number(hist[0]?.realized_sol || 0);

    const { rows: pos } = await pool.query(
      `SELECT bp.*, tw.address as wallet_address
       FROM bot_positions bp
       JOIN tracked_wallets tw ON tw.alias = bp.wallet_alias
       WHERE bp.modo = $1`,
      [MODO_ACTUAL]
    );

    let unrealizedSol = 0;
    if (pos.length > 0) {
      for (const p of pos) {
        const { decimals } = await getTokenInfoHelius(p.token_mint);
        const valor = await estimarValorEnSol(p.token_mint, p.amount, decimals);
        if (valor !== null) unrealizedSol += valor - (Number(p.cost_basis_sol) || 0);
      }
    }

    const totalSol = realizedSol + unrealizedSol;
    const emoji = totalSol >= 0 ? '🟢' : '🔴';

    let txt = `💰 PnL ${MODO_ACTUAL.toUpperCase()} ${emoji}\n`;
    txt += `🔒 Realizado: ${realizedSol.toFixed(4)} SOL\n`;
    if (pos.length > 0) {
      txt += `📈 No realizado: ${unrealizedSol.toFixed(4)} SOL (${pos.length} pos abiertas)\n`;
    }
    txt += `🧮 Total: ${totalSol.toFixed(4)} SOL`;
    const solPrice = await getSolPriceUSD();
    if (solPrice) txt += ` (~$${(totalSol * solPrice).toFixed(2)})`;
    bot.sendMessage(msg.chat.id, txt);
  } catch (e) {
    log('error', `Error en /pnl: ${e.message}`);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// /cleanup
bot.onText(/\/cleanup/, async (msg) => {
  if (!esAdmin(msg)) return;
  try {
    const modo = MODO_ACTUAL;
    const { rowCount } = await pool.query(
      `DELETE FROM bot_positions WHERE wallet_alias NOT IN (SELECT alias FROM tracked_wallets) AND modo = $1`,
      [modo]
    );
    bot.sendMessage(
      msg.chat.id,
      `🧹 Cleanup ${modo.toUpperCase()}: ${rowCount} posición(es) de wallets no trackeadas eliminada(s).`
    );
  } catch (e) {
    log('error', `Error en /cleanup: ${e.message}`);
    bot.sendMessage(msg.chat.id, 'Error en cleanup: ' + e.message);
  }
});

// /fixwebhook
bot.onText(/\/fixwebhook/, async (msg) => {
  if (!esAdmin(msg)) return;
  try {
    await pool.query('UPDATE global_balance SET helius_webhook_id = NULL WHERE id = 1');
    await crearOActualizarWebhookHelius();
    bot.sendMessage(msg.chat.id, '✅ Webhook reconfigurado correctamente con Helius.');
  } catch (e) {
    bot.sendMessage(msg.chat.id, '❌ Error: ' + e.message);
  }
});

// ---------- Purga de rate limit map ----------
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of webhookRateMap) {
    const filtrado = v.filter((t) => now - t < 5000);
    if (filtrado.length === 0) webhookRateMap.delete(k);
    else webhookRateMap.set(k, filtrado);
  }
}, 60_000).unref?.();

// ---------- Inicialización ----------
(async () => {
  await initDB();
  await initBaselineReal();

  // WS de PumpPortal desactivado — ahora dependemos solo de Helius
  // conectarWS();
  crearOActualizarWebhookHelius();
  iniciarServidorWebhook();

  intervals.push(setInterval(reconciliarPosiciones, 60_000));
  intervals.push(setInterval(revisarStopLoss, 60_000));
  intervals.push(setInterval(monitoreoAutomaticoWebhook, 600_000));

  // Módulo B: detección automática de ventas manuales (solo modo REAL)
  intervals.push(setInterval(detectarVentasManuales, 120_000));

  intervals.push(
    setInterval(() => {
      const apiKey = getHeliusApiKey();
      if (!apiKey) return;
      pool
        .query('SELECT helius_webhook_id FROM global_balance WHERE id=1')
        .then(({ rows }) => {
          const webhookId = rows[0]?.helius_webhook_id;
          if (webhookId) verificarEstadoWebhook(apiKey, webhookId);
        })
        .catch((e) => log('error', `Error en chequeo periódico del webhook: ${e.message}`));
    }, 300_000)
  );

  intervals.push(
    setInterval(() => {
      const marca = new Date().toISOString();
      log('info', `💓 Heartbeat [${marca}] modo=${MODO_ACTUAL} WS=${ws ? ws.readyState : 'null'}`);
    }, 300_000)
  );

  const shutdown = async () => {
    log('info', 'Recibida señal de apagado, cerrando conexiones...');
    for (const i of intervals) clearInterval(i);
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})();

// ===== FIN BLOQUE 5 =====

