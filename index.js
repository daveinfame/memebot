import 'dotenv/config';
import { Telegraf } from 'telegraf';
import pg from 'pg';
import WebSocket from 'ws';

const TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN_BOT;
const CHAT_ID = process.env.CHAT_ID || process.env.TELEGRAM_CHAT_ID;
const LIVE = (process.env.LIVE_TRADING || "false") === "true";
const DRY_RUN =!LIVE;

if (!TOKEN) {
  console.error("❌ No hay BOT_TOKEN ni TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

const bot = new Telegraf(TOKEN);
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

let state = { holdings: {}, customWallets: [], walletAmounts: {}, tradeAmount: 0.02 };

async function loadState() {
  try {
    const r = await pool.query("SELECT data FROM bot_state WHERE id='main'");
    if (r.rows[0] && r.rows[0].data) {
      state = {...state,...r.rows[0].data };
      console.log(`Estado cargado: ${Object.keys(state.holdings).length} holdings, ${state.customWallets.length} custom wallets`);
    }
  } catch(e){ console.log("State virgen"); }
}
async function saveState() {
  try {
    await pool.query("INSERT INTO bot_state(id,data) VALUES('main',$1) ON CONFLICT(id) DO UPDATE SET data=$1", [state]);
  } catch(e){ console.error("save error", e.message) }
}

function getAllWallets() {
  const envWallets = (process.env.WALLETS || "").split(",").map(s=>s.trim()).filter(Boolean);
  const all = [...new Set([...envWallets,...(state.customWallets||[])])];
  return all;
}

bot.command('help', (ctx) => {
  ctx.reply(`MEMEBOT v4.2 - CONTROL POR TELEGRAM:
 /estado - estado del bot
 /wallets - ver wallets que copias
 /add_wallet 0x123... 0.05 - agrega wallet (monto opcional)
 /remove_wallet 0x123... - quita wallet
 /set_trade 0.02 - monto global para todos
 /set_wallet_amount 0x123... 0.1 - monto especial solo para esa wallet
 /reset - borra snapshot y holdings
 Todo se guarda solo, no toques Railway.`);
});

bot.command('estado', async (ctx) => {
  await loadState();
  ctx.reply(`v4.2 | MODE:pump | ${DRY_RUN? 'SIMULACION 🧪':'REAL 🔴'}
WS: Conectado ✅
Wallets totales: ${getAllWallets().length}
Holdings: ${Object.keys(state.holdings).length}
Trade global: ${state.tradeAmount||0.02} SOL
LIVE_TRADING: ${LIVE}
ChatID: ${CHAT_ID||'no seteado'}`);
});

bot.command('wallets', (ctx) => {
  const wallets = getAllWallets();
  if (!wallets.length) return ctx.reply("No hay wallets. Agrega con /add_wallet direccion");
  let msg = `Copiando ${wallets.length} wallets:\n`;
  wallets.slice(0,20).forEach((w,i)=>{
    const amt = state.walletAmounts[w] || state.tradeAmount;
    msg+=`${i+1}. ${w.slice(0,6)}...${w.slice(-4)} -> ${amt} SOL\n`;
  });
  ctx.reply(msg);
});

bot.command('add_wallet', async (ctx) => {
  const parts = ctx.message.text.split(" ");
  const addr = parts[1];
  const amt = parseFloat(parts[2]);
  if (!addr) return ctx.reply("Uso: /add_wallet 0x123... 0.05");
  if (!state.customWallets.includes(addr)) state.customWallets.push(addr);
  if (amt) state.walletAmounts[addr] = amt;
  await saveState();
  ctx.reply(`✅ Agregada ${addr.slice(0,10)}... con monto ${amt||state.tradeAmount} SOL\nTotal: ${getAllWallets().length}`);
  connectPump(); // reconecta con nueva
});

bot.command('remove_wallet', async (ctx) => {
  const addr = ctx.message.text.split(" ")[1];
  if (!addr) return ctx.reply("Uso: /remove_wallet 0x123...");
  state.customWallets = state.customWallets.filter(w=>w.toLowerCase()!==addr.toLowerCase());
  delete state.walletAmounts[addr];
  await saveState();
  ctx.reply(`🗑️ Quitada ${addr.slice(0,10)}...\nTotal: ${getAllWallets().length}`);
});

bot.command('set_trade', async (ctx) => {
  const amt = parseFloat(ctx.message.text.split(" ")[1]);
  if (!amt) return ctx.reply("Uso: /set_trade 0.02");
  state.tradeAmount = amt;
  await saveState();
  ctx.reply(`Monto global cambiado a ${amt} SOL para todos (excepto los que tienen monto especial)`);
});

bot.command('set_wallet_amount', async (ctx) => {
  const [_, addr, amtStr] = ctx.message.text.split(" ");
  const amt = parseFloat(amtStr);
  if (!addr ||!amt) return ctx.reply("Uso: /set_wallet_amount 0x123... 0.1");
  state.walletAmounts[addr] = amt;
  await saveState();
  ctx.reply(`✅ ${addr.slice(0,6)}... ahora copia con ${amt} SOL`);
});

bot.command('reset', async (ctx) => {
  state.holdings = {};
  await saveState();
  ctx.reply("Snapshot borrada ✅ - Bot virgen");
});

await loadState();
bot.launch();
console.log(`MEMEBOT v4.2 LISTO | Token OK | DRY_RUN=${DRY_RUN} | Wallets:${getAllWallets().length}`);

// PUMP WS
let ws;
function connectPump() {
  const toWatch = getAllWallets().filter(w=>!w.startsWith("0x")); // solo SOL para pump
  if (ws) try{ws.close()}catch{}
  if (!toWatch.length) {
    console.log("No hay wallets SOL para escuchar, esperando wallets EVM o nuevas...");
    return;
  }
  ws = new WebSocket("wss://pumpportal.fun/api/data");
  ws.on('open', () => {
    console.log(`[PUMP WS] Conectado ✅ - Escuchando ${toWatch.length} wallets SOL`);
    ws.send(JSON.stringify({ method: "subscribeAccountTrade", keys: toWatch }));
  });
  ws.on('message', async (data) => {
    try {
      const tx = JSON.parse(data.toString());
      if (!tx.mint) return;
      if (state.holdings[tx.mint]) {
        console.log(`[R2 IGNORADO] ${tx.traderPublicKey.slice(0,6)} promedio ${tx.mint.slice(0,6)}`);
        if (DRY_RUN && CHAT_ID) bot.telegram.sendMessage(CHAT_ID, `🧪 [R2] ${tx.traderPublicKey.slice(0,6)} promedio ${tx.mint.slice(0,6)} → IGNORADO`).catch(()=>{});
        return;
      }
      console.log(`[NUEVA] ${tx.traderPublicKey.slice(0,6)} compro ${tx.mint.slice(0,6)}`);
      if (DRY_RUN && CHAT_ID) {
        bot.telegram.sendMessage(CHAT_ID, `🧪 [SIMULACION] 🟢 ${tx.traderPublicKey.slice(0,6)} COMPRÓ ${tx.mint.slice(0,6)} | Hubiera copiado ${state.walletAmounts[tx.traderPublicKey]||state.tradeAmount} SOL`).catch(()=>{});
      }
    } catch {}
  });
  ws.on('close', () => setTimeout(connectPump, 5000));
  ws.on('error', (e)=> console.log("WS error", e.message));
}
connectPump();
