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

async function initDB(){ await pool.query(`CREATE TABLE IF NOT EXISTS bot_state (id TEXT PRIMARY KEY, data JSONB)`); }
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
  }catch(e){ console.error('saveState error', e.message); }
}

let state = await initDB().then(()=>loadState());
console.log('LOADED', state.wallets?.length||0);
const save = () => saveState(state);
const addChat = (id) => {
  if(!state.notifyChats) state.notifyChats=[];
  if(!state.notifyChats.includes(id)){ state.notifyChats.push(id); save(); }
};

bot.start((ctx)=>{ addChat(ctx.chat.id); ctx.reply('Bot v4.5.1 FIX MULTICHAIN ONLINE 🟢'); });
bot.command('help', (ctx)=>{ addChat(ctx.chat.id); ctx.reply('/add alias address amount chain (sol/evm/base/bnb/eth)\n/wallets\nLIVE='+ (LIVE_TRADING?'REAL':'PAPER')); });
bot.command('wallets', (ctx)=>{
  addChat(ctx.chat.id);
  if(!state.wallets.length) return ctx.reply('Vacío');
  let m=''; const by={};
  state.wallets.forEach(w=>{ (by[w.alias]=by[w.alias]||[]).push(w); });
  for(const a in by){ m+=`\n${a}:\n`; by[a].forEach(w=>m+=` - [${w.chain}] ${w.address.slice(0,8)}.. ${w.amount}\n`); }
  ctx.reply(m||'Vacío');
});
bot.command('add', (ctx)=>{
  addChat(ctx.chat.id);
  const p=ctx.message.text.split(' ').filter(Boolean);
  if(p.length<5) return ctx.reply('Uso: /add alias address amount chain');
  const alias=p[1].toLowerCase(), address=p[2], amount=parseFloat(p[3]), chain=p[4].toLowerCase();
  state.wallets=state.wallets.filter(w=>!(w.alias===alias && w.address===address && w.chain===chain));
  state.wallets.push({alias,address,amount,chain});
  save(); ctx.reply(`Guardada ${alias} [${chain}] ${amount}`);
});

function connect(){
  const ws = new WebSocket('wss://pumpportal.fun/api/data');
  ws.on('open', ()=>{
    console.log('WS conectado');
    const keys=[...new Set(state.wallets.map(w=>w.address))];
    if(keys.length) ws.send(JSON.stringify({method:"subscribeAccountTrade", keys}));
  });
  ws.on('message', async (d)=>{
    try{
      const t=JSON.parse(d.toString());
      const trader=(t.traderPublicKey||t.trader||'').toString();
      if(!trader) return;
      const matches=state.wallets.filter(w=>w.address.toLowerCase()===trader.toLowerCase());
      for(const w of matches){
        const msg=`🧪 [${w.chain.toUpperCase()}] ${w.alias} compro ${(t.mint||'').slice(0,6)} -> hubiera copiado ${w.amount}`;
        console.log(msg);
        for(const id of state.notifyChats){ try{ await bot.telegram.sendMessage(id, msg); }catch{} }
      }
    }catch{}
  });
  ws.on('close', ()=>setTimeout(connect,5000));
  ws.on('error', (e)=>console.error(e.message));
}
connect();
bot.launch();
console.log('Bot v4.5.1 LIVE', LIVE_TRADING);
