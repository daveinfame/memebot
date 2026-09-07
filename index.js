// ========= MEMEBOT REAL TRADING - R0/R0.5/R1/R2/R3/R5 + SALDO PAPER + SUSCRIPCION EN VIVO + POSICIONES POR WALLET + API KEY DE PUMPPORTAL =========
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const { Pool } = require('pg');
const { Connection, Keypair, PublicKey, VersionedTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const CHAT_ID = process.env.CHAT_ID;

// La API key es obligatoria para subscribeAccountTrade (sin ella, PumpPortal ignora la suscripción sin avisar)
if (!process.env.PUMPPORTAL_API_KEY) {
  console.error('⚠️ FALTA PUMPPORTAL_API_KEY - las wallets trackeadas NO se van a poder vigilar sin esto');
}
const PUMP_PORTAL_WS = `wss://pumpportal.fun/api/data?api-key=${process.env.PUMPPORTAL_API_KEY || ''}`;
const PUMP_PORTAL_TRADE = 'https://pumpportal.fun/api/trade-local';
const JUPITER_QUOTE = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP = 'https://quote-api.jup.ag/v6/swap';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PUMPPORTAL_WALLET = 'Guao96aNr7GUj3CSspwLy3tEccL3RUh5xVT4W3KNfBUH'; // wallet ligada a tu API key, para saber cuánto SOL le queda

const LIVE = process.env.LIVE_TRADING === 'true';
const DUST_MIN_SOL = 0.05;
const INITIAL_PAPER_BALANCE = parseFloat(process.env.INITIAL_USDC || '1000');

let connection = null;
let walletKeypair = null;
let ws = null;
let totalMensajesRecibidos = 0;
let primerMensajeConfirmado = false;
let mensajesDesdeUltimoResumen = 0;

try {
  if (process.env.HELIUS_RPC_URL) connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
  if (process.env.WALLET_PRIVATE_KEY) walletKeypair = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY));
  if (walletKeypair) console.log('Wallet Solana cargada:', walletKeypair.publicKey.toBase58());
} catch (e) {
  console.error('Error cargando wallet/RPC de Solana:', e.message);
}

const CHAIN_CONFIG = {
  sol: { id: 'solana', name: 'SOLANA' },
  eth: { id: 'eth', name: 'ETH' },
  base: { id: 'base', name: 'BASE' },
  bsc: { id: 'bnb', name: 'BSC' },
  rh: { id: 'rh', name: 'ROBINHOOD CHAIN 4663' },
  robinhood: { id: 'rh', name: 'ROBINHOOD CHAIN 4663' },
  hype: { id: 'hyperliquid', name: 'HYPE EVM 999' }
};
function normalizeChain(c) { return (CHAIN_CONFIG[c.toLowerCase()] || { id: 'solana' }).id; }
function getLabel(c) { const f = Object.values(CHAIN_CONFIG).find(v => v.id === c); return f ? f.name : c.toUpperCase(); }

function subscribeWallet(address) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ method: 'subscribeAccountTrade', keys: [address] }));
    console.log('Suscrito en vivo a', address);
  } else {
    console.log('WS no está listo todavía, la wallet se suscribirá en la próxima reconexión');
  }
}

async function logWatchList() {
  try {
    const { rows } = await pool.query('SELECT alias FROM tracked_wallets ORDER BY alias');
    if (rows.length === 0) { console.log('Escuchando: ninguna wallet agregada todavía'); return; }
    console.log(`Escuchando: ${rows.map(r => r.alias).join(', ')} (${rows.length} wallets)`);
  } catch (e) { console.error('Error listando wallets vigiladas:', e.message); }
}

