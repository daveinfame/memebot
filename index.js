/* ============================================================
   MEMEBOT v2 — copy trading de memecoins (Solana)
   Notificaciones por Telegram + Discord · ejecución paper

   · Vigila wallets reales en mainnet (Helius RPC o RPC público)
   · Aplica las reglas R0–R5 y avisa al instante en tu Telegram
     (y en Discord si lo configuras)
   · NO necesita servidor, puerto, ni URL pública: telegraf usa
     long-polling, así que corre igual en tu PC que en un VPS
   · La tesorería es PAPER (ficticia) y se guarda en state.json

   Reglas:
     R0    snapshot: ignora tokens que la wallet ya tenía al seguirla
           (se liberan cuando la wallet los vende al 100%)
     R0.5  anti-dust: solo es compra válida si la wallet FIRMA y PAGA SOL
     R1    first-in: primera compra válida → el bot entra (una sola vez)
     R2    promedios (DCA) → se ignoran
     R3    first-out: primera venta → el bot vende 100%
     R5    tesorería: la ganancia de cada venta se asegura en USDC

   Arranque:  npm install && npm start   (requiere Node 18+)
   ============================================================ */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { Telegraf } from "telegraf";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

/* ================= configuración (.env) ================= */
const HELIUS_API_KEY = (process.env.HELIUS_API_KEY || "").trim();
const RPC_URL = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : "https://api.mainnet-beta.solana.com";

/** WALLETS=addr=ALIAS=0.25,addr2=BALLENA  (alias y monto opcionales) */
const DEFAULT_TRADE_SOL = Number(process.env.TRADE_SOL || 0.1);
const WALLETS = (process.env.WALLETS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [addr, alias, sol] = s.split("=");
    const address = addr.trim();
    return {
      address,
      alias: (alias || "").trim() || `${address.slice(0, 4)}…${address.slice(-4)}`,
      tradeSol: sol && Number(sol) > 0 ? Number(sol) : DEFAULT_TRADE_SOL,
    };
  });

const TELEGRAM_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = (process.env.TELEGRAM_CHAT_ID || "").trim();
const DISCORD_TOKEN = (process.env.DISCORD_BOT_TOKEN || "").trim();
const DISCORD_CHANNEL_ID = (process.env.DISCORD_CHANNEL_ID || "").trim();

const RESERVA_INICIAL = Number(process.env.RESERVA_SOL || 1.5);
const POLL_MS = Math.max(5000, Number(process.env.POLL_MS || 12000));
const SNAPSHOT_ON = (process.env.SNAPSHOT || "true") !== "false";
const ANTI_DUST_ON = (process.env.ANTI_DUST || "true") !== "false";
const AUTO_USDC_ON = (process.env.AUTO_USDC || "true") !== "false";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const STATE_FILE = path.join(process.cwd(), "state.json");

