// ========= ⚡️M3M3B0T⚡️ REAL TRADING - + COMANDO /diag PARA VERIFICAR CONFIGURACION DE HELIUS SIN ESPERAR =========
require('dotenv').config();

// ---------- Dependencies ----------
const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const { Pool } = require('pg');
const { Connection, Keypair, PublicKey, VersionedTransaction, Transaction, TransactionInstruction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58');

// ---------- Logger simple ----------
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = process.env.LOG_LEVEL ? LOG_LEVELS[process.env.LOG_LEVEL.toLowerCase()] : LOG_LEVELS.info;
function log(level, ...args) {
  if (LOG_LEVELS[level] <= CURRENT_LEVEL) {
    const prefix = `[${new Date().toISOString()}][${level.toUpperCase()}]`;
    console.log(prefix, ...args);
  }
}

// ---------- Configuración ----------
const REQUIRED_ENV = [
  'TELEGRAM_TOKEN', 'CHAT_ID', 'DATABASE_URL',
  'HELIUS_RPC_URL', 'WALLET_PRIVATE_KEY',
  'JUPITER_API_KEY', 'PUMPPORTAL_API_KEY'
];
for (const v of REQUIRED_ENV) {
  if (!process.env[v]) {
    log('error', `Variable de entorno requerida falta: ${v}`);
    process.exit(1);
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const CHAT_ID = process.env.CHAT_ID;
const NOMBRE_BOT = '⚡️M3M3B0T⚡️';

const PUMP_PORTAL_WS = `wss://pumpportal.fun/api/data?api-key=${process.env.PUMPPORTAL_API_KEY}`;
const PUMP_PORTAL_TRADE = 'https://pumpportal.fun/api/trade-local';
const JUPITER_BASE = 'https://api.jup.ag/swap/v2';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PUMPPORTAL_WALLET = 'Guao96aNr7GUj3CSspwLy3tEccL3RUh5xVT4W3KNfBUH';
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const HELIUS_WEBHOOK_URL = process.env.HELIUS_WEBHOOK_URL || 'https://memebot-production-054e.up.railway.app/helius-hook';
const HELIUS_WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET || 'memebot-raydium-secret';
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
const DEFAULT_SLIPPAGE_BPS = parseInt(process.env.DEFAULT_SLIPPAGE_BPS || '10', 10); // 10 bps = 0.1%

// ---------- Estado ----------
let connection = null;
let walletKeypair = null;
let ws = null;
let wsReconnectTimer = null;
let wsReconnectAttempts = 0;
let totalMensajesRecibidos = 0;
let primerMensajeConfirmado = false;
let mensajesDesdeUltimoResumen = 0;
const cacheSimbolos = new Map();
const cacheDecimales = new Map();
const MAX_CACHE_SIZE = 500;

// ---------- Utilidades ----------
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function horaLocal(ms) {
  return new Date(ms).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour12: false });
}
function chequearRetraso(horaDeteccionMs, alias, symbol) {
  if (!horaDeteccionMs) return;
  const ahora = Date.now();
  const retrasoMs = ahora - horaDeteccionMs;
  if (retrasoMs > RETRASO_AVISO_MS) {
    log('warn', `⚠️ DELAY DETECTADO: ${alias} (${symbol}) detectado a las ${horaLocal(horaDeteccionMs)} pero la copia se envió a las ${horaLocal(ahora)} (${Math.round(retrasoMs / 1000)}s de retraso) - posible saturación/rate limit`);
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

// ---------- Cache LRU ----------
function cacheSet(map, key, value) {
  if (map.size >= MAX_CACHE_SIZE) {
    const firstKey = map.keys().next().value;
    map.delete(firstKey);
  }
  map.set(key, value);
}

// ---------- Jupiter con reintento ----------
async function fetchJupiterConReintento(url, opts = {}) {
  let ultimoError = null;
  for (let intento = 1; intento <= JUPITER_MAX_INTENTOS; intento++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(JUPITER_TIMEOUT_MS) });
      if (res.status === 429) {
        const espera = 1000 * Math.pow(2, intento);
        log('warn', `Jupiter rate limited, esperando... (intento ${intento}/${JUPITER_MAX_INTENTOS}, espera ${espera}ms)`);
        await sleep(espera);
        continue;
      }
      return res;
    } catch (e) {
      ultimoError = e;
      const espera = 1000 * Math.pow(2, intento);
      log('warn', `Jupiter rate limited, esperando... (fetch failed intento ${intento}/${JUPITER_MAX_INTENTOS}: ${e.message}, espera ${espera}ms)`);
      if (intento < JUPITER_MAX_INTENTOS) await sleep(espera);
    }
  }
  throw ultimoError || new Error('Jupiter: se agotaron los reintentos');
}

// ---------- Solana init ----------
try {
  if (process.env.HELIUS_RPC_URL) connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
  if (process.env.WALLET_PRIVATE_KEY) walletKeypair = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY));
  if (walletKeypair) log('info', `Wallet Solana cargada: ${walletKeypair.publicKey.toBase58()}`);
} catch (e) {
  log('error', `Error cargando wallet/RPC de Solana: ${e.message}`);
}

// ---------- Cadena ----------
const CHAIN_CONFIG = {
  sol: { id: 'solana', name: 'SOLANA' },
  eth: { id: 'eth', name: 'ETH' },
  base: { id: 'base', name: 'BASE' },
  bsc: { id: 'bnb', name: 'BSC' },
  rh: { id: 'rh', name: 'ROBINHOOD CHAIN 4663' },
  robinhood: { id: 'rh', name: 'ROBINHOOD CHAIN 4663' },
  hype: { id: 'hyperliquid', name: 'HYPE EVM 999' }
};
function normalizeChain(c) { return (CHAIN_CONFIG[(c || 'sol').toLowerCase()] || { id: 'solana' }).id; }
function getLabel(c) { const f = Object.values(CHAIN_CONFIG).find(v => v.id === c); return f ? f.name : c.toUpperCase(); }

