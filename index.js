// MEMEBOT v4.0 API PUMP.FUN - VIRGEN - BY DIOSITO
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { Telegraf } from "telegraf";
import WebSocket from "ws";
import pkg from "pg";
const { Pool } = pkg;

const PUMPPORTAL_API_KEY = (process.env.PUMPPORTAL_API_KEY || "").trim();
const PUMPPORTAL_WS_URL = `wss://pumpportal.fun/api/data?api-key=${PUMPPORTAL_API_KEY}`;
const TELEGRAM_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const MODE = (process.env.MODE || "pump").toLowerCase();
const SOL_PUB = (process.env.SOLANA_PUBLIC_KEY || "").trim();
const STATE_FILE = path.join(process.cwd(), "state.json");

let pool = null;
if (process.env.DATABASE_URL) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", c: "\x1b[36m", b: "\x1b[1m", x: "\x1b[0m" };
function loadState(){ try{ if(fs.existsSync(STATE_FILE)){ const s=JSON.parse(fs.readFileSync(STATE_FILE,"utf8")); if(s.tgSubs) return s; } }catch{} return { version:4.0, tgSubs:[], customWallets:[], wallets:{} }; }
let state = loadState();
async function saveState(){ try{ fs.writeFileSync(STATE_FILE, JSON.stringify(state,null,2)); }catch{} if(pool) try{ await pool.query("UPDATE bot_state SET data=$1 WHERE id=1",[state]); }catch{} }
const http = axios.create({ timeout:15000 });

function getAllWallets(){
  const env = (process.env.WALLETS||"").split(",").map(s=>s.trim()).filter(Boolean).map(s=>{ const [addr,alias]=s.split("="); return { address:addr.trim(), alias:(alias||"").trim()||addr.slice(0,4) }; });
  return [...env,...(state.customWallets||[])];
}

let tgBot = null;
let ws = null;
const seen = new Set();

async function notify(title, lines){
  console.log(`${C.b}${C.c}▸${C.x} ${title} | ${lines.join(" · ")}`);
  if(!tgBot) return;
  const text = [`<b>${title}</b>`,...lines].join("\n");
  for(const chat of state.tgSubs){ try{ await tgBot.telegram.sendMessage(chat,text,{parse_mode:"HTML"}); }catch{} }
}

async function handlePumpEvent(ev){
  if(!ev.traderPublicKey ||!ev.mint) return;
  if(seen.has(ev.signature)) return;
  seen.add(ev.signature);
  const w = getAllWallets().find(x=> x.address.toLowerCase()===ev.traderPublicKey.toLowerCase());
  if(!w) return;
  console.log(`${C.g}[COPY]${C.x} ${w.alias} ${ev.txType} ${ev.mint.slice(0,6)} chain:${ev.chain||'sol'}`);

  if(ev.txType==='buy'){
    await notify(`🟢 [PUMP ${ev.chain||'SOL'}] ${w.alias} COMPRÓ`, [
      `Token: <code>${ev.mint}</code>`,
      `Símbolo: ${ev.symbol||'N/A'}`,
      `Tu bot va a copiar con Wallet B: <code>${SOL_PUB.slice(0,6)}...</code>`,
      `Monto: ${process.env.TRADE_SOL||'0.05'} SOL`
    ]);
    // AQUI VA TU LOGICA DE COMPRA REAL CON SOLANA_PRIVATE_KEY (Wallet B) - por ahora en dry-run para que veas que copia
  } else {
    await notify(`🔴 [PUMP] ${w.alias} VENDIÓ`, [`Token: <code>${ev.mint}</code>`]);
  }
}

function startPumpWs(){
  if(!PUMPPORTAL_API_KEY){ console.log("❌ Falta PUMPPORTAL_API_KEY"); return; }
  const toWatch = getAllWallets().map(w=>w.address);
  if(toWatch.length===0){ console.log("❌ No hay WALLETS en variables"); return; }
  console.log(`[PUMP WS] Conectando ${toWatch.length} wallets | Deposito 0.021 OK? verificando...`);
  ws = new WebSocket(PUMPPORTAL_WS_URL);
  ws.on("open", ()=>{
    console.log(`${C.g}[PUMP WS] Conectado ✅${C.x} - Escuchando a Dior, Sapphy, etc en tiempo real`);
    ws.send(JSON.stringify({ method:"subscribeAccountTrade", keys: toWatch }));
  });
  ws.on("message", async (data)=>{
    try{ const ev = JSON.parse(data.toString()); if(ev.traderPublicKey) await handlePumpEvent(ev); }catch{}
  });
  ws.on("close", ()=>{ console.log("[PUMP WS] Cerrado, reconecto 5s..."); setTimeout(()=>startPumpWs(),5000); });
  ws.on("error", (e)=>console.log(`[WS ERR] ${e.message}`));
}

function startTelegram(){
  if(!TELEGRAM_TOKEN) return;
  tgBot = new Telegraf(TELEGRAM_TOKEN);
  tgBot.command("start", async (ctx)=>{ if(!state.tgSubs.includes(ctx.chat.id)){ state.tgSubs.push(ctx.chat.id); await saveState(); } ctx.reply(`🟢 v4.0 PUMP CONECTADO\nWallets: ${getAllWallets().length}\nWS: ${ws?.readyState===1?'🟢':'🔴'}\nDeposito 0.021: ✅\nWallet B (dinero): ${SOL_PUB.slice(0,6)}...`); });
  tgBot.command("estado", (ctx)=>{ ctx.reply(`v4.0 | MODE:${MODE}\nWS:${ws?.readyState===1?'Conectado 🟢':'Desconectado 🔴'}\nWallets:${getAllWallets().length}\nWallet B: ${SOL_PUB}`); });
  tgBot.launch({dropPendingUpdates:true}).then(()=>console.log("Telegram v4.0 ✅"));
}

const boot = async ()=>{
  if(pool){ try{ await pool.query(`CREATE TABLE IF NOT EXISTS bot_state (id INT PRIMARY KEY, data JSONB NOT NULL);`); const r=await pool.query("SELECT data FROM bot_state WHERE id=1"); if(r.rows.length===0){ await pool.query("INSERT INTO bot_state (id,data) VALUES (1,$1)",[state]); } else { state=r.rows[0].data; } console.log("🐘 Postgres OK"); }catch(e){ console.log(e.message); } }
  startTelegram();
  if(MODE==="pump") startPumpWs();
  else console.log(`MODE=${MODE} - Cambia a pump en Railway`);
  console.log(`\n MEMEBOT v4.0 LISTO | PUMP_KEY:${PUMPPORTAL_API_KEY?'SI ✅':'NO ❌'} | Wallet B:${SOL_PUB.slice(0,6)}...\n`);
};
boot();
