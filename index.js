import 'dotenv/config';
import { Telegraf } from 'telegraf';
import pg from 'pg';
import WebSocket from 'ws';

const TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID || process.env.TELEGRAM_CHAT_ID;
const LIVE = (process.env.LIVE_TRADING || "false") === "true";
const DRY_RUN =!LIVE;

if (!TOKEN) { console.error("❌ No hay token"); process.exit(1); }

const bot = new Telegraf(TOKEN);
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

let state = { holdings: {}, customWallets: [], walletAmounts: {}, walletAliases: {}, tradeAmount: 0.02 };

async function loadState() {
  try {
    const r = await pool.query("SELECT data FROM bot_state WHERE id='main'");
    if (r.rows[0]?.data) state = {...state,...r.rows[0].data };
  } catch {}
}
async function saveState() {
  try {
    await pool.query("INSERT INTO bot_state(id,data) VALUES('main',$1) ON CONFLICT(id) DO UPDATE SET data=$1", [state]);
  } catch(e){ console.error(e.message) }
}
function getAllWallets() {
  const envW = (process.env.WALLETS || "").split(",").map(s=>s.trim()).filter(Boolean);
  return [...new Set([...envW,...(state.customWallets||[])])];
}
function getAlias(addr) {
  return state.walletAliases[addr] || state.walletAliases[addr.toLowerCase()] || addr.slice(0,6);
}

bot.command('help', (ctx) => {
  ctx.reply(`MEMEBOT v4.2.1 - CON ALIAS:
 /estado
 /wallets - ver con alias
 /add_wallet 0x123... 0.05
 /remove_wallet 0x123...
 /set_alias 0x123... Dior
 /set_trade 0.02
 /set_wallet_amount 0x123... 0.1
 /reset`);
});

bot.command('estado', async (ctx) => {
  await loadState();
  ctx.reply(`v4.2.1 | ${DRY_RUN?'SIMULACION 🧪':'REAL 🔴'} | Wallets:${getAllWallets().length} | Holdings:${Object.keys(state.holdings).length} | Trade:${state.tradeAmount} SOL`);
});

bot.command('wallets', (ctx) => {
  const wallets = getAllWallets();
  if (!wallets.length) return ctx.reply("No hay wallets. Usa /add_wallet");
  let msg = `Copiando ${wallets.length} wallets:\n\n`;
  wallets.forEach((w,i)=>{
    const alias = getAlias(w);
    const amt = state.walletAmounts[w] || state.walletAmounts[w.toLowerCase()] || state.tradeAmount;
    msg += `${i+1}. ${alias}\n ${w.slice(0,8)}...${w.slice(-4)} -> ${amt} SOL\n`;
  });
  ctx.reply(msg);
});

bot.command('add_wallet', async (ctx) => {
  const parts = ctx.message.text.split(" ");
  const addr = parts[1];
  const amt = parseFloat(parts[2]);
  if (!addr) return ctx.reply("Uso: /add_wallet direccion 0.05");
  if (!state.customWallets.includes(addr)) state.customWallets.push(addr);
  if (amt) { state.walletAmounts[addr]=amt; state.walletAmounts[addr.toLowerCase()]=amt; }
  await saveState();
  ctx.reply(`✅ Agregado ${getAlias(addr)} con ${amt||state.tradeAmount} SOL`);
  connectPump();
});

bot.command('remove_wallet', async (ctx) => {
  const addr = ctx.message.text.split(" ")[1];
  if (!addr) return ctx.reply("Uso: /remove_wallet direccion");
  state.customWallets = state.customWallets.filter(w=>w.toLowerCase()!==addr.toLowerCase());
  delete state.walletAmounts[addr]; delete state.walletAmounts[addr.toLowerCase()];
  delete state.walletAliases[addr]; delete state.walletAliases[addr.toLowerCase()];
  await saveState();
  ctx.reply(`🗑️ Quitado ${addr.slice(0,8)}... Total: ${getAllWallets().length}`);
});

bot.command('set_alias', async (ctx) => {
  const parts = ctx.message.text.split(" ");
  const addr = parts[1];
  const alias = parts.slice(2).join(" ");
  if (!addr ||!alias) return ctx.reply("Uso: /set_alias 0x123... Dior");
  state.walletAliases[addr]=alias;
  state.walletAliases[addr.toLowerCase()]=alias;
  await saveState();
  ctx.reply(`✅ Alias: ${addr.slice(0,6)}... = ${alias}`);
});

bot.command('set_trade', async (ctx) => {
  const amt = parseFloat(ctx.message.text.split(" ")[1]);
  if (!amt) return ctx.reply("Uso: /set_trade 0.02");
  state.tradeAmount=amt; await saveState();
  ctx.reply(`Monto global: ${amt} SOL`);
});

bot.command('set_wallet_amount', async (ctx) => {
  const [_, addr, amtStr] = ctx.message.text.split(" ");
  const amt = parseFloat(amtStr);
  if (!addr ||!amt) return ctx.reply("Uso: /set_wallet_amount 0x123... 0.1");
  state.walletAmounts[addr]=amt; state.walletAmounts[addr.toLowerCase()]=amt;
  await saveState();
  ctx.reply(`✅ ${getAlias(addr)} ahora con ${amt} SOL`);
});

bot.command('reset', async (ctx) => {
  state.holdings={}; await saveState();
  ctx.reply("Snapshot borrada ✅");
});

await loadState();
bot.launch();
console.log(`MEMEBOT v4.2.1 LISTO | Wallets:${getAllWallets().length} | DRY_RUN=${DRY_RUN}`);

let ws;
function connectPump(){
  const toWatch = getAllWallets().filter(w=>!w.startsWith("0x"));
  if(ws) try{ws.close()}catch{}
  if(!toWatch.length) { console.log("Sin wallets SOL para WS"); return; }
  ws = new WebSocket("wss://pumpportal.fun/api/data");
  ws.on('open', ()=>{ console.log(`[PUMP] Escuchando ${toWatch.length}`); ws.send(JSON.stringify({method:"subscribeAccountTrade", keys:toWatch})); });
  ws.on('message', async (d)=>{
    try{
      const tx = JSON.parse(d.toString());
      if(!tx.mint) return;
      if(state.holdings[tx.mint]) {
        console.log(`[R2] ${getAlias(tx.traderPublicKey)} promedio ${tx.mint.slice(0,6)}`);
        if(DRY_RUN && CHAT_ID) bot.telegram.sendMessage(CHAT_ID, `🧪 [R2 IGNORADO] ${getAlias(tx.traderPublicKey)} promedio ${tx.mint.slice(0,6)}`).catch(()=>{});
        return;
      }
      console.log(`[NUEVA] ${getAlias(tx.traderPublicKey)} compro ${tx.mint.slice(0,6)}`);
      if(DRY_RUN && CHAT_ID) bot.telegram.sendMessage(CHAT_ID, `🧪 ${getAlias(tx.traderPublicKey)} COMPRÓ ${tx.mint.slice(0,6)} -> hubiera copiado ${state.walletAmounts[tx.traderPublicKey]||state.tradeAmount} SOL`).catch(()=>{});
    }catch{}
  });
  ws.on('close', ()=>setTimeout(connectPump,5000));
}
connectPump();
