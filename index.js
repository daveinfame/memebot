// ========= ⚡️M3M3B0T⚡️ REAL TRADING - + COMANDO /diag PARA VERIFICAR CONFIGURACIÓN DE HELIUS SIN ESPERAR =========
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
function horaLocal(ms) { return new Date(ms).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour12: false }); }
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
  } catch { return null; }
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
  bsc: { id: 'bsc', name: 'BSC' },
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
    if (!res.ok) { log('warn', `Jupiter /order (stop-loss) respondió mal: ${res.status}, ${await res.text()}`); return null; }
    const data = await res.json();
    if (!data.outAmount) return null;
    return parseFloat(data.outAmount) / LAMPORTS_PER_SOL;
  } catch (e) { log('warn', `No se pudo cotizar valor para stop-loss: ${e.message}`); return null; }
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
  } catch (e) { log('warn', `No se pudo cerrar la cuenta del token (no crítico): ${e.message}`); return null; }
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
    rawAmount = Math.floor(amount * LAMPORTS_PER_SOL);
  } else { // sell
    inputMint = mint;
    outputMint = SOL_MINT;
    rawAmount = Math.floor(amount * Math.pow(10, decimals));
  }
  const quoteUrl = `${JUPITER_BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rawAmount}&slippageBps=${slippage}`;
  const quoteRes = await fetch(quoteUrl, { headers: { 'x-api-key': process.env.JUPITER_API_KEY } });
  if (!quoteRes.ok) throw new Error(`Jupiter quote failed: ${quoteRes.status} ${await quoteRes.text()}`);
  const quoteData = await quoteRes.json();
  const swapUrl = `${JUPITER_BASE}/swap`;
  const swapRes = await fetch(swapUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.JUPITER_API_KEY },
    body: JSON.stringify({ userPublicKey: walletKeypair.publicKey.toBase58(), quoteResponse: quoteData })
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
      return await pumpPortalTrade({
        action, mint, amount: action === 'buy' ? amount : '100%', denominatedInSol: action === 'buy' ? true : false,
        slippage, priorityFee: 0.0005, pool: 'auto'
      });
    }
    return await ejecutarSwapViaJupiter({ action, mint, amount, slippage });
  } catch (primerError) {
    if (action === 'sell') {
      log('warn', `Ruta PumpPortal falló para venta (${mint.slice(0, 6)}...), intentando Jupiter como respaldo: ${primerError.message}`);
      return await ejecutarSwapViaJupiter({ action, mint, amount, slippage });
    }
    if (esPump && origen === 'OnChain') {
      log('warn', `Ruta PumpPortal falló para compra (${mint.slice(0, 6)}...), intentando Jupiter como respaldo: ${primerError.message}`);
      return await ejecutarSwapViaJupiter({ action, mint, amount, slippage });
    }
    throw primerError;
  }
}

// ---------- WebSocket PumpPortal ----------
function conectarWS() {
  if (!process.env.PUMPPORTAL_API_KEY) { log('warn', 'PUMPPORTAL_API_KEY no está definida; se omite conexión WS a PumpPortal'); return; }
  if (ws && ws.readyState === WebSocket.OPEN) return;
  log('info', 'Conectando WebSocket a PumpPortal...');
  ws = new WebSocket(PUMP_PORTAL_WS);
  ws.on('open', () => { log('info', 'WebSocket PumpPortal conectado'); wsReconnectAttempts = 0; if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; } resyncSubscriptions(); });
  ws.on('message', (data) => { try { const msg = JSON.parse(data.toString()); if (msg.pong) return; procesarWebhookHelius(JSON.stringify(msg)); } catch (e) { log('error', `Error procesando mensaje WS: ${e.message}`); } });
  ws.on('error', (err) => { log('error', `WebSocket error: ${err.message}`); });
  ws.on('close', (code, reason) => { log('warn', `WebSocket cerrado (${code}): ${reason}. Intentando reconexión...`); ws = null; scheduleWSReconnect(); });
}
function scheduleWSReconnect() {
  if (wsReconnectTimer) return;
  const delay = Math.min(1000 * 2 ** ++wsReconnectAttempts, 30000);
  log('info', `Reconexión WS en ${delay}ms (intento ${wsReconnectAttempts})`);
  wsReconnectTimer = setTimeout(() => { wsReconnectTimer = null; conectarWS(); }, delay);
}
function resyncSubscriptions() {
  if (!ws || ws.readyState !== WebSocket.OPEN) { log('info', 'WS no está listo todavía, se sincronizará completo en la próxima conexión'); return; }
  pool.query('SELECT alias, address FROM tracked_wallets')
    .then(({ rows }) => { if (rows.length > 0) { ws.send(JSON.stringify({ method: 'subscribeAccountTrade', keys: rows.map(r => r.address) })); const aliases = rows.map(r => r.alias).join(', ') || 'ninguna'; log('info', `🔁 Resincronizado (PumpPortal): escuchando ${rows.length} wallets (${aliases})`); } })
    .catch(e => log('error', `Error resincronizando suscripciones: ${e.message}`));
}