// ---------- Error on‑chain ----------
function describirErrorOnChain(errValue) {
  try {
    if (errValue && errValue.InstructionError) {
      const [idx, detalle] = errValue.InstructionError;
      if (detalle && typeof detalle === 'object' && 'Custom' in detalle) {
        const codigoDecimal = detalle.Custom;
        const codigoHex = '0x' + codigoDecimal.toString(16);
        return { texto: `Instrucción #${idx} falló con código ${codigoHex} (${codigoDecimal})`, codigoHex };
      }
      return { texto: `Instrucción #${idx} falló: ${JSON.stringify(detalle)}`, codigoHex: null };
    }
    return { texto: JSON.stringify(errValue), codigoHex: null };
  } catch (e) {
    return { texto: String(errValue), codigoHex: null };
  }
}
async function confirmarYVerificarTx(sig) {
  const confirmacion = await connection.confirmTransaction(sig, 'confirmed');
  if (confirmacion.value.err) {
    const info = describirErrorOnChain(confirmacion.value.err);
    throw new Error(`ON_CHAIN_FAIL ${info.codigoHex || ''}: ${info.texto} (tx: ${sig})`);
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
function linkTx(sig) { return `https://solscan.io/tx/${sig}`; }

// ---------- Cálculo ----------
function calcularResultado(costBasisSol, proceedsSolBruto, solPriceActual, netoDeFees) {
  const fees = netoDeFees ? estimarFees(costBasisSol, proceedsSolBruto) : 0;
  const proceedsNetoSol = proceedsSolBruto - fees;
  const profitSol = proceedsNetoSol - costBasisSol;
  const multiplicador = costBasisSol > 0 ? proceedsNetoSol / costBasisSol : 0;
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
function estimarFees(costBasisSol, proceedsSol) {
  const feePumpFun = (costBasisSol + proceedsSol) * PUMPFUN_FEE_PCT;
  const feeRed = NETWORK_FEE_SOL * 2;
  return feePumpFun + feeRed;
}
function usdToSolNeto(usd, solPrice) {
  const solBruto = usd / solPrice;
  const solMenosFeePump = solBruto / (1 + PUMPFUN_FEE_PCT);
  return Math.max(solMenosFeePump - OVERHEAD_RED_SOL, 0);
}

// ---------- Valor estimado ----------
async function estimarValorEnSol(mint, cantidadTokens, decimals) {
  if (!process.env.JUPITER_API_KEY) return null;
  try {
    const rawAmount = Math.floor(cantidadTokens * Math.pow(10, decimals));
    if (rawAmount <= 0) return null;
    const url = `${JUPITER_BASE}/order?inputMint=${mint}&outputMint=${SOL_MINT}&amount=${rawAmount}`;
    const res = await fetchJupiterConReintento(url, { headers: { 'x-api-key': process.env.JUPITER_API_KEY } });
    if (!res.ok) {
      log('warn', `Jupiter /order (stop-loss) respondió mal: ${res.status}, ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    if (!data.outAmount) return null;
    return parseFloat(data.outAmount) / LAMPORTS_PER_SOL;
  } catch (e) {
    log('warn', `No se pudo cotizar valor para stop-loss: ${e.message}`);
    return null;
  }
}

// ---------- Cerrar cuenta de token ----------
async function cerrarCuentaDelToken(mint) {
  if (!connection || !walletKeypair) return null;
  try {
    const mintKey = new PublicKey(mint);
    const cuentas = await connection.getParsedTokenAccountsByOwner(walletKeypair.publicKey, { mint: mintKey });
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
      recuperadoSol += Math.max(despuesSol - antesSol, 0);
      log('info', `♻️ Cuenta de token cerrada (${mint.slice(0, 6)}...), recuperado: ${(despuesSol - antesSol).toFixed(5)} SOL`);
    }
    return recuperadoSol > 0 ? recuperadoSol : null;
  } catch (e) {
    log('warn', `No se pudo cerrar la cuenta del token (no crítico): ${e.message}`);
    return null;
  }
}

// ---------- Jupiter genérico swap (compra o venta) ----------
async function ejecutarSwapViaJupiter({ action, mint, amount, slippage = DEFAULT_SLIPPAGE_BPS }) {
  if (!process.env.JUPITER_API_KEY) throw new Error('Falta JUPITER_API_KEY para ejecutar swaps vía Jupiter');
  const tokenInfo = await getTokenInfoHelius(mint);
  const decimals = tokenInfo.decimals;
  let inputMint, outputMint, rawAmount;
  if (action === 'buy') {
    inputMint = SOL_MINT;
    outputMint = mint;
    rawAmount = Math.floor(amount * LAMPORTS_PER_SOL); // amount in SOL
  } else { // sell
    inputMint = mint;
    outputMint = SOL_MINT;
    rawAmount = Math.floor(amount * Math.pow(10, decimals)); // amount in token units
  }
  const quoteUrl = `${JUPITER_BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rawAmount}&slippageBps=${slippage}`;
  const quoteRes = await fetch(quoteUrl, { headers: { 'x-api-key': process.env.JUPITER_API_KEY } });
  if (!quoteRes.ok) throw new Error(`Jupiter quote failed: ${quoteRes.status} ${await quoteRes.text()}`);
  const quoteData = await quoteRes.json();
  const swapUrl = `${JUPITER_BASE}/swap`;
  const swapRes = await fetch(swapUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.JUPITER_API_KEY,
    },
    body: JSON.stringify({
      userPublicKey: walletKeypair.publicKey.toBase58(),
      quoteResponse: quoteData,
    }),
  });
  if (!swapRes.ok) throw new Error(`Jupiter swap failed: ${swapRes.status} ${await swapRes.text()}`);
  const swapData = await swapRes.json();
  const txBuf = Buffer.from(swapData.swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([walletKeypair]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await confirmarYVerificarTx(sig);
  return sig;
}

// ---------- Dispatcher de ejecución ----------
async function ejecutarTrade({ action, mint, amount, origen, slippage = DEFAULT_SLIPPAGE_BPS }) {
  const esPump = origen === 'PumpPortal' || origen === 'OnChain';
  try {
    if (esPump) {
      // Usamos PumpPortal (rápido y barato) para Pump.fun
      return await pumpPortalTrade({
        action,
        mint,
        amount: action === 'buy' ? amount : '100%',
        denominatedInSol: action === 'buy' ? true : false,
        slippage,
        priorityFee: 0.0005,
        pool: 'auto'
      });
    }
    // Para cualquier otro DEX usamos Jupiter como router genérico
    return await ejecutarSwapViaJupiter({ action, mint, amount, slippage });
  } catch (primerError) {
    // En venta siempre intentamos Jupiter como respaldo (p. ej. token que ya salió de la curva o no es pump).
    if (action === 'sell') {
      log('warn', `Ruta PumpPortal falló para venta (${mint.slice(0, 6)}...), intentando Jupiter como respaldo: ${primerError.message}`);
      return await ejecutarSwapViaJupiter({ action, mint, amount, slippage });
    }
    // En compra, si el origen era OnChain (posible token de otro DEX detectado de forma genérica),
    // también probamos Jupiter antes de rendirnos.
    if (esPump && origen === 'OnChain') {
      log('warn', `Ruta PumpPortal falló para compra (${mint.slice(0, 6)}...), intentando Jupiter como respaldo: ${primerError.message}`);
      return await ejecutarSwapViaJupiter({ action, mint, amount, slippage });
    }
    throw primerError;
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
    if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
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
  pool.query('SELECT alias, address FROM tracked_wallets')
    .then(({ rows }) => {
      if (rows.length > 0) {
        ws.send(JSON.stringify({ method: 'subscribeAccountTrade', keys: rows.map(r => r.address) }));
        const aliases = rows.map(r => r.alias).join(', ') || 'ninguna';
        log('info', `🔁 Resincronizado (PumpPortal): escuchando ${rows.length} wallets (${aliases})`);
      }
    })
    .catch(e => log('error', `Error resincronizando suscripciones: ${e.message}`));
}

// ---------- Webhook Helius ----------
function crearOActualizarWebhookHelius() {
  const apiKey = getHeliusApiKey();
  if (!apiKey) { log('error', '⚠️ No se pudo extraer el api-key de HELIUS_RPC_URL — el webhook no se puede configurar'); return; }
  pool.query('SELECT address, alias FROM tracked_wallets')
    .then(({ rows: walletRows }) => {
      const direcciones = walletRows.map(r => r.address);
      const aliases = walletRows.map(r => r.alias);
      return pool.query('SELECT helius_webhook_id FROM global_balance WHERE id=1')
        .then(({ rows }) => {
          const webhookIdExistente = rows[0]?.helius_webhook_id;
          const payload = {
            webhookURL: HELIUS_WEBHOOK_URL,
            transactionTypes: ['ANY'],
            accountAddresses: direcciones,
            webhookType: 'enhanced',
            authHeader: HELIUS_WEBHOOK_SECRET,
            active: true // 🔑 Clave: re-activa un webhook que Helius auto-deshabilitó
          };
          if (webhookIdExistente) {
            return fetch(`https://api.helius.xyz/v0/webhooks/${webhookIdExistente}?api-key=${apiKey}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            })
              .then(res => {
                if (!res.ok) throw new Error(`Error actualizando webhook de Helius: ${res.status} ${res.text()}`);
                log('info', `🌐 Webhook (ANY) actualizado: ${direcciones.length} wallets (${aliases.join(', ')})`);
              })
              .then(() => verificarEstadoWebhook(apiKey, webhookIdExistente));
          } else {
            return fetch(`https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            })
              .then(res => {
                if (!res.ok) throw new Error(`Error creando webhook de Helius: ${res.status} ${res.text()}`);
                return res.json();
              })
              .then(data => {
                return pool.query('UPDATE global_balance SET helius_webhook_id=$1 WHERE id=1', [data.webhookID])
                  .then(() => log('info', `🌐 Webhook (ANY) creado: ${direcciones.length} wallets, id=${data.webhookID}`))
                  .then(() => verificarEstadoWebhook(apiKey, data.webhookID));
              });
          }
        });
    })
    .catch(e => log('error', `Error configurando webhook de Helius: ${e.message}`));
}

// Verifica que el webhook esté ACTIVO; si no, lo reactiva (Helius lo auto-deshabilita tras fallos).
async function verificarEstadoWebhook(apiKey, webhookId) {
  try {
    const res = await fetch(`https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${apiKey}`);
    const data = await res.json();
    const activo = data.active;
    if (activo === false) {
      log('warn', '⚠️ Webhook de Helius está DESHABILITADO — intentando reactivar...');
      const react = await fetch(`https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${apiKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true })
      });
      if (!react.ok) {
        log('error', `⚠️ No se pudo reactivar el webhook: ${react.status} ${await react.text()}`);
        if (CHAT_ID) bot.sendMessage(CHAT_ID, `⚠️ El webhook de Helius está deshabilitado y no pude reactivarlo (${react.status}). Los trades NO están llegando — revisa el authHeader.`, { disable_notification: true }).catch(() => {});
        return false;
      }
      log('info', '✅ Webhook de Helius REACTIVADO (era active:false)');
      if (CHAT_ID) bot.sendMessage(CHAT_ID, '✅ Webhook de Helius reactivado automáticamente. Vuelve a recibir eventos.', { disable_notification: true }).catch(() => {});
      return true;
    }
    log('info', `🪝 Webhook de Helius verificado: ${activo ? 'ACTIVO' : 'inactivo'}`);
    return activo;
  } catch (e) {
    log('error', `Error verificando estado del webhook: ${e.message}`);
    return null;
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
  } catch (e) { webhookInfo = { error: e.message }; }
  // Métricas de salud del webhook (Helius las reporta en el GET del webhook)
  const saludWebhook = { failureRate: null, isUnderCooldown: null, lastSentAt: null, lastError: null, active: null };
  try {
    if (webhookInfo && !webhookInfo.error && typeof webhookInfo === 'object') {
      saludWebhook.failureRate = webhookInfo.failureRate ?? null;
      saludWebhook.isUnderCooldown = webhookInfo.isUnderCooldown ?? null;
      saludWebhook.lastSentAt = webhookInfo.lastSentAt ? new Date(webhookInfo.lastSentAt).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }) : null;
      saludWebhook.lastError = webhookInfo.lastError ?? null;
      saludWebhook.active = webhookInfo.active ?? null;
    }
  } catch (e) { /* ignorar */ }
  let historial = [];
  try {
    const res = await fetch(`https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&limit=10`);
    historial = await res.json();
  } catch (e) { historial = { error: e.message }; }
  return { webhookInfo, historial, address, alias, saludWebhook };
}

