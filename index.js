/* ============================================================
   MEMEBOT v2 — copy trading de memecoins (Solana) + POSTGRES
   ============================================================ */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { Telegraf } from "telegraf";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";
import pkg from "pg";
const { Pool } = pkg;

/* ================= configuración (.env) ================= */
const HELIUS_API_KEY = (process.env.HELIUS_API_KEY || "").trim();
const RPC_URL = HELIUS_API_KEY
? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : "https://api.mainnet-beta.solana.com";

const DEFAULT_TRADE_SOL = Number(process.env.TRADE_SOL || 0.1);
const WALLETS_ENV = (process.env.WALLETS || "")
.split(",")
.map((s) => s.trim())
.filter(Boolean)
.map((s) => {
    const [addr, alias, sol] = s.split("=");
    const address = addr.trim();
    return {
      address,
      alias: (alias || "").trim() || `${address.slice(0, 4)}…${address.slice(-4)}`,
      tradeSol: sol && Number(sol) > 0? Number(sol) : DEFAULT_TRADE_SOL,
    };
  });

const TELEGRAM_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "").trim();
const DISCORD_TOKEN = (process.env.DISCORD_BOT_TOKEN || "").trim();
const DISCORD_CHANNEL_ID = (process.env.DISCORD_CHANNEL_ID || "").trim();

const RESERVA_INICIAL = Number(process.env.RESERVA_SOL || 1.5);
const POLL_MS = Math.max(5000, Number(process.env.POLL_MS || 12000));
const SNAPSHOT_ON = (process.env.SNAPSHOT || "true")!== "false";
const ANTI_DUST_ON = (process.env.ANTI_DUST || "true")!== "false";
const AUTO_USDC_ON = (process.env.AUTO_USDC || "true")!== "false";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const STATE_FILE = path.join(process.cwd(), "state.json");

/* ================= POSTGRES (NUEVO - PERSISTENTE) ================= */
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  console.log("🐘 DATABASE_URL detectado -> usando Postgres");
} else {
  console.log("⚠️ Sin DATABASE_URL -> usando state.json local");
}