/* ================= consola (color + timestamps) ================= */
const C = {
  g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", c: "\x1b[36m",
  m: "\x1b[35m", b: "\x1b[1m", d: "\x1b[2m", x: "\x1b[0m",
};
const ts = () => new Date().toLocaleTimeString("es-ES", { hour12: false });
const say = {
  info: (m) => console.log(`${C.d}${ts()}${C.x}  ${m}`),
  ok: (m) => console.log(`${C.d}${ts()}${C.x}  ${C.g}✓${C.x} ${m}`),
  warn: (m) => console.log(`${C.d}${ts()}${C.x}  ${C.y}⚠${C.x} ${m}`),
  err: (m) => console.log(`${C.d}${ts()}${C.x}  ${C.r}✗${C.x} ${m}`),
  trade: (m) => console.log(`${C.d}${ts()}${C.x}  ${C.b}${C.c}▸${C.x} ${C.b}${m}${C.x}`),
};

const BANNER = `
${C.g}${C.b} ███╗   ███╗███████╗███╗   ███╗███████╗██████╗  ██████╗ ████████╗
 ████╗ ████║██╔════╝████╗ ████║██╔════╝██╔══██╗██╔═══██╗╚══██╔══╝
 ██╔████╔██║█████╗  ██╔████╔██║█████╗  ██████╔╝██║   ██║   ██║
 ██║╚██╔╝██║██╔══╝  ██║╚██╔╝██║██╔══╝  ██╔══██╗██║   ██║   ██║
 ██║ ╚═╝ ██║███████╗██║ ╚═╝ ██║███████╗██████╔╝╚██████╔╝   ██║
 ╚═╝     ╚═╝╚══════╝╚═╝     ╚═╝╚══════╝╚═════╝  ╚═════╝    ╚═╝${C.x}
 ${C.d}copy trading · solana · telegram + discord · paper trading${C.x}`;

/* ================= estado persistente (paper) ================= */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (s && typeof s.reserva === "number") return s;
    }
  } catch (e) {
    say.warn(`state.json corrupto, empezando de cero (${e.message})`);
  }
  return {
    version: 2,
    reserva: RESERVA_INICIAL,
    usdc: 0,
    startedAt: Date.now(),
    positions: {},           // mint → posición abierta
    wallets: {},             // addr → { lastBlockTime, snapshotIgnored, dusted, stats }
    tgSubs: [],              // chats de Telegram suscritos
  };
}
let state = loadState();

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    say.err(`no se pudo guardar state.json: ${e.message}`);
  }
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
  if (data.error) throw new Error(data.error.message ?? "RPC error");
  return data.result;
}

const tickerCache = new Map();
async function getTicker(mint) {
  if (tickerCache.has(mint)) return tickerCache.get(mint);
  /* 1) Helius DAS */
  if (HELIUS_API_KEY) {
    try {
      const asset = await rpc("getAsset", { id: mint });
      const sym = asset?.content?.metadata?.symbol;
      if (typeof sym === "string" && sym.trim()) {
        tickerCache.set(mint, sym.trim());
        return sym.trim();
      }
    } catch { /* sigue */ }
  }
  /* 2) Jupiter tokens API */
  try {
    const { data } = await http.get(`https://tokens.jup.ag/token/${mint}`);
    if (data && typeof data.symbol === "string" && data.symbol.trim()) {
      tickerCache.set(mint, data.symbol.trim());
      return data.symbol.trim();
    }
  } catch { /* sigue */ }
  tickerCache.set(mint, "UNKNOWN");
  return "UNKNOWN";
}

const priceCache = new Map(); // mint → { p, t }
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
  } catch { /* sin precio */ }
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
  } catch { /* sigue */ }
  try {
    const { data } = await http.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
    );
    const p = data?.solana?.usd;
    if (typeof p === "number" && p > 0) {
      priceCache.set("SOL", { p, t: Date.now() });
      return p;
    }
  } catch { /* sin precio */ }
  return null;
}

/* ================= clasificación de transacciones ================= */
/* v0 (Jupiter, pump.fun, Raydium… = casi todo hoy) trae accountKeys como
   strings; la PRIMERA cuenta es el fee-payer y SIEMPRE firma. legacy trae
   objetos { pubkey, signer }. Sin esto, las compras reales caían como dust. */
