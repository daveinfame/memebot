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
    return r.rows[0].data;
  }catch{ return { wallets:[], notifyChats:[] }; }
}
async function saveState(s){ await pool.query(`INSERT INTO bot_state(id,data) VALUES('main',$1) ON CONFLICT(id) DO UPDATE SET data=$1`,[s]); }

let state = await initDB().then(()=>loadState());
const save = () => saveState(state).catch(console.error);
const addChat = (id) => { if(!state.notifyChats.includes(id)){ state.notifyChats.push(id); save(); } };

// COMMANDS
bot.start((ctx)=>{ addChat(ctx.chat.id); ctx.reply('Bot v4.5 MULTICHAIN ONLINE 🟢 SOL+EVM por Pump.fun'); });
bot.command('help', (ctx)=>{ addChat(ctx.chat.id); ctx.reply(`/add alias address amount chain\nchain = sol | evm | base | bnb | eth\nEj: /add sapphy 0x123 0.01 evm\n/wallets\n/set alias amount chain\nLIVE=${LIVE_TRADING?'REAL':'PAPER'}`); });

bot.command('wallets', (ctx)=>{
  addChat(ctx.chat.id);
  if(!state.wallets.length) return ctx.reply('Vacío');
  let m=''; const by={};
  state.wallets.forEach(w=>{ (by[w.alias]=by[w.alias]||[]).push(w); });
  for(const a in by){ m+=`\n${a}:\n`; by[a].forEach(w=>m+=` - [${w.chain}] ${w.address.slice(0,8)}.. ${w.amount}\n`); }
  ctx.reply(m);
});

bot.command('add', (ctx)=>{
  addChat(ctx.chat.id);
  const p=ctx.message.text.split(' ').filter(Boolean);
  if(p.length<5) return ctx.reply('Uso: /add alias address amount chain');
  const [_,alias,address,amt,chainRaw]=p;
  const chain=chainRaw.toLowerCase();
  const amount=parseFloat(amt);
  state.wallets=state.wallets.filter(w=>!(w.alias===alias.toLowerCase() && w.address===address && w.chain===chain));
  state.wallets.push({alias:alias.toLowerCase(), address, amount, chain});
  save(); ctx.reply(`Guardada ${alias} [${chain}] ${amount}`);
});
bot.command('set', (ctx)=>{
  addChat(ctx.chat.id);
  const p=ctx.message.text.split(' ').filter(Boolean);
  if(p.length<4) return ctx.reply('Uso: /set alias amount chain');
  const alias=p[1].toLowerCase(), amount=parseFloat(p[2]), chain=p[3].toLowerCase();
  let c=0; state.wallets.forEach(w=>{ if(w.alias===alias && w.chain===chain){ w.amount=amount; c++; } });
  save(); ctx.reply(`Update ${c} wallets`);
});

// WS MULTICHAIN
function connect(){
  const ws = new WebSocket('wss://pumpportal.fun/api/data');
  ws.on('open', ()=>{
    console.log('WS Pump multichain conectado');
    const keys = state.wallets.map(w=>w.address);
    const uniq = [...new Set(keys)];
    if(uniq.length) ws.send(JSON.stringify({method:"subscribeAccountTrade", keys:uniq}));
  });
  ws.on('message', async (d)=>{
    try{
      const t = JSON.parse(d.toString());
      const trader = t.traderPublicKey || t.trader || t.wallet || t.account;
      if(!trader) return;
      const matches = state.wallets.filter(w=>w.address.toLowerCase()===trader.toLowerCase());
      if(!matches.length) return;
      for(const w of matches){
        const msg=`🧪 [${w.chain.toUpperCase()}] ${w.alias} ${ (t.txType||'TRADE')} ${ (t.mint||t.token||'').toString().slice(0,6)} por ${t.solAmount||t.amount||''} -> hubiera copiado ${w.amount} [${w.chain}] ${LIVE_TRADING?'REAL':'(PAPER)'}`;
        console.log(msg);
        for(const chatId of state.notifyChats){ try{ await bot.telegram.sendMessage(chatId, msg); }catch{} }
      }
    }catch(e){ console.error(e.message); }
  });
  ws.on('close', ()=>setTimeout(connect,5000));
  ws.on('error', (e)=>console.error('WS err', e.message));
}
connect();
bot.launch();
console.log('Bot v4.5 MULTICHAIN LIVE=',LIVE_TRADING);