async function initDB() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_state (
        id INT PRIMARY KEY,
        data JSONB NOT NULL
      );
    `);
    const res = await pool.query("SELECT data FROM bot_state WHERE id = 1");
    if (res.rows.length === 0) {
      const initial = {
        version: 2,
        reserva: RESERVA_INICIAL,
        usdc: 0,
        startedAt: Date.now(),
        positions: {},
        wallets: {},
        tgSubs: [],
        customWallets: [],
      };
      await pool.query("INSERT INTO bot_state (id, data) VALUES (1, $1)", [initial]);
      console.log("✅ Postgres conectado - tabla bot_state creada");
    } else {
      console.log("✅ Postgres conectado - tablas listas");
    }
  } catch (e) {
    console.log(`❌ Error initDB: ${e.message}`);
  }
}

/* ================= consola (color + timestamps) ================= */
const C = {
  g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", c: "\x1b[36m",
  m: "\x1b[35m", b: "\x1b[1m", d: "\x1b[2m", x: "\x1b[0m",
};
const ts = () => new Date().toLocaleTimeString("es-ES", { hour12: false });
const say = {
  info: (m) => console.log(`${C.d}${ts()}${C.x} ${m}`),
  ok: (m) => console.log(`${C.d}${ts()}${C.x} ${C.g}✓${C.x} ${m}`),
  warn: (m) => console.log(`${C.d}${ts()}${C.x} ${C.y}⚠${C.x} ${m}`),
  err: (m) => console.log(`${C.d}${ts()}${C.x} ${C.r}✗${C.x} ${m}`),
  trade: (m) => console.log(`${C.d}${ts()}${C.x} ${C.b}${C.c}▸${C.x} ${C.b}${m}${C.x}`),
};

const BANNER = `
 ███╗ ███╗███████╗███╗ ███╗███████╗██████╗ ██████╗ ████████╗
 ████╗ ████║██╔════╝████╗ ████║██╔════╝██╔══██╗██╔═══██╗╚══██╔══╝
 ██╔████╔██║█████╗ ██╔████╔██║█████╗ ██████╔╝██║ ██║ ██║
 ██║╚██╔╝██║██╔══╝ ██╔══██╗██║ ██║ ██║
 ██║ ╚═╝ ██║███████╗██║ ╚═╝ ██║███████╗██████╔╝╚██████╔╝ ██║
 copy trading + postgres`;
/* ================= estado persistente (paper) - CON POSTGRES ================= */
function loadStateFile() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (s && typeof s.reserva === "number") {
        if (!s.customWallets) s.customWallets = [];
        if (!s.tgSubs) s.tgSubs = [];
        return s;
      }
    }
  } catch (e) {
    say.warn(`state.json corrupto, empezando de cero (${e.message})`);
  }
  return {
    version: 2,
    reserva: RESERVA_INICIAL,
    usdc: 0,
    startedAt: Date.now(),
    positions: {},
    wallets: {},
    tgSubs: [],
    customWallets: [],
  };
}

async function loadStateDB() {
  if (!pool) return null;
  try {
    const res = await pool.query("SELECT data FROM bot_state WHERE id = 1");
    if (res.rows.length > 0) return res.rows[0].data;
  } catch (e) {
    say.warn(`Postgres load falló, usando archivo: ${e.message}`);
  }
  return null;
}

async function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {}
  if (pool) {
    try {
      await pool.query("UPDATE bot_state SET data = $1 WHERE id = 1", [state]);
    } catch (e) {
      say.err(`no se pudo guardar en Postgres: ${e.message}`);
    }
  }
}

let state = loadStateFile();

function getAllWallets() {
  return [...WALLETS_ENV,...(state.customWallets || [])];
}

function walletState(addr) {
  if (!state.wallets[addr]) {
    state.wallets[addr] = {
      lastBlockTime: 0,
      snapshotIgnored: [],
      dusted: [],
      stats: { copies: 0, ignored: 0, dust: 0, pnlSol: 0, usdcSecured: 0 },
    };
  }
  return state.wallets[addr];
}

/* ================= RPC + metadatos + precios ================= */
const http = axios.create({ timeout: 15000 });

async function rpc(method, params) {
  const { data } = await http.post(RPC_URL, {
    jsonrpc: "2.0", id: 1, method, params,
  });
  if (data.error) throw new Error(data.error.message?? "RPC error");
  return data.result;
}

const tickerCache = new Map();
async function getTicker(mint) {
  if (tickerCache.has(mint)) return tickerCache.get(mint);
  if (HELIUS_API_KEY) {
    try {
      const asset = await rpc("getAsset", { id: mint });
      const sym = asset?.content?.metadata?.symbol;
      if (typeof sym === "string" && sym.trim()) {
        tickerCache.set(mint, sym.trim());
        return sym.trim();
      }
    } catch {}
  }
  try {
    const { data } = await http.get(`https://tokens.jup.ag/token/${mint}`);
    if (data && typeof data.symbol === "string" && data.symbol.trim()) {
      tickerCache.set(mint, data.symbol.trim());
      return data.symbol.trim();
    }
  } catch {}
  tickerCache.set(mint, "UNKNOWN");
  return "UNKNOWN";
}

const priceCache = new Map();
async function getPriceUsd(mint) {
  const hit = priceCache.get(mint);
  if (hit && Date.now() - hit.t < 30000) return hit.p;
  try {
    const { data } = await http.get(`https://price.jup.ag/v6/price?ids=${SOL_MINT},${mint}`);
    const p = data?.data?.[mint]?.price;
    if (typeof p === "number" && p > 0) {
      priceCache.set(mint, { p, t: Date.now() });
      return p;
    }
  } catch {}
  return null;
}

async function getSolUsd() {
  const hit = priceCache.get("SOL");
  if (hit && Date.now() - hit.t < 30000) return hit.p;
  try {
    const { data } = await http.get(`https://price.jup.ag/v6/price?ids=${SOL_MINT}`);
    const p = data?.data?.[SOL_MINT]?.price;
    if (typeof p === "number" && p > 0) {
      priceCache.set("SOL", { p, t: Date.now() });
      return p;
    }
  } catch {}
  try {
    const { data } = await http.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
    );
    const p = data?.solana?.usd;
    if (typeof p === "number" && p > 0) {
      priceCache.set("SOL", { p, t: Date.now() });
      return p;
    }
  } catch {}
  return null;
}