// ---------- Balance PumpPortal ----------
async function getPumpPortalWalletBalance() {
  if (!connection) return null;
  try {
    const lamports = await connection.getBalance(new PublicKey(PUMPPORTAL_WALLET));
    return lamports / LAMPORTS_PER_SOL;
  } catch (e) {
    log('error', `Error consultando saldo de PumpPortal: ${e.message}`);
    return null;
  }
}

// ---------- Token info (cache) ----------
async function getTokenInfoHelius(mint) {
  const cachedSym = cacheSimbolos.get(mint);
  const cachedDec = cacheDecimales.get(mint);
  if (cachedSym !== undefined && cachedDec !== undefined) {
    return { symbol: cachedSym, decimals: cachedDec };
  }
  let symbol = mint.slice(0, 6) + '...';
  let decimals = 6;
  try {
    if (process.env.HELIUS_RPC_URL) {
      const res = await fetch(process.env.HELIUS_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'symbol-lookup', method: 'getAsset', params: { id: mint } })
      });
      const data = await res.json();
      const meta = data?.result?.content?.metadata;
      if (meta?.symbol) symbol = meta.symbol;
      else if (meta?.name) symbol = meta.name;
      if (data?.result?.token_info?.decimals !== undefined) decimals = data.result.token_info.decimals;
    }
  } catch (e) {
    log('warn', `No se pudo obtener info de ${mint}: ${e.message}`);
  }
  cacheSet(cacheSimbolos, mint, symbol);
  cacheSet(cacheDecimales, mint, decimals);
  return { symbol, decimals };
}
async function getTokenSymbol(mint) {
  const info = await getTokenInfoHelius(mint);
  return info.symbol;
}

// ---------- Holdings ----------
async function getHoldings(address) {
  if (!connection) { log('error', 'No hay conexión RPC, no se puede hacer snapshot real'); return []; }
  try {
    const owner = new PublicKey(address);
    const [legacy, token2022] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }).catch(() => ({ value: [] }))
    ]);
    const todasLasCuentas = [...legacy.value, ...token2022.value];
    const conSaldo = todasLasCuentas
      .map(acc => acc.account.data.parsed.info)
      .filter(info => info.tokenAmount && parseFloat(info.tokenAmount.uiAmount || 0) > 0)
      .map(info => ({ mint: info.mint }));
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