// ---------- Webhook Helius ----------
function crearOActualizarWebhookHelius() {
  const apiKey = getHeliusApiKey();
  if (!apiKey) { log('error', '⚠️ No se pudo extraer el api-key de HELIUS_RPC_URL — el webhook no se puede configurar'); return; }
  pool.query('SELECT address, alias FROM tracked_wallets')
    .then(({ rows: walletRows }) => { const direcciones = walletRows.map(r => r.address); const aliases = walletRows.map(r => r.alias);
      pool.query('INSERT INTO global_balance (id, helius_webhook_id) VALUES (1, \'a9fbea52-66c7-4fe0-85fb-358486d2b6d9\') ON CONFLICT (id) DO UPDATE SET helius_webhook_id = EXCLUDED.helius_webhook_id')
        .catch(e => log('warn', 'Nota: global_balance ya existe o no se pudo crear'))
        .then(() => pool.query('SELECT helius_webhook_id FROM global_balance WHERE id=1')).then(({ rows }) => { const webhookIdExistente = rows[0]?.helius_webhook_id;
          const payload = { webhookURL: HELIUS_WEBHOOK_URL, transactionTypes: ['ANY'], accountAddresses: direcciones, webhookType: 'enhanced', authHeader: HELIUS_WEBHOOK_SECRET };
          if (webhookIdExistente) { return fetch(`https://api.helius.xyz/v0/webhooks/${webhookIdExistente}?api-key=${apiKey}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, active: true }) }) .then(async res => { if (!res.ok) throw new Error(`Error actualizando webhook de Helius: ${res.status} ${await res.text()}`); log('info', `🌐 Webhook (ANY) actualizado: ${direcciones.length} wallets (${aliases.join(', ')})`); }) .then(() => verificarEstadoWebhook(apiKey, webhookIdExistente)); } else { return fetch(`https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }) .then(res => { if (!res.ok) throw new Error(`Error creando webhook de Helius: ${res.status} ${await res.text()}`); return res.json(); }) .then(data => { return pool.query('UPDATE global_balance SET helius_webhook_id=$1 WHERE id=1', [data.webhookID]) .then(() => log('info', `🌐 Webhook (ANY) creado: ${direcciones.length} wallets, id=${data.webhookID}`)) .then(() => verificarEstadoWebhook(apiKey, data.webhookID)); }); } })
    .catch(e => log('error', `Error configurando webhook de Helius: ${e.message}`));
}

// ---------- Verifica que el webhook esté ACTIVO; si no, lo reactiva (Helius lo auto-deshabilita tras fallos). ----------
async function verificarEstadoWebhook(apiKey, webhookId) {
  try { const res = await fetch(`https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${apiKey}`); const data = await res.json(); const auth = data.authHeader || data.xAuthHeader || data.authorization; if (auth !== HELIUS_WEBHOOK_SECRET) { log('warn', `⚠️ Webhook rechazado: authHeader no coincide. Recibido="${auth ? auth.slice(0, 24) + '...' : '(vacío)'}" esperado="${HELIUS_WEBHOOK_SECRET.slice(0, 8)}..." — si Helius no coincide, corregir HELIUS_WEBHOOK_SECRET o el secret del webhook.`); return; } } catch (e) { log('error', `Error verificando estado del webhook: ${e.message}`); }
}

// ---------- Diagnóstico ----------
async function diagnosticoHelius(alias) {
  const apiKey = getHeliusApiKey();
  if (!apiKey) return { error: 'No se pudo extraer el api-key de HELIUS_RPC_URL' };
  const { rows } = await pool.query('SELECT * FROM tracked_wallets WHERE alias=$1', [alias]);
  if (!rows[0]) return { error: `No existe ninguna wallet trackeada con el alias "${alias}"` };
  const address = rows[0].address;
  let webhookInfo = null;
  try { const { rows: gb } = await pool.query('SELECT helius_webhook_id FROM global_balance WHERE id=1'); const webhookId = gb[0]?.helius_webhook_id; if (webhookId) { const res = await fetch(`https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${apiKey}`); webhookInfo = await res.json(); } else { webhookInfo = { error: 'No hay webhookId guardado en la base de datos' }; } } catch (e) { webhookInfo = { error: e.message }; }
  let historial = []; try { const res = await fetch(`https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&limit=10`); historial = await res.json(); } catch (e) { historial = { error: e.message }; }
  return { webhookInfo, historial, address, alias, saludWebhook: { failureRate: null, isUnderCooldown: null, lastSentAt: null, lastError: null, active: null } };
}

// ---------- Posiciones ----------
async function initDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bot_positions (token_mint TEXT, symbol TEXT, chain TEXT, amount REAL);`);
  await pool.query(`ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS cost_basis_sol REAL;`);
  await pool.query(`ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS wallet_alias TEXT;`);
  await pool.query(`ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS modo TEXT DEFAULT 'paper'`);
  await pool.query(`DELETE FROM bot_positions WHERE wallet_alias IS NULL;`);
  await pool.query(`UPDATE bot_positions SET modo='paper' WHERE modo IS NULL`);
}

// ---------- Balance paper ----------
async function getPaperBalance() {
  try { const { rows } = await pool.query('SELECT SUM(amount) as current_usdc FROM bot_positions WHERE modo = $1', ['paper']); const { rows: init } = await pool.query('SELECT value as initial_usdc FROM config WHERE key = \'initial_usdc\''); return { current_usdc: parseFloat(rows[0].current_usdc || 0), initial_usdc: parseFloat(init[0].initial_usdc || 0) }; } catch (e) { log('warn', `Error getPaperBalance: ${e.message}`); return { current_usdc: 0, initial_usdc: 1000 }; }
}

// ---------- Webhook Helius ----------
async function initBaselineReal() { try { const res = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${process.env.HELIUS_RPC_URL}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactionTypes: ['ANY'], accountAddresses: [], webhookType: 'enhanced', authHeader: process.env.HELIUS_WEBHOOK_SECRET, active: true }) }); const data = await res.json(); log('info', `🌐 Webhook inicial creado: ${data.webhookID || 'fallo'});` } catch (e) { log('warn', `Webhook inicial fallo: ${e.message}`); }

// ---------- Funciones de Posiciones ----------
async function getPaperBalance() { try { const { rows } = await pool.query('SELECT SUM(amount) as current_usdc FROM bot_positions WHERE modo = $1', ['paper']); const { rows: init } = await pool.query('SELECT value as initial_usdc FROM config WHERE key = \'initial_usdc\''); return { current_usdc: parseFloat(rows[0].current_usdc || 0), initial_usdc: parseFloat(init[0].initial_usdc || 0) }; } catch (e) { log('warn', `Error getPaperBalance: ${e.message}`); return { current_usdc: 0, initial_usdc: 1000 }; }

// ---------- WebSocket PumpPortal ----------
function conectarWS() { if (!process.env.PUMPPORTAL_API_KEY) { log('warn', 'PUMPPORTAL_API_KEY no está definida; se omite conexión WS a PumpPortal'); return; } if (ws && ws.readyState === WebSocket.OPEN) return; log('info', 'Conectando WebSocket a PumpPortal...'); ws = new WebSocket(PUMP_PORTAL_WS); ws.on('open', () => { log('info', 'WebSocket PumpPortal conectado'); wsReconnectAttempts = 0; if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; } resyncSubscriptions(); }); ws.on('message', (data) => { try { const msg = JSON.parse(data.toString()); if (msg.pong) return; procesarWebhookHelius(JSON.stringify(msg)); } catch (e) { log('error', `Error procesando mensaje WS: ${e.message}`); } }); ws.on('error', (err) => { log('error', `WebSocket error: ${err.message}`); }); ws.on('close', (code, reason) => { log('warn', `WebSocket cerrado (${code}): ${reason}. Intentando reconexión...`); ws = null; scheduleWSReconnect(); }); }
function scheduleWSReconnect() { if (wsReconnectTimer) return; const delay = Math.min(1000 * 2 ** ++wsReconnectAttempts, 30000); log('info', `Reconexión WS en ${delay}ms (intento ${wsReconnectAttempts})`); wsReconnectTimer = setTimeout(() => { wsReconnectTimer = null; conectarWS(); }, delay); }
function resyncSubscriptions() { if (!ws || ws.readyState !== WebSocket.OPEN) { log('info', 'WS no está listo todavía, se sincronizará completo en la próxima conexión'); return; } pool.query('SELECT alias, address FROM tracked_wallets').then(({ rows }) => { if (rows.length > 0) { ws.send(JSON.stringify({ method: 'subscribeAccountTrade', keys: rows.map(r => r.address) })); const aliases = rows.map(r => r.alias).join(', ') || 'ninguna'; log('info', `🔁 Resincronizado (PumpPortal): escuchando ${rows.length} wallets (${aliases})`); } }).catch(e => log('error', `Error resincronizando suscripciones: ${e.message}`)); }

// ---------- Comandos de Telegram ----------
bot.onText(/\\/add (.+)/, async (msg, match) => { try { const args = match[1].trim().split(/\\s+/); const [alias, address, amountStr, chainRaw] = args; const amount = parseFloat(amountStr); const chain = normalizeChain(chainRaw); await pool.query('INSERT INTO tracked_wallets VALUES ($1,$2,$3,$4) ON CONFLICT(alias) DO UPDATE SET address=$2, amount=$3, chain=$4', [alias, address, amount, chain]); await resyncSubscriptions(); await crearOActualizarWebhookHelius(); bot.sendMessage(msg.chat.id, `⏳ Snapshot ${alias} en ${getLabel(chain)}...`); const holdings = await getHoldings(address); for (const h of holdings) { const mint = h.mint; if (!mint) continue; await pool.query('INSERT INTO seen_tokens VALUES ($1,$2) ON CONFLICT DO NOTHING', [address, mint]); } bot.sendMessage(msg.chat.id, `✅ ${alias} agregado [${getLabel(chain)}] $${amount} USD por compra (fees y red incluidos). Snapshot real: ${holdings.length} tokens vistos. Escuchando pump.fun ✅ y cualquier DEX ✅`); } catch (e) { log('error', `Error en /add: ${e.message}`, e.stack); bot.sendMessage(msg.chat.id, 'Error: ' + e.message); } });
bot.onText(/\\/setamount (\\S+) (\\S+)/, async (msg, match) => { try { const alias = match[1]; const nuevoMonto = parseFloat(match[2]); if (isNaN(nuevoMonto) || nuevoMonto <= 0) { bot.sendMessage(msg.chat.id, '⚠️ Monto inválido. Usa: /setamount alias nuevo_monto (ej. /setamount CAP 6)'); return; } const result = await pool.query('UPDATE tracked_wallets SET amount=$1 WHERE alias=$2 RETURNING alias, amount', [nuevoMonto, alias]); if (result.rows.length > 0) bot.sendMessage(msg.chat.id, `✅ ${alias} ahora usa $${nuevoMonto} USD por compra (efectivo desde la próxima señal).`); else bot.sendMessage(msg.chat.id, `⚠️ No encontré ninguna wallet con el alias "${alias}"); } catch (e) { log('error', `Error en /setamount: ${e.message}`, e.stack); bot.sendMessage(msg.chat.id, 'Error: ' + e.message); } });
bot.onText(/\\/remove (.+)/, async (msg, match) => { try { const alias = match[1]; const result = await pool.query('DELETE FROM tracked_wallets WHERE alias=$1 RETURNING alias', [alias]); if (result.rows.length > 0) { bot.sendMessage(msg.chat.id, `✅ ${alias} eliminado de tracked_wallets.`); await resyncSubscriptions(); await crearOActualizarWebhookHelius(); } else { bot.sendMessage(msg.chat.id, `⚠️ No encontré ninguna wallet con el alias "${alias}"); } } catch (e) { log('error', `Error in /remove: ${e.message}`, e.stack); bot.sendMessage(msg.chat.id, 'Error: ' + e.message); } });
bot.onText(/\\/list/, async (msg) => { try { const { rows } = await pool.query('SELECT alias, address, amount, chain FROM tracked_wallets ORDER BY alias'); if (rows.length === 0) { bot.sendMessage(msg.chat.id, '📭 No hay wallets trackeadas.'); return; } const lines = rows.map(r => `• ${r.alias} [${getLabel(r.chain)}] ${r.address} ($${r.amount})`); bot.sendMessage(msg.chat.id, `📋 Wallets trackeadas:\\n${lines.join('\\n')}`); } catch (e) { log('error', `Error en /list: ${e.message}`, e.stack); bot.sendMessage(msg.chat.id, 'Error: ' + e.message); } });
bot.onText(/\\/diag (.+)/, async (msg, match) => { try { const alias = match[1]; const diag = await diagnosticoHelius(alias); if (diag.error) { bot.sendMessage(msg.chat.id, `❌ Error en diagnóstico: ${diag.error}`); return; } const { webhookInfo, historial, address, alias: diagAlias, saludWebhook } = diag; let txt = `🔍 Diagnóstico de ${diagAlias} (${address})\\n`; txt += `🪝 Webhook registrado: ${webhookInfo.error ? '❌ ' + webhookInfo.error : '✅ OK'}\\n`; if (!webhookInfo.error && webhookInfo.webhookURL) txt += `🔗 URL: ${webhookInfo.webhookURL}\\n`; if (saludWebhook) { txt += `\\n📈 *Salud del webhook*:\\n`; txt += `• Activo: ${saludWebhook.active === null ? 'n/d' : (saludWebhook.active ? '✅ sí' : '❌ NO')}\\n`; txt += `• Failure rate (24h): ${saludWebhook.failureRate === null ? 'n/d' : (saludWebhook.failureRate * 100).toFixed(1) + '%'}\\n`; txt += `• Cooldown: ${saludWebhook.isUnderCooldown === null ? 'n/d' : (saludWebhook.isUnderCooldown ? '🔴 SÍ (Helius suspendió envíos)' : 'no')}\\n`; txt += `• Último envío: ${saludWebhook.lastSentAt || 'nunca'}\\n`; if (saludWebhook.lastError) txt += `• Último error: ${saludWebhook.lastError}\\n`; txt += `📜 Últimas 10 tx: ${historial.error ? '❌ ' + historial.error : `✅ ${historial.length} transacciones obtenidas`}`; bot.sendMessage(msg.chat.id, txt); } catch (e) { log('error', `Error en /diag: ${e.message}`, e.stack); bot.sendMessage(msg.chat.id, 'Error: ' + e.message); } });
bot.onText(/\\/status/, async (msg) => { try { const modo = MODO_ACTUAL.toUpperCase(); const solPrice = await getSolPriceUSD(); const solBal = LIVE ? await getWalletSolBalance() : 'N/A (paper)'; const paper = await getPaperBalance(); let txt = `🤖 Estado del bot\\n`; txt += `⚙️ Modo: ${modo}\\n`; txt += `💵 Precio SOL: $${solPrice?.toFixed(2) ?? 'N/A'}\\n`; txt += `💰 SOL en wallet: ${typeof solBal === 'number' ? solBal.toFixed(4) : solBal}\\n`; txt += `📄 Balance paper: $${paper.current_usdc.toFixed(2)} (inicial $${paper.initial_usdc})\\n`; bot.sendMessage(msg.chat.id, txt); } catch (e) { log('error', `Error en /status: ${e.message}`, e.stack); bot.sendMessage(msg.chat.id, 'Error: ' + e.message); } });
bot.onText(/\\/help/, async (msg) => { const ayuda = `\n🤖 *Comandos disponibles*:\n/add <alias> <dirección> <montoUSD> [cadena]   – Agrega una wallet a seguir (ej. /add miwallet 5EsYuW... 10 sol)\n/setamount <alias> <nuevoMontoUSD>            – Cambia el monto USD por compra para esa alias\n/remove <alias>                               – Elimina una wallet de seguimiento\n/list                                          – Lista todas las wallets trackeadas\n/diag <alias>                                 – Diagnóstico de webhook y últimas tx de una wallet\n/status                                        – Estado general del bot (modo, precio SOL, balances)\n/positions                                     – Muestra las posiciones abiertas del bot\n/ranking [real|paper]                          – Ranking wallets por PnL (modo actual o forzado)\n/pnl                                           – PnL rápido: realizado + no realizado + total\n/help                                          – Esta ayuda`; bot.sendMessage(msg.chat.id, ayuda, { parse_mode: 'Markdown' }); });
bot.onText(/\\/positions/, async (msg) => { try { const { rows } = await pool.query(`SELECT bp.token_mint, bp.symbol, bp.chain, bp.amount, bp.cost_basis_sol, bp.wallet_alias, bp.modo FROM bot_positions bp WHERE bp.modo = $1`, [MODO_ACTUAL]); if (rows.length === 0) { bot.sendMessage(msg.chat.id, `📭 No hay posiciones abiertas en modo ${MODO_ACTUAL.toUpperCase()}.`); return; } const lines = rows.map(r => `• ${r.symbol} (${r.chain}) – ${r.amount.toFixed(4)} tokens – costo ${r.cost_basis_sol.toFixed(4)} SOL – wallet: ${r.wallet_alias} [${r.modo === 'real' ? '🟢 REAL' : '🟡 PAPER'}]`); bot.sendMessage(msg.chat.id, `📊 *Posiciones abiertas* (${MODO_ACTUAL.toUpperCase()}):\\n${lines.join('\\n')}`); } catch (e) { log('error', `Error en /positions: ${e.message}`, e.stack); bot.sendMessage(msg.chat.id, 'Error: ' + e.message); } });
bot.onText(/\\/ranking(?:\\s+(\\S+))?/, async (msg, match) => { try { const modoFiltro = match[1]?.toLowerCase(); const modo = modoFiltro === 'real' ? 'real' : modoFiltro === 'paper' ? 'paper' : MODO_ACTUAL; const { rows } = await pool.query(`SELECT wallet_alias, COUNT(*) as trades, SUM(CASE WHEN profit_sol > 0 THEN 1 ELSE 0 END) as wins, SUM(CASE WHEN profit_sol < 0 THEN 1 ELSE 0 END) as losses, SUM(profit_sol) as total_profit_sol, AVG(profit_sol) as avg_profit_sol, MAX(profit_sol) as best_trade, MIN(profit_sol) as worst_trade FROM trade_history WHERE modo = $1 GROUP BY wallet_alias ORDER BY total_profit_sol DESC`, [modo]); if (rows.length === 0) { bot.sendMessage(msg.chat.id, `📭 No hay historial en modo ${modo.toUpperCase()}.`); return; } const lines = rows.map((r, i) => { const wr = r.trades > 0 ? ((r.wins / r.trades) * 100).toFixed(1) : '0.0'; const emoji = (r.total_profit_sol || 0) >= 0 ? '🟢' : '🔴'; const best = r.best_trade !== null ? parseFloat(r.best_trade).toFixed(4) : '0.0000'; const worst = r.worst_trade !== null ? parseFloat(r.worst_trade).toFixed(4) : '0.0000'; const total = (r.total_profit_sol !== null ? r.total_profit_sol : 0).toFixed(4); return `${i + 1}. ${emoji} ${r.wallet_alias}: ${total} SOL (${r.trades} trades, ${wr}% WR, best ${best}, worst ${worst})`; }); bot.sendMessage(msg.chat.id, `🏆 *Ranking wallets* (${modo.toUpperCase()}):\\n${lines.join('\\n')}`); } catch (e) { log('error', `Error en /ranking: ${e.message}`, e.stack); bot.sendMessage(msg.chat.id, 'Error: ' + e.message); } });
bot.onText(/\\/pnl/, async (msg) => { try { const { rows: hist } = await pool.query(`SELECT SUM(profit_sol) as realized_sol FROM trade_history WHERE modo = $1`, [MODO_ACTUAL]); const realizedSol = hist[0]?.realized_sol || 0; const { rows: pos } = await pool.query(`SELECT bp.*, tw.address as wallet_address FROM bot_positions bp JOIN tracked_wallets tw ON tw.alias = bp.wallet_alias WHERE bp.modo = $1`, [MODO_ACTUAL]); let unrealizedSol = 0; if (pos.length > 0) { for (const p of pos) { const { decimals } = await getTokenInfoHelius(p.token_mint); const valor = await estimarValorEnSol(p.token_mint, p.amount, decimals); if (valor !== null) unrealizedSol += valor - p.cost_basis_sol; } } const totalSol = realizedSol + unrealizedSol; const emoji = totalSol >= 0 ? '🟢' : '🔴'; let txt = `💰 *PnL ${MODO_ACTUAL.toUpperCase()}* ${emoji}\\n`; txt += `🔒 Realizado: ${realizedSol.toFixed(4)} SOL\\n`; if (pos.length > 0) { txt += `📈 No realizado: ${unrealizedSol.toFixed(4)} SOL (${pos.length} pos abiertas)\\n`; } txt += `🧮 Total: ${totalSol.toFixed(4)} SOL`; const solPrice = await getSolPriceUSD(); if (solPrice) txt += ` (~$${(totalSol * solPrice).toFixed(2)})`; bot.sendMessage(msg.chat.id, txt); } catch (e) { log('error', `Error en /pnl: ${e.message}`, e.stack); bot.sendMessage(msg.chat.id, 'Error: ' + e.message); } });
bot.onText(/\\/cleanup/, async (msg) => { try { const modo = MODO_ACTUAL; const { rows: tracked } = await pool.query('SELECT alias FROM tracked_wallets'); const trackedAliases = tracked.map(r => r.alias); const { rowCount } = await pool.query(`DELETE FROM bot_positions WHERE wallet_alias NOT IN ($1) AND modo = $2`, [trackedAliases.length ? `'${trackedAliases.join(',')}'` : \"''\", modo]); bot.sendMessage(msg.chat.id, `🧹 Cleanup ${modo.toUpperCase()}: ${rowCount} posición(es) de wallets no trackeadas eliminada(s).`); } catch (e) { log('error', `Error en /cleanup: ${e.message}`, e.stack); bot.sendMessage(msg.chat.id, 'Error en cleanup: ' + e.message); } });
bot.onText(/\\/fixwebhook/, async (msg) => { try { await pool.query('DELETE FROM global_balance WHERE id = 1'); await pool.query('INSERT INTO global_balance (id, helius_webhook_id) VALUES (1, \\'a9fbea52-66c7-4fe0-85fb-358486d2b6d9\\') ON CONFLICT (id) DO UPDATE SET helius_webhook_id = EXCLUDED.helius_webhook_id'); bot.sendMessage(msg.chat.id, '✅ global_balance actualizado con webhook ID existente. Reinicia el bot en Railway para que cargue el nuevo código.'); } catch (e) { bot.sendMessage(msg.chat.id, '❌ Error: ' + e.message); } });
// ---------- Inicialización ----------
(async () => { await initDB(); await initBaselineReal(); conectarWS(); crearOActualizarWebhookHelius(); setInterval(reconciliarPosiciones, 60_000); setInterval(revisarStopLoss, 60_000); setInterval(monitoreoAutomaticoWebhook, 600_000); setInterval(() => { const apiKey = getHeliusApiKey(); if (!apiKey) return; pool.query('SELECT helius_webhook_id FROM global_balance WHERE id=1').then(({ rows }) => { const webhookId = rows[0]?.helius_webhook_id; if (webhookId) verificarEstadoWebhook(apiKey, webhookId); }).catch(e => log('error', `Error en chequeo periódico del webhook: ${e.message}`)); }, 300_000); setInterval(async () => { const marca = new Date().toISOString(); log('info', `💓 Heartbeat [${marca}] modo=${MODO_ACTUAL} WS=${ws ? ws.readyState : 'null'}`); }, 300_000); const shutdown = async () => { log('info', 'Recibida señal de apagado, cerrando conexiones...'); if (ws && ws.readyState === WebSocket.OPEN) ws.close(); await pool.end(); process.exit(0); }; process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown); })();
