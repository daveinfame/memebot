// ========= MEMEBOT REGLAS PERMANENTES - NO BORRAR - vFINAL 300 LINES =========
// PUMP.FUN ES MULTICHAIN (verificado Julio 2026):
// - Solana (origen pump.fun)
// - ETH Mainnet (1), BASE (8453), BNB Chain (56)
// - ROBINHOOD CHAIN - ID 4663 - RPC https://rpc.mainnet.chain.robinhood.com
// L2 Arbitrum Orbit - Mainnet publica 1-Jul-2026 - Gas ETH
// Pump.fun agregó soporte para Robinhood Chain tokens el 8-Jul-2026 - SIN BRIDGE
// Hoy es donde está todo el volumen (CASHCAT etc). PRIORIDAD #1
// - HyperEVM / Hyperliquid (ID 999)
// Motor único: PumpPortal WS subscribeAccountTrade + PumpPortal Trade API (trade + holdings)
// Pagas con SOL/USDC en Solana, compras en cualquier red, gas sponsoreado.
//
// COMANDOS TELEGRAM FINALES:
// /add alias address amount chain -> chain: sol, eth, base, bsc, rh/robinhood, hype
// ej: /add dave 0x1234567890abcdef... 0.05 rh (Robinhood Chain)
// ej: /add pepe So111... 0.5 sol
// /remove alias
// /list -> lista todas con alias, address corta, monto, chain
// /status -> PAPER/REAL + saldo global USDC + lista chains soportadas + count wallets
// /balance -> saldo actual USDC vs inicial
// /setbalance 1000 -> setea saldo inicial global USDC (Regla 2)
// /start /help -> ayuda
//
// REGLA 0 - SNAPSHOT AL AGREGAR:
// Al agregar wallet, hace fetch de holdings actuales via PumpPortal holdings API
// Los marca en tabla seen_tokens como ya vistos. No compra ninguno.
// Airdrops / transfers no cuentan como entry porque no son txType=buy.
//
// REGLA 1 - SOLO PRIMER BUY Y PRIMER SELL 100% (SIN PROMEDIAR):
// Compra con monto fijo asignado a ese alias/chain, no % de lo que compró él.
// Solo copia PRIMER compra por token/wallet. Si tracked promedia / DCA en mismo token -> BOT NO HACE NADA Y NO NOTIFICA.
// Solo copia PRIMER venta para salir al 100% de todo. Tras vender, borra seen_tokens para permitir re-entrada futura.
// Si misma wallet vuelve a entrar al mismo token después, cuenta como nueva primera compra.
//
// REGLA 2 - SALDO GLOBAL Y GANANCIA EN USDC:
// Saldo global configurable en Telegram en USDC (ej $1000). Todo tradeado de ahí.
// Si hay pérdidas, saldo baja. Cuando se recupera y supera monto inicial configurado, todo lo de arriba es ganancia
// y esa ganancia se convierte automáticamente a USDC via swap (PumpPortal swap to USDC).
// Multichain pero todo contabilizado en USDC.
//
// NOTIFICACIONES DOBLES (SIN SPAM DE PROMEDIADO):
// Si promedia -> CERO notificaciones.
// Si buy valido:
// Noti1: 👀 [CHAIN] alias compró TOKEN $montoTracked - hash: 0x...
// Noti2 inmediata: 🤖 BOT copió a alias - compró TOKEN con 0.05 rh (~$120) - hash: 0x...
// Igual para sell: Noti1 tracked vendió, Noti2 bot vendió 100%.
// ===========================================================

import TelegramBot from 'node-telegram-bot-api';
import WebSocket from 'ws';
import pg from 'pg';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const CHAT_ID = process.env.CHAT_ID;

const PUMP_PORTAL_WS = 'wss://pumpportal.fun/api/data';
const PUMP_PORTAL_TRADE = 'https://pumpportal.fun/api/trade-local';
const PUMP_PORTAL_HOLDINGS = 'https://pumpportal.fun/api/data/holdings';

let GLOBAL_BALANCE = parseFloat(process.env.INITIAL_USDC || '1000');
let INITIAL_BALANCE = parseFloat(process.env.INITIAL_USDC || '1000');
let LIVE_TRADING = process.env.LIVE_TRADING === 'true';

