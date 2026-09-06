import { Telegraf } from 'telegraf';
import pg from 'pg';
import WebSocket from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const LIVE_TRADING = process.env.LIVE_TRADING === 'true';

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const bot = new Telegraf(BOT_TOKEN);

async function initDB(){
  await pool.query(`CREATE TABLE IF NOT EXISTS bot_state (id TEXT PRIMARY KEY, data JSONB)`);
}
async function loadState(){
  try{
    const r = await pool.query(`SELECT data FROM bot_state WHERE id='main'`);
    if(!r.rows.length) return { wallets:[], notifyChats:[] };
    const d = r.rows[0].data;
    return typeof d === 'string'? JSON.parse(d) : d;
  }catch{ return { wallets:[], notifyChats:[] }; }
}
async function saveState(s){
  try{
    const json = JSON.stringify(s);
    await pool.query(`INSERT INTO bot_state(id, data) VALUES('main', $1::jsonb) ON CONFLICT(id) DO UPDATE SET data=$1::jsonb`, [json]);
  }catch(e){ console.error('saveState', e.message); }
}

await initDB();
let state = await loadState();
if(!state.wallets) state.wallets=[];
if(!state.notifyChats) state.notifyChats=[];
console.log(`LOADED ${state.wallets.length} wallets`);

const save = () => saveState(state);
const addChat = (id) => {
  if(!state.notifyChats.includes(id)){ state.notifyChats.push(id); save(); }
};

// --- COMANDOS TELEGRAM ---

bot.start((ctx)=>{
  addChat(ctx.chat.id);
  ctx.reply(`🚀 Memebot v5 MULTICHAIN ONLINE\nLIVE=${LIVE_TRADING?'REAL - va a comprar':'PAPER - solo aviso'}\n\nUsa /help`);
});

bot.help((ctx)=>{
  addChat(ctx.chat.id);
  ctx.reply(
`/help - este menu
/wallets - ver todas
/add alias address amount chain - agregar
Ej: /add sapphy So1111... 0.01 sol
Ej: /add sapphy 0x123... 0.01 evm
Ej: /add sapphy 0x123... 0.01 base
/remove alias - borrar alias completo
/clear - borrar TODO
/status - estado del bot
LIVE actual: ${LIVE_TRADING?'REAL':'PAPER'}`
  );
});

bot.command('status', (ctx)=>{
  addChat(ctx.chat.id);
  ctx.reply(`Status: ${LIVE_TRADING?'🟢 REAL':'🟡 PAPER'}\nWallets: ${state.wallets.length}\nWS: pumpportal multichain\nChains: sol, evm, base, bnb, eth`);
});

bot.command('wallets', (ctx)=>{
  addChat(ctx.chat.id);
  if(!state.wallets.length) return ctx.reply('Vacío. Usa /add alias address amount chain');
  let m='📋 WALLETS:\n';
  const by={};
  state.wallets.forEach(w=>{ (by[w.alias]=by[w.alias]||[]).push(w); });
  for(const a in by){
    m+=`\n${a}:\n`;
    by[a].forEach(w=> m+=` [${w.chain}] ${w.address.slice(0,6)}...${w.address.slice(-4)} | ${w.amount}\n`);
  }
  m+=`\nTotal: ${state.wallets.length} - ${LIVE_TRADING?'REAL':'PAPER'}`;
  ctx.reply(m);
});

bot.command('add', (ctx)=>{
  addChat(ctx.chat.id);
  const p=ctx.message.text.split(' ').filter(Boolean);
  if(p.length<5) return ctx.reply('Uso: /add alias address amount chain\nEj: /add dave 0x123 0.01 evm');
  const alias=p[1].toLowerCase();
  const address=p[2];
  const amount=parseFloat(p[3]);
  const chain=p[4].toLowerCase();
  if(isNaN(amount)) return ctx.reply('amount debe ser numero');
  state.wallets=state.wallets.filter(w=>!(w.alias===alias && w.address===address && w.chain===chain));
  state.wallets.push({alias,address,amount,chain});
  save();
  ctx.reply(`✅ Guardada ${alias} [${chain}] ${amount}\n${address.slice(0,10)}...`);
});

bot.command('remove', (ctx)=>{
  addChat(ctx.chat.id);
  const p=ctx.message.text.split(' ').filter(Boolean);
  if(p.length<2) return ctx.reply('Uso: /remove alias');
  const alias=p[1].toLowerCase();
  const before=state.wallets.length;
  state.wallets=state.wallets.filter(w=>w.alias!==alias);
  save();
  ctx.reply(`🗑️ Borradas ${before-state.wallets.length} de alias ${alias}`);
});

bot.command('clear', (ctx)=>{
  addChat(ctx.chat.id);
  state.wallets=[];
  save();
  ctx.reply('🧹 Todo borrado');
});

bot.command('set', (ctx)=>{
  addChat(ctx.chat.id);
  const p=ctx.message.text.split(' ').filter(Boolean);
  if(p.length<4) return ctx.reply('Uso: /set alias amount chain');
  const alias=p[1].toLowerCase();
  const amount=parseFloat(p[2]);
  const chain=p[3].toLowerCase();
  let c=0;
  state.wallets.forEach(w=>{ if(w.alias===alias && w.chain===chain){ w.amount=amount; c++; } });
  save();
  ctx.reply(`✏️ Actualizadas ${c} wallets de ${alias} [${chain}] a ${amount}`);
});

// --- WEBSOCKET MULTICHAIN PUMP.FUN ---
function connect(){
  const ws = new WebSocket('wss://pumpportal.fun/api/data');
  ws.on('open', ()=>{
    console.log('WS multichain conectado');
    const keys=[...new Set(state.wallets.map(w=>w.address))];
    if(keys.length){
      console.log(`Suscribiendo ${keys.length} wallets`);
      ws.send(JSON.stringify({method:"subscribeAccountTrade", keys}));
    }
  });
  ws.on('message', async (raw)=>{
    try{
      const t=JSON.parse(raw.toString());
      const trader=(t.traderPublicKey||t.trader||t.wallet||'').toString();
      if(!trader) return;
      const matches=state.wallets.filter(w=>w.address.toLowerCase()===trader.toLowerCase());
      if(!matches.length) return;
      for(const w of matches){
        const mint=(t.mint||t.token||t.ca||'').toString();
        const type=(t.txType||t.type||'TRADE').toString();
        const msg=`🧪 [${w.chain.toUpperCase()}] ${w.alias}\n${type} ${mint.slice(0,8)}..\nCopiar: ${w.amount} ${w.chain}\n${LIVE_TRADING?'🟢 REAL':'🟡 PAPER'}`;
        console.log(msg);
        for(const chatId of state.notifyChats){
          try{ await bot.telegram.sendMessage(chatId, msg); }catch{}
        }
      }
    }catch(e){ console.error('WS msg err', e.message); }
  });
  ws.on('close', ()=>{ console.log('WS closed, reconectando 5s'); setTimeout(connect,5000); });
  ws.on('error', (e)=>console.error('WS error', e.message));
}
connect();

// Evitar 409
bot.telegram.deleteWebhook({drop_pending_updates:true}).catch(()=>{});
bot.launch().then(()=>console.log(`Bot v5 MULTICHAIN LAUNCHED LIVE=${LIVE_TRADING}`));

process.once('SIGINT', ()=>bot.stop('SIGINT'));
process.once('SIGTERM', ()=>bot.stop('SIGTERM'));