async function getPumpPortalWalletBalance() {
  if (!connection) return null;
  try {
    const lamports = await connection.getBalance(new PublicKey(PUMPPORTAL_WALLET));
    return lamports / LAMPORTS_PER_SOL;
  } catch (e) { console.error('Error consultando saldo de PumpPortal:', e.message); return null; }
}

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tracked_wallets (alias TEXT PRIMARY KEY, address TEXT, amount REAL, chain TEXT);
      CREATE TABLE IF NOT EXISTS seen_tokens (wallet_address TEXT, token_mint TEXT, PRIMARY KEY (wallet_address, token_mint));
      CREATE TABLE IF NOT EXISTS bot_positions (token_mint TEXT, symbol TEXT, chain TEXT, amount REAL);
      ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS cost_basis_sol REAL;
      ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS wallet_alias TEXT;
      CREATE TABLE IF NOT EXISTS global_balance (id INT PRIMARY KEY, initial_usdc REAL, current_usdc REAL);
      INSERT INTO global_balance (id, initial_usdc, current_usdc)
        VALUES (1, ${INITIAL_PAPER_BALANCE}, ${INITIAL_PAPER_BALANCE})
        ON CONFLICT (id) DO NOTHING;
    `);
    console.log('DB OK');
  } catch (e) { console.error('DB Error', e); }

  try {
    await pool.query(`DELETE FROM bot_positions WHERE wallet_alias IS NULL;`);
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
    console.log('Migración de posiciones por wallet OK');
  } catch (e) { console.error('Error migrando bot_positions:', e.message); }
}

async function getPaperBalance() {
  const { rows } = await pool.query('SELECT * FROM global_balance WHERE id=1');
  return rows[0] || { initial_usdc: INITIAL_PAPER_BALANCE, current_usdc: INITIAL_PAPER_BALANCE };
}

async function adjustPaperBalance(deltaUsd) {
  const { rows } = await pool.query('UPDATE global_balance SET current_usdc = current_usdc + $1 WHERE id=1 RETURNING current_usdc', [deltaUsd]);
  return rows[0]?.current_usdc;
}

async function getHoldings(address) {
  try {
    const res = await fetch(`https://pumpportal.fun/api/data/holdings?address=${address}`);
    const data = await res.json(); return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function getSolPriceUSD() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await res.json();
    return data.solana.usd;
  } catch (e) { console.error('Error precio SOL:', e.message); return null; }
}

function bondingCurvePriceSol(trade) {
  if (!trade.vSolInBondingCurve || !trade.vTokensInBondingCurve) return null;
  return trade.vSolInBondingCurve / trade.vTokensInBondingCurve;
}

async function getWalletSolBalance() {
  if (!connection || !walletKeypair) return 0;
  const lamports = await connection.getBalance(walletKeypair.publicKey);
  return lamports / LAMPORTS_PER_SOL;
}

async function pumpPortalTrade({ action, mint, amount, denominatedInSol, slippage = 10, priorityFee = 0.0005, pool = 'pump' }) {
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
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

async function swapProfitToUsdc(amountSol) {
  try {
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
    if (lamports <= 0) return null;
    const quoteRes = await fetch(`${JUPITER_QUOTE}?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=${lamports}&slippageBps=100`);
    const quote = await quoteRes.json();
    const swapRes = await fetch(JUPITER_SWAP, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteResponse: quote, userPublicKey: walletKeypair.publicKey.toBase58(), wrapAndUnwrapSol: true })
    });
    const { swapTransaction } = await swapRes.json();
    const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
    tx.sign([walletKeypair]);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction(sig, 'confirmed');
    return sig;
  } catch (e) { console.error('Error swap a USDC:', e.message); return null; }
}