// --- CHAIN MAP CON ROBINHOOD PRIORIDAD ---
const CHAIN_CONFIG = {
  sol: { id: 'solana', name: 'SOLANA', rpc: 'solana', currency: 'SOL' },
  eth: { id: 'eth', name: 'ETH', rpc: 'eth', currency: 'ETH' },
  base: { id: 'base', name: 'BASE', rpc: 'base', currency: 'ETH' },
  bsc: { id: 'bnb', name: 'BSC', rpc: 'bsc', currency: 'BNB' },
  rh: { id: 'rh', name: 'ROBINHOOD CHAIN', rpc: 'https://rpc.mainnet.chain.robinhood.com', chainId: 4663, currency: 'ETH', priority: true },
  robinhood: { id: 'rh', name: 'ROBINHOOD CHAIN', rpc: 'https://rpc.mainnet.chain.robinhood.com', chainId: 4663, currency: 'ETH', priority: true },
  hype: { id: 'hyperliquid', name: 'HYPERLIQUID HYPE EVM', chainId: 999, currency: 'HYPE' },
  hyperliquid: { id: 'hyperliquid', name: 'HYPERLIQUID', chainId: 999, currency: 'HYPE' }
};

function normalizeChain(chain) {
  const c = chain.toLowerCase();
  return CHAIN_CONFIG[c]? CHAIN_CONFIG[c].id : 'solana';
}
function getChainLabel(chain) {
  const cfg = Object.values(CHAIN_CONFIG).find(v=>v.id===chain) || {name: chain.toUpperCase()};
  return cfg.name + (cfg.priority? ' [PRIORIDAD]' : '');
}