/* ================= clasificación de transacciones ================= */
function normalizeKeys(message) {
  const raw = message?.accountKeys?? [];
  if (!raw.length) return [];
  if (typeof raw[0]!== "string") {
    return raw.map((k) => ({ address: k?.pubkey, signer:!!k?.signer }));
  }
  return raw.map((a, i) => ({ address: a, signer: i === 0 }));
}

function classify(tx, wallet) {
  const meta = tx?.meta;
  if (!meta || meta.err) return null;
  const keys = normalizeKeys(tx?.transaction?.message);
  const isSigner = keys.some((k) => k.address === wallet && k.signer);
  const walletIdx = keys.findIndex((k) => k.address === wallet);
  let solDelta = 0;
  if (walletIdx >= 0 && meta.preBalances && meta.postBalances) {
    solDelta = (meta.postBalances[walletIdx] - meta.preBalances[walletIdx]) / 1e9;
  }
  const preByMint = new Map();
  for (const b of meta.preTokenBalances?? []) {
    if (b.owner === wallet) {
      preByMint.set(b.mint, (preByMint.get(b.mint)?? 0) + (b.uiTokenAmount?.uiAmount?? 0));
    }
  }
  const postByMint = new Map();
  for (const b of meta.postTokenBalances?? []) {
    if (b.owner === wallet) {
      postByMint.set(b.mint, (postByMint.get(b.mint)?? 0) + (b.uiTokenAmount?.uiAmount?? 0));
    }
  }
  let bestMint = null;
  let bestDelta = 0;
  for (const m of new Set([...preByMint.keys(),...postByMint.keys()])) {
    const d = (postByMint.get(m)?? 0) - (preByMint.get(m)?? 0);
    if (Math.abs(d) > Math.abs(bestDelta)) {
      bestDelta = d;
      bestMint = m;
    }
  }
  if (!bestMint || bestDelta === 0 || bestMint === SOL_MINT) return null;
  const txHash = tx.transaction?.signatures?.[0]?? "";
  const blockTime = (tx.blockTime?? 0) * 1000 || Date.now();
  if (bestDelta > 0) {
    if (isSigner && solDelta < 0) {
      return {
        type: "buy", mint: bestMint, txHash, blockTime,
        solAmount: Math.abs(solDelta), tokenAmount: bestDelta,
        postBalance: postByMint.get(bestMint)?? 0,
      };
    }
    return {
      type: "dust", mint: bestMint, txHash, blockTime,
      solAmount: 0, tokenAmount: bestDelta,
      postBalance: postByMint.get(bestMint)?? 0,
    };
  }
  return {
    type: "sell", mint: bestMint, txHash, blockTime,
    solAmount: Math.max(0, solDelta), tokenAmount: Math.abs(bestDelta),
    postBalance: postByMint.get(bestMint)?? 0,
  };
}

/* ================= notificaciones ================= */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const solscan = (h) => `https://solscan.io/tx/${h}`;
const usd = (sol, solUsd) => (solUsd? ` ($${(sol * solUsd).toFixed(2)})` : "");

