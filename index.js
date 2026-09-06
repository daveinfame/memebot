// ========= MEMEBOT FIX CRASH - COMMONJS + ROBINHOOD CHAIN ID 4663 =========
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'? { rejectUnauthorized: false } : false
});
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const CHAT_ID = process.env.CHAT_ID;

const PUMP_PORTAL_WS = 'wss://pumpportal.fun/api/data';
const PUMP_PORTAL_TRADE = 'https://pumpportal.fun/api/trade-local';

let GLOBAL_BALANCE = parseFloat(process.env.INITIAL_USDC || '1000');
let INITIAL_BALANCE = parseFloat(process.env.INITIAL_USDC || '1000');

const CHAIN_CONFIG = {
  sol: { id: 'solana', name: 'SOLANA' },
  eth: { id: 'eth', name: 'ETH' },
  base: { id: 'base', name: 'BASE' },
  bsc: { id: 'bnb', name: 'BSC' },
  rh: { id: 'rh', name: 'ROBINHOOD CHAIN 4663', chainId: 4663, rpc: 'https://rpc.mainnet.chain.robinhood.com', priority: true },
  robinhood: { id: 'rh', name: 'ROBINHOOD CHAIN 4663', chainId: 4663, priority: true },
  hype: { id: 'hyperliquid', name: 'HYPE EVM 999' }
};
function normalizeChain(c){ return (CHAIN_CONFIG[c.toLowerCase()]||{id:'solana'}).id; }
function getLabel(c){ const f=Object.values(CHAIN_CONFIG).find(v=>v.id===c); return f?f.name:c.toUpperCase(); }

async function initDB(){
  try{
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tracked_wallets (alias TEXT PRIMARY KEY, address TEXT, amount REAL, chain TEXT);
      CREATE TABLE IF NOT EXISTS seen_tokens (wallet_address TEXT, token_mint TEXT, PRIMARY KEY (wallet_address, token_mint));
      CREATE TABLE IF NOT EXISTS bot_positions (token_mint TEXT PRIMARY KEY, symbol TEXT, chain TEXT, amount REAL);
      CREATE TABLE IF NOT EXISTS global_balance (id INT PRIMARY KEY, initial_usdc REAL, current_usdc REAL);
    `);
    console.log('DB OK');
  }catch(e){ console.error('DB Error', e); }
}

async function getHoldings(address){
  try{
    const res = await fetch(`https://pumpportal.fun/api/data/holdings?address=${address}`);
    const data = await res.json(); return Array.isArray(data)?data:[];
  }catch{ return []; }
}

bot.onText(/\/add (.+)/, async (msg, match) => {
  try{
    const args = match[1].trim().split(/\s+/);
    const [alias, address, amountStr, chainRaw] = args;
    const amount = parseFloat(amountStr);
    const chain = normalizeChain(chainRaw);
    await pool.query('INSERT INTO tracked_wallets VALUES ($1,$2,$3,$4) ON CONFLICT(alias) DO UPDATE SET address=$2, amount=$3, chain=$4', [alias, address, amount, chain]);
    bot.sendMessage(msg.chat.id, `⏳ Snapshot ${alias} en ${getLabel(chain)}...`);
    const holdings = await getHoldings(address);
    for(const h of holdings){
      const mint = h.mint || h.address;
      if(!mint) continue;
      await pool.query('INSERT INTO seen_tokens VALUES ($1,$2) ON CONFLICT DO NOTHING', [address, mint]);
    }
    bot.sendMessage(msg.chat.id, `✅ ${alias} agregado [${getLabel(chain)}] ${amount}. Snapshot: ${holdings.length} tokens vistos.`);
  }catch(e){ bot.sendMessage(msg.chat.id, 'Error: '+e.message); console.error(e); }
});

bot.onText(/\/list/, async (msg)=>{
  const {rows}=await pool.query('SELECT * FROM tracked_wallets');
  bot.sendMessage(msg.chat.id, rows.map(r=>`• ${r.alias} ${r.address.slice(0,6)} ${r.amount} ${getLabel(r.chain)}`).join('\n') || 'Vacío');
});
bot.onText(/\/status/, async (msg)=>{
  bot.sendMessage(msg.chat.id, `Estado: ${process.env.LIVE_TRADING?'REAL':'PAPER'} | Saldo $${GLOBAL_BALANCE} / Init $${INITIAL_BALANCE} | RH Chain 4663 OK`);
});
bot.onText(/\/setbalance (.+)/, async (msg, m)=>{
  GLOBAL_BALANCE=parseFloat(m[1]); INITIAL_BALANCE=parseFloat(m[1]);
  bot.sendMessage(msg.chat.id, `💰 Saldo seteado $${m[1]}`);
});

function startListener(){
  const ws = new WebSocket(PUMP_PORTAL_WS);
  ws.on('open', async ()=>{
    console.log('WS conectado multichain incl RH 4663');
    const {rows}=await pool.query('SELECT address FROM tracked_wallets');
    if(rows.length>0) ws.send(JSON.stringify({method:'subscribeAccountTrade', keys: rows.map(r=>r.address)}));
  });
  ws.on('message', async (raw)=>{
    try{
      const trade=JSON.parse(raw.toString());
      if(!trade.mint) return;
      const {rows}=await pool.query('SELECT * FROM tracked_wallets WHERE address=$1', [trade.traderPublicKey]);
      if(!rows[0]) return;
      const tracked=rows[0];
      const seen=await pool.query('SELECT * FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [trade.traderPublicKey, trade.mint]);
      if(trade.txType==='buy' && seen.rows.length>0){
        console.log(`DCA ignorado ${tracked.alias} ${trade.symbol} - NO NOTIFICA`);
        return;
      }
      if(trade.txType==='buy' && seen.rows.length===0){
        await pool.query('INSERT INTO seen_tokens VALUES ($1,$2) ON CONFLICT DO NOTHING', [trade.traderPublicKey, trade.mint]);
        if(CHAT_ID){
          await bot.sendMessage(CHAT_ID, `👀 [${getLabel(tracked.chain)}] ${tracked.alias} compró ${trade.symbol} $${trade.usdAmount||'?'} hash:${trade.signature}`);
          await bot.sendMessage(CHAT_ID, `🤖 BOT copió a ${tracked.alias} - compró ${trade.symbol} con ${tracked.amount} ${getLabel(tracked.chain)} hash:PAPER`);
        }
      }
    }catch(e){ console.error('ws msg', e); }
  });
  ws.on('close', ()=> setTimeout(startListener, 5000));
  ws.on('error', (e)=> console.error('WS err', e));
}

initDB().then(()=> startListener());
console.log('MEMEBOT READY FIX CRASH - ROBINHOOD 4663');
process.on('uncaughtException', e=> console.error('uncaught', e));
process.on('unhandledRejection', e=> console.error('unhandled', e));