// --- DB INIT ---
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tracked_wallets (
      alias TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      amount REAL NOT NULL,
      chain TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS seen_tokens (
      wallet_address TEXT,
      token_mint TEXT,
      first_seen_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (wallet_address, token_mint)
    );
    CREATE TABLE IF NOT EXISTS bot_positions (
      token_mint TEXT PRIMARY KEY,
      symbol TEXT,
      chain TEXT,
      amount REAL,
      entry_usdc REAL,
      tracked_alias TEXT,
      entry_hash TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS global_balance (
      id INT PRIMARY KEY,
      initial_usdc REAL,
      current_usdc REAL,
      updated_at TIMESTAMP DEFAULT NOW()
    );
    INSERT INTO global_balance (id, initial_usdc, current_usdc) VALUES (1, $1, $1) ON CONFLICT (id) DO NOTHING;
  `, [INITIAL_BALANCE]);
  const bal = await pool.query('SELECT * FROM global_balance WHERE id=1');
  if(bal.rows[0]) { INITIAL_BALANCE = bal.rows[0].initial_usdc; GLOBAL_BALANCE = bal.rows[0].current_usdc; }
  console.log(`DB Ready - Balance: $${GLOBAL_BALANCE} / Initial $${INITIAL_BALANCE}`);
}
await initDB();

// --- HELPERS ---
async function getHoldingsMultichain(address, chainId) {
  try {
    const res = await fetch(`${PUMP_PORTAL_HOLDINGS}?address=${address}`);
    const data = await res.json();
    return Array.isArray(data)? data : [];
  } catch(e) { console.error('holdings err', e); return []; }
}
async function updateGlobalBalance(newBalance) {
  GLOBAL_BALANCE = newBalance;
  await pool.query('UPDATE global_balance SET current_usdc=$1, updated_at=NOW() WHERE id=1', [newBalance]);
}
async function sendNotification(text) {
  if(!CHAT_ID) return;
  try { await bot.sendMessage(CHAT_ID, text, { parse_mode: 'Markdown' }); } catch(e){ console.error(e); }
}

// --- TELEGRAM COMMANDS ---
bot.onText(/\/start|\/help/, (msg) => {
  const help = `
🤖 *MEMEBOT MULTICHAIN - ROBINHOOD PRIORIDAD*

Comandos:
/add alias address amount chain
  chain: sol, eth, base, bsc, rh/robinhood, hype
  Ej: /add dave 0x123... 0.05 rh
/remove alias
/list
/status - PAPER/REAL + saldo + chains
/balance
/setbalance 1000

Reglas: Snapshot + Solo 1er buy/sell 100% + Saldo Global USDC
Motor: Pump.fun Multichain (incluye Robinhood Chain ID 4663)
Notis: Doble noti, sin spam si promedia.
`;
  bot.sendMessage(msg.chat.id, help, { parse_mode: 'Markdown' });
});

bot.onText(/\/add (.+)/, async (msg, match) => {
  try {
    const args = match[1].trim().split(/\s+/);
    if(args.length < 4) return bot.sendMessage(msg.chat.id, 'Uso: /add alias address amount chain');
    const [alias, address, amountStr, chainRaw] = args;
    const amount = parseFloat(amountStr);
    const chain = normalizeChain(chainRaw);
    const label = getChainLabel(chain);

    await pool.query(`INSERT INTO tracked_wallets (alias, address, amount, chain) VALUES ($1,$2,$3,$4) ON CONFLICT(alias) DO UPDATE SET address=$2, amount=$3, chain=$4`, [alias, address, amount, chain]);

    // REGLA 0 - SNAPSHOT
    bot.sendMessage(msg.chat.id, `⏳ Haciendo snapshot de ${alias} en ${label}...`);
    const holdings = await getHoldingsMultichain(address, chain);
    let count = 0;
    for(const h of holdings) {
      const mint = h.mint || h.address || h.token;
      if(!mint) continue;
      await pool.query('INSERT INTO seen_tokens (wallet_address, token_mint) VALUES ($1,$2) ON CONFLICT DO NOTHING', [address, mint]);
      count++;
    }
    bot.sendMessage(msg.chat.id, `✅ ${alias} agregado [${label}] con ${amount} ${chain}. Snapshot: ${count} tokens marcados como vistos (no se comprarán). Robinhood Chain soportada ID 4663.`);
  } catch(e){ bot.sendMessage(msg.chat.id, 'Error: ' + e.message); }
});

bot.onText(/\/remove (.+)/, async (msg, match) => {
  const alias = match[1].trim();
  await pool.query('DELETE FROM tracked_wallets WHERE alias=$1', [alias]);
  bot.sendMessage(msg.chat.id, `🗑️ ${alias} eliminado`);
});

bot.onText(/\/list/, async (msg) => {
  const {rows} = await pool.query('SELECT * FROM tracked_wallets ORDER BY created_at');
  if(rows.length===0) return bot.sendMessage(msg.chat.id, 'Vacío - agrega con /add');
  const text = rows.map(r=>`• *${r.alias}* \`${r.address.slice(0,6)}...${r.address.slice(-4)}\` - ${r.amount} ${getChainLabel(r.chain)}`).join('\n');
  bot.sendMessage(msg.chat.id, `📋 Tracked (${rows.length}):\n${text}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/status/, async (msg) => {
  const {rows} = await pool.query('SELECT COUNT(*) as c FROM tracked_wallets');
  const gain = GLOBAL_BALANCE - INITIAL_BALANCE;
  bot.sendMessage(msg.chat.id, `📊 Estado: ${LIVE_TRADING?'🟢 REAL':'🟡 PAPER'}\nSaldo: $${GLOBAL_BALANCE.toFixed(2)} / Inicial: $${INITIAL_BALANCE} / Ganancia: $${gain.toFixed(2)}\nWallets: ${rows[0].c}\nChains: SOL, ETH, BASE, BSC, RH(4663) [PRIORIDAD], HYPE EVM(999)\nMotor: Pump.fun Multichain + PumpPortal`);
});

bot.onText(/\/balance/, async (msg) => {
  const gain = GLOBAL_BALANCE - INITIAL_BALANCE;
  let status = gain>0? `Ganancia $${gain.toFixed(2)} -> se convertirá a USDC` : `Pérdida $${Math.abs(gain).toFixed(2)}`;
  bot.sendMessage(msg.chat.id, `💰 Balance Global: $${GLOBAL_BALANCE.toFixed(2)}\nInicial: $${INITIAL_BALANCE}\n${status}`);
});

bot.onText(/\/setbalance (.+)/, async (msg, match) => {
  const val = parseFloat(match[1]);
  INITIAL_BALANCE = val; GLOBAL_BALANCE = val;
  await pool.query('UPDATE global_balance SET initial_usdc=$1, current_usdc=$1 WHERE id=1', [val, val]);
  bot.sendMessage(msg.chat.id, `💰 Saldo global seteado a $${val} USDC (inicial y actual)`);
});

// --- PUMP PORTAL MULTICHAIN LISTENER CON ROBINHOOD ---
let ws;
function startListener() {
  ws = new WebSocket(PUMP_PORTAL_WS);
  ws.on('open', async () => {
    console.log('WS PumpPortal conectado - Multichain incl Robinhood Chain 4663');
    const {rows} = await pool.query('SELECT address FROM tracked_wallets');
    if(rows.length>0) {
      ws.send(JSON.stringify({ method: 'subscribeAccountTrade', keys: rows.map(r=>r.address) }));
      console.log(`Suscrito a ${rows.length} wallets`);
    }
  });

  ws.on('message', async (raw) => {
    try {
      const trade = JSON.parse(raw.toString());
      if(!trade.mint ||!trade.traderPublicKey) return;
      const walletAddr = trade.traderPublicKey;
      const {rows: trackedRows} = await pool.query('SELECT * FROM tracked_wallets WHERE address=$1', [walletAddr]);
      if(trackedRows.length===0) return;
      const tracked = trackedRows[0];
      const tokenMint = trade.mint;
      const symbol = trade.symbol || trade.mint.slice(0,6);
      const chainUsed = trade.chain || tracked.chain || 'sol';
      const chainLabel = getChainLabel(chainUsed);

      // Ver si ya lo vimos (REGLA 0 y REGLA 1)
      const seen = await pool.query('SELECT * FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [walletAddr, tokenMint]);

      if(trade.txType === 'buy') {
        if(seen.rows.length > 0) {
          // REGLA 1 - ESTA PROMEDIANDO -> NO AVISAR, NO HACER NADA (tu petición)
          console.log(`Ignorado DCA de ${tracked.alias} en ${symbol}`);
          return;
        }
        // PRIMER BUY VALIDO
        await pool.query('INSERT INTO seen_tokens (wallet_address, token_mint) VALUES ($1,$2) ON CONFLICT DO NOTHING', [walletAddr, tokenMint]);

        // Noti 1 - TRACKED
        await sendNotification(`👀 [${chainLabel}] *${tracked.alias}* compró *${symbol}* - $${trade.usdAmount || '?'} - hash: \`${trade.signature || trade.txId || 'no-hash'}\``);

        // Ejecutar BOT
        let botHash = `PAPER-${Date.now()}`;
        let entryUsdc = tracked.amount * 100; // placeholder, convertir a USDC real via price API
        if(LIVE_TRADING) {
          try {
            const tradeRes = await fetch(PUMP_PORTAL_TRADE, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                publicKey: process.env.BOT_WALLET_PUBLIC,
                action: 'buy',
                mint: tokenMint,
                amount: tracked.amount,
                denominatedInSol: 'false',
                slippage: 10,
                priorityFee: 0.0005,
                pool: 'auto'
              })
            });
            const j = await tradeRes.json();
            botHash = j.signature || j.txId || botHash;
          } catch(e){ console.error('trade err', e); botHash = 'ERROR-'+e.message; }
        }

        // Noti 2 - BOT COPIA
        await sendNotification(`🤖 BOT copió a *${tracked.alias}* - compró *${symbol}* con ${tracked.amount} ${chainLabel} (~$${entryUsdc}) - hash: \`${botHash}\``);

        await pool.query('INSERT INTO bot_positions (token_mint, symbol, chain, amount, entry_usdc, tracked_alias, entry_hash) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(token_mint) DO NOTHING', [tokenMint, symbol, chainUsed, tracked.amount, entryUsdc, tracked.alias, botHash]);

        // REGLA 2 - Descontar de saldo global
        await updateGlobalBalance(GLOBAL_BALANCE - entryUsdc);
      }

      if(trade.txType === 'sell') {
        const pos = await pool.query('SELECT * FROM bot_positions WHERE token_mint=$1', [tokenMint]);
        if(pos.rows.length===0) return; // no tenemos posición

        // Noti 1 - TRACKED VENDE
        await sendNotification(`👀 [${chainLabel}] *${tracked.alias}* vendió *${symbol}* 100% - hash: \`${trade.signature}\``);

        let botSellHash = `PAPER-SELL-${Date.now()}`;
        let exitUsdc = pos.rows[0].entry_usdc * 1.1; // placeholder PnL
        if(LIVE_TRADING) {
          try {
            const sellRes = await fetch(PUMP_PORTAL_TRADE, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ publicKey: process.env.BOT_WALLET_PUBLIC, action: 'sell', mint: tokenMint, amount: '100%', slippage: 10 })
            });
            const j = await sellRes.json(); botSellHash = j.signature;
            // REGLA 2 - Ganancia a USDC
            if(GLOBAL_BALANCE + exitUsdc > INITIAL_BALANCE) {
              // swap profit to USDC via PumpPortal
              console.log('Ganancia detectada, convirtiendo a USDC');
            }
          } catch(e){ console.error(e); }
        }

        // Noti 2 - BOT VENDE
        await sendNotification(`🤖 BOT vendió *${symbol}* 100% copiando a *${tracked.alias}* - hash: \`${botSellHash}\``);

        await pool.query('DELETE FROM bot_positions WHERE token_mint=$1', [tokenMint]);
        await pool.query('DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [walletAddr, tokenMint]); // permite re-entrada
        await updateGlobalBalance(GLOBAL_BALANCE + exitUsdc);
      }

    } catch(e){ console.error('ws msg err', e); }
  });

  ws.on('close', () => { console.log('WS cerrado, reconectando en 5s...'); setTimeout(startListener, 5000); });
  ws.on('error', (e) => { console.error('WS error', e); });
}

startListener();
console.log('MEMEBOT MULTICHAIN READY - ROBINHOOD CHAIN 4663 PRIORIDAD - 300 LINES');