async function notify({ title, lines, color, hash }) {
  say.trade(`${title} ${C.d}${lines.map((l) => l.replace(/<[^>]+>/g, "")).join(" · ")}${C.x}`);
  if (tgBot) {
    const text = [`<b>${title}</b>`,...lines, hash? `🔗 <a href="${solscan(hash)}">ver en Solscan</a>` : null]
    .filter(Boolean).join("\n");
    const targets = [...new Set([...state.tgSubs,...(TELEGRAM_CHAT_ID? [TELEGRAM_CHAT_ID] : [])])];
    for (const chat of targets) {
      try {
        await tgBot.telegram.sendMessage(chat, text, {
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
      } catch {}
    }
  }
  if (discordReady && DISCORD_CHANNEL_ID) {
    try {
      const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(lines.join("\n"))
      .setColor(color)
      .setTimestamp();
      if (hash) embed.setURL(solscan(hash));
      await discordClient.channels.cache.get(DISCORD_CHANNEL_ID)?.send({ embeds: [embed] });
    } catch {}
  }
}

const GREEN = 0x00ff41, RED = 0xff4d4d, YELLOW = 0xffd93d, CYAN = 0x5fd9f2;

/* ================= motor de reglas (R0–R5) ================= */
async function applyEvent(w, ev) {
  const ws = walletState(w.address);
  const solUsd = await getSolUsd();
  const symbol = await getTicker(ev.mint);

  if (ev.type === "buy") {
    if (SNAPSHOT_ON && ws.snapshotIgnored.includes(ev.mint)) {
      ws.stats.ignored++;
      await saveState();
      return notify({
        title: `🚫 R0 · ${w.alias} operó $${esc(symbol)} (ya lo tenía) → IGNORADO`,
        lines: [`Contrato: <code>${ev.mint}</code>`],
        color: YELLOW, hash: ev.txHash,
      });
    }
    if (ws.dusted.includes(ev.mint)) {
      ws.dusted = ws.dusted.filter((m) => m!== ev.mint);
      await saveState();
      say.info(`${w.alias} habilitó $${symbol}: compra válida pagando SOL (sale de cuarentena R0.5)`);
    }
    if (state.positions[ev.mint]) {
      ws.stats.ignored++;
      await saveState();
      return notify({
        title: `🚫 R2 · ${w.alias} promedió $${esc(symbol)} → IGNORADO (posición abierta)`,
        lines: [`El bot mantiene su entrada original (first-in).`],
        color: YELLOW, hash: ev.txHash,
      });
    }
    const size = Math.min(w.tradeSol, ev.solAmount);
    if (state.reserva < size) {
      return notify({
        title: `⚠️ R1 · RESERVA BAJA — no se copió la entrada de $${esc(symbol)}`,
        lines: [
          `${w.alias} compró ${ev.solAmount.toFixed(4)} SOL${usd(ev.solAmount, solUsd)}`,
          `Reserva disponible: ${state.reserva.toFixed(4)} SOL · se necesitan ${size.toFixed(4)}`,
        ],
        color: RED, hash: ev.txHash,
      });
    }
    const tokenUsd = await getPriceUsd(ev.mint);
    const entryPrice = ev.solAmount / ev.tokenAmount;
    state.positions[ev.mint] = {
      wallet: w.address, alias: w.alias, symbol,
      entryPrice, amountSol: size, tokenAmount: size / entryPrice,
      openedAt: Date.now(), usdValue: tokenUsd? size * solUsd : null,
    };
    state.reserva -= size;
    ws.stats.copies++;
    await saveState();
    return notify({
      title: `🟢 R1 · ${w.alias} COMPRÓ $${esc(symbol)} — BOT ENTRÓ`,
      lines: [
        `${w.alias} pagó: <b>${ev.solAmount.toFixed(4)} SOL</b>${usd(ev.solAmount, solUsd)}`,
        `🤖 Bot compró: <b>${size.toFixed(4)} SOL</b>${usd(size, solUsd)} @ ${entryPrice.toExponential(3)} SOL`,
        `Contrato: <code>${ev.mint}</code>`,
      ],
      color: GREEN, hash: ev.txHash,
    });
  }

  if (ev.type === "dust") {
    if (ANTI_DUST_ON &&!ws.dusted.includes(ev.mint)) ws.dusted.push(ev.mint);
    ws.stats.dust++;
    await saveState();
    say.info(`${C.y}R0.5 dust:${C.x} ${w.alias} recibió $${symbol} SIN pagar SOL → en cuarentena (${ev.mint})`);
    return;
  }

  if (ws.snapshotIgnored.includes(ev.mint) && ev.postBalance <= 0) {
    ws.snapshotIgnored = ws.snapshotIgnored.filter((m) => m!== ev.mint);
    await saveState();
    say.info(`R0: ${w.alias} vendió 100% de $${symbol} → liberado`);
  }
  const open = state.positions[ev.mint];
  if (!open) return;
  const exitPrice = ev.tokenAmount > 0? ev.solAmount / ev.tokenAmount : open.entryPrice;
  const proceeds = open.amountSol * (exitPrice / open.entryPrice);
  const pnlSol = proceeds - open.amountSol;
  const pnlPct = (exitPrice / open.entryPrice - 1) * 100;
  let r5Line;
  if (pnlSol > 0 && AUTO_USDC_ON) {
    const gain = pnlSol * (solUsd?? 0);
    state.reserva += open.amountSol;
    state.usdc += gain;
    ws.stats.usdcSecured += gain;
    r5Line = `💰 R5 GANANCIA: <b>+${pnlSol.toFixed(4)} SOL</b> → USDC (<b>+${gain.toFixed(2)} USDC</b>)`;
  } else {
    state.reserva += open.amountSol + pnlSol;
    r5Line = pnlSol >= 0
    ? `💰 R5 GANANCIA: <b>+${pnlSol.toFixed(4)} SOL</b>`
      : `💸 R5 PÉRDIDA: <b>−${Math.abs(pnlSol).toFixed(4)} SOL</b>`;
  }
  delete state.positions[ev.mint];
  ws.stats.pnlSol += pnlSol;
  await saveState();
  const win = pnlSol >= 0;
  return notify({
    title: `${win? "🟢" : "🔴"} R3 · ${w.alias} VENDIÓ $${esc(symbol)} — BOT CERRÓ 100%`,
    lines: [
      `PnL: <b>${win? "+" : "−"}${Math.abs(pnlPct).toFixed(1)}%</b> (${win? "+" : "−"}${Math.abs(pnlSol).toFixed(4)} SOL${usd(Math.abs(pnlSol), solUsd)})`,
      r5Line,
      `Reserva: ${state.reserva.toFixed(4)} SOL · USDC: ${state.usdc.toFixed(2)}`,
    ],
    color: win? GREEN : RED, hash: ev.txHash,
  });
}
/* ================= vigilancia ================= */
const seenSigs = new Set();
async function pollWallet(w) {
  const ws = walletState(w.address);
  let sigs;
  try {
    sigs = await rpc("getSignaturesForAddress", [w.address, { limit: 25 }]);
  } catch (e) {
    say.err(`RPC caído al leer ${w.alias}: ${e.message}`);
    return;
  }
  const fresh = (sigs?? [])
 .filter((s) =>!s.err &&!seenSigs.has(s.signature))
 .filter((s) => (s.blockTime?? 0) * 1000 > ws.lastBlockTime)
 .sort((a, b) => (a.blockTime?? 0) - (b.blockTime?? 0))
 .slice(0, 10);
  for (const s of fresh) {
    seenSigs.add(s.signature);
    let tx = null;
    try {
      tx = await rpc("getTransaction", [
        s.signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ]);
    } catch { continue; }
    if (!tx) continue;
    const ev = classify(tx, w.address);
    if (!ev) {
      ws.lastBlockTime = Math.max(ws.lastBlockTime, (tx.blockTime?? 0) * 1000);
      continue;
    }
    ws.lastBlockTime = Math.max(ws.lastBlockTime, ev.blockTime);
    try {
      await applyEvent(w, ev);
    } catch (e) {
      say.err(`procesando ${s.signature.slice(0, 12)}…: ${e.message}`);
    }
  }
  if (seenSigs.size > 2000) seenSigs.clear();
}

async function snapshotWallet(w) {
  if (!SNAPSHOT_ON) return;
  const ws = walletState(w.address);
  if (ws.snapshotIgnored.length || ws.lastBlockTime) return;
  try {
    const res = await rpc("getTokenAccountsByOwner", [
      w.address,
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      { encoding: "jsonParsed" },
    ]);
    const mints = [];
    for (const item of res?.value?? []) {
      const info = item?.account?.data?.parsed?.info;
      if (info?.mint && Number(info?.tokenAmount?.amount?? 0) > 0 &&!mints.includes(info.mint)) {
        mints.push(info.mint);
      }
    }
    ws.snapshotIgnored = mints;
    ws.lastBlockTime = Date.now();
    await saveState();
    say.ok(`R0 snapshot de ${w.alias}: ${mints.length} token(s) en TOKENS_IGNORADOS`);
  } catch (e) {
    ws.lastBlockTime = Date.now();
    say.warn(`snapshot de ${w.alias} falló (${e.message}) — anclado al presente`);
  }
}

async function loop() {
  for (const w of getAllWallets()) {
    await pollWallet(w);
    await new Promise((r) => setTimeout(r, 400));
  }
}

/* ================= Telegram ================= */
let tgBot = null;
function startTelegram() {
  if (!TELEGRAM_TOKEN) {
    say.warn("sin TELEGRAM_BOT_TOKEN → no habrá avisos en Telegram");
    return;
  }
  tgBot = new Telegraf(TELEGRAM_TOKEN);

  tgBot.command("start", async (ctx) => {
    if (!state.tgSubs.includes(ctx.chat.id)) {
      state.tgSubs.push(ctx.chat.id);
      await saveState();
    }
    const dbStatus = pool? "PostgreSQL Connected ✅" : "Local file";
    ctx.reply(
      `🟢 <b>MEMEBOT conectado</b> - DB: ${dbStatus}\nEste chat recibirá las señales.\n\n/estado · /pos · /wallets\n/add DIRECCION ALIAS 0.25\n/remove ALIAS o DIRECCION`,
      { parse_mode: "HTML" },
    );
    say.ok(`Telegram: chat ${ctx.chat.id} suscrito`);
  });

  tgBot.command("help", (ctx) =>
    ctx.reply(
      "<b>Comandos</b>\n/estado — reserva, USDC y resumen\n/pos — posiciones abiertas\n/wallets — wallets seguidas\n/add DIRECCION [ALIAS] [SOL] — agrega wallet\n/remove ALIAS o DIRECCION — quita wallet\n/reset — reinicia tesorería paper",
      { parse_mode: "HTML" },
    ),
  );

  tgBot.command("add", async (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const address = parts[1];
    const alias = parts[2] || `${address?.slice(0,4)}…${address?.slice(-4)}`;
    const sol = parts[3]? Number(parts[3]) : DEFAULT_TRADE_SOL;

    if (!address || address.length < 32) {
      return ctx.reply("Uso: /add DIRECCION [ALIAS] [CANTIDAD_SOL]\nEj: /add 7xKX... ABCD 0.25");
    }
    if (getAllWallets().some(w => w.address === address)) {
      return ctx.reply(`⚠️ Esa wallet ya está agregada: ${address}`);
    }

    const newWallet = { address, alias, tradeSol: sol > 0? sol : DEFAULT_TRADE_SOL };
    state.customWallets.push(newWallet);
    await saveState();
    await snapshotWallet(newWallet);
    ctx.reply(`✅ Agregada: <b>${esc(alias)}</b>\n<code>${address}</code>\nTrade: ${newWallet.tradeSol} SOL\n💾 Guardado en Postgres`, { parse_mode: "HTML" });
    say.ok(`Wallet agregada por Telegram: ${alias} (${address})`);
  });

  tgBot.command("remove", async (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const target = parts[1];
    if (!target) return ctx.reply("Uso: /remove ALIAS o DIRECCION");

    const before = state.customWallets.length;
    state.customWallets = state.customWallets.filter(w => w.address!== target && w.alias!== target);

    if (before === state.customWallets.length) {
      return ctx.reply(`No encontré ${target} en las agregadas por Telegram. Las de Railway (WALLETS) se borran desde Railway.`);
    }
    await saveState();
    ctx.reply(`🗑️ Eliminada: ${esc(target)} - guardado en Postgres`);
  });

  tgBot.command("estado", async (ctx) => {
    const solUsd = await getSolUsd();
    const open = Object.values(state.positions);
    const invested = open.reduce((a, p) => a + p.amountSol, 0);
    const dbInfo = pool? "🐘 Postgres" : "📁 Archivo local";
    ctx.reply(
      `<b>📊 ESTADO (paper) - ${dbInfo}</b>\n` +
      `Reserva: <b>${state.reserva.toFixed(4)} SOL</b>${usd(state.reserva, solUsd)}\n` +
      `Invertido: ${invested.toFixed(4)} SOL en ${open.length} posición(es)\n` +
      `USDC asegurado (R5): <b>${state.usdc.toFixed(2)}</b>\n` +
      `SOL/USD: ${solUsd? "$" + solUsd.toFixed(2) : "—"}`,
      { parse_mode: "HTML" },
    );
  });

  tgBot.command("pos", (ctx) => {
    const open = Object.values(state.positions);
    if (!open.length) return ctx.reply("Sin posiciones abiertas.");
    ctx.reply(
      open.map((p) => `• <b>$${esc(p.symbol)}</b> — ${p.amountSol.toFixed(4)} SOL · entrada ${p.entryPrice.toExponential(3)} · de ${p.alias}`).join("\n"),
      { parse_mode: "HTML" },
    );
  });

  tgBot.command("wallets", (ctx) => {
    const all = getAllWallets();
    ctx.reply(
      all.map((w) => {
        const st = state.wallets[w.address]?.stats?? { copies: 0, ignored: 0, pnlSol: 0 };
        const origin = WALLETS_ENV.some(x=>x.address===w.address)? "Railway" : "Telegram/Postgres";
        return `• <b>${esc(w.alias)}</b> [${origin}] — ${w.tradeSol} SOL/trade · ${st.copies} copias · PnL ${st.pnlSol.toFixed(4)}`;
      }).join("\n") || "Sin wallets.",
      { parse_mode: "HTML" },
    );
  });

  tgBot.command("reset", async (ctx) => {
    state.reserva = RESERVA_INICIAL;
    state.usdc = 0;
    state.positions = {};
    for (const a of Object.keys(state.wallets)) {
      state.wallets[a].stats = { copies: 0, ignored: 0, dust: 0, pnlSol: 0, usdcSecured: 0 };
    }
    await saveState();
    ctx.reply(`🔄 Tesorería reiniciada: ${RESERVA_INICIAL} SOL paper. Guardado en Postgres`);
    say.warn("tesorería paper reiniciada por comando /reset");
  });

  tgBot.launch().then(() => say.ok("Telegram en vivo + Postgres ✅"));
  tgBot.catch((e) => say.err(`telegram: ${e.message}`));
}

/* ================= Discord ================= */
let discordClient = null;
let discordReady = false;
function startDiscord() {
  if (!DISCORD_TOKEN ||!DISCORD_CHANNEL_ID) {
    say.info("Discord desactivado");
    return;
  }
  discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });
  discordClient.once("ready", () => {
    discordReady = true;
    say.ok(`Discord conectado como ${discordClient.user.tag}`);
  });
  discordClient.login(DISCORD_TOKEN).catch((e) => say.err(`discord: ${e.message}`));
}

