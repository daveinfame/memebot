import { Telegraf } from 'telegraf';
import pg from 'pg';
import WebSocket from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const LIVE_TRADING = process.env.LIVE_TRADING === 'true';

if (!BOT_TOKEN) throw new Error('Falta TELEGRAM_BOT_TOKEN');
if (!DATABASE_URL) throw new Error('Falta DATABASE_URL');

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const bot = new Telegraf(BOT_TOKEN);

// --- DB STATE ---
async function initDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bot_state (id TEXT PRIMARY KEY, data JSONB)`);
}
async function loadState() {
  try {
    const res = await pool.query(`SELECT data FROM bot_state WHERE id='main'`);
    if (res.rows.length === 0) return { wallets: [], notifyChats: [] };
    return res.rows[0].data;
  } catch (e) { return { wallets: [], notifyChats: [] }; }
}
async function saveState(state) {
  await pool.query(`INSERT INTO bot_state(id, data) VALUES('main', $1) ON CONFLICT(id) DO UPDATE SET data=$1`, [state]);
}

let state = await initDB().then(() => loadState());
console.log('STATE loaded:', state.wallets.length, 'wallets');

function save() { saveState(state).catch(console.error); }
function addNotifyChat(chatId) {
  if (!state.notifyChats) state.notifyChats = [];
  if (!state.notifyChats.includes(chatId)) {
    state.notifyChats.push(chatId);
    save();
  }
}

// --- HELPERS ---
function parseAdd(text) {
  // /add alias address amount chain
  const parts = text.split(' ').filter(Boolean);
  if (parts.length < 5) return null;
  return { alias: parts[1].toLowerCase(), address: parts[2], amount: parseFloat(parts[3]), chain: parts[4].toLowerCase() };
}

// --- COMMANDS ---
bot.start((ctx) => {
  addNotifyChat(ctx.chat.id);
  ctx.reply('Bot Online v4.4 🟢\nYa te voy a avisar aquí de las copias.\nUsa /help');
});

bot.command('help', (ctx) => {
  addNotifyChat(ctx.chat.id);
  ctx.reply(`
v4.4 - MEMEBOT PAPER
/add alias address amount chain -> ej: /add sapphy So11... 0.05 sol
/add alias address amount evm -> ej: /add sapphy 0x123... 0.05 evm
/set alias amount chain
/remove alias address chain
/delete alias
/wallets
LIVE_TRADING=${LIVE_TRADING? 'REAL' : 'PAPER (simulación)'}
  `);
});

bot.command('wallets', (ctx) => {
  addNotifyChat(ctx.chat.id);
  if (!state.wallets.length) return ctx.reply('Sin wallets');
  let msg = 'WALLETS:\n';
  const byAlias = {};
  state.wallets.forEach(w => {
    if (!byAlias[w.alias]) byAlias[w.alias] = [];
    byAlias[w.alias].push(w);
  });
  for (const alias in byAlias) {
    msg += `\n${alias}:\n`;
    byAlias[alias].forEach(w => msg += ` - ${w.chain} ${w.address.slice(0,6)}... ${w.amount}\n`);
  }
  ctx.reply(msg);
});

bot.command('add', (ctx) => {
  addNotifyChat(ctx.chat.id);
  const p = parseAdd(ctx.message.text);
  if (!p) return ctx.reply('Formato: /add alias address amount chain\nEj: /add sapphy 0x123 0.05 evm');
  if (!['sol','evm'].includes(p.chain)) return ctx.reply('chain debe ser sol o evm');
  // borrar si ya existe misma address+chain+alias
  state.wallets = state.wallets.filter(w =>!(w.alias===p.alias && w.address===p.address && w.chain===p.chain));
  state.wallets.push(p);
  save();
  ctx.reply(`Agregada: ${p.alias} [${p.chain}] ${p.amount}`);
});

bot.command('set', (ctx) => {
  addNotifyChat(ctx.chat.id);
  const parts = ctx.message.text.split(' ').filter(Boolean);
  if (parts.length < 4) return ctx.reply('Uso: /set alias amount chain');
  const alias = parts[1].toLowerCase(), amount = parseFloat(parts[2]), chain = parts[3].toLowerCase();
  let c=0;
  state.wallets.forEach(w=>{ if(w.alias===alias && w.chain===chain){ w.amount=amount; c++; } });
  save();
  ctx.reply(`Actualizadas ${c} wallets de ${alias} [${chain}] a ${amount}`);
});

bot.command('remove', (ctx) => {
  addNotifyChat(ctx.chat.id);
  const parts = ctx.message.text.split(' ').filter(Boolean);
  if (parts.length < 4) return ctx.reply('Uso: /remove alias address chain');
  const alias=parts[1].toLowerCase(), address=parts[2], chain=parts[3].toLowerCase();
  const before=state.wallets.length;
  state.wallets = state.wallets.filter(w=>!(w.alias===alias && w.address===address && w.chain===chain));
  save();
  ctx.reply(`Borradas ${before-state.wallets.length}`);
});

bot.command('delete', (ctx) => {
  addNotifyChat(ctx.chat.id);
  const alias = ctx.message.text.split(' ')[1]?.toLowerCase();
  if(!alias) return ctx.reply('Uso: /delete alias');
  const before=state.wallets.length;
  state.wallets = state.wallets.filter(w=>w.alias!==alias);
  save();
  ctx.reply(`Borrado alias ${alias}: ${before-state.wallets.length} wallets`);
});

// --- PUMP.FUN WS (SOL) ---
function connectPump() {
  const ws = new WebSocket('wss://pumpportal.fun/api/data');
  ws.on('open', () => {
    console.log('PumpPortal WS conectado');
    // Suscribirse a todas nuestras wallets SOL
    const solWallets = state.wallets.filter(w=>w.chain==='sol').map(w=>w.address);
    if(solWallets.length) ws.send(JSON.stringify({ method: "subscribeAccountTrade", keys: solWallets }));
  });
  ws.on('message', async (data) => {
    try {
      const trade = JSON.parse(data.toString());
      if(!trade.traderPublicKey) return;
      const found = state.wallets.filter(w=>w.chain==='sol' && w.address===trade.traderPublicKey);
      if(!found.length) return;

      for(const w of found) {
        const type = trade.txType || trade.type || 'trade';
        const mint = trade.mint || 'unknown';
        const solAmount = trade.solAmount || trade.sol_amount || 0;
        const msg = `🧪 [${w.chain}] ${w.alias} ${type.toUpperCase()} ${mint.slice(0,6)}... por ${solAmount} SOL\n-> Hubiera copiado ${w.amount} SOL ${LIVE_TRADING? 'REAL' : '(PAPER)'}`;
        console.log(msg);
        for(const chatId of state.notifyChats) {
          try { await bot.telegram.sendMessage(chatId, msg); } catch(e){}
        }
      }
    } catch(e){ console.error('WS parse', e.message); }
  });
  ws.on('close', () => { console.log('WS cerrado, reconectando 5s'); setTimeout(connectPump, 5000); });
  ws.on('error', (e)=>{ console.error('WS error', e.message); });
}
connectPump();

bot.launch();
console.log('Bot lanzado v4.4 LIVE_TRADING:', LIVE_TRADING);
