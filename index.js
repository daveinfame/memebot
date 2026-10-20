// ========= ⚡️M3M3B0T⚡️ REAL TRADING — v3 (refactor final) =========
require('dotenv').config();

// ---------- Dependencies ----------
const http = require('http');
const fs = require('fs');
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
  SystemProgram,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const bs58 = require('bs58');

// ---------- Logger ----------
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = process.env.LOG_LEVEL
  ? (LOG_LEVELS[process.env.LOG_LEVEL.toLowerCase()] ?? LOG_LEVELS.info)
  : LOG_LEVELS.info;

// Ultimos logs en memoria: se leen por Telegram con /logs (sin dar acceso a Railway).
const ULTIMOS_LOGS = [];
const MAX_LOGS_MEMORIA = 400;

function log(level, ...args) {
  const prefix = `[${new Date().toISOString()}][${level.toUpperCase()}]`;
  const linea = [prefix, ...args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))].join(' ');
  ULTIMOS_LOGS.push(linea);
  if (ULTIMOS_LOGS.length > MAX_LOGS_MEMORIA) ULTIMOS_LOGS.shift();
  if ((LOG_LEVELS[level] ?? LOG_LEVELS.info) <= CURRENT_LEVEL) {
    console.log(prefix, ...args);
  }
}