/* ================= arranque ================= */
console.log(BANNER);

const boot = async () => {
  await initDB();
  if (pool) {
    const dbState = await loadStateDB();
    if (dbState) {
      state = dbState;
      say.ok(`DB: PostgreSQL Connected ✅ - Estado cargado desde Postgres (${state.customWallets.length} wallets)`);
    }
  }
  say.info(`RPC: ${HELIUS_API_KEY? "Helius privado" : "público"}`);
  say.info(`Wallets ENV: ${WALLETS_ENV.length} + Telegram: ${state.customWallets.length} = Total ${getAllWallets().length}`);
  say.info(`Tesorería paper: ${state.reserva.toFixed(4)} SOL · USDC ${state.usdc.toFixed(2)}`);

  if (!getAllWallets().length) {
    say.err("SIN WALLETS — usa /add en Telegram o define WALLETS en Railway");
  } else {
    say.ok(`ESCUCHANDO ${getAllWallets().length} WALLET(S): [${getAllWallets().map((w) => w.alias).join(", ")}]`);
  }

  startTelegram();
  startDiscord();

  for (const w of getAllWallets()) await snapshotWallet(w);
  say.ok(`vigilancia activa — /add DIRECCION ALIAS 0.25 para agregar más`);
  setInterval(() => {
    loop().catch((e) => say.err(`ciclo: ${e.message}`));
  }, POLL_MS);
};
boot();

const shutdown = async () => {
  say.info("guardando estado…");
  await saveState();
  try { tgBot?.stop(); } catch {}
  try { discordClient?.destroy(); } catch {}
  try { await pool?.end(); } catch {}
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
