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

// Estructura nueva: wallets = [{alias, address, amount, chain}]
let state = { holdings: {}, wallets: [], tradeAmount: 0.02 };

async function loadState() {
  try {
    const r = await pool.query("SELECT data FROM bot_state WHERE id='main'");
    if (r.rows[0]?.data) {
      state = {...state,...r.rows[0].data };
      // migracion de formato viejo
      if (!state.wallets) state.wallets = [];
      if (state.customWallets && state.customWallets.length && state.wallets.length === 0) {
        console.log("Migrando formato viejo...");
      }
    }
  } catch {}
}
async function saveState() {
  try { await pool.query("INSERT INTO bot_state(id,data) VALUES('main',$1) ON CONFLICT(id) DO UPDATE SET data=$1", [state]); } catch(e){ console.error(e.message) }
}

function findWalletsByAlias(alias) { return state.wallets.filter(w => w.alias.toLowerCase() === alias.toLowerCase()); }

bot.command('help', (ctx) => {
  ctx.reply(`MEMEBOT v4.3 - SOL / EVM
/add alias wallet monto red
  red = sol o evm (obligatorio)
  Ej: /add sapphy 7xKX... 0.05 sol
      /add sapphy 0x123... 0.05 evm

/wallets - ver todo agrupado
/remove alias - borra todo ese alias
/remove alias red - borra solo esa red
  Ej: /remove sapphy evm

/set alias monto - cambia monto en todas sus redes
/set alias monto red - solo esa red
  Ej: /set sapphy 0.08
      /set sapphy 0.1 evm

/estado - estado
/reset - borra holdings`);
});

bot.command('estado', async (ctx) => {
  await loadState();
  ctx.reply(`v4.3 | ${DRY_RUN?'SIMULACION 🧪':'REAL 🔴'} | Wallets: ${state.wallets.length} | Holdings: ${Object.keys(state.holdings).length}\nModo: pumpportal multichain (sol+evm)`);
});

bot.command('wallets', (ctx) => {
  if (!state.wallets.length) return ctx.reply("Vacío. Agrega: /add alias wallet monto red");
  const grouped = {};
  state.wallets.forEach(w => {
    if (!grouped[w.alias]) grouped[w.alias] = [];
    grouped[w.alias].push(w);
  });
  let msg = `Copiando ${state.wallets.length} lineas:\n\n`;
  for (const alias in grouped) {
    msg += `${alias}:\n`;
    grouped[alias].forEach(w => {
      msg += ` - ${w.chain}: ${w.address.slice(0,6)}...${w.address.slice(-4)} -> ${w.amount}\n`;
    });
  }
  ctx.reply(msg);
});

bot.command('add', async (ctx) => {
  const parts = ctx.message.text.trim().split(/\s+/);
  // /add alias wallet monto red
  if (parts.length < 5) return ctx.reply("❌ Uso: /add alias wallet monto red\nEj: /add sapphy 0x123... 0.05 evm\nRed solo: sol o evm");
  const alias = parts[1];
  const wallet = parts[2];
  const amount = parseFloat(parts[3]);
  const chain = parts[4].toLowerCase();

  if (!amount || amount <= 0) return ctx.reply("❌ Monto obligatorio y mayor a 0. Ejemplo: 0.05");
  if (!['sol','evm'].includes(chain)) return ctx.reply("❌ Red solo puede ser 'sol' o 'evm'");
  if (chain === 'evm' &&!wallet.startsWith('0x')) return ctx.reply("❌ Para evm la wallet debe empezar con 0x");
  if (chain === 'sol' && wallet.startsWith('0x')) return ctx.reply("❌ Para sol no uses 0x, usa dirección solana");

  // si ya existe mismo alias+chain, lo reemplaza
  state.wallets = state.wallets.filter(w =>!(w.alias.toLowerCase() === alias.toLowerCase() && w.chain === chain));
  state.wallets.push({ alias, address: wallet, amount, chain, addressLower: wallet.toLowerCase() });
  await saveState();
  ctx.reply(`✅ Agregado: ${alias} | ${chain} | ${wallet.slice(0,6)}... -> ${amount}`);
  connectPump();
});