async function handleTrackedBuy(tracked, trade) {
  const solPaid = trade.solAmount || 0;
  if (solPaid < DUST_MIN_SOL) { console.log(`Dust ignorado ${tracked.alias} ${trade.symbol} (${solPaid} SOL)`); return; }

  if (CHAT_ID) bot.sendMessage(CHAT_ID, `👀 [${getLabel(tracked.chain)}] ${tracked.alias} compró ${trade.symbol} · ${solPaid.toFixed(3)} SOL`);

  const seen = await pool.query('SELECT 1 FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [trade.traderPublicKey, trade.mint]);
  if (seen.rows.length > 0) {
    console.log(`R2: recompra/ya visto ignorado ${tracked.alias} ${trade.symbol}`);
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `↪️ No copiado (recompra o ya visto)`);
    return;
  }
  await pool.query('INSERT INTO seen_tokens VALUES ($1,$2) ON CONFLICT DO NOTHING', [trade.traderPublicKey, trade.mint]);

  const existingPos = await pool.query('SELECT 1 FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2', [trade.mint, tracked.alias]);
  if (existingPos.rows.length > 0) {
    console.log('R2: posición ya abierta con esta wallet, ignorado');
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `↪️ No copiado (ya tienes posición abierta en este token vía ${tracked.alias})`);
    return;
  }

  if (tracked.chain !== 'solana') {
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `↪️ No copiado (esta cadena solo genera alertas, no ejecución)`);
    return;
  }

  const solPrice = await getSolPriceUSD();
  if (!solPrice) { console.error('No se pudo obtener precio de SOL, se aborta compra'); return; }
  const amountSol = tracked.amount / solPrice;
  const priceAtBuy = bondingCurvePriceSol(trade);
  const tokensBought = priceAtBuy ? amountSol / priceAtBuy : 0;

  if (LIVE && walletKeypair && connection) {
    try {
      const sig = await pumpPortalTrade({ action: 'buy', mint: trade.mint, amount: amountSol, denominatedInSol: true });
      await pool.query('INSERT INTO bot_positions (token_mint,symbol,chain,amount,cost_basis_sol,wallet_alias) VALUES ($1,$2,$3,$4,$5,$6)',
        [trade.mint, trade.symbol, tracked.chain, tokensBought, amountSol, tracked.alias]);
      if (CHAT_ID) bot.sendMessage(CHAT_ID, `✅ COMPRA REAL [${tracked.alias}] ${trade.symbol} · ${amountSol.toFixed(4)} SOL (~$${tracked.amount}) · tx:${sig}`);
    } catch (e) {
      console.error('Error comprando real:', e.message);
      if (CHAT_ID) bot.sendMessage(CHAT_ID, `❌ Error al comprar ${trade.symbol}: ${e.message}`);
    }
  } else {
    await pool.query('INSERT INTO bot_positions (token_mint,symbol,chain,amount,cost_basis_sol,wallet_alias) VALUES ($1,$2,$3,$4,$5,$6)',
      [trade.mint, trade.symbol, tracked.chain, tokensBought, amountSol, tracked.alias]);
    const nuevoSaldo = await adjustPaperBalance(-tracked.amount);
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `🧪 PAPER: BOT copió a ${tracked.alias} - compró ${trade.symbol} con ${amountSol.toFixed(4)} SOL (~$${tracked.amount}) · Saldo ficticio: $${nuevoSaldo.toFixed(2)}`);
  }
}

async function handleTrackedSell(tracked, trade) {
  await pool.query('DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [trade.traderPublicKey, trade.mint]);

  const posRes = await pool.query('SELECT * FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2', [trade.mint, tracked.alias]);
  if (posRes.rows.length === 0) {
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `👀 [${getLabel(tracked.chain)}] ${tracked.alias} vendió ${trade.symbol} (no tenías posición vía esta wallet, nada que copiar)`);
    return;
  }
  const position = posRes.rows[0];

  if (LIVE && tracked.chain === 'solana' && walletKeypair && connection) {
    try {
      const before = await getWalletSolBalance();
      const sig = await pumpPortalTrade({ action: 'sell', mint: trade.mint, amount: '100%', denominatedInSol: false });
      const after = await getWalletSolBalance();
      const proceedsSol = after - before;
      const profit = proceedsSol - position.cost_basis_sol;
      await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2', [trade.mint, tracked.alias]);
      let msg = `📤 VENTA REAL [${tracked.alias}] ${trade.symbol} 100% · Recibido: ${proceedsSol.toFixed(4)} SOL · Ganancia: ${profit.toFixed(4)} SOL · tx:${sig}`;
      if (profit > 0) {
        const usdcSig = await swapProfitToUsdc(profit);
        msg += usdcSig ? `\n💵 Ganancia convertida a USDC · tx:${usdcSig}` : `\n⚠️ No se pudo convertir la ganancia a USDC`;
      }
      if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);
    } catch (e) {
      console.error('Error vendiendo real:', e.message);
      if (CHAT_ID) bot.sendMessage(CHAT_ID, `❌ Error al vender ${trade.symbol}: ${e.message}`);
    }
  } else {
    const priceAtSell = bondingCurvePriceSol(trade);
    const proceedsSol = priceAtSell ? position.amount * priceAtSell : position.cost_basis_sol;
    const profit = proceedsSol - position.cost_basis_sol;
    const solPrice = await getSolPriceUSD();
    const proceedsUsd = solPrice ? proceedsSol * solPrice : tracked.amount;
    await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2', [trade.mint, tracked.alias]);
    const nuevoSaldo = await adjustPaperBalance(proceedsUsd);
    let msg = `🧪 PAPER: BOT vendió 100% ${trade.symbol} (copiando a ${tracked.alias}) · Recibido simulado: ${proceedsSol.toFixed(4)} SOL (~$${proceedsUsd.toFixed(2)}) · Ganancia simulada: ${profit.toFixed(4)} SOL · Saldo ficticio: $${nuevoSaldo.toFixed(2)}`;
    if (profit > 0) msg += `\n💵 (simulado) ${profit.toFixed(4)} SOL de ganancia se convertirían a USDC`;
    if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);
  }
}