function normalizeKeys(message) {
  const raw = message?.accountKeys ?? [];
  if (!raw.length) return [];
  if (typeof raw[0] !== "string") {
    return raw.map((k) => ({ address: k?.pubkey, signer: !!k?.signer }));
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
  for (const b of meta.preTokenBalances ?? []) {
    if (b.owner === wallet) {
      preByMint.set(b.mint, (preByMint.get(b.mint) ?? 0) + (b.uiTokenAmount?.uiAmount ?? 0));
    }
  }
  const postByMint = new Map();
  for (const b of meta.postTokenBalances ?? []) {
    if (b.owner === wallet) {
      postByMint.set(b.mint, (postByMint.get(b.mint) ?? 0) + (b.uiTokenAmount?.uiAmount ?? 0));
    }
  }

  let bestMint = null;
  let bestDelta = 0;
  for (const m of new Set([...preByMint.keys(), ...postByMint.keys()])) {
    const d = (postByMint.get(m) ?? 0) - (preByMint.get(m) ?? 0);
    if (Math.abs(d) > Math.abs(bestDelta)) {
      bestDelta = d;
      bestMint = m;
    }
  }
  if (!bestMint || bestDelta === 0 || bestMint === SOL_MINT) return null;

  const txHash = tx.transaction?.signatures?.[0] ?? "";
  const blockTime = (tx.blockTime ?? 0) * 1000 || Date.now();

  if (bestDelta > 0) {
    if (isSigner && solDelta < 0) {
      return {
        type: "buy", mint: bestMint, txHash, blockTime,
        solAmount: Math.abs(solDelta), tokenAmount: bestDelta,
        postBalance: postByMint.get(bestMint) ?? 0,
      };
    }
    /* recibió sin firmar/pagar → airdrop/dusting (R0.5) */
    return {
      type: "dust", mint: bestMint, txHash, blockTime,
      solAmount: 0, tokenAmount: bestDelta,
      postBalance: postByMint.get(bestMint) ?? 0,
    };
  }

  /* venta */
  return {
    type: "sell", mint: bestMint, txHash, blockTime,
    solAmount: Math.max(0, solDelta), tokenAmount: Math.abs(bestDelta),
    postBalance: postByMint.get(bestMint) ?? 0,
  };
}

/* ================= notificaciones (Telegram + Discord) ================= */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const solscan = (h) => `https://solscan.io/tx/${h}`;
const shortHash = (h) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const usd = (sol, solUsd) => (solUsd ? ` ($${(sol * solUsd).toFixed(2)})` : "");

async function notify({ title, lines, color, hash }) {
  /* consola siempre */
  say.trade(`${title}  ${C.d}${lines.map((l) => l.replace(/<[^>]+>/g, "")).join(" · ")}${C.x}`);

  /* telegram (HTML) */
  if (tgBot) {
    const text = [`<b>${title}</b>`, ...lines, hash ? `🔗 <a href="${solscan(hash)}">ver en Solscan</a>` : null]
      .filter(Boolean).join("\n");
    const targets = [...new Set([...state.tgSubs, ...(TELEGRAM_CHAT_ID ? [TELEGRAM_CHAT_ID] : [])])];
    for (const chat of targets) {
      try {
        await tgBot.telegram.sendMessage(chat, text, {
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
      } catch { /* chat bloqueó al bot, etc. */ }
    }
  }

  /* discord (embed) */
  if (discordReady && DISCORD_CHANNEL_ID) {
    try {
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(lines.join("\n"))
        .setColor(color)
        .setTimestamp();
      if (hash) embed.setURL(solscan(hash));
      await discordClient.channels.cache.get(DISCORD_CHANNEL_ID)?.send({ embeds: [embed] });
    } catch { /* sin canal, etc. */ }
  }
}

const GREEN = 0x00ff41, RED = 0xff4d4d, YELLOW = 0xffd93d, CYAN = 0x5fd9f2;

/* ================= motor de reglas (R0–R5) ================= */
async function applyEvent(w, ev) {
  const ws = walletState(w.address);
  const solUsd = await getSolUsd();
  const symbol = await getTicker(ev.mint);

  /* ---------- COMPRA ---------- */
  if (ev.type === "buy") {
    /* R0: estaba en el snapshot de ignorados */
    if (SNAPSHOT_ON && ws.snapshotIgnored.includes(ev.mint)) {
      ws.stats.ignored++;
      saveState();
      return notify({
        title: `🚫 R0 · ${w.alias} operó $${esc(symbol)} (ya lo tenía) → IGNORADO`,
        lines: [`Contrato: <code>${ev.mint}</code>`],
        color: YELLOW, hash: ev.txHash,
      });
    }

    /* R0.5: sale de cuarentena de dust porque pagó SOL (compra válida) */
    if (ws.dusted.includes(ev.mint)) {
      ws.dusted = ws.dusted.filter((m) => m !== ev.mint);
      saveState();
      say.info(`${w.alias} habilitó $${symbol}: compra válida pagando SOL (sale de cuarentena R0.5)`);
    }

    /* R2: posición ya abierta → promedios se ignoran */
    if (state.positions[ev.mint]) {
      ws.stats.ignored++;
      saveState();
      return notify({
        title: `🚫 R2 · ${w.alias} promedió $${esc(symbol)} → IGNORADO (posición abierta)`,
        lines: [`El bot mantiene su entrada original (first-in).`],
        color: YELLOW, hash: ev.txHash,
      });
    }

    /* R1: FIRST-IN */
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
    const entryPrice = ev.solAmount / ev.tokenAmount; // SOL por token
    state.positions[ev.mint] = {
      wallet: w.address, alias: w.alias, symbol,
      entryPrice, amountSol: size, tokenAmount: size / entryPrice,

      openedAt: Date.now(), usdValue: tokenUsd ? size * solUsd : null,
    };
    state.reserva -= size;
    ws.stats.copies++;
    saveState();

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

  /* ---------- DUST / AIRDROP (R0.5) ---------- */
  if (ev.type === "dust") {
    if (ANTI_DUST_ON && !ws.dusted.includes(ev.mint)) ws.dusted.push(ev.mint);
    ws.stats.dust++;
    saveState();
    say.info(`${C.y}R0.5 dust:${C.x} ${w.alias} recibió $${symbol} SIN pagar SOL → en cuarentena (${ev.mint})`);
    return; // no spam en Telegram: solo consola
  }

  /* ---------- VENTA ---------- */
  /* R0: si lo vendió al 100% → se libera de ignorados */
  if (ws.snapshotIgnored.includes(ev.mint) && ev.postBalance <= 0) {
    ws.snapshotIgnored = ws.snapshotIgnored.filter((m) => m !== ev.mint);
    saveState();
    say.info(`R0: ${w.alias} vendió 100% de $${symbol} → liberado de TOKENS_IGNORADOS`);
  }

  const open = state.positions[ev.mint];
  if (!open) return; // vendió algo que el bot no tenía

  /* R3: FIRST-OUT — vender 100% */
  const exitPrice = ev.tokenAmount > 0 ? ev.solAmount / ev.tokenAmount : open.entryPrice;
  const proceeds = open.amountSol * (exitPrice / open.entryPrice);
  const pnlSol = proceeds - open.amountSol;
  const pnlPct = (exitPrice / open.entryPrice - 1) * 100;

  /* R5: TESORERÍA — reserva recupera SOL_A_USAR; ganancia → USDC */
  let r5Line;
  if (pnlSol > 0 && AUTO_USDC_ON) {
    const gain = pnlSol * (solUsd ?? 0);
    state.reserva += open.amountSol;
    state.usdc += gain;
    ws.stats.usdcSecured += gain;
    r5Line = `💰 R5 GANANCIA: <b>+${pnlSol.toFixed(4)} SOL</b> → swap a USDC (<b>+${gain.toFixed(2)} USDC</b> asegurados)`;
  } else {
    state.reserva += open.amountSol + pnlSol;
    r5Line = pnlSol >= 0
      ? `💰 R5 GANANCIA: <b>+${pnlSol.toFixed(4)} SOL</b> (auto-USDC desactivado, queda en reserva)`
      : `💸 R5 PÉRDIDA: <b>−${Math.abs(pnlSol).toFixed(4)} SOL</b> (la reserva queda más pequeña)`;
  }
  delete state.positions[ev.mint];
  ws.stats.pnlSol += pnlSol;
  saveState();

  const win = pnlSol >= 0;
  return notify({
    title: `${win ? "🟢" : "🔴"} R3 · ${w.alias} VENDIÓ $${esc(symbol)} — BOT CERRÓ 100%`,
    lines: [
      `PnL: <b>${win ? "+" : "−"}${Math.abs(pnlPct).toFixed(1)}%</b> (${win ? "+" : "−"}${Math.abs(pnlSol).toFixed(4)} SOL${usd(Math.abs(pnlSol), solUsd)})`,
      r5Line,
      `Reserva: ${state.reserva.toFixed(4)} SOL · USDC asegurado: ${state.usdc.toFixed(2)}`,
    ],
    color: win ? GREEN : RED, hash: ev.txHash,
  });
}

/* ================= vigilancia (polling al RPC) ================= */
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

  const fresh = (sigs ?? [])
    .filter((s) => !s.err && !seenSigs.has(s.signature))
    .filter((s) => (s.blockTime ?? 0) * 1000 > ws.lastBlockTime)
    .sort((a, b) => (a.blockTime ?? 0) - (b.blockTime ?? 0))
    .slice(0, 10);

  for (const s of fresh) {
    seenSigs.add(s.signature);
    let tx = null;
    try {
      tx = await rpc("getTransaction", [
        s.signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ]);
    } catch { /* tasa limitada: se reintenta en el próximo ciclo */ continue; }
    if (!tx) continue;

    const ev = classify(tx, w.address);
    if (!ev) {
      ws.lastBlockTime = Math.max(ws.lastBlockTime, (tx.blockTime ?? 0) * 1000);
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

/* snapshot R0: tokens que la wallet ya tiene al seguirla */
async function snapshotWallet(w) {
  if (!SNAPSHOT_ON) return;
  const ws = walletState(w.address);
  if (ws.snapshotIgnored.length || ws.lastBlockTime) return; // ya tiene estado
  try {
    const res = await rpc("getTokenAccountsByOwner", [
      w.address,
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      { encoding: "jsonParsed" },
    ]);
    const mints = [];
    for (const item of res?.value ?? []) {
      const info = item?.account?.data?.parsed?.info;
      if (info?.mint && Number(info?.tokenAmount?.amount ?? 0) > 0 && !mints.includes(info.mint)) {
        mints.push(info.mint);
      }
    }
    ws.snapshotIgnored = mints;
    ws.lastBlockTime = Date.now(); // ancla: ignorar historia previa
    saveState();
    say.ok(`R0 snapshot de ${w.alias}: ${mints.length} token(s) en TOKENS_IGNORADOS`);
  } catch (e) {
    ws.lastBlockTime = Date.now();
    say.warn(`snapshot de ${w.alias} falló (${e.message}) — anclado al presente`);
  }
}

async function loop() {
  for (const w of WALLETS) {
    await pollWallet(w);
    await new Promise((r) => setTimeout(r, 400)); /* respiro al rate limit */
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

  tgBot.command("start", (ctx) => {
    if (!state.tgSubs.includes(ctx.chat.id)) {
      state.tgSubs.push(ctx.chat.id);
      saveState();
    }
    ctx.reply(
      "🟢 <b>MEMEBOT conectado</b>\nEste chat recibirá las señales de copy trading.\n\n/estado · /pos · /wallets · /reset",
      { parse_mode: "HTML" },
    );
    say.ok(`Telegram: chat ${ctx.chat.id} suscrito (${ctx.chat.title || ctx.chat.first_name || ""})`);
  });

  tgBot.command("help", (ctx) =>
    ctx.reply(
      "<b>Comandos</b>\n/estado — reserva, USDC y resumen\n/pos — posiciones abiertas\n/wallets — wallets seguidas\n/reset — reinicia la tesorería paper",
      { parse_mode: "HTML" },
    ),
  );

  tgBot.command("estado", async (ctx) => {
    const solUsd = await getSolUsd();
    const open = Object.values(state.positions);
    const invested = open.reduce((a, p) => a + p.amountSol, 0);
    ctx.reply(
      `<b>📊 ESTADO (paper)</b>\n` +
      `Reserva: <b>${state.reserva.toFixed(4)} SOL</b>${usd(state.reserva, solUsd)}\n` +
      `Invertido: ${invested.toFixed(4)} SOL en ${open.length} posición(es)\n` +
      `USDC asegurado (R5): <b>${state.usdc.toFixed(2)}</b>\n` +
      `SOL/USD: ${solUsd ? "$" + solUsd.toFixed(2) : "—"}`,
      { parse_mode: "HTML" },
    );
  });

  tgBot.command("pos", (ctx) => {
    const open = Object.values(state.positions);
    if (!open.length) return ctx.reply("Sin posiciones abiertas.");
    ctx.reply(
      open
        .map((p) => `• <b>$${esc(p.symbol)}</b> — ${p.amountSol.toFixed(4)} SOL · entrada ${p.entryPrice.toExponential(3)} · de ${p.alias}`)
        .join("\n"),
      { parse_mode: "HTML" },
    );
  });

  tgBot.command("wallets", (ctx) => {
    ctx.reply(
      WALLETS.map((w) => {
        const st = state.wallets[w.address]?.stats ?? { copies: 0, ignored: 0, pnlSol: 0 };
        return `• <b>${esc(w.alias)}</b> — ${w.tradeSol} SOL/trade · ${st.copies} copias · ${st.ignored} ignoradas · PnL ${st.pnlSol >= 0 ? "+" : "−"}${Math.abs(st.pnlSol).toFixed(4)}`;
      }).join("\n") || "Sin wallets configuradas (variable WALLETS).",
      { parse_mode: "HTML" },
    );
  });

  tgBot.command("reset", (ctx) => {
    state.reserva = RESERVA_INICIAL;
    state.usdc = 0;
    state.positions = {};
    for (const a of Object.keys(state.wallets)) {
      state.wallets[a].stats = { copies: 0, ignored: 0, dust: 0, pnlSol: 0, usdcSecured: 0 };
    }
    saveState();
    ctx.reply(`🔄 Tesorería reiniciada: ${RESERVA_INICIAL} SOL paper.`);
    say.warn("tesorería paper reiniciada por comando /reset");
  });

  tgBot.launch().then(() => say.ok("Telegram en vivo (long-polling, sin URL pública)"));
  tgBot.catch((e) => say.err(`telegram: ${e.message}`));
}

/* ================= Discord ================= */
let discordClient = null;
let discordReady = false;
function startDiscord() {
  if (!DISCORD_TOKEN || !DISCORD_CHANNEL_ID) {
    say.info("Discord desactivado (falta DISCORD_BOT_TOKEN o DISCORD_CHANNEL_ID)");
    return;
  }
  discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });
  discordClient.once("ready", () => {
    discordReady = true;
    say.ok(`Discord conectado como ${discordClient.user.tag} → canal ${DISCORD_CHANNEL_ID}`);
  });
  discordClient.login(DISCORD_TOKEN).catch((e) =>
    say.err(`discord: ${e.message}`),
  );
}

/* ================= arranque ================= */
console.log(BANNER);
say.info(`RPC: ${HELIUS_API_KEY ? "Helius privado (DAS activo)" : "público (sin HELIUS_API_KEY)"}`);
say.info(`Reglas: R0=${SNAPSHOT_ON ? "on" : "off"} · R0.5=${ANTI_DUST_ON ? "on" : "off"} · R5 auto-USDC=${AUTO_USDC_ON ? "on" : "off"} · poll cada ${POLL_MS / 1000}s`);
say.info(`Tesorería paper: ${state.reserva.toFixed(4)} SOL · USDC ${state.usdc.toFixed(2)}`);

if (!WALLETS.length) {
  say.err("SIN WALLETS — define WALLETS en .env (ej: WALLETS=DIRECCION=CAP=0.25)");
} else {
  say.ok(`ESCUCHANDO ${WALLETS.length} WALLET(S): [${WALLETS.map((w) => w.alias).join(", ")}]`);
}

startTelegram();
startDiscord();

/* snapshots iniciales (R0) y luego el bucle */
const boot = async () => {
  for (const w of WALLETS) await snapshotWallet(w);
  say.ok(`vigilancia activa — cada señal real llegará a tu Telegram${DISCORD_TOKEN ? " y Discord" : ""}`);
  setInterval(() => {
    loop().catch((e) => say.err(`ciclo: ${e.message}`));
  }, POLL_MS);
};
boot();

/* apagado limpio */
const shutdown = () => {
  say.info("guardando estado…");
  saveState();
  try { tgBot?.stop(); } catch { /* */ }
  try { discordClient?.destroy(); } catch { /* */ }
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);