// ---------- DB ----------
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tracked_wallets (alias TEXT PRIMARY KEY, address TEXT, amount REAL, chain TEXT);
      CREATE TABLE IF NOT EXISTS seen_tokens (wallet_address TEXT, token_mint TEXT, PRIMARY KEY (wallet_address, token_mint));
      CREATE TABLE IF NOT EXISTS bot_positions (token_mint TEXT, symbol TEXT, chain TEXT, amount REAL);
      ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS cost_basis_sol REAL;
      ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS wallet_alias TEXT;
      ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS ceros_seguidos INT DEFAULT 0;
      ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS modo TEXT DEFAULT 'paper';
      CREATE TABLE IF NOT EXISTS global_balance (id INT PRIMARY KEY, initial_usdc REAL, current_usdc REAL);
      ALTER TABLE global_balance ADD COLUMN IF NOT EXISTS real_initial_sol REAL;
      ALTER TABLE global_balance ADD COLUMN IF NOT EXISTS helius_webhook_id TEXT;
      INSERT INTO global_balance (id, initial_usdc, current_usdc)
        VALUES (1, $1, $2)
        ON CONFLICT (id) DO NOTHING;
      CREATE TABLE IF NOT EXISTS trade_history (
        id SERIAL PRIMARY KEY,
        wallet_alias TEXT,
        symbol TEXT,
        profit_sol REAL,
        closed_at TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE trade_history ADD COLUMN IF NOT EXISTS modo TEXT DEFAULT 'paper';
    `, [INITIAL_PAPER_BALANCE, INITIAL_PAPER_BALANCE]);
    log('info', 'DB OK');
  } catch (e) { log('error', `DB Error: ${e}`); }

  try {
    await pool.query(`DELETE FROM bot_positions WHERE wallet_alias IS NULL;`);
    await pool.query(`UPDATE bot_positions SET modo='paper' WHERE modo IS NULL;`);
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
  } catch (e) { log('error', `Error migrando bot_positions: ${e.message}`); }
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
  } catch (e) { log('error', `Error estableciendo baseline real: ${e.message}`); }
}

// ---------- Historial ----------
async function registrarTradeCerrado(walletAlias, symbol, profitSol) {
  try {
    await pool.query('INSERT INTO trade_history (wallet_alias, symbol, profit_sol, modo) VALUES ($1,$2,$3,$4)', [walletAlias, symbol, profitSol, MODO_ACTUAL]);
  } catch (e) { log('error', `Error registrando historial de trade: ${e.message}`); }
}

// ---------- Balance paper ----------
async function getPaperBalance() {
  const { rows } = await pool.query('SELECT * FROM global_balance WHERE id=1');
  return rows[0] || { initial_usdc: INITIAL_PAPER_BALANCE, current_usdc: INITIAL_PAPER_BALANCE };
}
async function adjustPaperBalance(deltaUsd) {
  const { rows } = await pool.query('UPDATE global_balance SET current_usdc = current_usdc + $1 WHERE id=1 RETURNING current_usdc', [deltaUsd]);
  return rows[0]?.current_usdc;
}

// ---------- Precio SOL ----------
async function getSolPriceUSD() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await res.json();
    return data.solana.usd;
  } catch (e) {
    log('error', `Error precio SOL: ${e.message}`);
    return null;
  }
}

// ---------- Bonding curve ----------
function bondingCurvePriceSol(trade) {
  if (!trade.vSolInBondingCurve || !trade.vTokensInBondingCurve) return null;
  return trade.vSolInBondingCurve / trade.vTokensInBondingCurve;
}

// ---------- Balance SOL ----------
async function getWalletSolBalance() {
  if (!connection || !walletKeypair) return 0;
  const lamports = await connection.getBalance(walletKeypair.publicKey);
  return lamports / LAMPORTS_PER_SOL;
}

// ---------- Trade PumpPortal (manteniendo la función original) ----------
async function pumpPortalTrade({ action, mint, amount, denominatedInSol, slippage = 10, priorityFee = 0.0005, pool = 'auto' }) {
  const res = await fetch(PUMP_PORTAL_TRADE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: walletKeypair.publicKey.toBase58(),
      action, mint, amount,
      denominatedInSol: denominatedInSol ? 'true' : 'false',
      slippage, priorityFee, pool
    })
  });
  if (res.status !== 200) throw new Error('PumpPortal: ' + await res.text());
  const data = await res.arrayBuffer();
  const tx = VersionedTransaction.deserialize(new Uint8Array(data));
  tx.sign([walletKeypair]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await confirmarYVerificarTx(sig);
  return sig;
}

// ---------- Swap a USDC (manteniendo la función original) ----------
async function swapProfitToUsdc(amountSol) {
  if (!process.env.JUPITER_API_KEY) { log('error', 'Falta JUPITER_API_KEY, no se puede convertir a USDC'); return null; }
  try {
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
    if (lamports <= 0) return null;
    const url = `${JUPITER_BASE}/order?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=${lamports}&taker=${walletKeypair.publicKey.toBase58()}`;
    const res = await fetchJupiterConReintento(url, { headers: { 'x-api-key': process.env.JUPITER_API_KEY } });
    if (!res.ok) { log('error', `Jupiter /order (swap a USDC) respondió mal: ${res.status}, ${await res.text()}`); return null; }
    const order = await res.json();
    if (!order.transaction) { log('error', `Jupiter /order no regresó transacción: ${JSON.stringify(order)}`); return null; }
    const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, 'base64'));
    tx.sign([walletKeypair]);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    await confirmarYVerificarTx(sig);
    return sig;
  } catch (e) {
    log('error', `Error swap a USDC: ${e.message}`);
    return null;
  }
}

// ---------- Reconciliación ----------
async function reconciliarPosiciones(forzado = false) {
  const marca = new Date().toISOString();
  if (!connection) {
    log('info', `🔍 [${marca}] Reconciliación: sin conexión RPC, se salta este ciclo`);
    return;
  }
  try {
    const { rows: posiciones } = await pool.query(`
      SELECT bp.*, tw.address AS wallet_address
      FROM bot_positions bp
      JOIN tracked_wallets tw ON tw.alias = bp.wallet_alias
      WHERE bp.modo = $1
    `, [MODO_ACTUAL]);
    if (posiciones.length === 0) {
      log('info', `🔍 [${marca}] Reconciliación${forzado ? ' (manual)' : ''}: 0 posiciones abiertas en modo ${MODO_ACTUAL.toUpperCase()}, nada que revisar.`);
      return;
    }
    let cerradas = 0;
    for (const pos of posiciones) {
      const balanceActual = await getBalanceDeTokenEnWallet(pos.wallet_address, pos.token_mint);
      if (balanceActual === null) continue;
      if (balanceActual > 0) {
        if (pos.ceros_seguidos > 0) {
          await pool.query('UPDATE bot_positions SET ceros_seguidos=0 WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]);
        }
        continue;
      }
      if (!forzado) {
        const nuevosCeros = (pos.ceros_seguidos || 0) + 1;
        if (nuevosCeros < CONFIRMACIONES_NECESARIAS) {
          await pool.query('UPDATE bot_positions SET ceros_seguidos=$1 WHERE token_mint=$2 AND wallet_alias=$3 AND modo=$4', [nuevosCeros, pos.token_mint, pos.wallet_alias, MODO_ACTUAL]);
          log('info', `🔍 ${pos.wallet_alias} ${pos.symbol}: balance en 0 (confirmación ${nuevosCeros}/${CONFIRMACIONES_NECESARIAS}), esperando siguiente ciclo antes de cerrar`);
          continue;
        }
      } else {
        log('info', `🔍 ${pos.wallet_alias} ${pos.symbol}: balance en 0, cerrando de inmediato (reconciliación manual forzada)`);
      }
      cerradas++;
      log('info', `🔄 Reconciliación [${MODO_ACTUAL.toUpperCase()}]: ${pos.wallet_alias} ya no tiene ${pos.symbol} - cerrando posición`);
      if (LIVE && pos.chain === 'solana' && walletKeypair && connection) {
        try {
          const before = await getWalletSolBalance();
          const sig = await ejecutarTrade({
            action: 'sell',
            mint: pos.token_mint,
            amount: pos.amount,
            origen: 'OnChain', // en reconciliación no conocemos el origen exacto, usamos OnChain para intentar PumpPortal primero
            slippage: DEFAULT_SLIPPAGE_BPS
          });
          await sleep(ESPERA_LECTURA_SALDO_MS);
          const after = await getWalletSolBalance();
          const proceedsSol = after - before;
          const solPrice = await getSolPriceUSD();
          const r = calcularResultado(pos.cost_basis_sol, proceedsSol, solPrice, false);
          await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]);
          await pool.query('DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [pos.wallet_address, pos.token_mint]);
          await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
          let msg = `🔄⚠️ Venta atrasada detectada y ejecutada [${pos.wallet_alias}] ${pos.symbol} · Salí con: ${proceedsSol.toFixed(4)} SOL · ${formatearResultado(r)} · tx: ${linkTx(sig)}`;
          if (r.profitSol > 0) {
            const usdcSig = await swapProfitToUsdc(r.profitSol);
            msg += usdcSig ? `\n💵 Ganancia convertida a USDC · tx: ${linkTx(usdcSig)}` : `\n⚠️ No se pudo convertir la ganancia a USDC`;
          }
          const rentRecuperado = await cerrarCuentaDelToken(pos.token_mint);
          if (rentRecuperado) msg += `\n♻️ Cuenta cerrada, recuperado: ${rentRecuperado.toFixed(5)} SOL de rent`;
          const saldoFinal = await getWalletSolBalance();
          msg += `\n💰 Saldo total: ${saldoFinal.toFixed(4)} SOL`;
          if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);
        } catch (e) {
          log('error', `Error en venta real de reconciliación: ${e.message}`);
          if (esSellZeroAmount(e)) {
            await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]);
            await pool.query('DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [pos.wallet_address, pos.token_mint]);
            if (CHAT_ID) bot.sendMessage(CHAT_ID, `🧹 [${pos.wallet_alias}] ${pos.symbol}: posición fantasma eliminada — la compra original nunca se ejecutó de verdad. No se cuenta como pérdida.`);
          } else {
            if (CHAT_ID) bot.sendMessage(CHAT_ID, `⚠️🔄 [${pos.wallet_alias}] ${pos.symbol}: ${mensajeAmigableError(e)} Se reintentará en el próximo ciclo, la posición sigue abierta.`);
          }
        }
      } else {
        const proceedsSol = 0;
        const solPrice = await getSolPriceUSD();
        const r = calcularResultado(pos.cost_basis_sol, proceedsSol, solPrice, false);
        await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]);
        await pool.query('DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [pos.wallet_address, pos.token_mint]);
        await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
        const nuevoSaldo = await adjustPaperBalance(0);
        if (CHAT_ID) bot.sendMessage(CHAT_ID, `🔄⚠️ PAPER: Venta atrasada NO detectada a tiempo [${pos.wallet_alias}] ${pos.symbol} · Se asume pérdida total · ${formatearResultado(r)} · Saldo ficticio: $${nuevoSaldo.toFixed(2)}`);
      }
    }
    log('info', `🔍 [${marca}] Reconciliación completa [${MODO_ACTUAL.toUpperCase()}]${forzado ? ' (manual)' : ''}: ${posiciones.length} posiciones revisadas, ${cerradas} cerradas por venta atrasada.`);
  } catch (e) { log('error', `Error en reconciliación de posiciones: ${e.message}`); }
}

// ---------- Stop‑loss ----------
async function revisarStopLoss() {
  try {
    const { rows: posiciones } = await pool.query(`
      SELECT bp.*, tw.address AS wallet_address
      FROM bot_positions bp
      JOIN tracked_wallets tw ON tw.alias = bp.wallet_alias
      WHERE bp.modo = $1
    `, [MODO_ACTUAL]);
    await Promise.allSettled(posiciones.map(async (pos) => {
      if (!pos.cost_basis_sol || pos.cost_basis_sol <= 0 || !pos.amount || pos.amount <= 0) return;
      const { decimals } = await getTokenInfoHelius(pos.token_mint);
      const valorActualSol = await estimarValorEnSol(pos.token_mint, pos.amount, decimals);
      if (valorActualSol === null) return;
      const ratio = valorActualSol / pos.cost_basis_sol;
      if (ratio > STOP_LOSS_PCT) return;
      log('info', `🛑 STOP-LOSS activado: ${pos.wallet_alias} ${pos.symbol} · valor actual ${valorActualSol.toFixed(4)} SOL vs costo ${pos.cost_basis_sol.toFixed(4)} SOL (${(ratio * 100).toFixed(1)}%)`);
      await ejecutarStopLoss(pos, valorActualSol);
    }));
  } catch (e) { log('error', `Error revisando stop-loss: ${e.message}`); }
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
      await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]);
      await pool.query('DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [pos.wallet_address, pos.token_mint]);
      await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
      let msg = `🛑 STOP-LOSS ejecutado [${pos.wallet_alias}] ${pos.symbol} · Salí con: ${proceedsSol.toFixed(4)} SOL · ${formatearResultado(r)} · tx: ${linkTx(sig)}`;
      if (r.profitSol > 0) {
        const usdcSig = await swapProfitToUsdc(r.profitSol);
        msg += usdcSig ? `\n💵 Ganancia convertida a USDC · tx: ${linkTx(usdcSig)}` : `\n⚠️ No se pudo convertir la ganancia a USDC`;
      }
      const rentRecuperado = await cerrarCuentaDelToken(pos.token_mint);
      if (rentRecuperado) msg += `\n♻️ Cuenta cerrada, recuperado: ${rentRecuperado.toFixed(5)} SOL de rent`;
      const saldoFinal = await getWalletSolBalance();
      msg += `\n💰 Saldo total: ${saldoFinal.toFixed(4)} SOL`;
      if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);
    } catch (e) {
      log('error', `Error ejecutando stop-loss real: ${e.message}`);
      if (esSellZeroAmount(e)) {
        await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]);
        await pool.query('DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [pos.wallet_address, pos.token_mint]);
        if (CHAT_ID) bot.sendMessage(CHAT_ID, `🧹 [${pos.wallet_alias}] ${pos.symbol}: posición fantasma eliminada al intentar el stop-loss. No se cuenta como pérdida.`);
      } else {
        if (CHAT_ID) bot.sendMessage(CHAT_ID, `⚠️🛑 [${pos.wallet_alias}] ${pos.symbol}: intento de stop-loss falló (${mensajeAmigableError(e)}). Se reintentará en el próximo ciclo; si sigue fallando, la reconciliación se hará cargo.`);
      }
    }
  } else {
    const solPrice = await getSolPriceUSD();
    const r = calcularResultado(pos.cost_basis_sol, valorEstimadoSol, solPrice, true);
    const proceedsUsd = solPrice ? r.proceedsNetoSol * solPrice : 0;
    await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]);
    await pool.query('DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [pos.wallet_address, pos.token_mint]);
    await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
    const nuevoSaldo = await adjustPaperBalance(proceedsUsd);
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `🛑 PAPER STOP-LOSS: ${pos.symbol} vía ${pos.wallet_alias} · Salí con (estimado, neto de fees): ${r.proceedsNetoSol.toFixed(4)} SOL (~$${proceedsUsd.toFixed(2)}) · ${formatearResultado(r)} · Saldo ficticio: $${nuevoSaldo.toFixed(2)}`);
  }
}

// ---------- Compra ----------
async function handleTrackedBuy(tracked, trade, origen = 'PumpPortal', horaDeteccion = null) {
  const solPaid = trade.solAmount || 0;
  if (solPaid < DUST_MIN_SOL) { log('info', `Dust ignorado ${tracked.alias} (${solPaid} SOL) [${origen}]`); return; }
  const symbol = await getTokenSymbol(trade.mint);
  const link = `https://pump.fun/coin/${trade.mint}`;
  const etiquetaOrigen = origen !== 'PumpPortal' ? ` 🌐${origen}` : '';
  if (CHAT_ID) bot.sendMessage(CHAT_ID, `👀 [${getLabel(tracked.chain)}${etiquetaOrigen}] ${tracked.alias} compró ${symbol} · ${solPaid.toFixed(3)} SOL\n🔗 ${link}`);
  const seen = await pool.query('SELECT 1 FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [trade.traderPublicKey, trade.mint]);
  if (seen.rows.length > 0) {
    log('info', `R2: recompra/ya visto ignorado ${tracked.alias} ${symbol}`);
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `↪️ No copiado (recompra o ya visto)`);
    return;
  }
  await pool.query('INSERT INTO seen_tokens VALUES ($1,$2) ON CONFLICT DO NOTHING', [trade.traderPublicKey, trade.mint]);
  const existingPos = await pool.query('SELECT 1 FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [trade.mint, tracked.alias, MODO_ACTUAL]);
  if (existingPos.rows.length > 0) {
    log('info', 'R2: posición ya abierta con esta wallet en modo actual, ignorado');
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `↪️ No copiado (ya tienes posición abierta en este token vía ${tracked.alias})`);
    return;
  }
  if (tracked.chain !== 'solana') {
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `↪️ No copiado (esta cadena solo genera alertas, no ejecución)`);
    return;
  }
  const solPrice = await getSolPriceUSD();
  if (!solPrice) { log('error', 'No se pudo obtener precio de SOL, se aborta compra'); return; }
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
      log('warn', `Fondos insuficientes para copiar a ${tracked.alias}: saldo ${saldoActual.toFixed(4)} SOL, se necesitan ${totalNecesario.toFixed(4)} SOL`);
      if (CHAT_ID) bot.sendMessage(CHAT_ID, `⚠️ No copiado (${tracked.alias} → ${symbol}): saldo insuficiente. Tienes ${saldoActual.toFixed(4)} SOL, se necesitan ${totalNecesario.toFixed(4)} SOL (fee + red incluidos).`);
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
      await pool.query('INSERT INTO bot_positions (token_mint,symbol,chain,amount,cost_basis_sol,wallet_alias,modo) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [trade.mint, symbol, tracked.chain, tokensBought, amountSol, tracked.alias, MODO_ACTUAL]);
      const saldoFinal = await getWalletSolBalance();
      if (CHAT_ID) bot.sendMessage(CHAT_ID, `✅ COMPRA REAL [${tracked.alias}] ${symbol} · ${amountSol.toFixed(4)} SOL (~$${tracked.amount} todo incluido) · tx: ${linkTx(sig)}\n💰 Saldo total: ${saldoFinal.toFixed(4)} SOL`);
      chequearRetraso(horaDeteccion, tracked.alias, symbol);
    } catch (e) {
      log('error', `Error comprando real: ${e.message}`);
      if (CHAT_ID) bot.sendMessage(CHAT_ID, `❌ No copiado (${tracked.alias} → ${symbol}): ${mensajeAmigableError(e)}`);
    }
  } else {
    await pool.query('INSERT INTO bot_positions (token_mint,symbol,chain,amount,cost_basis_sol,wallet_alias,modo) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [trade.mint, symbol, tracked.chain, tokensBought, amountSol, tracked.alias, MODO_ACTUAL]);
    const nuevoSaldo = await adjustPaperBalance(-tracked.amount);
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `🧪 PAPER: ${NOMBRE_BOT} copió a ${tracked.alias} - compró ${symbol} con ${amountSol.toFixed(4)} SOL (~$${tracked.amount} todo incluido) · Saldo ficticio: $${nuevoSaldo.toFixed(2)}`);
    chequearRetraso(horaDeteccion, tracked.alias, symbol);
  }
}