bot.onText(/\/add (.+)/, async (msg, match) => {
  try {
    const args = match[1].trim().split(/\s+/);
    const [alias, address, amountStr, chainRaw] = args;
    const amount = parseFloat(amountStr);
    const chain = normalizeChain(chainRaw);
    await pool.query('INSERT INTO tracked_wallets VALUES ($1,$2,$3,$4) ON CONFLICT(alias) DO UPDATE SET address=$2, amount=$3, chain=$4', [alias, address, amount, chain]);
    subscribeWallet(address);
    await logWatchList();
    bot.sendMessage(msg.chat.id, `⏳ Snapshot ${alias} en ${getLabel(chain)}...`);
    const holdings = await getHoldings(address);
    for (const h of holdings) {
      const mint = h.mint || h.address;
      if (!mint) continue;
      await pool.query('INSERT INTO seen_tokens VALUES ($1,$2) ON CONFLICT DO NOTHING', [address, mint]);
    }
    bot.sendMessage(msg.chat.id, `✅ ${alias} agregado [${getLabel(chain)}] $${amount} USD por compra. Snapshot: ${holdings.length} tokens vistos. Escuchando en vivo ✅`);
  } catch (e) { bot.sendMessage(msg.chat.id, 'Error: ' + e.message); console.error(e); }
});

bot.onText(/\/remove (.+)/, async (msg, match) => {
  try {
    const alias = match[1].trim();
    const result = await pool.query('DELETE FROM tracked_wallets WHERE alias=$1 RETURNING alias', [alias]);
    if (result.rows.length > 0) { bot.sendMessage(msg.chat.id, `🗑️ ${alias} eliminado de la lista de wallets seguidas.`); await logWatchList(); }
    else bot.sendMessage(msg.chat.id, `⚠️ No encontré ninguna wallet con el alias "${alias}".`);
  } catch (e) { bot.sendMessage(msg.chat.id, 'Error: ' + e.message); console.error(e); }
});

bot.onText(/\/list/, async (msg) => {
  const { rows } = await pool.query('SELECT * FROM tracked_wallets');
  bot.sendMessage(msg.chat.id, rows.map(r => `• ${r.alias} ${r.address.slice(0, 6)} $${r.amount} ${getLabel(r.chain)}`).join('\n') || 'Vacío');
});

bot.onText(/\/positions/, async (msg) => {
  const { rows } = await pool.query('SELECT * FROM bot_positions');
  bot.sendMessage(msg.chat.id, rows.map(r => `• ${r.symbol} · ${r.amount?.toFixed(2)} tokens · costo ${r.cost_basis_sol?.toFixed(4)} SOL · via ${r.wallet_alias}`).join('\n') || 'Sin posiciones abiertas');
});