// Avisos de precio que se repiten cada 20 s por posicion: maximo 1 cada 10 min.
const AVISOS_PRECIO = new Map();
function avisarPrecio(mint, nivel, mensaje) {
  const ahora = Date.now();
  if (ahora - (AVISOS_PRECIO.get(mint) || 0) < 10 * 60 * 1000) return;
  AVISOS_PRECIO.set(mint, ahora);
  log(nivel, mensaje);
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
const JUPITER_BASE = 'https://lite-api.jup.ag/swap/v1';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PUMPPORTAL_WALLET = 'Guao96aNr7GUj3CSspwLy3tEccL3RUh5xVT4W3KNfBUH';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

const HELIUS_WEBHOOK_URL = process.env.HELIUS_WEBHOOK_URL;
const HELIUS_WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET;

// Mints que NUNCA son el token objetivo de una copia: SOL/wSOL y stables.
// Una "compra de USDC" en realidad es una venta del token que la wallet tenía,
// y los tramos internos de una ruta de Jupiter pueden reportar USDC↔USDC.
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const PYUSD_MINT = '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo';
const USDS_MINT = 'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA';
const MINTS_A_IGNORAR = new Set([SOL_MINT, USDC_MINT, USDT_MINT, PYUSD_MINT, USDS_MINT]);

const esMintNoCopiable = (mint) => !!mint && MINTS_A_IGNORAR.has(mint);

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
let fuenteClaveWallet = null;
try {
  if (process.env.HELIUS_RPC_URL) {
    connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
  }
  // La clave puede leerse de un ARCHIVO (secreto montado) en vez de una variable
  // de entorno, que es visible para cualquiera con acceso al panel del proyecto.
  // Se prefiere el archivo si WALLET_PRIVATE_KEY_FILE está definida.
  const rutaClave = process.env.WALLET_PRIVATE_KEY_FILE;
  let claveCruda = null;
  if (rutaClave) {
    claveCruda = fs.readFileSync(rutaClave, 'utf8').trim();
    fuenteClaveWallet = `archivo ${rutaClave}`;
  } else if (process.env.WALLET_PRIVATE_KEY) {
    claveCruda = String(process.env.WALLET_PRIVATE_KEY).trim();
    fuenteClaveWallet = 'variable de entorno WALLET_PRIVATE_KEY (visible en el panel de Railway)';
  }
  if (claveCruda) {
    walletKeypair = Keypair.fromSecretKey(bs58.decode(claveCruda));
  }
  if (walletKeypair) {
    // NUNCA se loguea la clave: sólo la dirección pública y de dónde se leyó.
    log('info', `Wallet Solana cargada: ${walletKeypair.publicKey.toBase58()} (clave desde ${fuenteClaveWallet})`);
  }
} catch (e) {
  log('error', `Error cargando wallet/RPC de Solana: ${e.message}`);
  process.exit(1);
}

// ================== CANDADOS DE SEGURIDAD (mínimo privilegio) ==================
// Principio: cualquier cambio de código o de variables que intente mover fondos
// fuera de lo previsto debe FALLAR, no pasar. Estos candados no necesitan conocer
// la clave privada: solo limitan y auditan lo que se firma.
//
// 1) ALLOWED_WITHDRAW_ADDRESS: único destino al que se permite mover SOL fuera de
//    un swap conocido (por defecto, la propia wallet del bot: el bot no tiene
//    función de retiro). Cualquier transferencia a otra dirección se bloquea.
// 2) MAX_DAILY_SPEND_SOL: SOL máximo que puede salir de la wallet por día.
// 3) MAX_TRADE_SOL: tope duro por operación de compra.
const ALLOWED_WITHDRAW_ADDRESS =
  // Rotar la clave no requiere tocar nada: la allowlist sigue a la wallet cargada.
  process.env.ALLOWED_WITHDRAW_ADDRESS ||
  (walletKeypair ? walletKeypair.publicKey.toBase58() : null);

// 1b) SWEEP_ADDRESS: wallet de retiro de ganancias (opcional). Es el UNICO destino
//     adicional permitido ademas de la propia wallet del bot. Se configura SOLO en
//     Railway (variable sellada): si un comando de Telegram pudiera cambiarlo,
//     robar el bot de Telegram seria robar la wallet.
const SWEEP_ADDRESS = (process.env.SWEEP_ADDRESS || '').trim();
const ALLOWED_WITHDRAW_ADDRESSES = new Set(
  [ALLOWED_WITHDRAW_ADDRESS, ...(process.env.ALLOWED_WITHDRAW_ADDRESS_LIST || '').split(',')]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .concat(SWEEP_ADDRESS ? [SWEEP_ADDRESS] : [])
);
const MAX_DAILY_SPEND_SOL = parseFloat(process.env.MAX_DAILY_SPEND_SOL || '0.5');
const MAX_TRADE_SOL = parseFloat(process.env.MAX_TRADE_SOL || '0.1');
// --- Umbrales de la valoración por DexScreener ---
// El bot copia memecoins de curva de bonding con mcap de ~3k y sin campo
// `liquidity`, así que el piso de mcap debe ser coherente con eso. El candado
// que realmente protege es el ratio contra el precio de compra (0.03x-30x)
// más el tope de 10 SOL/token, no el mcap.
//   MIN_LIQ_USD = 0 → no se exige liquidez (curvas de bonding no la publican).
const MIN_MCAP_USD = parseFloat(process.env.MIN_MCAP_USD || '1000');
const MAX_MCAP_USD = parseFloat(process.env.MAX_MCAP_USD || '500000000');
const MIN_LIQ_USD = parseFloat(process.env.MIN_LIQ_USD || '0');
const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
const TOKEN_PROGRAMS = new Set([
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' // Token-2022
]);
const PROGRAMAS_SWAP = new Set([
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter v6
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB', // Jupiter v4 (legacy)
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // pump.fun
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA', // pump AMM
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // raydium v4
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', // meteora DLMM
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc' // whirlpool
]);

function fechaHoyUTC() {
  return new Date().toISOString().slice(0, 10);
}

function notificarSeguridad(mensaje) {
  log('warn', `🚨 SEGURIDAD: ${mensaje}`);
  if (CHAT_ID) {
    bot.sendMessage(CHAT_ID, `🚨 SEGURIDAD: ${mensaje}`).catch(() => {});
  }
}

async function estaCongelado() {
  try {
    const { rows } = await pool.query('SELECT congelado FROM bot_seguridad WHERE id=1');
    return !!(rows[0] && rows[0].congelado);
  } catch (e) {
    return false; // si la BD falla no bloqueamos el bot; el resto de candados sigue
  }
}

async function gastoDiario() {
  try {
    const hoy = fechaHoyUTC();
    const { rows } = await pool.query('SELECT fecha_gasto, gasto_sol FROM bot_seguridad WHERE id=1');
    const r = rows[0];
    if (!r) return 0;
    const fecha = r.fecha_gasto ? new Date(r.fecha_gasto).toISOString().slice(0, 10) : null;
    if (fecha !== hoy) return 0;
    return Number(r.gasto_sol) || 0;
  } catch (e) {
    return 0;
  }
}

async function registrarGastoDiario(sol) {
  try {
    const hoy = fechaHoyUTC();
    await pool.query(
      `INSERT INTO bot_seguridad (id, congelado, fecha_gasto, gasto_sol) VALUES (1, FALSE, $1, $2)
       ON CONFLICT (id) DO UPDATE SET
         gasto_sol = CASE WHEN bot_seguridad.fecha_gasto = $1 THEN COALESCE(bot_seguridad.gasto_sol, 0) + $2 ELSE $2 END,
         fecha_gasto = $1`,
      [hoy, sol]
    );
  } catch (e) {
    log('warn', `No se pudo registrar el gasto diario: ${e.message}`);
  }
}

// Audita TODA transacción firmada antes de mandarla a la red:
//  - si el bot está congelado, no sale nada;
//  - bloquea transferencias de SOL a direcciones fuera de ALLOWED_WITHDRAW_ADDRESS
//    cuando la tx NO es un swap (sin programa DEX y sin movimiento de tokens): esa
//    es exactamente la firma de un 'mándame los fondos';
//  - cuenta todo el SOL que sale contra MAX_DAILY_SPEND_SOL;
//  - registra destinos y montos en el log (rastro auditable).
async function auditarTransaccionSaliente(rawTx) {
  if (await estaCongelado()) {
    notificarSeguridad('BLOQUEADO: el bot está CONGELADO (/unfreeze para reactivar).');
    throw new Error('Bot congelado por seguridad (/unfreeze)');
  }

  let tx = null;
  try {
    tx = VersionedTransaction.deserialize(rawTx);
  } catch (e) {
    try {
      tx = Transaction.from(rawTx);
    } catch (e2) {
      tx = null;
    }
  }
  if (!tx) {
    log('warn', '🔐 No se pudo inspeccionar la tx saliente (formato desconocido) — se permite y se registra');
    return;
  }

  const claves =
    (tx.message && (tx.message.staticAccountKeys || tx.message.accountKeys)) || tx.accountKeys || [];
  const direcciones = claves.map((k) => (k && k.toBase58 ? k.toBase58() : String(k)));
  const programas = new Set();
  const destinos = [];
  let lamportsFuera = 0;

  const destinosToken = [];
  const revisarInstruccion = (programa, dataBytes, destinosIx, cuentas) => {
    programas.add(programa);
    if (dataBytes && cuentas && TOKEN_PROGRAMS.has(programa) && dataBytes[0] === 12) {
      // TransferChecked: cuentas = [origen, mint, destino, owner]. Solo vigilamos USDC.
      if (cuentas[1] === USDC_MINT && cuentas[2]) destinosToken.push(cuentas[2]);
      return;
    }
    if (programa !== SYSTEM_PROGRAM_ID || !dataBytes || dataBytes.length < 12) return;
    const tipo = dataBytes[0] | (dataBytes[1] << 8) | (dataBytes[2] << 16) | (dataBytes[3] << 24);
    if (tipo !== 2) return; // SystemProgram.transfer
    const buf = new Uint8Array(dataBytes);
    const lamports = Number(new DataView(buf.buffer, buf.byteOffset + 4, 8).getBigUint64(0, true));
    if (!Number.isFinite(lamports) || lamports <= 0) return;
    destinos.push({ destino: destinosIx, lamports });
    lamportsFuera += lamports;
  };

  if (tx.message && tx.message.compiledInstructions) {
    for (const ix of tx.message.compiledInstructions) {
      const programa = direcciones[ix.programIdIndex];
      const destino = direcciones[ix.accountKeyIndexes && ix.accountKeyIndexes[1]];
      revisarInstruccion(programa, ix.data, destino, ix.accountKeyIndexes ? ix.accountKeyIndexes.map((i2) => direcciones[i2]) : (ix.keys ? ix.keys.map((k) => (k.pubkey && k.pubkey.toBase58 ? k.pubkey.toBase58() : String(k.pubkey))) : [destino]));
    }
  } else if (tx.instructions) {
    for (const ix of tx.instructions) {
      const programa = ix.programId ? ix.programId.toBase58() : null;
      const destino = ix.keys && ix.keys[1] ? ix.keys[1].pubkey.toBase58() : null;
      revisarInstruccion(programa, ix.data, destino, ix.accountKeyIndexes ? ix.accountKeyIndexes.map((i2) => direcciones[i2]) : (ix.keys ? ix.keys.map((k) => (k.pubkey && k.pubkey.toBase58 ? k.pubkey.toBase58() : String(k.pubkey))) : [destino]));
    }
  }

  const esSwap = [...programas].some((p) => PROGRAMAS_SWAP.has(p));

  // Transferencias SPL de USDC (TransferChecked) fuera de los destinos permitidos:
  // es la forma de sacar la tesoreria sin mover SOL, que era lo unico vigilado.
  if (destinosToken.length > 0 && !esSwap) {
    const permitidas = new Set();
    try {
      const spl = require('@solana/spl-token');
      for (const a of ALLOWED_WITHDRAW_ADDRESSES) {
        permitidas.add(spl.getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), new PublicKey(a)).toBase58());
      }
    } catch (e) {
      // fail closed: si no se pueden calcular los destinos permitidos, no sale USDC
      notificarSeguridad('BLOQUEADA transferencia de USDC: no se pudo verificar el destino (' + e.message + ')');
      throw new Error('Transaccion bloqueada: no se pudo verificar el destino del USDC');
    }
    if (permitidas.size > 0) {
      const malos = destinosToken.filter((d) => !permitidas.has(d));
      if (malos.length > 0) {
        notificarSeguridad(
          `BLOQUEADA transferencia de USDC a ${malos.map((d) => d.slice(0, 8) + '...').join(', ')}. Destinos permitidos: ${[...ALLOWED_WITHDRAW_ADDRESSES].map((a) => a.slice(0, 8)).join(', ')}...`
        );
        throw new Error('Transaccion bloqueada: USDC fuera de los destinos permitidos (ALLOWED_WITHDRAW_ADDRESSES)');
      }
    }
  }
  const hayTokens = [...programas].some((p) => TOKEN_PROGRAMS.has(p));
  const mínimo = 0.002 * LAMPORTS_PER_SOL;
  const sospechosos = destinos.filter((d) => !ALLOWED_WITHDRAW_ADDRESSES.has(d.destino) && d.lamports >= mínimo);

  if (sospechosos.length > 0 && !esSwap && !hayTokens) {
    notificarSeguridad(
      `BLOQUEADA transferencia de SOL a ${sospechosos.map((d) => `${d.destino.slice(0, 8)}… (${(d.lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL)`).join(', ')}. Destino permitido: ${[...ALLOWED_WITHDRAW_ADDRESSES].map((a) => a.slice(0, 8)).join(', ')}…`
    );
    throw new Error('Transacción bloqueada por el candado de destino (ALLOWED_WITHDRAW_ADDRESS)');
  }

  if (lamportsFuera > 0) {
    const solFuera = lamportsFuera / LAMPORTS_PER_SOL;
    const gastado = await gastoDiario();
    if (gastado + solFuera > MAX_DAILY_SPEND_SOL) {
      notificarSeguridad(
        `BLOQUEADA salida de ${solFuera.toFixed(4)} SOL: excede el tope diario (${gastado.toFixed(4)}/${MAX_DAILY_SPEND_SOL} SOL ya gastados hoy).`
      );
      throw new Error('Transacción bloqueada por el tope diario (MAX_DAILY_SPEND_SOL)');
    }
    await registrarGastoDiario(solFuera);
  }

  log(
    'info',
    `🔐 Tx auditada: ${(lamportsFuera / LAMPORTS_PER_SOL).toFixed(6)} SOL fuera · destinos: ${destinos.map((d) => `${d.destino.slice(0, 6)}:${(d.lamports / LAMPORTS_PER_SOL).toFixed(4)}`).join(', ') || 'ninguno'} · swap: ${esSwap ? 'sí' : 'no'} · tokens: ${hayTokens ? 'sí' : 'no'}`
  );
}

// Interceptamos TODOS los envíos (compras, ventas, swaps de ganancia, cierre de
// cuentas): nada sale a la red sin pasar por el candado.
if (connection) {
  const _sendRawTransaction = connection.sendRawTransaction.bind(connection);
  connection.sendRawTransaction = async (rawTx, opciones) => {
    await auditarTransaccionSaliente(rawTx);
    return _sendRawTransaction(rawTx, opciones);
  };
  log(
    'info',
    `🔐 Candados activos: destinos permitidos ${[...ALLOWED_WITHDRAW_ADDRESSES].join(', ')} · tope diario ${MAX_DAILY_SPEND_SOL} SOL · tope por operación ${MAX_TRADE_SOL} SOL`
  );
}
// ================== FIN CANDADOS ==================

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
// ---------- Lock anti-race-condition para ventas ----------
// Evita que 2 ventas del mismo mint+alias se procesen simultáneamente.
const ventasEnProceso = new Set();

// ---------- Normalización de `source` de Helius al `dexId` de DexScreener ----------
// Helius manda el `source` en formato UPPER_SNAKE (ej. 'PUMP_FUN', 'RAYDIUM').
// DexScreener usa un `dexId` en minúsculas (ej. 'pumpfun', 'raydium').
// Esta función mapea uno al otro. Devuelve null si no se puede mapear.
function normalizarDexIdParaDexScreener(origen) {
  if (!origen || typeof origen !== 'string') return null;
  const o = origen.toUpperCase();

  // Mapeo explícito
  const mapa = {
    'PUMP_FUN': 'pumpfun',
    'PUMPPORTAL': 'pumpfun',
    'PUMP_AMM': 'pumpswap',
    'PUMPSWAP': 'pumpswap',
    'RAYDIUM': 'raydium',
    'RAYDIUM_LAUNCHLAB': 'raydium',
    'METEORA': 'meteora',
    'JUPITER': 'jupiter',
    'ORCA': 'orca',
    'LIFINITY': 'lifinity',
    'PHOENIX': 'phoenix',
    'OPENBOOK': 'openbook'
  };

  if (mapa[o]) return mapa[o];

  // Si ya viene en formato DexScreener (ej. 'pumpfun', 'meteora'), devolverlo directo
  const lower = origen.toLowerCase();
  const dexIdsValidos = ['pumpfun', 'pumpswap', 'raydium', 'meteora', 'jupiter', 'orca', 'lifinity', 'phoenix', 'openbook'];
  if (dexIdsValidos.includes(lower)) return lower;

  // No se pudo mapear (ej. SOLANA_PROGRAM_LIBRARY, SYSTEM_PROGRAM, OnChain)
  return null;
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

// ---------- Balance de token: caché + single-flight + corta-circuitos ----------
// Helius responde 429 "max usage reached" cuando se agotan los créditos. Sin
// freno, el reconciliador (cada 20 s por posición) y el resto de rutas lo
// martillan y el bot se queda sin datos: no detecta ventas y no valora.
// Reglas: cada (wallet,mint) se cachea BALANCE_CACHE_MS, las llamadas simultáneas
// comparten una sola petición y ante un 429 se deja de llamar RPC_COOLDOWN_MS
// devolviendo el último valor conocido (nunca 0, que cerraría una posición).
const BALANCE_CACHE_MS = parseInt(process.env.BALANCE_CACHE_MS || '45000', 10);
const RPC_COOLDOWN_MS = parseInt(process.env.RPC_COOLDOWN_MS || '300000', 10);
const balancesCache = new Map();
const balancesEnVuelo = new Map();
let rpcCooldownHasta = 0;
let rpcAvisoHasta = 0;

function esErrorDeLimiteRpc(mensaje) {
  return /429|too many requests|max usage|rate limit/i.test(String(mensaje || ''));
}

async function getBalanceDeTokenEnWallet(walletAddress, mint) {
  if (!connection) return null;
  const clave = `${walletAddress}:${mint}`;
  const ahora = Date.now();

  const cacheado = balancesCache.get(clave);
  if (cacheado && ahora - cacheado.ts < BALANCE_CACHE_MS) return cacheado.valor;

  if (ahora < rpcCooldownHasta) return cacheado ? cacheado.valor : null;

  if (balancesEnVuelo.has(clave)) return balancesEnVuelo.get(clave);

  const promesa = (async () => {
    try {
      const owner = new PublicKey(walletAddress);
      const mintKey = new PublicKey(mint);
      const cuentas = await connection.getParsedTokenAccountsByOwner(owner, { mint: mintKey });
      let total = 0;
      for (const c of cuentas.value) {
        total += parseFloat(c.account.data.parsed.info.tokenAmount.uiAmount || 0);
      }
      balancesCache.set(clave, { valor: total, ts: Date.now() });
      return total;
    } catch (e) {
      if (esErrorDeLimiteRpc(e.message)) {
        rpcCooldownHasta = Date.now() + RPC_COOLDOWN_MS;
        if (Date.now() >= rpcAvisoHasta) {
          rpcAvisoHasta = Date.now() + RPC_COOLDOWN_MS;
          log(
            'error',
            `⛔ RPC sin créditos (429 max usage): pauso las consultas de balance ${Math.round(
              RPC_COOLDOWN_MS / 60000
            )} min y uso el último dato conocido. Revisa los créditos de Helius.`
          );
        }
        return cacheado ? cacheado.valor : null;
      }
      log('error', `Error consultando balance de token en wallet: ${e.message}`);
      return null;
    } finally {
      balancesEnVuelo.delete(clave);
    }
  })();

  balancesEnVuelo.set(clave, promesa);
  return promesa;
}

// ---------- Balance SOL ----------
async function getWalletSolBalance() {
  if (!connection || !walletKeypair) return 0;
  const lamports = await connection.getBalance(walletKeypair.publicKey);
  return lamports / LAMPORTS_PER_SOL;
}

// ---------- Precio SOL ----------
let cachedSolPrice = { value: null, timestamp: 0 };
const SOL_PRICE_CACHE_MS = 60_000;

async function getSolPriceUSD() {
  const ahora = Date.now();

  if (
    cachedSolPrice.value !== null &&
    ahora - cachedSolPrice.timestamp < SOL_PRICE_CACHE_MS
  ) {
    return cachedSolPrice.value;
  }

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

  if (cachedSolPrice.value !== null) {
    const edadMin = Math.round((ahora - cachedSolPrice.timestamp) / 60000);
    log('warn', `⚠️ Usando precio cacheado de hace ${edadMin} min: $${cachedSolPrice.value}`);
    return cachedSolPrice.value;
  }

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

// ---------- Parser de description de Helius ----------
function extraerMontoDeDescription(description, walletAddress) {
  if (!description || typeof description !== 'string') return null;
  const desc = description.replace(/,/g, '');
  const regexBuy = /swapped\s+([\d.]+)\s+SOL\s+for\s+([\d.]+)\s+(\S+)/i;
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

// ---------- Extraer cambios de tx completa para una wallet ----------
function extraerCambiosDeTxParaWallet(tx, walletAddress, solPriceUsd = null) {
  const porMint = new Map();
  // Helius entrega el mismo movimiento de tokens DOS veces: en `tokenTransfers`
  // y en `tokenBalanceChanges`. Sumar ambos duplicaba la cantidad de tokens
  // (bug del 2x). Se prefiere `tokenBalanceChanges` (raw + decimals exactos) y,
  // cuando existe, se ignora el duplicado de `tokenTransfers`.
  const sumarToken = (mint, tokenDelta, decimals = 6, origen = 'transfers') => {
    if (!mint || MINTS_A_IGNORAR.has(mint)) return;
    let prev = porMint.get(mint);
    if (!prev) {
      prev = { tokenDelta: 0, decimals, origen };
      porMint.set(mint, prev);
    } else if (prev.origen !== origen) {
      if (origen === 'cambios' && prev.origen === 'transfers') {
        prev.tokenDelta = 0;
        prev.origen = 'cambios';
      } else {
        return;
      }
    }
    prev.tokenDelta += tokenDelta;
    prev.decimals = decimals;
  };

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

  let nativeSolInLamports = 0;
  let nativeSolOutLamports = 0;

  if (wsolAbsLamports === 0) {
    for (const nt of tx.nativeTransfers || []) {
      const amount = numeroSeguro(nt.amount);
      if (amount <= 0) continue;
      if (nt.fromUserAccount === walletAddress) nativeSolOutLamports += amount;
      if (nt.toUserAccount === walletAddress) nativeSolInLamports += amount;
    }

    // Solo si nativeTransfers no reportó nada se usa el cambio neto de la cuenta:
    // sumar ambos duplicaba el SOL del trade.
    if (nativeSolInLamports + nativeSolOutLamports === 0) {
      for (const acc of tx.accountData || []) {
        if (acc.account !== walletAddress) continue;
        const nativeDelta = numeroSeguro(acc.nativeBalanceChange);
        if (nativeDelta < 0) nativeSolOutLamports += Math.abs(nativeDelta);
        else if (nativeDelta > 0) nativeSolInLamports += nativeDelta;
      }
    }
  }

  let solAbsLamports = wsolAbsLamports > 0
    ? wsolAbsLamports
    : (nativeSolInLamports + nativeSolOutLamports);

  // ===== USDC =====
  // Muchas wallets (rutas Jupiter) operan contra USDC, no contra SOL: en esos
  // swaps no hay ningún delta de SOL y el parser terminaba inventando 0.001 SOL
  // (o atribuyendo el SOL de un tramo interno de la ruta).
  let usdcIn = 0;
  let usdcOut = 0;
  let usdcInTT = 0;
  let usdcOutTT = 0;
  for (const tt of tx.tokenTransfers || []) {
    if (tt.mint !== USDC_MINT) continue;
    const valor = Math.abs(numeroSeguro(tt.tokenAmount)); // tokenTransfers: monto en unidades UI
    if (!valor) continue;
    if (tt.fromUserAccount === walletAddress) usdcOutTT += valor;
    if (tt.toUserAccount === walletAddress) usdcInTT += valor;
  }
  let usdcInCambios = 0;
  let usdcOutCambios = 0;
  for (const acc of tx.accountData || []) {
    for (const tbc of acc.tokenBalanceChanges || []) {
      if (tbc.mint !== USDC_MINT) continue;
      const owner = tbc.userAccount || tbc.owner || acc.account;
      if (owner !== walletAddress) continue;
      const dec = tbc.rawTokenAmount?.decimals ?? 6;
      const valor = numeroSeguro(tbc.rawTokenAmount?.tokenAmount) / Math.pow(10, dec);
      if (!Number.isFinite(valor) || valor === 0) continue;
      if (valor > 0) usdcInCambios += valor;
      else usdcOutCambios += Math.abs(valor);
    }
  }
  // Igual que con los tokens: si hay tokenBalanceChanges de USDC, se usan esos
  // (raw exacto) y se ignora el duplicado de tokenTransfers.
  if (usdcInCambios + usdcOutCambios > 0) {
    usdcIn = usdcInCambios;
    usdcOut = usdcOutCambios;
  } else {
    usdcIn = usdcInTT;
    usdcOut = usdcOutTT;
  }
  const usdcAbs = usdcIn + usdcOut;

  // Si la wallet movió USDC en esta tx, ESE es el valor real de su operación:
  // el SOL que aparece en los tramos internos de la ruta (wSOL) no es lo que
  // pagó/cobró la wallet. Antes se usaba ese SOL de ruta y salían montos falsos
  // (ej. 1.3356 SOL por una compra de 500 USDC).
  if (usdcAbs > 0 && solPriceUsd && solPriceUsd > 0) {
    const solDesdeUsdc = Math.round((usdcAbs / solPriceUsd) * LAMPORTS_PER_SOL);
    log(
      'info',
      `🎯 Parser: swap con USDC — ${usdcAbs.toFixed(4)} USDC ÷ $${solPriceUsd.toFixed(2)}/SOL → ${(solDesdeUsdc / LAMPORTS_PER_SOL).toFixed(6)} SOL${solAbsLamports > 0 ? ` (se descarta el SOL de ruta: ${(solAbsLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL)` : ''}`
    );
    solAbsLamports = solDesdeUsdc;
  }

  for (const tt of tx.tokenTransfers || []) {
    if (tt.mint === SOL_MINT || MINTS_A_IGNORAR.has(tt.mint)) continue;
    const amount = numeroSeguro(tt.tokenAmount);
    if (!amount) continue;
    const decimals = tt.decimals ?? 6;
    if (tt.fromUserAccount === walletAddress) sumarToken(tt.mint, -amount, decimals, 'transfers');
    if (tt.toUserAccount === walletAddress) sumarToken(tt.mint, amount, decimals, 'transfers');
  }

  for (const acc of tx.accountData || []) {
    for (const tbc of acc.tokenBalanceChanges || []) {
      if (tbc.mint === SOL_MINT || MINTS_A_IGNORAR.has(tbc.mint)) continue;
      const owner = tbc.userAccount || tbc.owner || acc.account;
      if (owner !== walletAddress) continue;
      const decimals = tbc.rawTokenAmount?.decimals ?? 6;
      const rawAmount = numeroSeguro(tbc.rawTokenAmount?.tokenAmount);
      const delta = rawAmount / Math.pow(10, decimals);
      if (delta !== 0) sumarToken(tbc.mint, delta, decimals, 'cambios');
    }
  }

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
      log(
        'warn',
        `⚠️ Parser: sin SOL ni USDC para valorizar ${c.mint.slice(0, 6)}... (${c.direction}) — monto marcado como desconocido (ya no se inventa 0.001 SOL)`
      );
    }

    cambios.push({
      mint: c.mint,
      tokenAmount: Math.abs(c.info.tokenDelta),
      solAmount: lamportsAsignados / LAMPORTS_PER_SOL,
      direction: c.direction,
      solAmountEstimado: solAbsLamports === 0
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
    await pool.query(`ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS origen_dex TEXT`);
    await pool.query(`ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS precio_compra_native REAL`);
    await pool.query(`ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS pair_address TEXT`);

    await pool.query(
      `CREATE TABLE IF NOT EXISTS global_balance (id INT PRIMARY KEY, initial_usdc REAL, current_usdc REAL)`
    );
    // Estado de los candados: congelado + gasto del día (sobrevive reinicios).
    await pool.query(
      `CREATE TABLE IF NOT EXISTS bot_seguridad (id INT PRIMARY KEY, congelado BOOLEAN DEFAULT FALSE, fecha_gasto DATE, gasto_sol REAL DEFAULT 0)`
    );
    await pool.query(
      `INSERT INTO bot_seguridad (id, congelado, gasto_sol) VALUES (1, FALSE, 0) ON CONFLICT (id) DO NOTHING`
    );
    // Retiro de ganancias: base/monto/estado (configurable por /sweep)
    await pool.query(
      `CREATE TABLE IF NOT EXISTS bot_sweep (id INT PRIMARY KEY, activo BOOLEAN DEFAULT TRUE, base_usd REAL DEFAULT 100, monto_usd REAL DEFAULT 20, total_enviado_usd REAL DEFAULT 0, ultimo_envio TIMESTAMPTZ)`
    );
    await pool.query(
      `INSERT INTO bot_sweep (id, activo, base_usd, monto_usd, total_enviado_usd) VALUES (1, TRUE, 100, 20, 0) ON CONFLICT (id) DO NOTHING`
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

// ===== Parsed Events API (Helius) — fuente confiable de swaps =====

// Cola con rate limit para Parsed Events API (2 req/s en plan Free)
const parsedEventsTimestamps = [];
const PARSED_EVENTS_MAX_RPS = 2;
const parsedEventsCache = new Map();
const PARSED_EVENTS_CACHE_MS = 60 * 60 * 1000;

async function esperarTurnoParsedEvents() {
  while (true) {
    const ahora = Date.now();
    while (parsedEventsTimestamps.length > 0 && ahora - parsedEventsTimestamps[0] > 1000) {
      parsedEventsTimestamps.shift();
    }
    if (parsedEventsTimestamps.length < PARSED_EVENTS_MAX_RPS) {
      parsedEventsTimestamps.push(ahora);
      return;
    }
    const espera = 1000 - (ahora - parsedEventsTimestamps[0]) + 10;
    await sleep(espera);
  }
}

function limpiarCacheParsedEvents() {
  const ahora = Date.now();
  for (const [sig, entry] of parsedEventsCache.entries()) {
    if (ahora - entry.timestamp > PARSED_EVENTS_CACHE_MS) {
      parsedEventsCache.delete(sig);
    }
  }
}

// Busca en parsed.instructions el summary.parsedData de tipo swap.
// IMPORTANTE: Helius APLANA las inner instructions en el mismo array
// "instructions" (con innerInstructionIndex distinto), NO las anida.
// Por eso solo hay que recorrer instructions[] y buscar el swap.
function buscarSwapParsedData(parsed) {
  if (!parsed) return null;

  const instructions = parsed.instructions || [];
  for (const ins of instructions) {
    const pd = ins?.summary?.parsedData;
    if (!pd || pd.type !== 'swap' || !pd.in_amount || !pd.actual_out_amount) continue;

    const inp = pd.input_mint;
    const out = pd.output_mint;
    if (!inp || !out) continue;

    // P1: una instrucción con el MISMO mint a los dos lados no es un swap de la
    // wallet, es un tramo interno de la ruta (así se generaba la falsa
    // "compra de USDC" que abría posición en la stable).
    if (inp === out) continue;

    const inpRef = inp === SOL_MINT || MINTS_A_IGNORAR.has(inp);
    const outRef = out === SOL_MINT || MINTS_A_IGNORAR.has(out);

    // SOL↔stable o stable↔stable: no es una operación de token que nos interese.
    if (inpRef && outRef) continue;

    // token↔token: no sabemos valorarlo (opción B: se ignora y el fallback decide).
    if (!inpRef && !outRef) continue;

    return pd;
  }
  return null;
}

async function getDecimalsDelMint(mint) {
  try {
    const info = await getTokenInfoHelius(mint);
    return info.decimals ?? 6;
  } catch {
    return 6;
  }
}

// Extrae el objeto de transacción de la respuesta de Parsed Events.
// La API puede devolver varias formas distintas:
//   - [tx1, tx2, ...]                      (array directo)
//   - { value: [tx1, tx2, ...] }           (envuelto en value)
//   - { value: tx }                        (value como objeto)
//   - { signature, parserStatus, parsed }  (un solo objeto directo)
function extraerTxDeRespuestaParsedEvents(data) {
  if (!data) return null;

  if (Array.isArray(data)) {
    return data[0] || null;
  }
  if (Array.isArray(data.value)) {
    return data.value[0] || null;
  }
  if (data.value && typeof data.value === 'object' && data.value.signature) {
    return data.value;
  }
  if (data.signature && data.parserStatus) {
    return data;
  }
  if (data.value && typeof data.value === 'object' && data.value.parserStatus) {
    return data.value;
  }
  return null;
}

// Parsea una transacción vía Helius Parsed Events API.
// Devuelve { direction, mint, solAmount, tokenAmount, protocol } o null si falla.
async function parsearTransaccionViaHeliusAPI(signature) {
  if (!signature || typeof signature !== 'string') return null;

  const cacheado = parsedEventsCache.get(signature);
  if (cacheado && Date.now() - cacheado.timestamp < PARSED_EVENTS_CACHE_MS) {
    return cacheado.value;
  }

  const apiKey = getHeliusApiKey();
  if (!apiKey) {
    log('debug', `🔍 Parsed Events: no apiKey disponible`);
    return null;
  }

  await esperarTurnoParsedEvents();

  try {
    const res = await fetch(
      `https://mainnet.helius-rpc.com/v1/parsed-events/transactions?api-key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: [signature] }),
        signal: AbortSignal.timeout(8000)
      }
    );

    if (!res.ok) {
      log('warn', `Parsed Events API: HTTP ${res.status} para ${signature.slice(0, 12)}...`);
      parsedEventsCache.set(signature, { value: null, timestamp: Date.now() });
      return null;
    }

    const data = await res.json();
    const tx = extraerTxDeRespuestaParsedEvents(data);

    if (!tx) {
      log('debug', `🔍 Parsed Events: no se pudo extraer tx de la respuesta (keys: ${data ? Object.keys(data).join(',') : 'null'})`);
      parsedEventsCache.set(signature, { value: null, timestamp: Date.now() });
      return null;
    }

    if (tx.parserStatus !== 'OK') {
      log('debug', `🔍 Parsed Events: parserStatus != OK (status: ${tx.parserStatus})`);
      parsedEventsCache.set(signature, { value: null, timestamp: Date.now() });
      return null;
    }

    const parsedData = buscarSwapParsedData(tx.parsed);
    if (!parsedData) {
      log('debug', `🔍 Parsed Events: buscarSwapParsedData devolvió null (instructions.length: ${tx.parsed?.instructions?.length})`);
      parsedEventsCache.set(signature, { value: null, timestamp: Date.now() });
      return null;
    }

    const { in_amount, actual_out_amount, input_mint, output_mint } = parsedData;

    if (!in_amount || !actual_out_amount || !input_mint || !output_mint) {
      log('debug', `🔍 Parsed Events: campos faltantes en parsedData (in_amount: ${in_amount}, actual_out_amount: ${actual_out_amount})`);
      parsedEventsCache.set(signature, { value: null, timestamp: Date.now() });
      return null;
    }

    const SOL_MINT_LOCAL = 'So11111111111111111111111111111111111111112';
    const USDC_MINT_LOCAL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    let direction, mint, solAmountLamports, tokenAmountRaw, tokenDecimals;
    let notaValoracion = null;

    if (input_mint === SOL_MINT_LOCAL) {
      direction = 'buy';
      mint = output_mint;
      solAmountLamports = Number(in_amount);
      tokenAmountRaw = Number(actual_out_amount);
      tokenDecimals = await getDecimalsDelMint(mint);
    } else if (output_mint === SOL_MINT_LOCAL) {
      direction = 'sell';
      mint = input_mint;
      solAmountLamports = Number(actual_out_amount);
      tokenAmountRaw = Number(in_amount);
      tokenDecimals = await getDecimalsDelMint(mint);
    } else if (output_mint === USDC_MINT_LOCAL || input_mint === USDC_MINT_LOCAL) {
      // Swap denominado en USDC (la wallet paga/cobra USDC, no SOL).
      // Se valoriza en SOL con el precio actual en vez de descartarlo:
      // antes se hacía `ignorado` y el trade completo se perdía.
      const usdcEsEntrada = input_mint === USDC_MINT_LOCAL;
      const usdcAmount = Number(usdcEsEntrada ? in_amount : actual_out_amount) / 1e6;
      if (!Number.isFinite(usdcAmount) || usdcAmount <= 0) {
        log('debug', `🔍 Parsed Events: swap USDC con monto inválido, ignorado`);
        parsedEventsCache.set(signature, { value: null, timestamp: Date.now() });
        return null;
      }
      const solPriceUsdc = await getSolPriceUSD();
      if (!solPriceUsdc || solPriceUsdc <= 0) {
        log(
          'warn',
          `🔍 Parsed Events: sin precio de SOL para valorizar swap USDC (${signature.slice(0, 12)}...), se ignora`
        );
        parsedEventsCache.set(signature, { value: null, timestamp: Date.now() });
        return null;
      }
      direction = usdcEsEntrada ? 'buy' : 'sell';
      mint = usdcEsEntrada ? output_mint : input_mint;
      tokenAmountRaw = Number(usdcEsEntrada ? actual_out_amount : in_amount);
      tokenDecimals = await getDecimalsDelMint(mint);
      solAmountLamports = Math.round((usdcAmount / solPriceUsdc) * LAMPORTS_PER_SOL);
      notaValoracion = `valorado en USDC: ${usdcAmount.toFixed(4)} USDC ÷ $${solPriceUsdc.toFixed(2)}/SOL`;
    } else {
      log('debug', `🔍 Parsed Events: par no-SOL/USDC, ignorado`);
      parsedEventsCache.set(signature, { value: null, timestamp: Date.now() });
      return null;
    }

    // P2: una stable (USDC/USDT/…) o SOL nunca puede ser el token objetivo de
    // una copia. Si el tramo elegido las deja como mint, es una venta del otro
    // lado o un tramo interno: se descarta.
    if (esMintNoCopiable(mint)) {
      log('debug', `🔍 Parsed Events: ${direction} de ${mint.slice(0, 6)}... (stable/SOL), ignorado`);
      parsedEventsCache.set(signature, { value: null, timestamp: Date.now() });
      return null;
    }

    const solAmount = solAmountLamports / LAMPORTS_PER_SOL;
    const tokenAmount = tokenAmountRaw / Math.pow(10, tokenDecimals);

    const resultado = {
      direction,
      mint,
      solAmount,
      tokenAmount,
      protocol: parsedData.protocol || null,
      valoradoEnUsdc: notaValoracion
    };

    log(
      'debug',
      `🎯 Parsed Events: ${direction} ${mint.slice(0, 6)}... · ${solAmount.toFixed(6)} SOL · ${tokenAmount.toFixed(4)} tokens (protocol: ${resultado.protocol})${notaValoracion ? ' · ' + notaValoracion : ''}`
    );

    parsedEventsCache.set(signature, { value: resultado, timestamp: Date.now() });
    return resultado;
  } catch (e) {
    log('warn', `Parsed Events API error para ${signature.slice(0, 12)}...: ${e.message}`);
    parsedEventsCache.set(signature, { value: null, timestamp: Date.now() });
    return null;
  }
}

// ---------- Pata de pago PROPIA de la wallet (anti-copia de tokens recibidos) ----------
// Una tx puede contener un swap donde la wallet trackeada NO paga nada: un
// pagador/bundler compra y reparte tokens a N wallets (multisend), o la wallet
// recibe un airdrop. El swap existe, así que sin este filtro el bot copiaba la
// "compra" con el SOL DEL PAGADOR. Regla: sólo hay compra/venta copiable si la
// wallet movió SU propio SOL o USDC en esa misma tx.
const MIN_PAGO_PROPIO_SOL = parseFloat(process.env.MIN_PAGO_PROPIO_SOL || '0.005');
const USDC_ATRIB_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT_ATRIB_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

function flujoPropioDeWallet(tx, walletAddress, mint) {
  let tokensIn = 0;
  let tokensOut = 0;
  let stableIn = 0;
  let stableOut = 0;
  for (const tt of tx.tokenTransfers || []) {
    const cantidad = Math.abs(numeroSeguro(tt.tokenAmount));
    if (!cantidad) continue;
    const entra = tt.toUserAccount === walletAddress;
    const sale = tt.fromUserAccount === walletAddress;
    if (!entra && !sale) continue;
    if (tt.mint === mint) {
      if (entra) tokensIn += cantidad;
      if (sale) tokensOut += cantidad;
    } else if (tt.mint === USDC_ATRIB_MINT || tt.mint === USDT_ATRIB_MINT) {
      if (entra) stableIn += cantidad;
      if (sale) stableOut += cantidad;
    }
  }

  let solPropio = 0;
  const mia = (tx.accountData || []).find((a) => a.account === walletAddress);
  if (mia && Number.isFinite(numeroSeguro(mia.nativeBalanceChange))) {
    solPropio = numeroSeguro(mia.nativeBalanceChange) / LAMPORTS_PER_SOL;
  } else {
    let lamports = 0;
    for (const nt of tx.nativeTransfers || []) {
      const lam = numeroSeguro(nt.amount);
      if (nt.toUserAccount === walletAddress) lamports += lam;
      if (nt.fromUserAccount === walletAddress) lamports -= lam;
    }
    solPropio = lamports / LAMPORTS_PER_SOL;
  }

  return { tokensIn, tokensOut, stableIn, stableOut, solPropio };
}

// Devuelve el monto REAL que puso/cobró la wallet en el swap de esa tx, o null
// si no hubo pata de pago propia (recepción de tokens, airdrop, bundle ajeno).
async function atribuirTradeParsedAWallet(tx, parsed, walletAddress) {
  const flujo = flujoPropioDeWallet(tx, walletAddress, parsed.mint);
  const precioSwap =
    parsed.solAmount > 0 && parsed.tokenAmount > 0 ? parsed.solAmount / parsed.tokenAmount : null;

  if (parsed.direction === 'buy') {
    // Sólo cuentan los tokens que recibió ESTA wallet. Nunca el total del swap:
    // en un bundle el total es del pagador, no suyo.
    const tokensRecibidos = flujo.tokensIn;
    if (!(tokensRecibidos > 0)) return null;

    let solPagado = flujo.solPropio < 0 ? -flujo.solPropio : 0;
    let metodo = 'pago propio en SOL';
    if (solPagado < MIN_PAGO_PROPIO_SOL && flujo.stableOut > 0) {
      const solPrice = await getSolPriceUSD();
      if (!solPrice) return null;
      solPagado = flujo.stableOut / solPrice;
      metodo = 'pago propio en stable (USDC/USDT)';
    }
    if (!(solPagado >= MIN_PAGO_PROPIO_SOL)) return null;

    return { solAmount: solPagado, tokenAmount: tokensRecibidos, fuente: metodo };
  }

  const tokensEnviados = flujo.tokensOut;
  if (!(tokensEnviados > 0)) return null;

  let solRecibido = flujo.solPropio > 0 ? flujo.solPropio : 0;
  let metodo = 'cobro propio en SOL';
  if (solRecibido < MIN_PAGO_PROPIO_SOL && flujo.stableIn > 0) {
    const solPrice = await getSolPriceUSD();
    if (solPrice) {
      solRecibido = flujo.stableIn / solPrice;
      metodo = 'cobro propio en stable (USDC/USDT)';
    }
  }
  if (solRecibido >= MIN_PAGO_PROPIO_SOL) {
    return { solAmount: solRecibido, tokenAmount: tokensEnviados, fuente: metodo };
  }

  // Wallet tipo app: no cobra ella misma (el swap lo ejecuta otro pagador). Se
  // valora la salida con el precio del swap de la MISMA tx y SUS propios tokens.
  if (!precioSwap) return null;
  return {
    solAmount: tokensEnviados * precioSwap,
    tokenAmount: tokensEnviados,
    fuente: 'precio del swap de la tx (la wallet no cobra)',
    valoradoConSwapDeLaTx: true
  };
}

// Encuentra qué wallet trackeada es la dueña del swap según el parsed data
function encontrarWalletTrackeadaDelSwap(tx, parsed, trackedMap) {
  const feePayer = tx.feePayer;
  if (feePayer && trackedMap.has(feePayer)) return feePayer;

  for (const tt of tx.tokenTransfers || []) {
    if (parsed.direction === 'buy' && tt.toUserAccount && trackedMap.has(tt.toUserAccount)) {
      return tt.toUserAccount;
    }
    if (parsed.direction === 'sell' && tt.fromUserAccount && trackedMap.has(tt.fromUserAccount)) {
      return tt.fromUserAccount;
    }
  }

  for (const acc of tx.accountData || []) {
    if (trackedMap.has(acc.account)) return acc.account;
  }

  for (const nt of tx.nativeTransfers || []) {
    if (nt.fromUserAccount && trackedMap.has(nt.fromUserAccount)) return nt.fromUserAccount;
    if (nt.toUserAccount && trackedMap.has(nt.toUserAccount)) return nt.toUserAccount;
  }

  return null;
}

setInterval(limpiarCacheParsedEvents, 15 * 60 * 1000).unref?.();

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
const signaturesProcesadas = new Map();
const DEDUP_TTL_MS = 60 * 60 * 1000;

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

// ---------- Log compacto de TX ----------
function logRawTxCompacto(tx) {
  try {
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
      const origenRaw =
        !eventos.source || eventos.source === 'PUMP_FUN' ? 'PumpPortal' : eventos.source;
      const origen = normalizarDexIdParaDexScreener(origenRaw) || origenRaw;

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
  // Precio de SOL una vez por lote: se usa para valorizar swaps denominados en USDC.
  const solPriceBatch = await getSolPriceUSD();

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

    logRawTxCompacto(tx);

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

    const origenNormalizado = normalizarDexIdParaDexScreener(tx.source);

    // ===== PRIORIDAD: Parsed Events API de Helius =====
    const parsed = await parsearTransaccionViaHeliusAPI(tx.signature);

    if (parsed) {
      const ownerWallet = encontrarWalletTrackeadaDelSwap(tx, parsed, trackedMap);
      if (ownerWallet) {
        const tracked = trackedMap.get(ownerWallet);
        log(
          'info',
          `🌐 Actividad detectada (Parsed Events): ${tracked.alias} ${parsed.direction} ${parsed.mint.slice(0, 6)}... · ${parsed.solAmount.toFixed(4)} SOL · ${parsed.tokenAmount.toFixed(4)} tokens (protocol: ${parsed.protocol})${parsed.valoradoEnUsdc ? ' · ' + parsed.valoradoEnUsdc : ''}`
        );

        // Pata de pago propia: un swap donde la wallet NO puso su SOL/USDC es una
        // recepción de tokens (bundler/multisend/airdrop), no una compra suya.
        const atribucion = await atribuirTradeParsedAWallet(tx, parsed, tracked.address);
        if (!atribucion) {
          log(
            'info',
            `🚫 Parsed Events: ${tracked.alias} ${parsed.direction} ${parsed.mint.slice(0, 6)}... sin pata de pago propia (tokens recibidos de un tercero) — no se copia`
          );
        } else {
          log(
            'info',
            `🎯 Atribución propia: ${tracked.alias} ${parsed.direction} ${parsed.mint.slice(0, 6)}... · ${atribucion.solAmount.toFixed(4)} SOL · ${atribucion.tokenAmount.toFixed(4)} tokens (${atribucion.fuente})`
          );
          const tradeCompatible = {
            mint: parsed.mint,
            solAmount: atribucion.solAmount,
            tokenAmount: atribucion.tokenAmount,
            solAmountEstimado: false,
            traderPublicKey: tracked.address,
            txType: parsed.direction
          };
          const origen =
            parsed.protocol ||
            origenNormalizado ||
            (tx.source && tx.source !== 'PUMP_FUN' ? tx.source : 'OnChain');

          if (parsed.direction === 'buy') {
            await handleTrackedBuy(tracked, tradeCompatible, origen, horaDeteccion);
          } else {
            await handleTrackedSell(tracked, tradeCompatible, origen, horaDeteccion);
          }
          continue;
        }
      }
    }

    // ===== FALLBACK: parser casero =====
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
        const origen = origenNormalizado || (tx.source && tx.source !== 'PUMP_FUN' ? tx.source : 'OnChain');

        // (a) Ventas de wallets tipo app: la wallet no mueve SOL (el swap lo hace
        // otro pagador), así que se valora la salida con el precio del swap de la
        // misma tx para poder cerrar EN VIVO en vez de esperar a la reconciliación.
        if (cambio.direction === 'sell' && !(cambio.solAmount > 0)) {
          const valorTx = await valorarSalidaConSwapDeLaTx(tx, cambio.mint, cambio.tokenAmount, tracked.alias);
          if (valorTx) {
            tradeCompatible.solAmount = valorTx.solAmount;
            tradeCompatible.solAmountEstimado = false;
          } else {
            // Una TRANSFERENCIA de tokens (sin pata de SOL de la wallet y sin swap
            // dentro de la tx para valorarla) NO es una venta copiable: puede ser
            // un regalo, un movimiento a otra wallet del dueño o un depósito a un
            // router. Antes se cerraba la posición valuando a mercado y se
            // reportaba como si fuera lo que recibió la wallet.
            log(
              'info',
              `📤 ${tracked.alias} ENVIÓ ${cambio.mint.slice(0, 6)}... (transferencia sin swap ni pata de SOL) — no se copia la venta`
            );
            continue;
          }
        }

        // Misma regla que en Parsed Events: sin pago propio no hay compra copiable.
        if (cambio.direction === 'buy') {
          const flujoPropio = flujoPropioDeWallet(tx, tracked.address, cambio.mint);
          const pagoSol = flujoPropio.solPropio < 0 ? -flujoPropio.solPropio : 0;
          if (pagoSol < MIN_PAGO_PROPIO_SOL && !(flujoPropio.stableOut > 0)) {
            log(
              'info',
              `🚫 ${tracked.alias} ${cambio.mint.slice(0, 6)}... sin pago propio en la tx (tokens recibidos) — no se copia`
            );
            continue;
          }
        }
        if (cambio.direction === 'buy') await handleTrackedBuy(tracked, tradeCompatible, origen, horaDeteccion);
        else await handleTrackedSell(tracked, tradeCompatible, origen, horaDeteccion);
      }
    }

    for (const tracked of trackedRows) {
      if (!cuentasDetectadas.includes(tracked.address)) continue;

      const cambiosFallback = extraerCambiosDeTxParaWallet(tx, tracked.address, solPriceBatch);
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
        const origen = origenNormalizado || (tx.source && tx.source !== 'PUMP_FUN' ? tx.source : 'OnChain');

        // (a) Ventas de wallets tipo app: la wallet no mueve SOL (el swap lo hace
        // otro pagador), así que se valora la salida con el precio del swap de la
        // misma tx para poder cerrar EN VIVO en vez de esperar a la reconciliación.
        if (cambio.direction === 'sell' && !(cambio.solAmount > 0)) {
          const valorTx = await valorarSalidaConSwapDeLaTx(tx, cambio.mint, cambio.tokenAmount, tracked.alias);
          if (valorTx) {
            tradeCompatible.solAmount = valorTx.solAmount;
            tradeCompatible.solAmountEstimado = false;
          } else {
            // Una TRANSFERENCIA de tokens (sin pata de SOL de la wallet y sin swap
            // dentro de la tx para valorarla) NO es una venta copiable: puede ser
            // un regalo, un movimiento a otra wallet del dueño o un depósito a un
            // router. Antes se cerraba la posición valuando a mercado y se
            // reportaba como si fuera lo que recibió la wallet.
            log(
              'info',
              `📤 ${tracked.alias} ENVIÓ ${cambio.mint.slice(0, 6)}... (transferencia sin swap ni pata de SOL) — no se copia la venta`
            );
            continue;
          }
        }

        // Misma regla que en Parsed Events: sin pago propio no hay compra copiable.
        if (cambio.direction === 'buy') {
          const flujoPropio = flujoPropioDeWallet(tx, tracked.address, cambio.mint);
          const pagoSol = flujoPropio.solPropio < 0 ? -flujoPropio.solPropio : 0;
          if (pagoSol < MIN_PAGO_PROPIO_SOL && !(flujoPropio.stableOut > 0)) {
            log(
              'info',
              `🚫 ${tracked.alias} ${cambio.mint.slice(0, 6)}... sin pago propio en la tx (tokens recibidos) — no se copia`
            );
            continue;
          }
        }
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

  // ===== Candados: congelado, tope por operación y tope diario =====
  if (await estaCongelado()) {
    notificarSeguridad(`BLOQUEADO ${action} ${mint.slice(0, 6)}...: bot CONGELADO.`);
    throw new Error('Bot congelado por seguridad (/unfreeze)');
  }
  if (action === 'buy') {
    const solCompra = Number(amount) || 0;
    if (solCompra > MAX_TRADE_SOL) {
      notificarSeguridad(`BLOQUEADA compra de ${solCompra.toFixed(4)} SOL: supera el tope por operación (${MAX_TRADE_SOL} SOL).`);
      throw new Error('Tope por operación excedido (MAX_TRADE_SOL)');
    }
    const gastadoHoy = await gastoDiario();
    if (gastadoHoy + solCompra > MAX_DAILY_SPEND_SOL) {
      notificarSeguridad(
        `BLOQUEADA compra de ${solCompra.toFixed(4)} SOL: tope diario alcanzado (${gastadoHoy.toFixed(4)}/${MAX_DAILY_SPEND_SOL} SOL).`
      );
      throw new Error('Tope diario excedido (MAX_DAILY_SPEND_SOL)');
    }
  }

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

// ---------- Cotización vía DexScreener (con validaciones estrictas + validación 3x) ----------
// Devuelve: { valorSol, precioSolUnitario, dexId, pairAddress, error }
async function cotizarViaDexScreener(mint, cantidadTokens, dexIdPreferido = null, precioCompraNative = null, maxRatio = 30) {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${mint}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return { valorSol: null, precioSolUnitario: null, dexId: null, pairAddress: null, error: 'DEXSCREENER_HTTP_' + res.status };
    }
    const data = await res.json();
    if (!data || !Array.isArray(data.pairs) || data.pairs.length === 0) {
      return { valorSol: null, precioSolUnitario: null, dexId: null, pairAddress: null, error: 'NO_PAIRS' };
    }

    // Filtro base
    let pairsValidos = data.pairs.filter((p) => {
      const price = parseFloat(p.priceNative);
      if (!Number.isFinite(price) || price <= 0) return false;

      // Liquidez: solo se exige si MIN_LIQ_USD > 0. Las curvas de bonding
      // (dexId 'pumpfun') no publican el campo `liquidity` y aun así tienen
      // un precio real: exigirlo descartaba tokens que el bot sí copia.
      if (MIN_LIQ_USD > 0) {
        const liq = p.liquidity?.usd;
        if (!liq || liq < MIN_LIQ_USD) return false;
      }

      // El piso de mcap debe ser coherente con lo que se copia: los memecoins
      // de curva de bonding arrancan en ~3k. El candado que de verdad protege
      // es el ratio contra el precio de compra (abajo) + el tope de 10 SOL.
      const mcap = p.marketCap || p.fdv;
      if (!mcap || mcap < MIN_MCAP_USD || mcap > MAX_MCAP_USD) return false;

      if (price > 10) return false; // memecoins < 1 SOL; acciones tokenizadas ~2 SOL/token

      return true;
    });

    // Validación contra el precio de compra (ratio configurable)
    if (precioCompraNative && precioCompraNative > 0) {
      const MAX_RATIO = maxRatio;
      const MIN_RATIO = 1 / maxRatio;
      const antes = pairsValidos.length;
      pairsValidos = pairsValidos.filter((p) => {
        const price = parseFloat(p.priceNative);
        const ratio = price / precioCompraNative;
        if (ratio > MAX_RATIO || ratio < MIN_RATIO) return false;
        return true;
      });
      if (pairsValidos.length < antes) {
        avisarPrecio(
          mint,
          'info',
          `🔒 DexScreener: ${antes - pairsValidos.length} par(es) descartado(s) por estar fuera del rango [${(1 / maxRatio).toFixed(2)}x, ${maxRatio}x] del precio de compra (${precioCompraNative.toExponential(4)} SOL/token)`
        );
      }
    }

    if (pairsValidos.length === 0) {
      avisarPrecio(mint, 'warn', `DexScreener: ningún par válido para ${mint.slice(0, 6)}... (liquidez, mcap, precio o rango)`);
      return { valorSol: null, precioSolUnitario: null, dexId: null, pairAddress: null, error: 'NO_VALID_PAIRS' };
    }

    // Filtro por dexIdPreferido
    let candidatos = pairsValidos;
    if (dexIdPreferido) {
      const filtrados = pairsValidos.filter(
        (p) => (p.dexId || '').toLowerCase() === dexIdPreferido.toLowerCase()
      );
      if (filtrados.length > 0) {
        candidatos = filtrados;
      } else {
        avisarPrecio(
          mint,
          'warn',
          `DexScreener: no hay par de ${dexIdPreferido} para ${mint.slice(0, 6)}..., usando el de más liquidez`
        );
      }
    }

    const pair = candidatos.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

    const precioNative = parseFloat(pair.priceNative);
    const valorSol = cantidadTokens * precioNative;
    // Los pares de curva de bonding no traen `liquidity`: no se puede imprimir
    // 'undefined' ni reventar el log con un TypeError.
    const liqPar = pair.liquidity?.usd;
    const esCurva = liqPar == null;

    log(
      'info',
      `📊 DexScreener: precio ${precioNative.toExponential(4)} SOL/token · posición ${cantidadTokens.toFixed(4)} tokens → ${valorSol.toFixed(6)} SOL (dex: ${pair.dexId}, liq: ${esCurva ? 'curva/sin dato' : '$' + liqPar}, mcap: $${pair.marketCap || pair.fdv || 'n/d'})${esCurva ? ' [curva]' : ''}`
    );

    return {
      valorSol,
      precioSolUnitario: precioNative,
      dexId: pair.dexId || null,
      pairAddress: pair.pairAddress || null,
      curva: esCurva,
      error: null
    };
  } catch (e) {
    return { valorSol: null, precioSolUnitario: null, dexId: null, pairAddress: null, error: 'DEXSCREENER_ERROR: ' + e.message };
  }
}

// ---------- Cotización vía Jupiter ----------
async function cotizarViaJupiter(mint, cantidadTokens, decimals) {
  if (!process.env.JUPITER_API_KEY) return { valorSol: null, precioSolUnitario: null, error: 'NO_API_KEY' };
  try {
    const rawAmount = Math.floor(cantidadTokens * Math.pow(10, decimals));
    if (rawAmount <= 0) return { valorSol: null, precioSolUnitario: null, error: 'ZERO_AMOUNT' };

    const url = `${JUPITER_BASE}/quote?inputMint=${mint}&outputMint=${SOL_MINT}&amount=${rawAmount}&slippageBps=${DEFAULT_SLIPPAGE_BPS}`;
    const res = await fetchJupiterConReintento(url, {
      headers: { 'x-api-key': process.env.JUPITER_API_KEY }
    });
    if (!res.ok) {
      let body = '';
      try {
        body = await res.text();
      } catch (_) {}
      const esNoTradable = body.includes('TOKEN_NOT_TRADABLE') || body.includes('not tradable');
      if (esNoTradable) {
        return { valorSol: null, precioSolUnitario: null, error: 'NOT_TRADABLE' };
      }
      return { valorSol: null, precioSolUnitario: null, error: 'JUPITER_HTTP_' + res.status };
    }
    const data = await res.json();
    if (!data.outAmount) return { valorSol: null, precioSolUnitario: null, error: 'NO_OUT_AMOUNT' };
    const valorSol = parseFloat(data.outAmount) / LAMPORTS_PER_SOL;
    return { valorSol, precioSolUnitario: null, error: null };
  } catch (e) {
    return { valorSol: null, precioSolUnitario: null, error: 'JUPITER_ERROR: ' + e.message };
  }
}

// ---------- Valor estimado en SOL ----------
async function estimarValorEnSol(mint, cantidadTokens, decimals, dexIdPreferido = null, precioCompraNative = null, maxRatio = 30) {
  let cantidadReal = cantidadTokens;
  // En PAPER la posición es ficticia: el saldo on-chain de la wallet del bot no
  // tiene nada que ver (usar "saldo real" aquí valuaba una posición de USDC
  // contra el USDC real que el usuario tuviera en la wallet).
  if (LIVE && walletKeypair) {
    try {
      const saldoReal = await getBalanceDeTokenEnWallet(
        walletKeypair.publicKey.toBase58(),
        mint
      );
      if (saldoReal !== null && saldoReal > 0) {
        if (Math.abs(saldoReal - cantidadTokens) / Math.max(cantidadTokens, 1) > 0.01) {
          log(
            'warn',
            `🔍 estimarValorEnSol: saldo real (${saldoReal}) ≠ position.amount (${cantidadTokens}) para ${mint.slice(0, 6)}... Usando saldo real.`
          );
        }
        cantidadReal = saldoReal;
      }
    } catch (e) {
      log('warn', `No se pudo consultar saldo real para ${mint.slice(0, 6)}...: ${e.message}. Usando position.amount.`);
    }
  }

  if (cantidadReal <= 0) return { valorSol: null, precioSolUnitario: null, dexId: null, pairAddress: null, error: 'ZERO_AMOUNT' };

  const dexs = await cotizarViaDexScreener(mint, cantidadReal, dexIdPreferido, precioCompraNative, maxRatio);
  if (dexs.valorSol !== null) {
    return dexs;
  }

  avisarPrecio(mint, 'info', `⚠️ DexScreener falló (${dexs.error}), intentando Jupiter para ${mint.slice(0, 6)}...`);
  const jup = await cotizarViaJupiter(mint, cantidadReal, decimals);
  return jup;
}

// ---------- Obtener precio unitario + dexId + pairAddress vía DexScreener ----------
async function obtenerPrecioUnitarioDexScreener(mint, dexIdPreferido = null) {
  const resultado = await cotizarViaDexScreener(mint, 1, dexIdPreferido, null, 30);
  if (resultado.valorSol !== null && resultado.valorSol > 0) {
    return {
      precioSol: resultado.valorSol,
      dexId: resultado.dexId,
      pairAddress: resultado.pairAddress,
      error: null
    };
  }
  return { precioSol: null, dexId: null, pairAddress: null, error: resultado.error };
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


// ---------- Retiro de ganancias (sweep) ----------
// Regla: cuando el valor en caja (USDC + SOL) supera BASE + MONTO, se envian MONTO
// dolares a SWEEP_ADDRESS. La BASE es el capital que se queda trabajando dentro del
// bot y no se mueve: asi el retiro solo toca ganancias, nunca el capital.
// El destino se configura SOLO en Railway, nunca por Telegram (si un comando pudiera
// cambiarlo, robar el bot seria robar la wallet).
// En PAPER solo se registra lo que habria hecho: jamas envia nada.
const SWEEP_COOLDOWN_MS = 10 * 60 * 1000;
const SWEEP_MAX_USD = 1000;
const SWEEP_RESERVA_SOL = parseFloat(process.env.SWEEP_RESERVA_SOL || '0.02');

async function leerSweepConfig() {
  try {
    const { rows } = await pool.query('SELECT * FROM bot_sweep WHERE id=1');
    if (rows[0]) return rows[0];
  } catch (e) {
    log('warn', `No se pudo leer bot_sweep: ${e.message}`);
  }
  return { activo: true, base_usd: 100, monto_usd: 20, total_enviado_usd: 0, ultimo_envio: null };
}

async function guardarSweepConfig(campos) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(campos)) {
    sets.push(`${k} = $${i++}`);
    vals.push(v);
  }
  if (!sets.length) return;
  await pool.query(`UPDATE bot_sweep SET ${sets.join(', ')} WHERE id=1`, vals);
}

// Funcion pura y testeable: toca retirar y cuanto?
function decidirSweep({ totalUsd, baseUsd, montoUsd, activo }) {
  if (!activo) return { hacer: false, motivo: 'apagado' };
  if (!Number.isFinite(montoUsd) || montoUsd <= 0) return { hacer: false, motivo: 'monto no valido' };
  if (!Number.isFinite(baseUsd) || baseUsd < 0) return { hacer: false, motivo: 'base no valida' };
  if (!Number.isFinite(totalUsd)) return { hacer: false, motivo: 'sin valor de cartera' };
  const excedente = totalUsd - baseUsd;
  if (excedente + 1e-9 < montoUsd) {
    return { hacer: false, excedente, motivo: `excedente $${excedente.toFixed(2)} < $${montoUsd.toFixed(2)}` };
  }
  return { hacer: true, excedente, monto: montoUsd, motivo: 'objetivo alcanzado' };
}

async function saldoUsdc() {
  if (!connection || !walletKeypair) return 0;
  const r = await connection.getParsedTokenAccountsByOwner(walletKeypair.publicKey, {
    mint: new PublicKey(USDC_MINT)
  });
  return r.value.reduce((s, c) => s + (c.account.data.parsed.info.tokenAmount.uiAmount || 0), 0);
}

async function valorCajaUsd() {
  // En PAPER la "caja" es el saldo simulado del bot; la wallet real de Solana no
  // se usa para tradear y sumarla aqui confundia (dos numeros distintos).
  if (!LIVE) {
    try {
      const { rows } = await pool.query('SELECT current_usdc FROM global_balance WHERE id=1');
      const saldo = Number(rows[0] && rows[0].current_usdc) || 0;
      return { sol: 0, usdc: saldo, precioSol: 0, total: saldo, paper: true };
    } catch (e) {
      return { sol: 0, usdc: 0, precioSol: 0, total: NaN, paper: true };
    }
  }
  const [precioSol, sol, usdc] = await Promise.all([
    getSolPriceUSD().catch(() => 0),
    getWalletSolBalance().catch(() => 0),
    saldoUsdc().catch(() => 0)
  ]);
  const p = Number(precioSol) || 0;
  const s = Number(sol) || 0;
  const u = Number(usdc) || 0;
  return { sol: s, usdc: u, precioSol: p, total: u + s * p, paper: false };
}

async function enviarUsdcSweep(destino, cantidadUsd) {
  const spl = require('@solana/spl-token');
  const mint = new PublicKey(USDC_MINT);
  const destinoKey = new PublicKey(destino);
  const origenAta = await spl.getAssociatedTokenAddress(mint, walletKeypair.publicKey);
  const destinoAta = await spl.getAssociatedTokenAddress(mint, destinoKey);
  const tx = new Transaction();
  const info = await connection.getAccountInfo(destinoAta);
  if (!info) {
    tx.add(spl.createAssociatedTokenAccountInstruction(walletKeypair.publicKey, destinoAta, destinoKey, mint));
  }
  tx.add(
    spl.createTransferInstruction(origenAta, destinoAta, walletKeypair.publicKey, Math.round(cantidadUsd * 1000000))
  );
  tx.feePayer = walletKeypair.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(walletKeypair);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await confirmarYVerificarTx(sig);
  return sig;
}

async function enviarSolSweep(destino, sol) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: walletKeypair.publicKey,
      toPubkey: new PublicKey(destino),
      lamports: Math.floor(sol * LAMPORTS_PER_SOL)
    })
  );
  tx.feePayer = walletKeypair.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(walletKeypair);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await confirmarYVerificarTx(sig);
  return sig;
}

async function ejecutarSweep({ forzar = false } = {}) {
  if (!SWEEP_ADDRESS) return { ok: false, motivo: 'SWEEP_ADDRESS no configurada en Railway' };
  if (!walletKeypair || !connection) return { ok: false, motivo: 'wallet o RPC no disponible' };

  const cfg = await leerSweepConfig();
  const caja = await valorCajaUsd();
  const d = decidirSweep({
    totalUsd: caja.total,
    baseUsd: Number(cfg.base_usd),
    montoUsd: Number(cfg.monto_usd),
    activo: !!cfg.activo
  });
  if (!d.hacer) return { ok: false, motivo: d.motivo, caja };

  if (!forzar && cfg.ultimo_envio) {
    const pasado = Date.now() - new Date(cfg.ultimo_envio).getTime();
    if (pasado < SWEEP_COOLDOWN_MS) {
      return { ok: false, motivo: `esperando ${Math.ceil((SWEEP_COOLDOWN_MS - pasado) / 60000)} min`, caja };
    }
  }

  if (!LIVE) {
    // PAPER: se mueve el saldo ficticio igual que en REAL para poder probar la
    // regla completa, pero no sale dinero. El cooldown de 10 min evita el bucle.
    const saldoNuevo = await adjustPaperBalance(-d.monto);
    await guardarSweepConfig({
      ultimo_envio: new Date(),
      total_enviado_usd: Number(cfg.total_enviado_usd || 0) + d.monto
    });
    log(
      'info',
      `💰 [PAPER] retiro simulado: $${d.monto.toFixed(2)} -> ${SWEEP_ADDRESS.slice(0, 8)}... - saldo paper $${saldoNuevo.toFixed(2)}`
    );
    if (CHAT_ID) {
      bot
        .sendMessage(
          CHAT_ID,
          `💰 *Retiro simulado (PAPER)*\n$${d.monto.toFixed(2)} → ${SWEEP_ADDRESS.slice(0, 6)}…${SWEEP_ADDRESS.slice(-4)}\nCaja antes: $${caja.total.toFixed(2)} · base $${Number(cfg.base_usd).toFixed(2)}\nSaldo paper ahora: $${saldoNuevo.toFixed(2)}\nNo salió dinero real.`,
          { parse_mode: 'Markdown', disable_web_page_preview: true }
        )
        .catch(() => {});
    }
    return { ok: true, simulado: true, monto: d.monto, caja, saldoNuevo };
  }

  let sig = null;
  let via = null;
  if (caja.usdc >= d.monto) {
    sig = await enviarUsdcSweep(SWEEP_ADDRESS, d.monto);
    via = 'USDC';
  } else {
    const precio = caja.precioSol;
    if (!precio) return { ok: false, motivo: 'sin precio SOL/USD para valorar el retiro', caja };
    const solNecesario = d.monto / precio;
    if (caja.sol - solNecesario < SWEEP_RESERVA_SOL) {
      return { ok: false, motivo: `SOL insuficiente dejando reserva de ${SWEEP_RESERVA_SOL} SOL`, caja };
    }
    sig = await enviarSolSweep(SWEEP_ADDRESS, solNecesario);
    via = 'SOL';
  }

  await guardarSweepConfig({
    ultimo_envio: new Date(),
    total_enviado_usd: Number(cfg.total_enviado_usd || 0) + d.monto
  });
  log('info', `RETIRO de ganancias: $${d.monto.toFixed(2)} via ${via} -> ${SWEEP_ADDRESS} - tx ${sig}`);
  if (CHAT_ID) {
    bot
      .sendMessage(
        CHAT_ID,
        `*Retiro de ganancias*\n$${d.monto.toFixed(2)} (${via}) -> ${SWEEP_ADDRESS.slice(0, 6)}...${SWEEP_ADDRESS.slice(-4)}\nCaja: $${caja.total.toFixed(2)} - base $${Number(cfg.base_usd).toFixed(2)}\n[Ver tx](https://solscan.io/tx/${sig})`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      )
      .catch(() => {});
  }
  return { ok: true, monto: d.monto, via, sig, caja, simulado: false };
}

// Chequeo periodico: solo si hay destino configurado y es valido.
if (SWEEP_ADDRESS) {
  let destinoValido = true;
  try {
    new PublicKey(SWEEP_ADDRESS);
  } catch (e) {
    destinoValido = false;
    log('error', 'SWEEP_ADDRESS invalida: el retiro de ganancias queda DESACTIVADO');
  }
  if (destinoValido) {
    setTimeout(() => {
      ejecutarSweep().catch((e) => log('warn', `Sweep: ${e.message}`));
    }, 30000);
    setInterval(() => {
      ejecutarSweep().catch((e) => log('warn', `Sweep: ${e.message}`));
    }, 60000);
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

// ---------- Buscar último trade real de una wallet para un mint (para reconciliación) ----------
async function buscarUltimoTradeReal(walletAlias, mint, minutosAtras = 30) {
  try {
    const { rows } = await pool.query(
      `SELECT th.profit_sol, th.closed_at
       FROM trade_history th
       WHERE th.wallet_alias = $1 AND th.modo = $2
       ORDER BY th.closed_at DESC
       LIMIT 50`,
      [walletAlias, MODO_ACTUAL]
    );
    // No tenemos el mint en trade_history, así que no podemos filtrar por mint.
    // Retornamos null siempre. Esta función queda como placeholder para futuro.
    return null;
  } catch (_) {
    return null;
  }
}

// ---------- Calcular proceeds para reconciliación ----------
// Prioridad:
//   1. Trade real reciente de la wallet (si existe)
//   2. DexScreener con filtro 3x (contra precio_compra_native)
//   3. cost_basis (PnL = 0)
async function calcularProceedsParaReconciliacion(pos) {
  const costBasis = Number(pos.cost_basis_sol) || 0;

  // 1. DexScreener con filtro 3x
  try {
    const { decimals } = await getTokenInfoHelius(pos.token_mint);
    const resultado = await estimarValorEnSol(
      pos.token_mint,
      pos.amount,
      decimals,
      pos.origen_dex,
      pos.precio_compra_native,
      3  // ← filtro 3x en reconciliación (más estricto)
    );

    if (resultado.error === 'NOT_TRADABLE') {
      log('warn', `🔍 Reconciliación ${pos.symbol}: token no tradable. Usando cost_basis.`);
      return { proceedsSol: costBasis, fuente: 'cost_basis (no tradable)' };
    }

    if (resultado.valorSol !== null && resultado.valorSol > 0) {
      let proceeds = resultado.valorSol;

      // Validaciones 3x / 0.33x
      if (costBasis > 0 && proceeds > costBasis * 3) {
        log('warn', `⚠️ Reconciliación ${pos.symbol}: proceeds ${proceeds.toFixed(6)} SOL > 3x cost_basis ${costBasis.toFixed(4)}. Usando cost_basis.`);
        proceeds = costBasis;
      }
      if (costBasis > 0 && proceeds < costBasis * 0.33) {
        log('warn', `⚠️ Reconciliación ${pos.symbol}: proceeds ${proceeds.toFixed(6)} SOL < 0.33x cost_basis ${costBasis.toFixed(4)}. Usando cost_basis.`);
        proceeds = costBasis;
      }

      return { proceedsSol: proceeds, fuente: `DexScreener (dex: ${resultado.dexId || 'n/d'})` };
    }
  } catch (e) {
    log('warn', `🔍 Reconciliación ${pos.symbol}: error en estimarValorEnSol: ${e.message}`);
  }

  // 2. Fallback: cost_basis
  log('warn', `🔍 Reconciliación ${pos.symbol}: sin cotización válida, usando cost_basis (PnL = 0).`);
  return { proceedsSol: costBasis, fuente: 'cost_basis (fallback)' };
}

// ---------- Reconciliación de posiciones ----------
// ---------- Reclamo atomico de una posicion antes de cerrarla ----------
// reconciliarPosiciones (venta atrasada) y revisarStopLoss corren en timers
// independientes de 60s SIN exclusion mutua: los dos podian cerrar la MISMA
// posicion, acreditando el proceeds dos veces en el saldo y duplicando el trade
// en el historial (RIBBIT 16-oct-2026: dos cierres con 77 ms de diferencia).
// Reclamar con DELETE ... RETURNING garantiza que solo el primero que borra la
// fila siga con el cierre, aunque haya varios ciclos o replicas.
async function reclamarPosicionParaCierre(mint, alias, symbol = '') {
  const r = await pool.query(
    'DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3 RETURNING token_mint',
    [mint, alias, MODO_ACTUAL]
  );
  if (r.rowCount === 0) {
    log('warn', `⏭️ Cierre duplicado evitado: ${symbol || String(mint).slice(0, 6)} (${alias}) ya no estaba abierto`);
    return false;
  }
  return true;
}
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

      // ============ REAL ============
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
          let proceedsSol = after - before;
          if (proceedsSol < 0) proceedsSol = 0;

          const solPrice = await getSolPriceUSD();
          const r = calcularResultado(pos.cost_basis_sol, proceedsSol, solPrice, false);

          if (!(await reclamarPosicionParaCierre(pos.token_mint, pos.wallet_alias, pos.symbol))) continue;
          await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
          marcarSignatureProcesada(sig);

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
        // ============ PAPER ============
        const { proceedsSol, fuente } = await calcularProceedsParaReconciliacion(pos);
        const solPrice = await getSolPriceUSD();
        const r = calcularResultado(pos.cost_basis_sol, proceedsSol, solPrice, true);
        const proceedsUsd = solPrice ? r.proceedsNetoSol * solPrice : 0;

        if (!(await reclamarPosicionParaCierre(pos.token_mint, pos.wallet_alias, pos.symbol))) continue;
        await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
        const nuevoSaldo = await adjustPaperBalance(proceedsUsd);
        const saldoSeguro = Number.isFinite(nuevoSaldo) ? nuevoSaldo : INITIAL_PAPER_BALANCE;

        if (CHAT_ID) {
          bot.sendMessage(
            CHAT_ID,
            `🔄⚠️ PAPER: venta atrasada [${pos.wallet_alias}] ${pos.symbol}\n` +
            `Fuente: ${fuente}\n` +
            `Estimado: ${r.proceedsNetoSol.toFixed(4)} SOL\n` +
          `Costo: ${Number(pos.cost_basis_sol).toFixed(4)} SOL\n` +
            `${formatearResultado(r)}\n` +
            `Saldo: $${saldoSeguro.toFixed(2)}`
          );
        }
      }
    }

    if (cerradas > 0 || forzado) {
      log(
        'info',
        `🔍 Reconciliación [${MODO_ACTUAL.toUpperCase()}]${forzado ? ' (manual)' : ''}: ${posiciones.length} posiciones revisadas, ${cerradas} cerradas por venta atrasada.`
      );
    }
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
      const resultado = await estimarValorEnSol(
        pos.token_mint,
        pos.amount,
        decimals,
        pos.origen_dex,
        pos.precio_compra_native,
        30
      );

      if (resultado.error === 'NOT_TRADABLE') {
        if (LIVE) {
          // Fail-closed: sin precio no se puede saber si tocó el umbral, y
          // vender "a ciegas" puede realizar una pérdida enorme o malvender
          // una posición ganadora. Se avisa y se deja la decisión a /close.
          log(
            'warn',
            `⛔ ${pos.symbol}: sin precio confiable (NOT_TRADABLE) — NO se vende a ciegas. Usa /close o espera la venta de la wallet.`
          );
          if (CHAT_ID) {
            bot
              .sendMessage(
                CHAT_ID,
                `⛔ STOP-LOSS BLOQUEADO [${pos.wallet_alias}] ${pos.symbol}\n` +
                  `No hay precio confiable (sin ruta en Jupiter y sin par válido en DexScreener).\n` +
                  `No se vende a ciegas: si quieres salir, usa /close ${pos.wallet_alias} ${pos.token_mint}`
              )
              .catch(() => {});
          }
        } else {
          log(
            'info',
            `📌 [PAPER] Token ${pos.symbol} no tradable en Jupiter (${pos.token_mint.slice(0, 6)}...). NO cerramos. Esperando venta de la wallet.`
          );
        }
        return;
      }

      if (resultado.valorSol === null) {
        log('warn', `Sin precio para ${pos.symbol} (${resultado.error}). Saltando en este ciclo.`);
        return;
      }

      const ratio = resultado.valorSol / pos.cost_basis_sol;
      if (ratio > STOP_LOSS_PCT) return;

      log(
        'info',
        `🛑 STOP-LOSS activado: ${pos.wallet_alias} ${pos.symbol} · valor actual ${resultado.valorSol.toFixed(6)} SOL vs costo ${pos.cost_basis_sol.toFixed(4)} SOL (${(ratio * 100).toFixed(1)}%)`
      );
      await ejecutarStopLoss(pos, resultado.valorSol);
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

      if (!(await reclamarPosicionParaCierre(pos.token_mint, pos.wallet_alias, pos.symbol))) return;
      await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
      marcarSignatureProcesada(sig);

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

    if (!(await reclamarPosicionParaCierre(pos.token_mint, pos.wallet_alias, pos.symbol))) return;
    await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
    const nuevoSaldo = await adjustPaperBalance(proceedsUsd);

    if (CHAT_ID) {
      bot.sendMessage(
        CHAT_ID,
        `🛑 PAPER STOP-LOSS: ${pos.symbol} vía ${pos.wallet_alias} · Salí con (estimado, neto de fees): ${r.proceedsNetoSol.toFixed(4)} SOL (~$${proceedsUsd.toFixed(2)}) · costo: ${Number(pos.cost_basis_sol).toFixed(4)} SOL · ${formatearResultado(r)} · Saldo ficticio: $${nuevoSaldo.toFixed(2)}`
      );
    }
  }
}

// ---------- Stop-loss especial para tokens NO TRADABLES ----------
async function ejecutarStopLossNoTradable(pos) {
  if (!LIVE || pos.chain !== 'solana' || !walletKeypair || !connection) return;

  log(
    'info',
    `🔄 Token no tradable en Jupiter: intentando vender ${pos.symbol} vía PumpPortal → Jupiter...`
  );

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

    if (!(await reclamarPosicionParaCierre(pos.token_mint, pos.wallet_alias, pos.symbol))) return;
    await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
    marcarSignatureProcesada(sig);

    let msg = `🛑 STOP-LOSS (token no tradable en Jupiter) [${pos.wallet_alias}] ${pos.symbol}\nVendido vía PumpPortal/Jupiter.\nSalí con: ${proceedsSol.toFixed(4)} SOL · ${formatearResultado(r)} · tx: ${linkTx(sig)}`;
    const rentRecuperado = await cerrarCuentaDelToken(pos.token_mint);
    if (rentRecuperado) msg += `\n♻️ Cuenta cerrada, recuperado: ${rentRecuperado.toFixed(5)} SOL de rent`;
    const saldoFinal = await getWalletSolBalance();
    msg += `\n💰 Saldo total: ${saldoFinal.toFixed(4)} SOL`;
    if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);

    log('info', `✅ Venta de token no tradable exitosa para ${pos.symbol}`);
  } catch (e) {
    log(
      'warn',
      `🔄 Venta de ${pos.symbol} falló en este ciclo (${e.message}). Se reintentará en el próximo.`
    );
  }
}

// ---------- (a) Valuar ventas SIN pata de SOL (wallets tipo app) ----------
// Hay wallets (las que operan desde una app) donde el swap lo ejecuta otro
// pagador: a la wallet solo le entran/le salen tokens y nunca toca SOL. Sin pata
// de SOL el parser no puede valorar la venta en vivo, así que la posición se
// quedaba abierta hasta que la reconciliación veía el saldo en 0 y la cerraba
// como 'venta atrasada' 60-120 s después y a precio estimado.
// Aquí se usa el PRECIO del swap de la MISMA tx (Parsed Events) multiplicado por
// los tokens que salieron de la wallet: el precio es el de la operación real.
async function valorarSalidaConSwapDeLaTx(tx, mint, tokenAmountSalida, alias = '') {
  try {
    if (!tx || !tx.signature || !(tokenAmountSalida > 0)) return null;
    const parsed = await parsearTransaccionViaHeliusAPI(tx.signature);
    if (!parsed || parsed.mint !== mint) return null;
    if (!(parsed.tokenAmount > 0) || !(parsed.solAmount > 0)) return null;
    const precioUnitario = parsed.solAmount / parsed.tokenAmount;
    const solAmount = tokenAmountSalida * precioUnitario;
    if (!Number.isFinite(solAmount) || solAmount <= 0 || solAmount > 1000) return null;
    log(
      'info',
      `🧩 Venta sin pata de SOL valorada con el swap de la misma tx ${alias ? '(' + alias + ') ' : ''}${mint.slice(0, 6)}...: ${precioUnitario.toExponential(4)} SOL/token × ${tokenAmountSalida.toFixed(4)} tokens → ${solAmount.toFixed(6)} SOL`
    );
    return { solAmount, precioUnitario };
  } catch (e) {
    log('warn', `No se pudo valorar la venta con el swap de la tx: ${e.message}`);
    return null;
  }
}

// ---------- Verificación on-chain de múltiplos grandes ----------
// Cuando un cierre reporta un múltiplo alto se compara contra lo que la wallet
// hizo DE VERDAD en ese token (sus tokens y su SOL), para no cantar un x10 que la
// cadena no respalda.
const VERIFICAR_MULT_DESDE = parseFloat(process.env.VERIFICAR_MULT_DESDE || '3');

async function verificarMultiploEnCadena(walletAddress, mint) {
  const apiKey = getHeliusApiKey();
  if (!apiKey || !walletAddress || !mint) return null;
  try {
    const res = await fetch(
      `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${apiKey}&limit=100`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const txs = await res.json();
    const solPrice = await getSolPriceUSD();

    // Se toma la tx DOMINANTE de cada lado (la que movió más tokens del mint) en
    // vez de sumar todo: sumar mezclaba tramos y polvo. Visto: la wallet pagó
    // 0.4 SOL en una tx que además le dejó polvo de otro token y el múltiplo
    // salía 0.00x. Y una recepción (bundler/airdrop) sumaba tokens sin SOL.
    let mejorCompra = null;
    let mejorVenta = null;

    for (const tx of txs || []) {
      const flujo = flujoPropioDeWallet(tx, walletAddress, mint);
      if (!(flujo.tokensIn > 0) && !(flujo.tokensOut > 0)) continue;

      // Tx ambigua: la wallet mueve OTRO token (no stable) en la misma tx, así
      // que el SOL de esa tx no es atribuible a este mint.
      const mueveOtroToken = (tx.tokenTransfers || []).some(
        (t) =>
          t.mint !== mint &&
          !esMintNoCopiable(t.mint) &&
          (t.toUserAccount === walletAddress || t.fromUserAccount === walletAddress)
      );
      if (mueveOtroToken) continue;

      if (flujo.tokensIn > 0) {
        let pagado = flujo.solPropio < 0 ? -flujo.solPropio : 0;
        if (!(pagado > 0) && flujo.stableOut > 0 && solPrice) pagado = flujo.stableOut / solPrice;
        if (pagado > 0 && (!mejorCompra || flujo.tokensIn > mejorCompra.tokens)) {
          mejorCompra = { tokens: flujo.tokensIn, sol: pagado };
        }
      }
      if (flujo.tokensOut > 0) {
        let cobrado = flujo.solPropio > 0 ? flujo.solPropio : 0;
        if (!(cobrado > 0) && flujo.stableIn > 0 && solPrice) cobrado = flujo.stableIn / solPrice;
        if (cobrado > 0 && (!mejorVenta || flujo.tokensOut > mejorVenta.tokens)) {
          mejorVenta = { tokens: flujo.tokensOut, sol: cobrado };
        }
      }
    }

    if (!mejorCompra || !mejorVenta) {
      return { verificable: false, motivo: 'sin compras y ventas del token en las últimas 100 tx' };
    }
    const precioCompra = mejorCompra.sol / mejorCompra.tokens;
    const precioVenta = mejorVenta.sol / mejorVenta.tokens;
    if (precioCompra > 0 && precioVenta > 0) {
      return {
        verificable: true,
        multiple: precioVenta / precioCompra,
        compra: mejorCompra,
        venta: mejorVenta
      };
    }
    return { verificable: false, motivo: 'la wallet no mueve SOL ni USDC propio (wallet tipo app)' };
  } catch (e) {
    return null;
  }
}

async function lineaVerificacionOnChain(r, mint, walletAddress) {
  try {
    if (!r || !(r.multiplicador >= VERIFICAR_MULT_DESDE)) return '';
    const v = await verificarMultiploEnCadena(walletAddress, mint);
    if (!v) return '';
    let linea;
    if (!v.verificable) {
      linea = `\n🔎 On-chain: no verificable (${v.motivo})`;
    } else {
      const desvio = v.multiple / r.multiplicador;
      const aviso = desvio > 2 || desvio < 0.5 ? ' ⚠️ desvío >2x' : ' ✓';
      const detalle =
        v.compra && v.venta
          ? ` [compró ${v.compra.sol.toFixed(4)} SOL / vendió ${v.venta.sol.toFixed(4)} SOL]`
          : '';
      linea = `\n🔎 On-chain: la wallet hizo ${v.multiple.toFixed(2)}x (nosotros ${r.multiplicador.toFixed(2)}x)${aviso}${detalle}`;
    }
    log('info', `📊 Verificación on-chain ${mint.slice(0, 6)}...: ${linea.replace(/\n/g, ' ').trim()}`);
    return linea;
  } catch (e) {
    return '';
  }
}

// ---------- Calcular proceeds desde el trade real de la wallet ----------
function calcularProceedsDesdeTradeReal(trade, position) {
  if (!trade || !position) return null;
  if (trade.solAmountEstimado === true) return null;
  if (!trade.tokenAmount || trade.tokenAmount <= 0) return null;
  if (!trade.solAmount || trade.solAmount <= 0) return null;
  if (trade.solAmount <= 0.005) return null;

  const precioUnitario = trade.solAmount / trade.tokenAmount;
  if (!Number.isFinite(precioUnitario) || precioUnitario <= 0) return null;

  const proceedsSol = position.amount * precioUnitario;
  if (!Number.isFinite(proceedsSol) || proceedsSol <= 0) return null;

  return {
    proceedsSol,
    precioUnitario,
    fuente: 'trade real de la wallet'
  };
}

// ---------- Proceeds por PROPORCIÓN (venta ÷ compra de la wallet) ----------
// El múltiplo de una copia tiene que ser el movimiento de precio de la wallet.
// Calcularlo como `position.amount × precio_absoluto_de_venta` amplifica
// cualquier error de `amount` (o de un precio absoluto fuera de rango) en una
// ganancia ficticia: visto +52.4% donde la wallet salió en -6.7% y +218.9%
// donde hizo +36.5%. Aquí todo se deriva de cost_basis × (precioVenta/precioCompra),
// sin usar `amount`.
const RATIO_SALIDA_MIN = parseFloat(process.env.RATIO_SALIDA_MIN || '0.02');
const RATIO_SALIDA_MAX = parseFloat(process.env.RATIO_SALIDA_MAX || '30');

function calcularProceedsPorProporcion(trade, position) {
  if (!trade || !position) return null;
  if (trade.solAmountEstimado === true) return null;
  if (!(trade.solAmount > 0.005)) return null;
  if (!(trade.tokenAmount > 0)) return null;

  const precioVenta = trade.solAmount / trade.tokenAmount;
  const precioCompra = Number(position.precio_compra_native);
  const costBasis = Number(position.cost_basis_sol);

  if (!Number.isFinite(precioVenta) || precioVenta <= 0) return null;
  if (!Number.isFinite(precioCompra) || precioCompra <= 0) return null;
  if (!Number.isFinite(costBasis) || costBasis <= 0) return null;

  let ratio = precioVenta / precioCompra;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;

  let clampado = false;
  if (ratio < RATIO_SALIDA_MIN) {
    ratio = RATIO_SALIDA_MIN;
    clampado = true;
  }
  if (ratio > RATIO_SALIDA_MAX) {
    ratio = RATIO_SALIDA_MAX;
    clampado = true;
  }

  return {
    proceedsSol: costBasis * ratio,
    ratio,
    precioVenta,
    precioCompra,
    clampado,
    fuente: `proporción venta/compra de la wallet (${ratio.toFixed(2)}x)`
  };
}

// ---------- Compra ----------
// P4: evita ráfagas del mismo aviso de Telegram (misma clave = mismo alias+mint).
// Los eventos repetidos se siguen registrando en logs, pero no spamean el chat.
const avisosRecientes = new Map();
function avisarUnaVez(clave, mensaje, ttlMs = 30 * 60 * 1000) {
  const ahora = Date.now();
  for (const [k, t] of avisosRecientes) {
    if (ahora - t > ttlMs) avisosRecientes.delete(k);
  }
  if (avisosRecientes.has(clave)) return false;
  avisosRecientes.set(clave, ahora);
  if (CHAT_ID) bot.sendMessage(CHAT_ID, mensaje);
  return true;
}

async function handleTrackedBuy(tracked, trade, origen = 'PumpPortal', horaDeteccion = null) {
  const solPaid = trade.solAmount || 0;

  if (await estaCongelado()) {
    log('warn', `🧊 Congelado: compra de ${tracked.alias} ${trade.mint.slice(0, 6)}... ignorada`);
    return;
  }

  // P2: SOL/wSOL y stables NUNCA son el token objetivo de una copia. Una
  // "compra de USDC" es en realidad la venta del token que la wallet tenía.
  if (esMintNoCopiable(trade.mint)) {
    log('debug', `🚫 ${tracked.alias} ${trade.mint.slice(0, 6)}... es stable/SOL — no se copia`);
    return;
  }

  // Sin monto determinable (tx sin pata de pago: recepciones, airdrops, bundles):
  // no se copia y NO se avisa por Telegram (antes llegaba un aviso por evento).
  if (trade.solAmountEstimado === true || !(solPaid > 0)) {
    log(
      'debug',
      `ℹ️ Sin monto determinable ${tracked.alias} ${trade.mint.slice(0, 6)}... [${origen}] — no se copia (silencioso)`
    );
    return;
  }

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

  const seen = await pool.query(
    'SELECT 1 FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
    [trade.traderPublicKey, trade.mint]
  );
  if (seen.rows.length > 0) {
    log('info', `R2: recompra/ya visto ignorado ${tracked.alias} ${symbol}`);
    avisarUnaVez(
      `yaVisto:${tracked.alias}:${trade.mint}`,
      `↪️ No copiado (${tracked.alias} → ${symbol}): recompra o ya visto. Repetidos del mismo token silenciados 30 min.`
    );
    return;
  }

  const existingPos = await pool.query(
    'SELECT 1 FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
    [trade.mint, tracked.alias, MODO_ACTUAL]
  );
  if (existingPos.rows.length > 0) {
    log('info', 'R2: posición ya abierta con esta wallet en modo actual, ignorado');
    avisarUnaVez(
      `yaAbierta:${tracked.alias}:${trade.mint}`,
      `↪️ No copiado (ya tienes posición abierta en ${symbol} vía ${tracked.alias})`
    );
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

  const dexIdsDexScreener = ['pumpfun', 'pumpswap', 'raydium', 'meteora', 'jupiter', 'orca', 'lifinity', 'phoenix', 'openbook'];
  const origenDex = origen && dexIdsDexScreener.includes(origen.toLowerCase()) ? origen.toLowerCase() : null;

  let tokensBought = 0;
  let precioCompraNative = null;
  let pairAddress = null;
  let fuentePrecio = 'ninguna';

  // P3: el precio del trade de la wallet (SOL que pagó ÷ tokens que recibió) es
  // la fuente fiable: es lo que costó de verdad. DexScreener puede devolver
  // pools con un precio desviado decenas de veces (XTO: 5.18e-3 vs 6.44e-5 real)
  // y ese error se convertía en una pérdida/ganancia ficticia al vender.
  const precioTrade =
    trade.solAmount > 0 && trade.tokenAmount > 0 ? trade.solAmount / trade.tokenAmount : null;

  let precioDex = null;
  try {
    const precio = await obtenerPrecioUnitarioDexScreener(trade.mint, origenDex);
    if (precio.precioSol !== null && precio.precioSol > 0) {
      precioDex = precio;
      if (precioTrade && (precio.precioSol > precioTrade * 30 || precio.precioSol < precioTrade * 0.033)) {
        log(
          'warn',
          `🔒 DexScreener descartado para ${symbol}: ${precio.precioSol.toExponential(4)} vs trade de la wallet ${precioTrade.toExponential(4)} SOL/token (fuera de [0.03x, 30x])`
        );
        precioDex = null;
      }
    }
  } catch (e) {
    log('warn', `No se pudo obtener precio de DexScreener para ${symbol}: ${e.message}`);
  }

  if (precioTrade) {
    tokensBought = amountSol / precioTrade;
    precioCompraNative = precioTrade;
    pairAddress = precioDex ? precioDex.pairAddress : null;
    fuentePrecio = `trade de la wallet (${precioTrade.toExponential(4)} SOL/token)`;
  } else if (precioDex && precioDex.precioSol >= 1e-15 && precioDex.precioSol <= 1e-2) {
    tokensBought = amountSol / precioDex.precioSol;
    precioCompraNative = precioDex.precioSol;
    pairAddress = precioDex.pairAddress;
    fuentePrecio = `DexScreener (${precioDex.dexId || origenDex || 'n/d'})`;
  } else if (precioDex) {
    log(
      'warn',
      `💰 ${symbol}: precio de DexScreener fuera de rango (${precioDex.precioSol.toExponential(4)} SOL/token). Usando fallback.`
    );
  }

  if (tokensBought === 0) {
    const priceAtBuy = bondingCurvePriceSol(trade);
    tokensBought = priceAtBuy ? amountSol / priceAtBuy : 0;
    fuentePrecio = priceAtBuy ? 'bonding curve (fallback)' : 'ninguna';
  }

  log(
    'info',
    `💰 ${symbol}: ${amountSol.toFixed(6)} SOL / ${fuentePrecio} → ${tokensBought.toFixed(6)} tokens`
  );

  if (!tokensBought || tokensBought <= 0) {
    log('warn', `⚠️ ${symbol}: tokensBought = 0. NO se crea posición.`);
    avisarUnaVez(
      `sinTokens:${tracked.alias}:${trade.mint}`,
      `⚠️ No copiado (${tracked.alias} → ${symbol}): no se pudo calcular la cantidad de tokens a comprar.`
    );
    return;
  }

  // P4: el "👀 compró …" se manda sólo cuando de verdad se va a copiar. Antes se
  // enviaba antes de las guardias, así que también llegaba por recompras ya
  // vistas / tokens ignorados (ese era el spam del mismo token).
  if (CHAT_ID) {
    bot.sendMessage(
      CHAT_ID,
      `👀 [${getLabel(tracked.chain)}${etiquetaOrigen}] ${tracked.alias} compró ${symbol} · ${solTxt} → ${tokensBought.toFixed(2)} tokens vía bot (${fuentePrecio})\n🔗 ${link}`
    );
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
        'INSERT INTO bot_positions (token_mint,symbol,chain,amount,cost_basis_sol,wallet_alias,modo,origen_dex,precio_compra_native,pair_address) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [trade.mint, symbol, tracked.chain, tokensBought, amountSol, tracked.alias, MODO_ACTUAL, origenDex, precioCompraNative, pairAddress]
      );
      await pool.query(
        'INSERT INTO seen_tokens VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [trade.traderPublicKey, trade.mint]
      );

      try {
        await sleep(4000);
        const saldoReal = await getBalanceDeTokenEnWallet(walletKeypair.publicKey.toBase58(), trade.mint);
        if (saldoReal !== null && saldoReal > 0) {
          await pool.query(
            'UPDATE bot_positions SET amount=$1 WHERE token_mint=$2 AND wallet_alias=$3 AND modo=$4',
            [saldoReal, trade.mint, tracked.alias, MODO_ACTUAL]
          );
          log('info', `✅ amount actualizado con saldo real: ${saldoReal} (era ${tokensBought.toFixed(6)})`);
        }
      } catch (e) {
        log('warn', `No se pudo verificar saldo real post-compra (${symbol}): ${e.message}`);
      }

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
      'INSERT INTO bot_positions (token_mint,symbol,chain,amount,cost_basis_sol,wallet_alias,modo,origen_dex,precio_compra_native,pair_address) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [trade.mint, symbol, tracked.chain, tokensBought, amountSol, tracked.alias, MODO_ACTUAL, origenDex, precioCompraNative, pairAddress]
    );
    await pool.query(
      'INSERT INTO seen_tokens VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [trade.traderPublicKey, trade.mint]
    );
    // Convención unificada de fees (14 oct 2026): el saldo se mueve EXACTAMENTE
    // por el PnL que se registra en trade_history. Al abrir se descuenta el mismo
    // costo que usará el cierre (cost_basis_sol = SOL netos de fees de compra) y
    // al cerrar se acredita el proceeds neto: el diferencial es r.profitSol.
    // Antes se descontaba `tracked.amount` ($4 brutos) y el saldo caía ~8% por
    // trade más rápido que la suma de los PnL.
    const costoUsd = solPrice ? amountSol * solPrice : tracked.amount;
    const nuevoSaldo = await adjustPaperBalance(-costoUsd);
    const saldoSeguro = Number.isFinite(nuevoSaldo) ? nuevoSaldo : INITIAL_PAPER_BALANCE;

    if (CHAT_ID) {
      bot.sendMessage(
        CHAT_ID,
        `🧪 PAPER: ${NOMBRE_BOT} copió a ${tracked.alias} - compró ${symbol} con ${amountSol.toFixed(4)} SOL (costo ~$${costoUsd.toFixed(2)}, mismo criterio que el PnL) · Saldo ficticio: $${saldoSeguro.toFixed(2)}`
      );
    }
    chequearRetraso(horaDeteccion, tracked.alias, symbol);
  }
}

// ---------- Venta ----------
async function handleTrackedSell(tracked, trade, origen = 'PumpPortal', horaDeteccion = null) {
  if (await estaCongelado()) {
    log('warn', `🧊 Congelado: venta de ${tracked.alias} ${trade.mint.slice(0, 6)}... ignorada`);
    return;
  }
  const lockKey = `${trade.mint}:${tracked.alias}`;
  if (ventasEnProceso.has(lockKey)) {
    log('warn', `⏸️ Venta duplicada ignorada para ${trade.mint.slice(0, 6)}... vía ${tracked.alias}`);
    return;
  }
  ventasEnProceso.add(lockKey);

  try {
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
        const proceedsSolOnChain = after - before;

        let proceedsSol = proceedsSolOnChain;
        const desdeTrade = calcularProceedsDesdeTradeReal(trade, position);
        if (desdeTrade && proceedsSolOnChain > 0) {
          const ratio = proceedsSolOnChain / desdeTrade.proceedsSol;
          if (ratio > 1.3 || ratio < 0.7) {
            log(
              'warn',
              `⚠️ REAL: proceeds on-chain (${proceedsSolOnChain.toFixed(6)} SOL) se desvía ${(ratio * 100).toFixed(0)}% del trade real (${desdeTrade.proceedsSol.toFixed(6)} SOL). Usando trade real.`
            );
            proceedsSol = desdeTrade.proceedsSol;
          }
        }

        const solPrice = await getSolPriceUSD();
        const r = calcularResultado(position.cost_basis_sol, proceedsSol, solPrice, false);

        if (!(await reclamarPosicionParaCierre(trade.mint, tracked.alias, symbol))) return;
        await registrarTradeCerrado(tracked.alias, symbol, r.profitSol);
        marcarSignatureProcesada(sig);

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
        msg += await lineaVerificacionOnChain(r, trade.mint, tracked.address);
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
      // PAPER: la salida se valora con el MOVIMIENTO DE PRECIO de la wallet
      // (precio de venta ÷ precio de compra). Así un `amount` corrupto no puede
      // fabricar una ganancia: el múltiplo queda pegado al de la wallet.
      const costBasis = Number(position.cost_basis_sol) || 0;
      const porProporcion = calcularProceedsPorProporcion(trade, position);
      const desdeTrade = calcularProceedsDesdeTradeReal(trade, position);

      let proceedsSol = null;
      let fuente = 'sin dato';
      let valoracionDudosa = false;

      if (porProporcion) {
        proceedsSol = porProporcion.proceedsSol;
        fuente = `${porProporcion.fuente}${porProporcion.clampado ? ' [tope aplicado]' : ''}`;
      } else if (desdeTrade) {
        proceedsSol = desdeTrade.proceedsSol;
        fuente = `${desdeTrade.fuente} (${desdeTrade.precioUnitario.toExponential(4)} SOL/token)`;
      }

      // Sin precio propio de la wallet, o con un valor imposiblemente bajo
      // (pata wSOL de la ruta): se intenta el mercado ANTES de cerrar. Con
      // proporción de la wallet NO se rescata: un -90% real también da <25%.
      if (!porProporcion && (proceedsSol === null || (costBasis > 0 && proceedsSol < costBasis * 0.25))) {
        const { decimals } = await getTokenInfoHelius(trade.mint);
        const mercado = await estimarValorEnSol(
          trade.mint,
          position.amount,
          decimals,
          position.origen_dex,
          position.precio_compra_native,
          30
        );
        const mercadoUtil =
          mercado.valorSol !== null &&
          (!costBasis || (mercado.valorSol >= costBasis * 0.05 && mercado.valorSol <= costBasis * 50));
        if (mercadoUtil) {
          proceedsSol = mercado.valorSol;
          fuente = `DexScreener/Jupiter (dex: ${mercado.dexId || 'n/d'}) [rescate de valoración]`;
        } else if (costBasis > 0) {
          proceedsSol = costBasis;
          fuente = 'cost_basis (sin valoración fiable: PnL 0)';
          valoracionDudosa = true;
        } else {
          proceedsSol = 0;
          fuente = 'sin dato ni coste (PnL 0)';
          valoracionDudosa = true;
        }
      }

      log('info', `🧪 PAPER proceeds para ${symbol}: ${proceedsSol.toFixed(6)} SOL (fuente: ${fuente})`);

      if (costBasis > 0 && proceedsSol > costBasis * 50) {
        log('warn', `⚠️ proceedsSol sospechoso para ${symbol}. Usando cost_basis.`);
        proceedsSol = costBasis;
      }
      if (proceedsSol < 0) proceedsSol = 0;

      let solPrice = await getSolPriceUSD();
      if (!solPrice) solPrice = 150;

      const r = calcularResultado(position.cost_basis_sol, proceedsSol, solPrice, true);
      const proceedsUsd = solPrice ? r.proceedsNetoSol * solPrice : tracked.amount;

      if (!(await reclamarPosicionParaCierre(trade.mint, tracked.alias, symbol))) return;
      await registrarTradeCerrado(tracked.alias, symbol, r.profitSol);
      const nuevoSaldo = await adjustPaperBalance(proceedsUsd);
      const saldoSeguro = Number.isFinite(nuevoSaldo) ? nuevoSaldo : INITIAL_PAPER_BALANCE;

      let msg = `🧪 PAPER: ${NOMBRE_BOT} vendió 100% ${symbol} (copiando a ${tracked.alias}) · Salí con (neto de fees): ${r.proceedsNetoSol.toFixed(4)} SOL (~$${proceedsUsd.toFixed(2)}) · costo: ${Number(position.cost_basis_sol).toFixed(4)} SOL · ${formatearResultado(r)} · Saldo ficticio: $${saldoSeguro.toFixed(2)}`;
      if (valoracionDudosa) {
        msg += `\n⚠️ Valuación no fiable (la wallet no deja pata de pago y no hay par válido): se cierra a costo, PnL 0.`;
      }
      if (proceedsSol > 0 && r.proceedsNetoSol === 0) {
        msg += `\n⚠️ El valor de salida (${proceedsSol.toFixed(6)} SOL) no cubre las fees de venta: se reporta -100%.`;
      }
      if (r.profitSol > 0) {
        msg += `\n💵 (simulado) ${r.profitSol.toFixed(4)} SOL de ganancia se convertirían a USDC`;
      }
      msg += await lineaVerificacionOnChain(r, trade.mint, tracked.address);
      if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);

      chequearRetraso(horaDeteccion, tracked.alias, symbol);
    }
  } finally {
    ventasEnProceso.delete(lockKey);
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

        if (!(await reclamarPosicionParaCierre(pos.token_mint, pos.wallet_alias, pos.symbol))) continue;
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
    const sw = await leerSweepConfig();
    txt += `💸 Retirado a ganancias: $${Number(sw.total_enviado_usd || 0).toFixed(2)}${LIVE ? '' : ' (simulado en PAPER)'}`;
    txt += SWEEP_ADDRESS ? ` → ${SWEEP_ADDRESS.slice(0, 6)}…${SWEEP_ADDRESS.slice(-4)}` : ' (sin wallet de retiro configurada)';
    txt += sw.ultimo_envio ? ` · último: ${new Date(sw.ultimo_envio).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ' · todavía ninguno';
    txt += `\n`;
    if (!LIVE) txt += `💸 Caja paper: $${paper.current_usdc.toFixed(2)} · base $${Number(sw.base_usd).toFixed(2)} · monto $${Number(sw.monto_usd).toFixed(2)} (${sw.activo ? 'activo' : 'apagado'})\n`;
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
/close <alias> <mint> – Cierra manualmente una posición (el bot vende)
/closeall <alias> – Cierra todas las posiciones de una wallet (el bot vende)

⚙️ SISTEMA:
/status – Estado general del bot
/cleanup – Limpia posiciones de wallets borradas
/freeze – FRENA el bot por completo (no compra ni vende) hasta /unfreeze
/unfreeze – Reactiva el bot tras un /freeze
/seguridad – Muestra el estado de los candados (destino permitido, topes, clave)
/sweep [base|monto|on|off|ahora] - Retiro de ganancias a tu otra wallet (ej: /sweep base 100, /sweep monto 20)
/logs [n] - Ultimas n lineas del log (default 60), sin acceso a Railway
/resetpaper – Reinicia el modo PAPER: balance a $${INITIAL_PAPER_BALANCE}, sin posiciones ni historial
/fixwebhook – Fuerza la recreación del webhook en Helius
/help – Esta ayuda
`;
  bot.sendMessage(msg.chat.id, ayuda);
});

// /positions (incluye mint para facilitar /close)
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

// ---------- Cierre manual (PAPER y REAL) ----------

// Calcula proceeds para cierre manual en PAPER.
// Prioridad:
//   1. DexScreener con filtro 30x (usando precio_compra_native)
//   2. Jupiter (si DexScreener falla)
//   3. cost_basis (PnL = 0) si todo falla
async function calcularProceedsParaCierreManual(pos) {
  const costBasis = Number(pos.cost_basis_sol) || 0;

  // 1. DexScreener con validaciones
  try {
    const { decimals } = await getTokenInfoHelius(pos.token_mint);
    const resultado = await estimarValorEnSol(
      pos.token_mint,
      pos.amount,
      decimals,
      pos.origen_dex,
      pos.precio_compra_native
    );

    if (resultado.error === 'NOT_TRADABLE') {
      log('warn', `🔍 Cierre manual PAPER ${pos.symbol}: token no tradable en Jupiter. Usando cost_basis.`);
      return { proceedsSol: costBasis, fuente: 'cost_basis (no tradable)' };
    }

    if (resultado.valorSol !== null && resultado.valorSol > 0) {
      let proceeds = resultado.valorSol;

      // Validaciones 50x / 0.001x
      if (costBasis > 0 && proceeds > costBasis * 50) {
        log('warn', `⚠️ Cierre manual PAPER ${pos.symbol}: proceeds ${proceeds.toFixed(6)} SOL sospechosamente alto vs cost_basis ${costBasis.toFixed(4)}. Usando cost_basis.`);
        proceeds = costBasis;
      }
      if (costBasis > 0 && proceeds < costBasis * 0.001) {
        log('warn', `⚠️ Cierre manual PAPER ${pos.symbol}: proceeds ${proceeds.toFixed(6)} SOL sospechosamente bajo vs cost_basis ${costBasis.toFixed(4)}. Usando cost_basis.`);
        proceeds = costBasis;
      }

      return { proceedsSol: proceeds, fuente: `DexScreener/Jupiter (dex: ${resultado.dexId || 'n/d'})` };
    }
  } catch (e) {
    log('warn', `🔍 Cierre manual PAPER ${pos.symbol}: error en estimarValorEnSol: ${e.message}`);
  }

  // 2. Fallback: cost_basis
  log('warn', `🔍 Cierre manual PAPER ${pos.symbol}: sin cotización, usando cost_basis (PnL = 0).`);
  return { proceedsSol: costBasis, fuente: 'cost_basis (fallback)' };
}

// /close <alias> <mint> — cierra 100%, sin confirmación
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

    // ============ PAPER ============
    if (MODO_ACTUAL === 'paper') {
      const { rows: trackedRows } = await pool.query(
        'SELECT address FROM tracked_wallets WHERE alias=$1',
        [alias]
      );
      const walletAddress = trackedRows[0]?.address || alias;

      const { proceedsSol, fuente } = await calcularProceedsParaCierreManual(pos);

      let solPrice = await getSolPriceUSD();
      if (!solPrice) {
        log('warn', '⚠️ Sin precio de SOL disponible, usando fallback 150 USD para no abortar el cierre');
        solPrice = 150;
      }

      const r = calcularResultado(pos.cost_basis_sol, proceedsSol, solPrice, true);
      const proceedsUsd = solPrice ? r.proceedsNetoSol * solPrice : 0;

      if (!(await reclamarPosicionParaCierre(pos.token_mint, pos.wallet_alias, pos.symbol))) {
        bot.sendMessage(msg.chat.id, `↪️ ${pos.symbol} ya estaba cerrada (se cerró por otro camino).`);
        return;
      }
      await pool.query(
        'DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
        [walletAddress, pos.token_mint]
      );
      await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
      const nuevoSaldo = await adjustPaperBalance(proceedsUsd);
      const saldoSeguro = Number.isFinite(nuevoSaldo) ? nuevoSaldo : INITIAL_PAPER_BALANCE;

      bot.sendMessage(
        msg.chat.id,
        `🖐️ CIERRE MANUAL PAPER [${pos.wallet_alias}] ${pos.symbol}\n` +
        `Fuente: ${fuente}\n` +
        `Salí con (neto de fees): ${r.proceedsNetoSol.toFixed(4)} SOL (~$${proceedsUsd.toFixed(2)})\n` +
        `Costo: ${Number(pos.cost_basis_sol).toFixed(4)} SOL\n` +
        `${formatearResultado(r)}\n` +
        `Saldo ficticio: $${saldoSeguro.toFixed(2)}`
      );
      log('info', `🖐️ Cierre manual PAPER [${pos.wallet_alias}] ${pos.symbol}: ${formatearResultado(r)} (fuente: ${fuente})`);
      return;
    }

    // ============ REAL ============
    if (!LIVE || !walletKeypair || !connection) {
      bot.sendMessage(msg.chat.id, '❌ No se puede vender: wallet o conexión RPC no disponibles.');
      return;
    }

    bot.sendMessage(msg.chat.id, `⏳ Cerrando posición REAL [${alias}] ${pos.symbol}...`);

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
      const proceedsSolOnChain = after - before;

      // Validación cruzada con trade real (si existiera reciente, no en cierre manual)
      // En cierre manual no hay trade reciente de la wallet, así que usamos on-chain puro.
      let proceedsSol = proceedsSolOnChain;
      if (proceedsSol < 0) {
        log('warn', `⚠️ Cierre manual REAL ${pos.symbol}: proceeds negativos (${proceedsSol}). Usando 0.`);
        proceedsSol = 0;
      }

      const solPrice = await getSolPriceUSD();
      const r = calcularResultado(pos.cost_basis_sol, proceedsSol, solPrice, false);

      // 1. Reclamar posición (si ya no está, otro camino la cerró)
      if (!(await reclamarPosicionParaCierre(pos.token_mint, pos.wallet_alias, pos.symbol))) {
        bot.sendMessage(msg.chat.id, `↪️ ${pos.symbol} ya estaba cerrada (se cerró por otro camino).`);
        return;
      }
      await pool.query(
        'DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
        [pos.wallet_address || alias, pos.token_mint]
      );

      // 2. Registrar el trade
      await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);

      // 3. Marcar la signature como procesada para que detectarVentasManuales no la procese de nuevo
      marcarSignatureProcesada(sig);

      // 4. Mensaje
      let mensaje =
        `🖐️ CIERRE MANUAL REAL [${pos.wallet_alias}] ${pos.symbol}\n` +
        `Salí con: ${proceedsSol.toFixed(4)} SOL\n` +
        `${formatearResultado(r)}\n` +
        `tx: ${linkTx(sig)}`;

      if (r.profitSol > 0) {
        const usdcSig = await swapProfitToUsdc(r.profitSol);
        mensaje += usdcSig
          ? `\n💵 Ganancia convertida a USDC · tx: ${linkTx(usdcSig)}`
          : `\n⚠️ No se pudo convertir la ganancia a USDC`;
      }

      const rentRecuperado = await cerrarCuentaDelToken(pos.token_mint);
      if (rentRecuperado) {
        mensaje += `\n♻️ Cuenta cerrada, recuperado: ${rentRecuperado.toFixed(5)} SOL de rent`;
      }

      const saldoFinal = await getWalletSolBalance();
      mensaje += `\n💰 Saldo total: ${saldoFinal.toFixed(4)} SOL`;

      bot.sendMessage(msg.chat.id, mensaje);
      log('info', `🖐️ Cierre manual REAL [${pos.wallet_alias}] ${pos.symbol}: ${formatearResultado(r)}`);
    } catch (e) {
      log('error', `Error en /close REAL: ${e.message}`);
      if (esSellZeroAmount(e)) {
        // Posición fantasma
        await pool.query(
          'DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
          [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]
        );
        await pool.query(
          'DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
          [pos.wallet_address || alias, pos.token_mint]
        );
        bot.sendMessage(
          msg.chat.id,
          `🧹 [${pos.wallet_alias}] ${pos.symbol}: posición fantasma eliminada — la compra original nunca se ejecutó de verdad. No se cuenta como pérdida.`
        );
      } else {
        // A: dejar la posición abierta, avisar, se reintenta en reconciliación
        bot.sendMessage(
          msg.chat.id,
          `❌ No se pudo cerrar [${pos.wallet_alias}] ${pos.symbol}: ${mensajeAmigableError(e)}\n` +
          `La posición sigue abierta. Se reintentará en el próximo ciclo de reconciliación, o puedes volver a mandar /close.`
        );
      }
    }
  } catch (e) {
    log('error', `Error en /close: ${e.message}`);
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// /closeall <alias> — cierra todas las posiciones de una wallet, sin confirmación
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

    bot.sendMessage(
      msg.chat.id,
      `⏳ Cerrando ${posRes.rows.length} posiciones [${alias}] en modo ${MODO_ACTUAL.toUpperCase()}...`
    );

    // ============ PAPER ============
    if (MODO_ACTUAL === 'paper') {
      let solPrice = await getSolPriceUSD();
      if (!solPrice) solPrice = 150;

      let cerradas = 0;
      let pnlTotalSol = 0;
      let usdTotal = 0;
      const simbolos = [];

      for (const pos of posRes.rows) {
        const { proceedsSol, fuente } = await calcularProceedsParaCierreManual(pos);
        const r = calcularResultado(pos.cost_basis_sol, proceedsSol, solPrice, true);
        const proceedsUsd = solPrice ? r.proceedsNetoSol * solPrice : 0;

        if (!(await reclamarPosicionParaCierre(pos.token_mint, pos.wallet_alias, pos.symbol))) continue;
        await adjustPaperBalance(proceedsUsd);
        await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
        await pool.query(
          'DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
          [walletAddress, pos.token_mint]
        );

        pnlTotalSol += r.profitSol;
        usdTotal += proceedsUsd;
        cerradas++;
        simbolos.push(`${pos.symbol} (${formatearResultado(r)})`);
        log('info', `🖐️ /closeall PAPER ${pos.symbol}: ${formatearResultado(r)} (fuente: ${fuente})`);
      }

      const emoji = pnlTotalSol >= 0 ? '🟢' : '🔴';
      let txt = `🖐️ ${cerradas} posiciones cerradas manualmente [${alias}] (PAPER)\n`;
      txt += `Tokens: ${simbolos.join(', ')}\n`;
      txt += `PnL total estimado: ${emoji} ${pnlTotalSol >= 0 ? '+' : ''}${pnlTotalSol.toFixed(4)} SOL (~$${usdTotal.toFixed(2)})`;
      bot.sendMessage(msg.chat.id, txt);
      log('info', `🖐️ /closeall PAPER ${alias}: ${cerradas} posiciones cerradas, PnL: ${pnlTotalSol.toFixed(4)} SOL`);
      return;
    }

    // ============ REAL ============
    if (!LIVE || !walletKeypair || !connection) {
      bot.sendMessage(msg.chat.id, '❌ No se puede vender: wallet o conexión RPC no disponibles.');
      return;
    }

    let cerradas = 0;
    let pnlTotalSol = 0;
    let usdTotal = 0;
    const simbolos = [];
    const errores = [];

    for (const pos of posRes.rows) {
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
        let proceedsSol = after - before;
        if (proceedsSol < 0) proceedsSol = 0;

        const solPrice = await getSolPriceUSD();
        const r = calcularResultado(pos.cost_basis_sol, proceedsSol, solPrice, false);

        if (!(await reclamarPosicionParaCierre(pos.token_mint, pos.wallet_alias, pos.symbol))) continue;
        await pool.query(
          'DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
          [walletAddress, pos.token_mint]
        );
        await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
        marcarSignatureProcesada(sig);

        // Convertir ganancia a USDC si aplica
        if (r.profitSol > 0) {
          try {
            await swapProfitToUsdc(r.profitSol);
          } catch (_) {}
        }

        // Cerrar cuenta
        try {
          await cerrarCuentaDelToken(pos.token_mint);
        } catch (_) {}

        pnlTotalSol += r.profitSol;
        if (solPrice) usdTotal += r.proceedsNetoSol * solPrice;
        cerradas++;
        simbolos.push(`${pos.symbol} (${formatearResultado(r)})`);
        log('info', `🖐️ /closeall REAL ${pos.symbol}: ${formatearResultado(r)} · tx: ${sig}`);
      } catch (e) {
        log('error', `Error cerrando ${pos.symbol} en /closeall: ${e.message}`);
        if (esSellZeroAmount(e)) {
          await pool.query(
            'DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3',
            [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]
          );
          await pool.query(
            'DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2',
            [walletAddress, pos.token_mint]
          );
          simbolos.push(`${pos.symbol} (fantasma eliminada)`);
          cerradas++;
        } else {
          errores.push(`${pos.symbol}: ${mensajeAmigableError(e)}`);
        }
      }
    }

    const emoji = pnlTotalSol >= 0 ? '🟢' : '🔴';
    let txt = `🖐️ ${cerradas} posiciones cerradas manualmente [${alias}] (REAL)\n`;
    txt += `Tokens: ${simbolos.join(', ')}\n`;
    if (usdTotal > 0 || cerradas > 0) {
      txt += `PnL total: ${emoji} ${pnlTotalSol >= 0 ? '+' : ''}${pnlTotalSol.toFixed(4)} SOL`;
      if (usdTotal !== 0) txt += ` (~$${usdTotal.toFixed(2)})`;
    }
    if (errores.length > 0) {
      txt += `\n\n⚠️ Errores en ${errores.length}:\n${errores.join('\n')}`;
    }
    const saldoFinal = await getWalletSolBalance();
    txt += `\n💰 Saldo total: ${saldoFinal.toFixed(4)} SOL`;

    bot.sendMessage(msg.chat.id, txt);
    log('info', `🖐️ /closeall REAL ${alias}: ${cerradas} cerradas, PnL: ${pnlTotalSol.toFixed(4)} SOL, errores: ${errores.length}`);
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
      `SELECT SUM(profit_sol) as realized_sol, COUNT(*)::int AS n FROM trade_history WHERE modo = $1`,
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
    let posicionesNoTradables = 0;

    if (pos.length > 0) {
      for (const p of pos) {
        const { decimals } = await getTokenInfoHelius(p.token_mint);
        const resultado = await estimarValorEnSol(
          p.token_mint,
          p.amount,
          decimals,
          p.origen_dex,
          p.precio_compra_native
        );

        if (resultado.error === 'NOT_TRADABLE') {
          unrealizedSol += 0 - (Number(p.cost_basis_sol) || 0);
          posicionesNoTradables++;
        } else if (resultado.valorSol !== null) {
          unrealizedSol += resultado.valorSol - (Number(p.cost_basis_sol) || 0);
        }
      }
    }

    const totalSol = realizedSol + unrealizedSol;
    const emoji = totalSol >= 0 ? '🟢' : '🔴';

    let txt = `💰 PnL ${MODO_ACTUAL.toUpperCase()} ${emoji}\n`;
    txt += `🔒 Realizado: ${realizedSol.toFixed(4)} SOL\n`;
    if (pos.length > 0) {
      txt += `📈 No realizado: ${unrealizedSol.toFixed(4)} SOL (${pos.length} pos abiertas)\n`;
      if (posicionesNoTradables > 0) {
        txt += `⚠️ ${posicionesNoTradables} posiciones con tokens no tradables (contadas como pérdida total)\n`;
      }
    }
    txt += `🧮 Total: ${totalSol.toFixed(4)} SOL`;
    const solPrice = await getSolPriceUSD();
    if (solPrice) txt += ` (~$${(totalSol * solPrice).toFixed(2)})`;

    // Chequeo de consistencia (solo PAPER): saldo real de la tabla vs lo que el
    // PnL dice que debería ser. Con la convención unificada:
    //   saldo = inicial + realizado×precio − costo de las posiciones abiertas
    if (!LIVE && solPrice) {
      const costoAbiertoUsd = pos.reduce((a, p) => a + (Number(p.cost_basis_sol) || 0), 0) * solPrice;
      const paper = await getPaperBalance();
      const deltaSaldo = paper.current_usdc - paper.initial_usdc;
      const esperado = realizedSol * solPrice - costoAbiertoUsd;
      // Tolerancia: el saldo es en USD y el PnL en SOL, así que la deriva del
      // precio de SOL entre la apertura y el cierre deja ~2 centavos por trade.
      const nTrades = Number(hist[0]?.n || 0);
      const tol = 0.05 + 0.02 * nTrades;
      const cuadra = Math.abs(deltaSaldo - esperado) < tol;
      txt +=
        `\n⚖️ Chequeo saldo: $${paper.initial_usdc.toFixed(2)} → $${paper.current_usdc.toFixed(2)} (${deltaSaldo >= 0 ? '+' : ''}${deltaSaldo.toFixed(2)})` +
        `\n   esperado = realizado ${(realizedSol * solPrice).toFixed(2)} − costo abierto ${costoAbiertoUsd.toFixed(2)} = ${esperado.toFixed(2)} ${cuadra ? '✅' : '⚠️ no cuadra'} (tolerancia ±$${tol.toFixed(2)})`;
    }

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

// /freeze — frena el bot por completo (no compra ni vende hasta /unfreeze)
bot.onText(/\/freeze/, async (msg) => {
  if (!esAdmin(msg)) return;
  try {
    await pool.query(
      'INSERT INTO bot_seguridad (id, congelado) VALUES (1, TRUE) ON CONFLICT (id) DO UPDATE SET congelado=TRUE'
    );
    log('warn', '🧊 Bot CONGELADO por el admin (/unfreeze para reactivar)');
    bot.sendMessage(msg.chat.id, '🧊 Bot CONGELADO: no ejecutará compras ni ventas hasta que uses /unfreeze.');
  } catch (e) {
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// /unfreeze — reactiva el bot
bot.onText(/\/unfreeze/, async (msg) => {
  if (!esAdmin(msg)) return;
  try {
    await pool.query(
      'INSERT INTO bot_seguridad (id, congelado) VALUES (1, FALSE) ON CONFLICT (id) DO UPDATE SET congelado=FALSE'
    );
    log('info', '🔓 Bot reactivado por el admin (/unfreeze)');
    bot.sendMessage(msg.chat.id, '🔓 Bot reactivado: vuelve a operar con normalidad.');
  } catch (e) {
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});

// /seguridad — estado de los candados y de la custodia de la clave
bot.onText(/\/seguridad/, async (msg) => {
  if (!esAdmin(msg)) return;
  try {
    const congelado = await estaCongelado();
    const gastado = await gastoDiario();
    const solBal = LIVE && connection && walletKeypair ? await getWalletSolBalance() : null;
    let txt = `🔐 Estado de seguridad\n`;
    txt += `🧊 Congelado: ${congelado ? 'SÍ (/unfreeze para reactivar)' : 'no'}\n`;
    txt += `🎯 Destino permitido: ${ALLOWED_WITHDRAW_ADDRESS}\n`;
    txt += `💸 Gasto de hoy: ${gastado.toFixed(4)} / ${MAX_DAILY_SPEND_SOL} SOL\n`;
    txt += `🛡️ Tope por operación: ${MAX_TRADE_SOL} SOL\n`;
    txt += `💸 Retiro de ganancias: ${SWEEP_ADDRESS ? 'destino ' + SWEEP_ADDRESS : 'sin destino (desactivado)'}\n`;
    if (solBal !== null) txt += `💰 Saldo wallet: ${solBal.toFixed(4)} SOL\n`;
    txt += `🔑 Clave privada desde: ${fuenteClaveWallet || 'no cargada'}\n`;
    if (fuenteClaveWallet && fuenteClaveWallet.includes('variable de entorno')) {
      txt += `🔒 Si esa variable NO está sellada en Railway (Seal), cualquiera con acceso al panel o a un token puede leerla.\n`;
    }
    bot.sendMessage(msg.chat.id, txt);
  } catch (e) {
    bot.sendMessage(msg.chat.id, 'Error: ' + e.message);
  }
});
// /resetpaper — reinicia el modo PAPER de cero (balance, posiciones, historial)
// /sweep - estado y configuracion del retiro de ganancias
bot.onText(/\/sweep(?:\s+(.+))?/, async (msg, match) => {
  if (!esAdmin(msg)) return;
  const chat = msg.chat.id;
  const args = (match[1] || '').trim().split(/\s+/).filter(Boolean);
  const sub = (args[0] || 'estado').toLowerCase();
  try {
    const cfg = await leerSweepConfig();

    if (sub === 'base' || sub === 'monto') {
      const n = parseFloat((args[1] || '').replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > SWEEP_MAX_USD) {
        return bot.sendMessage(chat, `Uso: /sweep ${sub} <USD> (0 a ${SWEEP_MAX_USD})`);
      }
      if (sub === 'base') {
        await guardarSweepConfig({ base_usd: n });
      } else {
        if (n <= 0) return bot.sendMessage(chat, 'El monto a enviar debe ser mayor que 0.');
        await guardarSweepConfig({ monto_usd: n });
      }
      return bot.sendMessage(
        chat,
        `OK: ${sub === 'base' ? 'Base' : 'Monto a enviar'} = $${n.toFixed(2)}${LIVE ? '' : ' (modo PAPER: solo simula)'}`
      );
    }

    if (sub === 'on' || sub === 'off') {
      await guardarSweepConfig({ activo: sub === 'on' });
      return bot.sendMessage(chat, `Retiro de ganancias ${sub === 'on' ? 'ACTIVADO' : 'APAGADO'}`);
    }

    if (sub === 'ahora') {
      const r = await ejecutarSweep({ forzar: true });
      if (r.ok && r.simulado) {
        return bot.sendMessage(chat, `PAPER: retiro simulado de $${r.monto.toFixed(2)} → ${SWEEP_ADDRESS || 'sin destino'} · saldo paper $${Number(r.saldoNuevo).toFixed(2)}`);
      }
      if (r.ok) return bot.sendMessage(chat, `Enviado $${r.monto.toFixed(2)} via ${r.via} -> ${SWEEP_ADDRESS}`);
      return bot.sendMessage(chat, `No se envio nada: ${r.motivo}`);
    }

    const caja = await valorCajaUsd().catch(() => null);
    let txt = '*Retiro de ganancias*\n';
    txt += `Estado: ${cfg.activo ? 'activo' : 'apagado'}\n`;
    txt += `Base (capital que se queda): $${Number(cfg.base_usd).toFixed(2)}\n`;
    txt += `Monto a enviar: $${Number(cfg.monto_usd).toFixed(2)}\n`;
    txt += `Destino: ${SWEEP_ADDRESS || 'FALTA SWEEP_ADDRESS en Railway'}\n`;
    if (caja) {
      txt += caja.paper
        ? `Caja (saldo PAPER simulado): $${caja.total.toFixed(2)}\n`
        : `Caja ahora: $${caja.total.toFixed(2)} (${caja.sol.toFixed(4)} SOL + $${caja.usdc.toFixed(2)} USDC)\n`;
      txt += `Excedente sobre la base: $${(caja.total - Number(cfg.base_usd)).toFixed(2)}\n`;
    }
    txt += `Enviado historico: $${Number(cfg.total_enviado_usd || 0).toFixed(2)}\n`;
    txt += `Ultimo envio: ${cfg.ultimo_envio ? new Date(cfg.ultimo_envio).toLocaleString('es-MX') : 'nunca'}\n`;
    txt += `Modo: ${LIVE ? 'REAL' : 'PAPER (solo simula)'}\n\n`;
  if (!LIVE) txt += `Las cifras son del saldo simulado; la wallet real de Solana no se toca en PAPER.\n`;
    txt += 'Comandos: /sweep base 100 - /sweep monto 20 - /sweep on|off - /sweep ahora';
    bot.sendMessage(chat, txt, { parse_mode: 'Markdown' });
  } catch (e) {
    bot.sendMessage(chat, 'Error: ' + e.message);
  }
});

// /logs [n] - ultimas lineas del log (para diagnosticar sin acceso a Railway)
bot.onText(/\/logs(?:\s+(\d+))?/, async (msg, match) => {
  if (!esAdmin(msg)) return;
  const chat = msg.chat.id;
  const n = Math.min(parseInt(match[1] || '60', 10) || 60, 200);
  const seleccion = ULTIMOS_LOGS.slice(-n);
  if (!seleccion.length) return bot.sendMessage(chat, 'Sin logs en memoria todavia.');
  const NL = String.fromCharCode(10);
  const texto = seleccion.join(NL);
  const trozos = [];
  for (let i = 0; i < texto.length; i += 3500) trozos.push(texto.slice(i, i + 3500));
  // Texto PLANO a propósito: los logs traen `_`, `*`, `[`, backticks y demás
  // que rompen el parser de Markdown, y Telegram rechazaba el mensaje entero
  // (síntoma: /logs no contestaba nada mientras el resto de comandos sí).
  for (const t of trozos.slice(-3)) {
    try {
      await bot.sendMessage(chat, t);
    } catch (e) {
      log('warn', `No se pudo enviar un bloque de /logs: ${e.message}`);
    }
  }
});

bot.onText(/\/resetpaper/, async (msg) => {
  if (!esAdmin(msg)) return;
  try {
    const { rows } = await pool.query(
      `UPDATE global_balance SET initial_usdc=$1, current_usdc=$1 WHERE id=1 RETURNING current_usdc`,
      [INITIAL_PAPER_BALANCE]
    );
    const { rowCount: pos } = await pool.query(`DELETE FROM bot_positions WHERE modo='paper'`);
    const { rowCount: hist } = await pool.query(`DELETE FROM trade_history WHERE modo='paper'`);
    const { rowCount: vistos } = await pool.query(
      `DELETE FROM seen_tokens WHERE token_mint NOT IN (SELECT token_mint FROM bot_positions)`
    );
    const saldo = Number(rows[0]?.current_usdc ?? INITIAL_PAPER_BALANCE);
    bot.sendMessage(
      msg.chat.id,
      `♻️ PAPER reiniciado de cero:\n💰 Balance: $${saldo.toFixed(2)}\n📉 Posiciones borradas: ${pos}\n📜 Historial borrado: ${hist}\n🧹 Seen tokens limpiados: ${vistos}`
    );
  } catch (e) {
    log('error', `Error en /resetpaper: ${e.message}`);
    bot.sendMessage(msg.chat.id, '❌ Error en /resetpaper: ' + e.message);
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
  
  // WS de PumpPortal desactivado — dependemos solo de Helius
  // conectarWS();
  crearOActualizarWebhookHelius();
  iniciarServidorWebhook();

  // (c) Red de seguridad: 20 s en vez de 60 s. Las ventas de wallets tipo app que
// no se puedan valorar por la tx se cierran por aquí, y cada minuto cuenta en
// estos tokens. El doble cierre está cubierto por el reclamo atómico.
  intervals.push(setInterval(reconciliarPosiciones, 20_000));
  intervals.push(setInterval(revisarStopLoss, 60_000));
  intervals.push(setInterval(monitoreoAutomaticoWebhook, 600_000));
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
      log('info', `💓 Heartbeat modo=${MODO_ACTUAL} WS=${ws ? ws.readyState : 'null'}`);
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