// ---------- Venta ----------
async function handleTrackedSell(tracked, trade, origen = 'PumpPortal', horaDeteccion = null) {
  await pool.query('DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [trade.traderPublicKey, trade.mint]);
  const symbol = await getTokenSymbol(trade.mint);
  const etiquetaOrigen = origen !== 'PumpPortal' ? ` 🌐${origen}` : '';
  const posRes = await pool.query('SELECT * FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [trade.mint, tracked.alias, MODO_ACTUAL]);
  if (posRes.rows.length === 0) {
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `👀 [${getLabel(tracked.chain)}${etiquetaOrigen}] ${tracked.alias} vendió ${symbol} (no tenías posición vía esta wallet, nada que copiar)`);
    return;
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
      await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [trade.mint, tracked.alias, MODO_ACTUAL]);
      await registrarTradeCerrado(tracked.alias, symbol, r.profitSol);
      let msg = `📤 VENTA REAL [${tracked.alias}] ${symbol} 100% · Salí con: ${proceedsSol.toFixed(4)} SOL · ${formatearResultado(r)} · tx: ${linkTx(sig)}`;
      if (r.profitSol > 0) {
        const usdcSig = await swapProfitToUsdc(r.profitSol);
        msg += usdcSig ? `\\n💵 Ganancia convertida a USDC · tx: ${linkTx(usdcSig)}` : `\\n⚠️ No se pudo convertir la ganancia a USDC`;
      }
      const rentRecuperado = await cerrarCuentaDelToken(trade.mint);
      if (rentRecuperado) msg += `\\n♻️ Cuenta cerrada, recuperado: ${rentRecuperado.toFixed(5)} SOL de rent`;
      const saldoFinal = await getWalletSolBalance();
      msg += `\\n💰 Saldo total: ${saldoFinal.toFixed(4)} SOL`;
      if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);
      chequearRetraso(horaDeteccion, tracked.alias, symbol);
    } catch (e) {
      log('error', `Error vendiendo real: ${e.message}`);
      if (esSellZeroAmount(e)) {
        await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [trade.mint, tracked.alias, MODO_ACTUAL]);
        if (CHAT_ID) bot.sendMessage(CHAT_ID, `🧹 [${tracked.alias}] ${symbol}: posición fantasma eliminada — la compra original nunca se ejecutó de verdad. No se cuenta como pérdida.`);
      } else {
        if (CHAT_ID) bot.sendMessage(CHAT_ID, `❌ Error al vender ${symbol}: ${mensajeAmigableError(e)}\n(la posición sigue abierta, se reintentará con la próxima reconciliación)`);
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
    const solPrice = await getSolPriceUSD();
    const r = calcularResultado(position.cost_basis_sol, proceedsSol, solPrice, true);
    const proceedsUsd = solPrice ? r.proceedsNetoSol * solPrice : tracked.amount;
    await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [trade.mint, tracked.alias, MODO_ACTUAL]);
    await registrarTradeCerrado(tracked.alias, symbol, r.profitSol);
    const nuevoSaldo = await adjustPaperBalance(proceedsUsd);
    let msg = `🧪 PAPER: ${NOMBRE_BOT} vendió 100% ${symbol} (copiando a ${tracked.alias}) · Salí con (neto de fees): ${r.proceedsNetoSol.toFixed(4)} SOL (~$${proceedsUsd.toFixed(2)}) · ${formatearResultado(r)} · Saldo ficticio: $${nuevoSaldo.toFixed(2)}`;
    if (r.profitSol > 0) msg += `\\n💵 (simulado) ${r.profitSol.toFixed(4)} SOL de ganancia se convertirían a USDC`;
    if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);
    chequearRetraso(horaDeteccion, tracked.alias, symbol);
  }
}