bot.onText(/\/status/, async (msg) => {
  const modo = LIVE ? 'REAL' : 'PAPER';
  const estadoConexion = primerMensajeConfirmado ? `✅ PumpPortal confirmado (${totalMensajesRecibidos} eventos recibidos)` : '⏳ Esperando primer dato de PumpPortal...';
  const saldoApiKey = await getPumpPortalWalletBalance();
  const lineaApiKey = saldoApiKey !== null
    ? `${saldoApiKey < 0.005 ? '⚠️ BAJO' : '💳'} Saldo cuenta PumpPortal: ${saldoApiKey.toFixed(4)} SOL`
    : '⚠️ No se pudo consultar el saldo de la cuenta de PumpPortal';
  if (LIVE) {
    const solBalance = await getWalletSolBalance();
    bot.sendMessage(msg.chat.id, `Estado: REAL | Saldo SOL: ${solBalance.toFixed(4)}\n${estadoConexion}\n${lineaApiKey}`);
  } else {
    const balance = await getPaperBalance();
    const pnl = balance.current_usdc - balance.initial_usdc;
    const signo = pnl >= 0 ? '📈' : '📉';
    bot.sendMessage(msg.chat.id, `Estado: PAPER | Saldo ficticio: $${balance.current_usdc.toFixed(2)} (inicial $${balance.initial_usdc.toFixed(2)}) ${signo} ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}\n${estadoConexion}\n${lineaApiKey}`);
  }
});

bot.onText(/\/help/, async (msg) => {
  const texto = [
    '📋 Comandos disponibles:',
    '/add alias direccion monto_usd cadena - Agrega/actualiza una wallet a seguir (monto en USD)',
    '/remove alias - Elimina una wallet de la lista',
    '/list - Muestra todas las wallets que sigues',
    '/positions - Muestra las posiciones abiertas del bot',
    '/status - Muestra modo (REAL/PAPER), saldo, ganancia/pérdida, conexión y saldo de la API key',
    '/help - Muestra este mensaje'
  ].join('\n');
  bot.sendMessage(msg.chat.id, texto);
});

function startListener() {
  ws = new WebSocket(PUMP_PORTAL_WS);
  ws.on('open', async () => {
    console.log('WS conectado (con API key)');
    const { rows } = await pool.query('SELECT address FROM tracked_wallets');
    if (rows.length > 0) ws.send(JSON.stringify({ method: 'subscribeAccountTrade', keys: rows.map(r => r.address) }));
    ws.send(JSON.stringify({ method: 'subscribeNewToken' }));
    await logWatchList();
  });
  ws.on('message', async (raw) => {
    try {
      totalMensajesRecibidos++;
      mensajesDesdeUltimoResumen++;
      if (!primerMensajeConfirmado) {
        primerMensajeConfirmado = true;
        console.log('✅ CONFIRMADO: PumpPortal está mandando datos en vivo (llegó el primer evento)');
        if (CHAT_ID) bot.sendMessage(CHAT_ID, '✅ Confirmado: la API de PumpPortal está funcionando y mandando datos en vivo.');
      }
      const trade = JSON.parse(raw.toString());
      if (!trade.mint) return;
      const { rows } = await pool.query('SELECT * FROM tracked_wallets WHERE address=$1', [trade.traderPublicKey]);
      if (!rows[0]) return;
      const tracked = rows[0];
      if (trade.txType === 'buy') await handleTrackedBuy(tracked, trade);
      else if (trade.txType === 'sell') await handleTrackedSell(tracked, trade);
    } catch (e) { console.error('ws msg', e); }
  });
  ws.on('close', () => { console.log('WS cerrado, reintentando en 5s...'); setTimeout(startListener, 5000); });
  ws.on('error', (e) => console.error('WS err', e));
}

setInterval(() => {
  if (mensajesDesdeUltimoResumen === 0) {
    console.warn('⚠️ ALERTA: no ha llegado NINGÚN dato de PumpPortal en los últimos 5 minutos. Revisa la conexión.');
  } else {
    console.log(`💓 Pulso OK: ${mensajesDesdeUltimoResumen} eventos recibidos en los últimos 5 min (total acumulado: ${totalMensajesRecibidos})`);
  }
  mensajesDesdeUltimoResumen = 0;
}, 5 * 60 * 1000);

initDB().then(() => startListener());
console.log(`MEMEBOT REGLAS R0-R5 LISTO · modo ${LIVE ? 'REAL' : 'PAPER'}`);
process.on('uncaughtException', e => console.error('uncaught', e));
process.on('unhandledRejection', e => console.error('unhandled', e));
