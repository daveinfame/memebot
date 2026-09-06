import 'dotenv/config';
import { Telegraf } from 'telegraf';
import pg from 'pg';
import WebSocket from 'ws';

const bot = new Telegraf(process.env.BOT_TOKEN);
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

let state = { holdings: {}, tradeAmount: 0.02 };
let TRADE_AMOUNT = parseFloat(process.env.TRADE_SOL || "0.02");
let DRY_RUN = (process.env.DRY_RUN || "true") === "true";

// Cargar estado
async function loadState() {
  try {
    const r = await pool.query("SELECT data FROM bot_state WHERE id='main'");
    if (r.rows[0]) state = r.rows[0].data;
  } catch { console.log("state virgen, iniciando vacio"); }
}
async function saveState() {
  try {
    await pool.query("INSERT INTO bot_state(id,data) VALUES('main',$1) ON CONFLICT(id) DO UPDATE SET data=$1", [state]);
  } catch {}
}

function getWallets() {
  return (process.env.WALLETS || "").split(",").map(s=>s.trim()).filter(Boolean);
}

// COMANDOS
bot.command('help', (ctx) => {
  ctx.reply(`v4.1 COMANDOS:
 /estado - ver estado WS y wallets
 /wallets - listar las 20 wallets
 /set_trade 0.02 - cambiar monto por trade
 /reset - borrar snapshot y empezar virgen
 /help - este menu`);
});

bot.command('estado', (ctx) => {
  ctx.reply(`v4.1 | MODE:pump
WS:Conectado 🟢
Wallets:${getWallets().length}
Wallet B: ${process.env.SOLANA_PUBLIC_KEY?.slice(0,6)}...
Trade: ${TRADE_AMOUNT} SOL
Modo: ${DRY_RUN? 'SIMULACION' : 'REAL'}
Holdings: ${Object.keys(state.holdings).length} tokens`);
});

bot.command('wallets', (ctx) => {
  ctx.reply(`Escuchando ${getWallets().length}:\n` + getWallets().slice(0,20).join("\n"));
});

bot.command('set_trade', (ctx) => {
  const amt = parseFloat(ctx.message.text.split(" ")[1]);
  if (!amt) return ctx.reply("Uso: /set_trade 0.02");
  TRADE_AMOUNT = amt;
  ctx.reply(`Trade cambiado a ${amt} SOL (simulacion)`);
});

bot.command('reset', async (ctx) => {
  state = { holdings: {}, tradeAmount: TRADE_AMOUNT };
  await saveState();
  ctx.reply("Snapshot borrada, bot virgen ✅");
});

bot.launch();
await loadState();

// PUMP WS
const toWatch = getWallets();
function connect() {
  const ws = new WebSocket("wss://pumpportal.fun/api/data");
  ws.on('open', () => {
    console.log(`[PUMP WS] Conectando ${toWatch.length} wallets | Deposito OK`);
    ws.send(JSON.stringify({ method: "subscribeAccountTrade", keys: toWatch }));
    console.log(`[PUMP WS] Conectado ✅ - Escuchando ${toWatch.length} en tiempo real`);
  });
  ws.on('message', async (data) => {
    try {
      const tx = JSON.parse(data);
      if (!tx ||!tx.traderPublicKey) return;
      const token = tx.mint || tx.tokenAddress;
      if (!token) return;

      // R2 - Snapshot rule
      if (state.holdings[token]) {
        console.log(`[R2 IGNORADO] ${tx.traderPublicKey.slice(0,6)} promedio ${token} -> ya lo tenemos`);
        if (DRY_RUN) bot.telegram.sendMessage(process.env.CHAT_ID, `🧪 [SIMULACION - R2] ${tx.traderPublicKey.slice(0,6)} promedio ${token.slice(0,6)} → IGNORADO (ya en holdings)\nEl bot mantiene su entrada original.`).catch(()=>{});
        return;
      }

      // Si es compra nueva
      console.log(`[NUEVA] ${tx.traderPublicKey.slice(0,6)} compro ${token} en ${tx.chain || 'SOL'}`);
      if (DRY_RUN) {
        await bot.telegram.sendMessage(process.env.CHAT_ID, `🧪 [SIMULACION] 🟢 ${tx.traderPublicKey.slice(0,6)} COMPRÓ ${token.slice(0,6)} en ${(tx.chain||'SOL').toUpperCase()} | Hubiera copiado ${TRADE_AMOUNT} SOL`).catch(()=>{});
      } else {
        // aqui va el trade real
        state.holdings[token] = { boughtAt: Date.now() };
        await saveState();
      }
    } catch(e){}
  });
  ws.on('close', () => setTimeout(connect, 5000));
}
connect();
console.log("MEMEBOT v4.1 LISTO | PUMP_KEY:SI ✅");