// ---------- Extraer cambios de balance ----------
function extraerCambiosDeBalance(acc) {
  const resultados = [];
  const nativeSol = Math.abs((acc.nativeBalanceChange || 0) / LAMPORTS_PER_SOL);
  for (const tbc of (acc.tokenBalanceChanges || [])) {
    if (MINTS_A_IGNORAR.has(tbc.mint)) continue;
    const decimals = tbc.rawTokenAmount?.decimals ?? 6;
    if (decimals === 0) continue;
    const rawAmount = parseFloat(tbc.rawTokenAmount?.tokenAmount ?? '0');
    const delta = rawAmount / Math.pow(10, decimals);
    if (delta === 0) continue;
    let solAmount = nativeSol;
    if (solAmount === 0) {
      const wsol = (acc.tokenBalanceChanges || []).find(t => t.mint === SOL_MINT);
      if (wsol) solAmount = Math.abs(parseFloat(wsol.rawTokenAmount?.tokenAmount ?? '0') / Math.pow(10, wsol.rawTokenAmount?.decimals ?? 9));
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

function numeroSeguro(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

// Fallback para Helius enhanced: en PUMP_FUN/Raydium/Jupiter el cambio real puede venir
// en tokenTransfers o en una token-account cuyo owner es la wallet, no en accountData[wallet].
function extraerCambiosDeTxParaWallet(tx, walletAddress) {
  const porMint = new Map();
  const sumar = (mint, tokenDelta, decimals = 6) => {
    if (!mint || MINTS_A_IGNORAR.has(mint)) return;
    const prev = porMint.get(mint) || { delta: 0, decimals };
    prev.delta += tokenDelta;
    prev.decimals = decimals;
    porMint.set(mint, prev);
  };

  let solDeltaLamports = 0;
  for (const nt of (tx.nativeTransfers || [])) {
    const amount = numeroSeguro(nt.amount);
    if (nt.fromUserAccount === walletAddress) solDeltaLamports -= amount;
    if (nt.toUserAccount === walletAddress) solDeltaLamports += amount;
  }

  for (const tt of (tx.tokenTransfers || [])) {
    const amount = numeroSeguro(tt.tokenAmount);
    if (!amount || !tt.mint) continue;
    if (tt.fromUserAccount === walletAddress) sumar(tt.mint, -amount, tt.decimals ?? 6);
    if (tt.toUserAccount === walletAddress) sumar(tt.mint, amount, tt.decimals ?? 6);
  }

  for (const acc of (tx.accountData || [])) {
    if (acc.account === walletAddress) solDeltaLamports += numeroSeguro(acc.nativeBalanceChange);
    for (const tbc of (acc.tokenBalanceChanges || [])) {
      const owner = tbc.userAccount || tbc.owner || acc.account;
      if (owner !== walletAddress) continue;
      if (MINTS_A_IGNORAR.has(tbc.mint)) continue;
      const decimals = tbc.rawTokenAmount?.decimals ?? 6;
      const rawAmount = numeroSeguro(tbc.rawTokenAmount?.tokenAmount);
      const delta = rawAmount / Math.pow(10, decimals);
      if (delta !== 0) sumar(tbc.mint, delta, decimals);
    }
  }

  const solAmount = Math.abs(solDeltaLamports / LAMPORTS_PER_SOL);
  const cambios = [];
  for (const [mint, info] of porMint.entries()) {
    if (!info.delta) continue;
    cambios.push({
      mint,
      tokenAmount: Math.abs(info.delta),
      solAmount,
      direction: info.delta > 0 ? 'buy' : 'sell'
    });
  }
  return cambios;
}

// ---------- Servidor webhook HTTP ----------
function iniciarServidorWebhook() {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }
    const ip = req.socket.remoteAddress;
    const now = Date.now();
    if (!global._webhookRate) global._webhookRate = new Map();
    const timestamps = global._webhookRate.get(ip) || [];
    const recent = timestamps.filter(t => now - t < 1000);
    if (recent.length >= 10) {
      res.writeHead(429, { 'Content-Type': 'text/plain' });
      res.end('Too Many Requests');
      return;
    }
    recent.push(now);
    global._webhookRate.set(ip, recent);
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      // Helius envía el secreto como header 'x-authheader' (o 'x-auth-header') por defecto.
      // Aceptamos todas las variantes de casing/guiones para no rechazar envíos válidos.
      const auth =
        req.headers['x-authheader'] ||
        req.headers['x-auth-header'] ||
        req.headers['authheader'] ||
        req.headers['AuthHeader'] ||
        req.headers['authorization'];
      if (auth !== HELIUS_WEBHOOK_SECRET) {
        log('warn', `⚠️ Webhook rechazado: authHeader no coincide. Recibido="${auth ? auth.slice(0, 24) + '...' : '(vacío)'}" esperado="${HELIUS_WEBHOOK_SECRET.slice(0, 8)}..." — si Helius no coincide, corregir HELIUS_WEBHOOK_SECRET o el secret del webhook.`);
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Unauthorized');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      procesarWebhookHelius(body).catch(e => log('error', `Error procesando webhook de Helius: ${e.message}, ${e.stack}`));
    });
  });
  const port = process.env.PORT || 3000;
  server.on('error', (e) => {
    // Si el puerto ya está ocupado o no se puede hacer bind, se ve claro en logs.
    log('error', `❌ Servidor de webhooks NO pudo escuchar en el puerto ${port}: ${e.message} (${e.code})`);
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `❌ El servidor de webhooks no pudo levantarse (${e.code}) — los trades de DEX que NO son pump no llegarán. Revisa logs.`, { disable_notification: true }).catch(() => {});
  });
  server.listen(port, () => log('info', `🌐 Servidor de webhooks escuchando en el puerto ${port} (tipo ANY, cualquier DEX)`));
}