bot.command('remove', async (ctx) => {
  const parts = ctx.message.text.trim().split(/\s+/);
  const alias = parts[1];
  const chain = parts[2]?.toLowerCase();
  if (!alias) return ctx.reply("Uso: /remove alias o /remove alias evm");
  const before = state.wallets.length;
  if (chain) {
    if (!['sol','evm'].includes(chain)) return ctx.reply("Red solo sol o evm");
    state.wallets = state.wallets.filter(w =>!(w.alias.toLowerCase() === alias.toLowerCase() && w.chain === chain));
  } else {
    state.wallets = state.wallets.filter(w => w.alias.toLowerCase()!== alias.toLowerCase());
  }
  await saveState();
  ctx.reply(`🗑️ Borrado ${alias}${chain?' '+chain:''}. ${before - state.wallets.length} linea(s) eliminadas. Quedan ${state.wallets.length}`);
  connectPump();
});

bot.command('set', async (ctx) => {
  const parts = ctx.message.text.trim().split(/\s+/);
  // /set alias monto o /set alias monto red
  if (parts.length < 3) return ctx.reply("Uso: /set alias monto o /set alias monto red");
  const alias = parts[1];
  const amount = parseFloat(parts[2]);
  const chain = parts[3]?.toLowerCase();
  if (!amount || amount <= 0) return ctx.reply("Monto obligatorio mayor a 0");
  if (chain &&!['sol','evm'].includes(chain)) return ctx.reply("Red solo sol o evm");

  let count = 0;
  state.wallets.forEach(w => {
    if (w.alias.toLowerCase() === alias.toLowerCase()) {
      if (!chain || w.chain === chain) { w.amount = amount; count++; }
    }
  });
  if (!count) return ctx.reply(`No encontré ${alias}${chain?' '+chain:''}`);
  await saveState();
  ctx.reply(`✅ ${alias}${chain?' '+chain:''} ahora con ${amount} (${count} linea(s) actualizada(s))`);
});

bot.command('reset', async (ctx) => { state.holdings={}; await saveState(); ctx.reply("Holdings borrados ✅"); });

await loadState();
bot.launch();
console.log(`MEMEBOT v4.3 LISTO | ${state.wallets.length} wallets | DRY_RUN=${DRY_RUN}`);

let ws;
function connectPump(){
  const allAddrs = [...new Set(state.wallets.map(w=>w.address))];
  if(ws) try{ws.close()}catch{}
  if(!allAddrs.length){ console.log("Sin wallets para escuchar"); return; }
  ws = new WebSocket("wss://pumpportal.fun/api/data");
  ws.on('open', ()=>{ console.log(`[PUMP] Escuchando ${allAddrs.length} addrs (${state.wallets.length} lineas)`); ws.send(JSON.stringify({method:"subscribeAccountTrade", keys: allAddrs})); });
  ws.on('message', (d)=>{
    try{
      const tx = JSON.parse(d.toString());
      if(!tx.mint) return;
      const trader = tx.traderPublicKey;
      const match = state.wallets.find(w=>w.addressLower === trader.toLowerCase() || w.address === trader);
      if(!match) return;
      const alias = match.alias;
      if(state.holdings[tx.mint]) {
        if(DRY_RUN && CHAT_ID) bot.telegram.sendMessage(CHAT_ID, `🧪 [R2] ${alias} (${match.chain}) promedio ${tx.mint.slice(0,6)} IGNORADO`).catch(()=>{});
        return;
      }
      console.log(`[NUEVA] ${alias} ${match.chain} compro ${tx.mint.slice(0,6)}`);
      if(DRY_RUN && CHAT_ID) bot.telegram.sendMessage(CHAT_ID, `🧪 ${alias} [${match.chain}] COMPRÓ ${tx.mint.slice(0,6)} -> hubiera copiado ${match.amount}`).catch(()=>{});
    }catch{}
  });
  ws.on('close', ()=>setTimeout(connectPump,5000));
}
connectPump();