// ---------- Procesar webhook Helius ----------
async function procesarWebhookHelius(rawBody) {
  log('info', `📨 Webhook Helius recibido: ${rawBody.length} bytes`);
  let eventos;
  try {
    eventos = JSON.parse(rawBody);
  } catch (e) {
    log('error', `📨 Webhook Helius: el body NO es JSON válido: ${e.message} — primeros 300 chars: ${rawBody.slice(0, 300)}`);
    return;
  }
  if (!Array.isArray(eventos)) {
    // ¿Es un objeto estilo PumpPortal ({signature, mint, traderPublicKey, txType, tokenAmount, solAmount})?
    const esPumpPortal =
      eventos.signature && eventos.mint && eventos.traderPublicKey &&
      eventos.txType && eventos.tokenAmount !== undefined && eventos.solAmount !== undefined;

    if (esPumpPortal) {
      log('info', '📨 Webhook Helius: objeto estilo PumpPortal detectado, procesando directamente.');
      const { mint, traderPublicKey, txType, tokenAmount, solAmount } = eventos;
      const { rows: buscado } = await pool.query('SELECT * FROM tracked_wallets WHERE address=$1', [traderPublicKey]);
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
        traderPublicKey,
        chain: 'solana',
        txType: direccion
      };
      const horaDeteccion = eventos.timestamp ? eventos.timestamp * 1000 : Date.now();
      const origen = eventos.source === 'PUMP_FUN' ? 'PumpPortal' : 'OnChain';
      if (direccion === 'buy') await handleTrackedBuy(tracked, trade, origen, horaDeteccion);
      else await handleTrackedSell(tracked, trade, origen, horaDeteccion);
      return;
    }

    log('info', `📨 Webhook Helius: el body es un objeto simple (tipo: ${typeof eventos}), se envuelve en arreglo.`);
    eventos = [eventos];
  }
  log('info', `📨 Webhook Helius: ${eventos.length} transacción(es) en este lote`);
  const { rows: trackedRows } = await pool.query('SELECT * FROM tracked_wallets');
  const trackedMap = new Map(trackedRows.map(r => [r.address, r]));
  for (const tx of eventos) {
    const cuentasEnTx = (tx.accountData || []).map(a => a.account);
    const participantesExtra = [];
    for (const tt of (tx.tokenTransfers || [])) {
      if (tt.fromUserAccount) participantesExtra.push(tt.fromUserAccount);
      if (tt.toUserAccount) participantesExtra.push(tt.toUserAccount);
    }
    for (const nt of (tx.nativeTransfers || [])) {
      if (nt.fromUserAccount) participantesExtra.push(nt.fromUserAccount);
      if (nt.toUserAccount) participantesExtra.push(nt.toUserAccount);
    }
    const cuentasDetectadas = [...new Set([...cuentasEnTx, ...participantesExtra])];
    const walletsInvolucradas = cuentasDetectadas.filter(a => trackedMap.has(a)).map(a => trackedMap.get(a).alias);
    log('info', `📨 TX recibida: type=${tx.type || '(sin type)'} source=${tx.source || '(sin source)'} accountData.length=${cuentasEnTx.length} wallets-trackeadas=[${walletsInvolucradas.join(', ')}]`);
    if (trackedRows.length === 0) continue;
    const horaDeteccion = tx.timestamp ? tx.timestamp * 1000 : Date.now();
    const cambiosProcesados = new Set();
    for (const acc of (tx.accountData || [])) {
      const tracked = trackedMap.get(acc.account);
      if (!tracked) continue;
      const cambios = extraerCambiosDeBalance(acc);
      if (cambios.length === 0) {
        log('info', `📨 ${tracked.alias} apareció en esta TX pero SIN cambio directo de balance — probando fallback global de Helius.`);
      }
      for (const cambio of cambios) {
        const key = `${tracked.address}:${cambio.mint}:${cambio.direction}`;
        cambiosProcesados.add(key);
        log('info', `🌐 Actividad detectada: ${tracked.alias} ${cambio.direction} ${cambio.mint.slice(0, 6)}... · ${cambio.solAmount.toFixed(4)} SOL (fuente: ${tx.source || 'desconocida'})`);
        const tradeCompatible = {
          mint: cambio.mint,
          solAmount: cambio.solAmount,
          tokenAmount: cambio.tokenAmount,
          traderPublicKey: tracked.address,
          txType: cambio.direction
        };
        const origen = tx.source && tx.source !== 'PUMP_FUN' ? tx.source : 'OnChain';
        if (cambio.direction === 'buy') await handleTrackedBuy(tracked, tradeCompatible, origen, horaDeteccion);
        else await handleTrackedSell(tracked, tradeCompatible, origen, horaDeteccion);
      }
    }

    for (const tracked of trackedRows) {
      if (!cuentasDetectadas.includes(tracked.address)) continue;
      const cambiosFallback = extraerCambiosDeTxParaWallet(tx, tracked.address);
      for (const cambio of cambiosFallback) {
        const key = `${tracked.address}:${cambio.mint}:${cambio.direction}`;
        if (cambiosProcesados.has(key)) continue;
        cambiosProcesados.add(key);
        log('info', `🌐 Actividad detectada (fallback Helius): ${tracked.alias} ${cambio.direction} ${cambio.mint.slice(0, 6)}... · ${cambio.solAmount.toFixed(4)} SOL (fuente: ${tx.source || 'desconocida'})`);
        const tradeCompatible = {
          mint: cambio.mint,
          solAmount: cambio.solAmount,
          tokenAmount: cambio.tokenAmount,
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

// ---------- Comandos de Telegram ----------
bot.onText(/\/add (.+)/, async (msg, match) => {
  try {
    const args = match[1].trim().split(/\s+/);
    const [alias, address, amountStr, chainRaw] = args;
    const amount = parseFloat(amountStr);
    const chain = normalizeChain(chainRaw);
    await pool.query('INSERT INTO tracked_wallets VALUES ($1,$2,$3,$4) ON CONFLICT(alias) DO UPDATE SET address=$2, amount=$3, chain=$4', [alias, address, amount, chain]);
    await resyncSubscriptions();
    await crearOActualizarWebhookHelius();
    bot.sendMessage(msg.chat.id, `⏳ Snapshot ${alias} en ${getLabel(chain)}...`);
    const holdings = await getHoldings(address);
    for (const h of holdings) {
      const mint = h.mint;
      if (!mint) continue;
      await pool.query('INSERT INTO seen_tokens VALUES ($1,$2) ON CONFLICT DO NOTHING', [address, mint]);
    }
    bot.sendMessage(msg.chat.id, `✅ ${alias} agregado [${getLabel(chain)}] $${amount} USD por compra (fees y red incluidos). Snapshot real: ${holdings.length} tokens vistos. Escuchando pump.fun ✅ y cualquier DEX ✅`);
  } catch (e) {
    log('error', `Error en /add: ${e.message}`, e.stack);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});
bot.onText(/\/setamount (\S+) (\S+)/, async (msg, match) => {
  try {
    const alias = match[1];
    const nuevoMonto = parseFloat(match[2]);
    if (isNaN(nuevoMonto) || nuevoMonto <= 0) {
      bot.sendMessage(msg.chat.id, '⚠️ Monto inválido. Usa: /setamount alias nuevo_monto (ej. /setamount CAP 6)');
      return;
    }
    const result = await pool.query('UPDATE tracked_wallets SET amount=$1 WHERE alias=$2 RETURNING alias, amount', [nuevoMonto, alias]);
    if (result.rows.length > 0) bot.sendMessage(msg.chat.id, `✅ ${alias} ahora usa $${nuevoMonto} USD por compra (efectivo desde la próxima señal).`);
    else bot.sendMessage(msg.chat.id, `⚠️ No encontré ninguna wallet con el alias "${alias}"`);
  } catch (e) {
    log('error', `Error en /setamount: ${e.message}`, e.stack);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});
bot.onText(/\/remove (.+)/, async (msg, match) => {
  try {
    const alias = match[1];
    const result = await pool.query('DELETE FROM tracked_wallets WHERE alias=$1 RETURNING alias', [alias]);
    if (result.rows.length > 0) {
      bot.sendMessage(msg.chat.id, `✅ ${alias} eliminado de tracked_wallets.`);
      await resyncSubscriptions();
      await crearOActualizarWebhookHelius();
    } else {
      bot.sendMessage(msg.chat.id, `⚠️ No encontré ninguna wallet con el alias "${alias}"`);
    }
  } catch (e) {
    log('error', `Error in /remove: ${e.message}`, e.stack);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});
bot.onText(/\/list/, async (msg) => {
  try {
    const { rows } = await pool.query('SELECT alias, address, amount, chain FROM tracked_wallets ORDER BY alias');
    if (rows.length === 0) {
      bot.sendMessage(msg.chat.id, '📭 No hay wallets trackeadas.');
      return;
    }
    const lines = rows.map(r => `• ${r.alias} [${getLabel(r.chain)}] ${r.address} ($${r.amount})`);
    bot.sendMessage(msg.chat.id, `📋 Wallets trackeadas:\n${lines.join('\n')}`);
  } catch (e) {
    log('error', `Error en /list: ${e.message}`, e.stack);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});
bot.onText(/\/diag (.+)/, async (msg, match) => {
  try {
    const alias = match[1];
    const diag = await diagnosticoHelius(alias);
    if (diag.error) {
      bot.sendMessage(msg.chat.id, `❌ Error en diagnóstico: ${diag.error}`);
      return;
    }
    const { webhookInfo, historial, address, alias: diagAlias, saludWebhook } = diag;
    let txt = `🔍 Diagnóstico de ${diagAlias} (${address})\n`;
    txt += `🪝 Webhook registrado: ${webhookInfo.error ? '❌ ' + webhookInfo.error : '✅ OK'}\n`;
    if (!webhookInfo.error && webhookInfo.webhookURL) txt += `🔗 URL: ${webhookInfo.webhookURL}\n`;
    if (!webhookInfo.error && webhookInfo.transactionTypes) txt += `📦 Tipos: ${webhookInfo.transactionTypes.join(', ')}\n`;
    if (saludWebhook) {
      txt += `\n📈 *Salud del webhook*:\n`;
      txt += `• Activo: ${saludWebhook.active === null ? 'n/d' : (saludWebhook.active ? '✅ sí' : '❌ NO')}\n`;
      txt += `• Failure rate (24h): ${saludWebhook.failureRate === null ? 'n/d' : (saludWebhook.failureRate * 100).toFixed(1) + '%'}\n`;
      txt += `• Cooldown: ${saludWebhook.isUnderCooldown === null ? 'n/d' : (saludWebhook.isUnderCooldown ? '🔴 SÍ (Helius suspendió envíos)' : 'no')}\n`;
      txt += `• Último envío: ${saludWebhook.lastSentAt || 'nunca'}\n`;
      if (saludWebhook.lastError) txt += `• Último error: ${saludWebhook.lastError}\n`;
    }
    txt += `📜 Últimas 10 tx: ${historial.error ? '❌ ' + historial.error : `✅ ${historial.length} transacciones obtenidas`}`;
    bot.sendMessage(msg.chat.id, txt);
  } catch (e) {
    log('error', `Error en /diag: ${e.message}`, e.stack);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});
bot.onText(/\/status/, async (msg) => {
  try {
    const modo = MODO_ACTUAL.toUpperCase();
    const solPrice = await getSolPriceUSD();
    const solBal = LIVE ? await getWalletSolBalance() : 'N/A (paper)';
    const paper = await getPaperBalance();
    let txt = `🤖 Estado del bot\n`;
    txt += `⚙️ Modo: ${modo}\n`;
    txt += `💵 Precio SOL: $${solPrice?.toFixed(2) ?? 'N/A'}\n`;
    txt += `💰 SOL en wallet: ${typeof solBal === 'number' ? solBal.toFixed(4) : solBal}\n`;
    txt += `📄 Balance paper: $${paper.current_usdc.toFixed(2)} (inicial $${paper.initial_usdc})\n`;
    bot.sendMessage(msg.chat.id, txt);
  } catch (e) {
    log('error', `Error en /status: ${e.message}`, e.stack);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});
// ---------- NUEVO: /help ----------
bot.onText(/\/help/, async (msg) => {
  const ayuda = `
🤖 *Comandos disponibles*:
/add <alias> <dirección> <montoUSD> [cadena]   – Agrega una wallet a seguir (ej. /add miwallet 5EsYuW... 10 sol)
/setamount <alias> <nuevoMontoUSD>            – Cambia el monto USD por compra para esa alias
/remove <alias>                               – Elimina una wallet de seguimiento
/list                                          – Lista todas las wallets trackeadas
/diag <alias>                                 – Diagnóstico de webhook y últimas tx de una wallet
/status                                        – Estado general del bot (modo, precio SOL, balances)
/positions                                     – Muestra las posiciones abiertas del bot
/help                                          – Esta ayuda
`;
  bot.sendMessage(msg.chat.id, ayuda, { parse_mode: 'Markdown' });
});
// ---------- NUEVO: /positions ----------
bot.onText(/\/positions/, async (msg) => {
  try {
    const { rows } = await pool.query(`
      SELECT bp.token_mint, bp.symbol, bp.chain, bp.amount, bp.cost_basis_sol, bp.wallet_alias, bp.modo
      FROM bot_positions bp
      WHERE bp.modo = $1
    `, [MODO_ACTUAL]);
    if (rows.length === 0) {
      bot.sendMessage(msg.chat.id, `📭 No hay posiciones abiertas en modo ${MODO_ACTUAL.toUpperCase()}.`);
      return;
    }
    const lines = rows.map(r => {
      const modoTag = r.modo === 'real' ? '🟢 REAL' : '🟡 PAPER';
      return `• ${r.symbol} (${r.chain}) – ${r.amount.toFixed(4)} tokens – costo ${r.cost_basis_sol.toFixed(4)} SOL – wallet: ${r.wallet_alias} [${modoTag}]`;
    });
    bot.sendMessage(msg.chat.id, `📊 *Posiciones abiertas* (${MODO_ACTUAL.toUpperCase()}):\n${lines.join('\n')}`);
  } catch (e) {
    log('error', `Error en /positions: ${e.message}`, e.stack);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// ---------- Inicialización ----------
(async () => {
  await initDB();
  await initBaselineReal();
  conectarWS();
  crearOActualizarWebhookHelius();
  iniciarServidorWebhook();

  setInterval(reconciliarPosiciones, 60_000);
  setInterval(revisarStopLoss, 60_000);
  // Cada 5 min: si Helius deshabilitó el webhook, reactivarlo automáticamente.
  setInterval(() => {
    const apiKey = getHeliusApiKey();
    if (!apiKey) return;
    pool.query('SELECT helius_webhook_id FROM global_balance WHERE id=1')
      .then(({ rows }) => {
        const webhookId = rows[0]?.helius_webhook_id;
        if (webhookId) verificarEstadoWebhook(apiKey, webhookId);
      })
      .catch(e => log('error', `Error en chequeo periódico del webhook: ${e.message}`));
  }, 300_000);
  setInterval(async () => {
    const marca = new Date().toISOString();
    log('info', `💓 Heartbeat [${marca}] modo=${MODO_ACTUAL} WS=${ws ? ws.readyState : 'null'}`);
  }, 300_000);

  const shutdown = async () => {
    log('info', 'Recibida señal de apagado, cerrando conexiones...');
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})();