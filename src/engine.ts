import { DEFAULT_CONFIG_TEXT, parseConfig } from "/src/config.ts";
export const LS_KEY = "memebot:v3.2";
export const SOL_USD_FALLBACK = 105;
export const BOT_WALLET = "MemeBotExecutionWa11et11111111111111111111111";
export const rand = (a, b) => a + Math.random() * (b - a);
export const uid = () => Math.random().toString(36).slice(2, 10);
export function genBotHash() {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < 44; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
export const solscanTx = (hash) => `https://solscan.io/tx/${hash}`;
export const shortHash = (h) => h.length > 10 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
export const fmtSigned = (n, dp = 2, suffix = "") => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(dp)}${suffix}`;
export const fmtPrice = (p) => {
  if (!isFinite(p)) return "—";
  if (p >= 1) return p.toFixed(3);
  if (p >= 1e-3) return p.toFixed(5);
  return p.toExponential(2);
};
export const fmtUsd = (n) => `$${n.toFixed(2)}`;
export const fmtPct = (n, dp = 1) => isFinite(n) ? `${n.toFixed(dp)}%` : "0%";
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString("es-ES", { hour12: false });
export const shortAddr = (a) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const emptyStats = () => ({ copies: 0, ignored: 0, dustIgnored: 0, pnlSol: 0, usdcSecured: 0 });
function seedState() {
  const cfg = parseConfig(DEFAULT_CONFIG_TEXT).cfg;
  return {
    tick: 0,
    block: 289412550,
    botOn: true,
    reservaSol: cfg.reservaGlobal,
    usdc: 0,
    solUsd: SOL_USD_FALLBACK,
    cfg,
    configText: DEFAULT_CONFIG_TEXT,
    tokens: {},
    positions: [],
    closed: [],
    snapshotIgnored: {},
    dusted: {},
    walletStats: {},
    log: [],
    seq: 1
  };
}
export function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return seedState();
    const saved = JSON.parse(raw);
    if (!isValidSaved(saved)) return seedState();
    return { ...saved, log: [] };
  } catch {
    return seedState();
  }
}
function isValidSaved(o) {
  if (!o || typeof o !== "object") return false;
  const s = o;
  const cfg = s.cfg;
  return typeof s.reservaSol === "number" && typeof s.configText === "string" && typeof s.block === "number" && !!cfg && Array.isArray(cfg.wallets) && !!s.tokens && Array.isArray(s.positions) && Array.isArray(s.closed) && !!s.walletStats && !!s.snapshotIgnored && !!s.dusted && typeof s.seq === "number";
}
export function saveState(s) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...s, log: [] }));
  } catch {
  }
}
function pushLog(s, kind, text) {
  const entry = { id: s.seq, ts: Date.now(), kind, text };
  return { ...s, seq: s.seq + 1, log: [...s.log.slice(-399), entry] };
}
function bumpStats(s, addr, patch) {
  const cur = s.walletStats[addr] ?? emptyStats();
  return { ...s, walletStats: { ...s.walletStats, [addr]: { ...cur, ...patch } } };
}
function ensureToken(tokens, mint, symbol, price) {
  const hit = tokens[mint];
  if (hit) return tokens;
  return {
    ...tokens,
    [mint]: { mint, symbol, name: symbol, price, history: Array(30).fill(price) }
  };
}
function applyEvent(prev, ev) {
  let s = { ...prev };
  const walletCfg = s.cfg.wallets.find((w) => w.address === ev.wallet);
  const alias = walletCfg?.alias ?? shortAddr(ev.wallet);
  s = { ...s, tokens: ensureToken(s.tokens, ev.mint, ev.symbol, ev.price) };
  if (ev.type === "dust") {
    const dq = [...s.dusted[ev.wallet] ?? []];
    if (!dq.includes(ev.mint)) dq.push(ev.mint);
    s = { ...s, dusted: { ...s.dusted, [ev.wallet]: dq } };
    const cur = s.walletStats[ev.wallet] ?? emptyStats();
    s = bumpStats(s, ev.wallet, { dustIgnored: cur.dustIgnored + 1 });
    return pushLog(
      s,
      "dust",
      `R0.5 $${ev.symbol} · contrato: ${ev.mint} · ${alias} lo recibió SIN pagar SOL (airdrop/dusting) → ignorado · HASH: ${shortHash(ev.txHash)}`
    );
  }
  if (!walletCfg) {
    return pushLog(s, "out", `señal de wallet no seguida (${shortAddr(ev.wallet)}) → ignorada`);
  }
  if (ev.type === "buy") {
    const snap = s.snapshotIgnored[ev.wallet] ?? [];
    if (s.cfg.snapshotInicial && snap.includes(ev.mint)) {
      const cur2 = s.walletStats[ev.wallet] ?? emptyStats();
      s = bumpStats(s, ev.wallet, { ignored: cur2.ignored + 1 });
      return pushLog(
        s,
        "ignore",
        `R0 $${ev.symbol} · contrato: ${ev.mint} · ${alias} lo operó pero YA lo tenía (snapshot) → IGNORADO`
      );
    }
    const open = s.positions.find((p) => p.mint === ev.mint);
    if (open) {
      const cur2 = s.walletStats[ev.wallet] ?? emptyStats();
      s = bumpStats(s, ev.wallet, { ignored: cur2.ignored + 1 });
      return pushLog(
        s,
        "ignore",
        `R2 ${ev.symbol} — contrato: ${ev.mint} · ${alias} promedió → IGNORADO (posición abierta)`
      );
    }
    const solAUsar = walletCfg.capitalUsd / s.solUsd;
    if (s.positions.length >= s.cfg.maxPositions) {
      return pushLog(s, "warn", `R1 ⚠ límite de ${s.cfg.maxPositions} posiciones alcanzado → no se entró en $${ev.symbol}`);
    }
    if (s.reservaSol < solAUsar) {
      return pushLog(
        s,
        "warn",
        `R1 ⚠ RESERVA BAJA: se necesitan ${solAUsar.toFixed(4)} SOL y hay ${s.reservaSol.toFixed(4)} → no se entró en $${ev.symbol}`
      );
    }
    const botHash = genBotHash();
    const position = {
      id: uid(),
      mint: ev.mint,
      symbol: ev.symbol,
      walletAddress: ev.wallet,
      entryPrice: ev.price,
      amountSol: solAUsar,
      capitalUsd: walletCfg.capitalUsd,
      tokens: ev.price > 0 ? solAUsar / ev.price : 0,
      openedAt: Date.now()
    };
    s = { ...s, positions: [...s.positions, position], reservaSol: s.reservaSol - solAUsar };
    const cur = s.walletStats[ev.wallet] ?? emptyStats();
    s = bumpStats(s, ev.wallet, { copies: cur.copies + 1 });
    s = pushLog(
      s,
      "buy",
      `R1: ${alias} COMPRÓ $${ev.symbol} | Pagó ${ev.solAmount.toFixed(4)} SOL | HASH CAP: ${shortHash(ev.txHash)} | ${solscanTx(ev.txHash)} | MI BOT COMPRÓ: ${solAUsar.toFixed(4)} SOL (${fmtUsd(walletCfg.capitalUsd)}) | HASH BOT: ${shortHash(botHash)} | ${solscanTx(botHash)}`
    );
    return s;
  }
  if (ev.type === "sell") {
    const open = s.positions.find((p) => p.mint === ev.mint && p.walletAddress === ev.wallet);
    if (!open) {
      const snap = s.snapshotIgnored[ev.wallet] ?? [];
      if (snap.includes(ev.mint)) {
        s = {
          ...s,
          snapshotIgnored: {
            ...s.snapshotIgnored,
            [ev.wallet]: snap.filter((m) => m !== ev.mint)
          }
        };
        return pushLog(s, "ignore", `R0 ${alias} vendió 100% de $${ev.symbol} → liberado de TOKENS_IGNORADOS`);
      }
      return pushLog(s, "ignore", `R3 ${alias} vendió $${ev.symbol} pero el bot no tenía posición → nada que hacer`);
    }
    const proceeds = open.amountSol * (ev.price / open.entryPrice);
    const pnlSol = proceeds - open.amountSol;
    const pnlPct = open.entryPrice > 0 ? (ev.price / open.entryPrice - 1) * 100 : 0;
    const trade = {
      ...open,
      exitPrice: ev.price,
      closedAt: Date.now(),
      pnlSol,
      pnlPct,
      reason: "TRADER_SELL"
    };
    const botHash = genBotHash();
    const ganancia = pnlSol;
    let newReserva;
    let newUsdc = s.usdc;
    let r5Kind;
    let r5Text;
    if (ganancia > 0 && s.cfg.autoSwapUsdc) {
      const usdcGain = ganancia * s.solUsd;
      newReserva = s.reservaSol + open.amountSol;
      newUsdc = s.usdc + usdcGain;
      r5Kind = "tp";
      r5Text = `R5 GANANCIA: +${ganancia.toFixed(4)} SOL → swap SOL→USDC (+${usdcGain.toFixed(2)} USDC asegurados)`;
    } else if (ganancia > 0) {
      newReserva = s.reservaSol + open.amountSol + ganancia;
      r5Kind = "tp";
      r5Text = `R5 GANANCIA: +${ganancia.toFixed(4)} SOL (auto_swap USDC desactivado, queda en reserva)`;
    } else {
      newReserva = s.reservaSol + open.amountSol + ganancia;
      r5Kind = "sl";
      r5Text = `R5 PÉRDIDA: −${Math.abs(ganancia).toFixed(4)} SOL (la RESERVA_GLOBAL queda más pequeña)`;
    }
    s = {
      ...s,
      positions: s.positions.filter((p) => p.id !== open.id),
      closed: [trade, ...s.closed].slice(0, 80),
      reservaSol: newReserva,
      usdc: newUsdc
    };
    const cur = s.walletStats[ev.wallet] ?? emptyStats();
    s = bumpStats(s, ev.wallet, {
      pnlSol: cur.pnlSol + pnlSol,
      usdcSecured: cur.usdcSecured + (ganancia > 0 && s.cfg.autoSwapUsdc ? ganancia * s.solUsd : 0)
    });
    s = pushLog(
      s,
      "sell",
      `R3: ${alias} VENDIÓ $${ev.symbol} 100% @ ${fmtPrice(ev.price)} | HASH CAP: ${shortHash(ev.txHash)} | ${solscanTx(ev.txHash)} | MI BOT VENDIÓ 100% | HASH BOT: ${shortHash(botHash)} | ${solscanTx(botHash)} | PnL: ${fmtSigned(pnlPct, 1, "%")} (${fmtSigned(pnlSol, 4, " SOL")})`
    );
    s = pushLog(s, r5Kind, r5Text);
    return s;
  }
  return s;
}
function step(prev) {
  let s = { ...prev, tick: prev.tick + 1, block: prev.block + 1 };
  const tokens = {};
  for (const key of Object.keys(s.tokens)) {
    const t = s.tokens[key];
    let drift = rand(-0.014, 0.016);
    if (Math.random() < 0.05) drift += rand(-0.06, 0.11);
    const price = Math.max(t.price * (1 + drift), t.history[0] * 0.05);
    tokens[key] = { ...t, price, history: [...t.history.slice(-89), price] };
  }
  s = { ...s, tokens };
  return s;
}
export function reducer(state, action) {
  switch (action.type) {
    case "TICK":
      return step(state);
    case "TOGGLE_BOT": {
      const botOn = !state.botOn;
      return pushLog(
        { ...state, botOn },
        botOn ? "ok" : "warn",
        botOn ? "SISTEMA    bot activado · copiando la primera compra válida de cada señal" : "SISTEMA    bot en pausa · el radar detecta señales pero no ejecuta"
      );
    }
    case "APPLY_CONFIG": {
      const walletStats = { ...state.walletStats };
      const snapshotIgnored = { ...state.snapshotIgnored };
      const dusted = { ...state.dusted };
      for (const w of action.cfg.wallets) {
        if (!walletStats[w.address]) walletStats[w.address] = emptyStats();
        if (!snapshotIgnored[w.address]) snapshotIgnored[w.address] = [];
        if (!dusted[w.address]) dusted[w.address] = [];
      }
      let s = {
        ...state,
        cfg: action.cfg,
        configText: action.text,
        reservaSol: action.cfg.reservaGlobal,
        walletStats,
        snapshotIgnored,
        dusted
      };
      s = pushLog(
        s,
        "ok",
        `CONFIG      ✓ config.txt recargada · ${action.cfg.wallets.length} wallet(s) · RESERVA_GLOBAL ${action.cfg.reservaGlobal.toFixed(2)} SOL · precio SOL/USD EN VIVO (Jupiter)`
      );
      return s;
    }
    case "ONCHAIN_EVENT":
      return applyEvent(state, action.event);
    case "SNAPSHOT_SET": {
      let s = {
        ...state,
        snapshotIgnored: { ...state.snapshotIgnored, [action.wallet]: action.mints }
      };
      s = pushLog(
        s,
        "ok",
        `R0          snapshot REAL de ${action.alias}: ${action.mints.length} token(s) ya en cartera → TOKENS_IGNORADOS`
      );
      for (const mint of action.mints) {
        const sym = action.symbols?.[mint] || "UNKNOWN";
        s = pushLog(
          s,
          "ignore",
          `IGNORADO: $${sym} - ${shortAddr(mint)} - ${mint} — ya estaba en la cartera de ${action.alias} (R0 snapshot)`
        );
      }
      return s;
    }
    case "PRICES_UPDATE": {
      const tokens = { ...state.tokens };
      for (const [mint, price] of Object.entries(action.prices)) {
        const t = tokens[mint];
        if (t && price > 0) {
          tokens[mint] = { ...t, price, history: [...t.history.slice(-89), price] };
        }
      }
      return {
        ...state,
        tokens,
        solUsd: action.solUsd && action.solUsd > 0 ? action.solUsd : state.solUsd
      };
    }
    case "CLOSE_POSITION": {
      const pos = state.positions.find((p) => p.id === action.id);
      if (!pos) return state;
      const ev = {
        wallet: pos.walletAddress,
        type: "sell",
        mint: pos.mint,
        symbol: pos.symbol,
        solAmount: 0,
        tokenAmount: pos.tokens,
        price: state.tokens[pos.mint]?.price ?? pos.entryPrice,
        txHash: genBotHash(),
        blockTime: Date.now()
      };
      return applyEvent(state, ev);
    }
    case "RESET":
      return seedState();
    case "PRINT": {
      let s = state;
      for (const l of action.lines) s = pushLog(s, l.kind, l.text);
      return s;
    }
    case "CLEAR_LOG":
      return { ...state, log: [] };
    default:
      return state;
  }
}
export function positionPnl(pos, tokens) {
  const token = tokens[pos.mint];
  const price = token ? token.price : pos.entryPrice;
  const value = pos.entryPrice > 0 ? pos.amountSol * (price / pos.entryPrice) : pos.amountSol;
  const pnlPct = pos.entryPrice > 0 ? (price / pos.entryPrice - 1) * 100 : 0;
  return { price, value, pnlSol: value - pos.amountSol, pnlPct: isFinite(pnlPct) ? pnlPct : 0 };
}
export function sessionStats(closed, positions, tokens) {
  const realized = closed.reduce((a, t) => a + t.pnlSol, 0);
  const unrealized = positions.reduce((a, p) => a + positionPnl(p, tokens).pnlSol, 0);
  const wins = closed.filter((t) => t.pnlSol >= 0).length;
  return {
    realized,
    unrealized,
    total: realized + unrealized,
    trades: closed.length,
    winRate: closed.length ? wins / closed.length * 100 : 0
  };
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImVuZ2luZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7XG4gIEFjdGlvbixcbiAgQ2xvc2VkVHJhZGUsXG4gIENsb3NlUmVhc29uLFxuICBMb2dLaW5kLFxuICBMb2dMaW5lLFxuICBPbmNoYWluRXZlbnQsXG4gIFBvc2l0aW9uLFxuICBTaW1TdGF0ZSxcbiAgVG9rZW4sXG4gIFdhbGxldFN0YXRzLFxufSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgREVGQVVMVF9DT05GSUdfVEVYVCwgcGFyc2VDb25maWcgfSBmcm9tIFwiLi9jb25maWdcIjtcblxuZXhwb3J0IGNvbnN0IExTX0tFWSA9IFwibWVtZWJvdDp2My4yXCI7XG5cbi8qKiBGYWxsYmFjayBkZWwgcHJlY2lvIFNPTC9VU0QgY3VhbmRvIEp1cGl0ZXIgbm8gcmVzcG9uZGUuICovXG5leHBvcnQgY29uc3QgU09MX1VTRF9GQUxMQkFDSyA9IDEwNTtcblxuLyoqIFdhbGxldCBkZSBlamVjdWNpw7NuIGRlbCBib3QgKHBhcGVyKS4gKi9cbmV4cG9ydCBjb25zdCBCT1RfV0FMTEVUID0gXCJNZW1lQm90RXhlY3V0aW9uV2ExMWV0MTExMTExMTExMTExMTExMTExMTExMTFcIjtcblxuLyogLS0tLS0tLS0tLS0tLS0tLSBoZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0gKi9cbmV4cG9ydCBjb25zdCByYW5kID0gKGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiBhICsgTWF0aC5yYW5kb20oKSAqIChiIC0gYSk7XG5leHBvcnQgY29uc3QgdWlkID0gKCkgPT4gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMiwgMTApO1xuXG4vKiogR2VuZXJhIHVuIGhhc2ggZXN0aWxvIFNvbGFuYSBwYXJhIGxhIHRyYW5zYWNjacOzbiAocGFwZXIpIGRlbCBib3QuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VuQm90SGFzaCgpOiBzdHJpbmcge1xuICBjb25zdCBjaGFycyA9IFwiMTIzNDU2Nzg5QUJDREVGR0hKS0xNTlBRUlNUVVZXWFlaYWJjZGVmZ2hpamttbm9wcXJzdHV2d3h5elwiO1xuICBsZXQgcyA9IFwiXCI7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgNDQ7IGkrKykgcyArPSBjaGFyc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBjaGFycy5sZW5ndGgpXTtcbiAgcmV0dXJuIHM7XG59XG5cbmV4cG9ydCBjb25zdCBzb2xzY2FuVHggPSAoaGFzaDogc3RyaW5nKSA9PiBgaHR0cHM6Ly9zb2xzY2FuLmlvL3R4LyR7aGFzaH1gO1xuZXhwb3J0IGNvbnN0IHNob3J0SGFzaCA9IChoOiBzdHJpbmcpID0+IChoLmxlbmd0aCA+IDEwID8gYCR7aC5zbGljZSgwLCA2KX3igKYke2guc2xpY2UoLTQpfWAgOiBoKTtcblxuZXhwb3J0IGNvbnN0IGZtdFNpZ25lZCA9IChuOiBudW1iZXIsIGRwID0gMiwgc3VmZml4ID0gXCJcIikgPT5cbiAgYCR7biA+PSAwID8gXCIrXCIgOiBcIuKIklwifSR7TWF0aC5hYnMobikudG9GaXhlZChkcCl9JHtzdWZmaXh9YDtcblxuZXhwb3J0IGNvbnN0IGZtdFByaWNlID0gKHA6IG51bWJlcikgPT4ge1xuICBpZiAoIWlzRmluaXRlKHApKSByZXR1cm4gXCLigJRcIjtcbiAgaWYgKHAgPj0gMSkgcmV0dXJuIHAudG9GaXhlZCgzKTtcbiAgaWYgKHAgPj0gMC4wMDEpIHJldHVybiBwLnRvRml4ZWQoNSk7XG4gIHJldHVybiBwLnRvRXhwb25lbnRpYWwoMik7XG59O1xuXG5leHBvcnQgY29uc3QgZm10VXNkID0gKG46IG51bWJlcikgPT4gYCQke24udG9GaXhlZCgyKX1gO1xuXG4vKiogUG9yY2VudGFqZSBhIHRleHRvLCBibGluZGFkbyBjb250cmEgTmFOL0luZmluaXR5LiAqL1xuZXhwb3J0IGNvbnN0IGZtdFBjdCA9IChuOiBudW1iZXIsIGRwID0gMSkgPT4gKGlzRmluaXRlKG4pID8gYCR7bi50b0ZpeGVkKGRwKX0lYCA6IFwiMCVcIik7XG5cbmV4cG9ydCBjb25zdCBmbXRUaW1lID0gKHRzOiBudW1iZXIpID0+IG5ldyBEYXRlKHRzKS50b0xvY2FsZVRpbWVTdHJpbmcoXCJlcy1FU1wiLCB7IGhvdXIxMjogZmFsc2UgfSk7XG5leHBvcnQgY29uc3Qgc2hvcnRBZGRyID0gKGE6IHN0cmluZykgPT4gYCR7YS5zbGljZSgwLCA0KX3igKYke2Euc2xpY2UoLTQpfWA7XG5cbmNvbnN0IGVtcHR5U3RhdHMgPSAoKTogV2FsbGV0U3RhdHMgPT4gKHsgY29waWVzOiAwLCBpZ25vcmVkOiAwLCBkdXN0SWdub3JlZDogMCwgcG5sU29sOiAwLCB1c2RjU2VjdXJlZDogMCB9KTtcblxuZnVuY3Rpb24gc2VlZFN0YXRlKCk6IFNpbVN0YXRlIHtcbiAgY29uc3QgY2ZnID0gcGFyc2VDb25maWcoREVGQVVMVF9DT05GSUdfVEVYVCkuY2ZnO1xuICByZXR1cm4ge1xuICAgIHRpY2s6IDAsXG4gICAgYmxvY2s6IDI4OV80MTJfNTUwLFxuICAgIGJvdE9uOiB0cnVlLFxuICAgIHJlc2VydmFTb2w6IGNmZy5yZXNlcnZhR2xvYmFsLFxuICAgIHVzZGM6IDAsXG4gICAgc29sVXNkOiBTT0xfVVNEX0ZBTExCQUNLLFxuICAgIGNmZyxcbiAgICBjb25maWdUZXh0OiBERUZBVUxUX0NPTkZJR19URVhULFxuICAgIHRva2Vuczoge30sXG4gICAgcG9zaXRpb25zOiBbXSxcbiAgICBjbG9zZWQ6IFtdLFxuICAgIHNuYXBzaG90SWdub3JlZDoge30sXG4gICAgZHVzdGVkOiB7fSxcbiAgICB3YWxsZXRTdGF0czoge30sXG4gICAgbG9nOiBbXSxcbiAgICBzZXE6IDEsXG4gIH07XG59XG5cbi8qIC0tLS0tLS0tLS0tLS0tLS0gcGVyc2lzdGVuY2lhIC0tLS0tLS0tLS0tLS0tLS0gKi9cbmV4cG9ydCBmdW5jdGlvbiBsb2FkU3RhdGUoKTogU2ltU3RhdGUge1xuICB0cnkge1xuICAgIGNvbnN0IHJhdyA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKExTX0tFWSk7XG4gICAgaWYgKCFyYXcpIHJldHVybiBzZWVkU3RhdGUoKTtcbiAgICBjb25zdCBzYXZlZCA9IEpTT04ucGFyc2UocmF3KTtcbiAgICBpZiAoIWlzVmFsaWRTYXZlZChzYXZlZCkpIHJldHVybiBzZWVkU3RhdGUoKTtcbiAgICByZXR1cm4geyAuLi4oc2F2ZWQgYXMgU2ltU3RhdGUpLCBsb2c6IFtdIH07XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBzZWVkU3RhdGUoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpc1ZhbGlkU2F2ZWQobzogdW5rbm93bik6IGJvb2xlYW4ge1xuICBpZiAoIW8gfHwgdHlwZW9mIG8gIT09IFwib2JqZWN0XCIpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgcyA9IG8gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IGNmZyA9IHMuY2ZnIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuICByZXR1cm4gKFxuICAgIHR5cGVvZiBzLnJlc2VydmFTb2wgPT09IFwibnVtYmVyXCIgJiZcbiAgICB0eXBlb2Ygcy5jb25maWdUZXh0ID09PSBcInN0cmluZ1wiICYmXG4gICAgdHlwZW9mIHMuYmxvY2sgPT09IFwibnVtYmVyXCIgJiZcbiAgICAhIWNmZyAmJlxuICAgIEFycmF5LmlzQXJyYXkoY2ZnLndhbGxldHMpICYmXG4gICAgISFzLnRva2VucyAmJlxuICAgIEFycmF5LmlzQXJyYXkocy5wb3NpdGlvbnMpICYmXG4gICAgQXJyYXkuaXNBcnJheShzLmNsb3NlZCkgJiZcbiAgICAhIXMud2FsbGV0U3RhdHMgJiZcbiAgICAhIXMuc25hcHNob3RJZ25vcmVkICYmXG4gICAgISFzLmR1c3RlZCAmJlxuICAgIHR5cGVvZiBzLnNlcSA9PT0gXCJudW1iZXJcIlxuICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2F2ZVN0YXRlKHM6IFNpbVN0YXRlKSB7XG4gIHRyeSB7XG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oTFNfS0VZLCBKU09OLnN0cmluZ2lmeSh7IC4uLnMsIGxvZzogW10gfSkpO1xuICB9IGNhdGNoIHtcbiAgICAvKiBzaW4gYWxtYWNlbmFtaWVudG8gKi9cbiAgfVxufVxuXG4vKiAtLS0tLS0tLS0tLS0tLS0tIGxvZyAtLS0tLS0tLS0tLS0tLS0tICovXG5mdW5jdGlvbiBwdXNoTG9nKHM6IFNpbVN0YXRlLCBraW5kOiBMb2dLaW5kLCB0ZXh0OiBzdHJpbmcpOiBTaW1TdGF0ZSB7XG4gIGNvbnN0IGVudHJ5OiBMb2dMaW5lID0geyBpZDogcy5zZXEsIHRzOiBEYXRlLm5vdygpLCBraW5kLCB0ZXh0IH07XG4gIHJldHVybiB7IC4uLnMsIHNlcTogcy5zZXEgKyAxLCBsb2c6IFsuLi5zLmxvZy5zbGljZSgtMzk5KSwgZW50cnldIH07XG59XG5cbmZ1bmN0aW9uIGJ1bXBTdGF0cyhzOiBTaW1TdGF0ZSwgYWRkcjogc3RyaW5nLCBwYXRjaDogUGFydGlhbDxXYWxsZXRTdGF0cz4pOiBTaW1TdGF0ZSB7XG4gIGNvbnN0IGN1ciA9IHMud2FsbGV0U3RhdHNbYWRkcl0gPz8gZW1wdHlTdGF0cygpO1xuICByZXR1cm4geyAuLi5zLCB3YWxsZXRTdGF0czogeyAuLi5zLndhbGxldFN0YXRzLCBbYWRkcl06IHsgLi4uY3VyLCAuLi5wYXRjaCB9IH0gfTtcbn1cblxuLyogLS0tLS0tLS0tLS0tLS0tLSB0b2tlbnMgLS0tLS0tLS0tLS0tLS0tLSAqL1xuZnVuY3Rpb24gZW5zdXJlVG9rZW4odG9rZW5zOiBSZWNvcmQ8c3RyaW5nLCBUb2tlbj4sIG1pbnQ6IHN0cmluZywgc3ltYm9sOiBzdHJpbmcsIHByaWNlOiBudW1iZXIpIHtcbiAgY29uc3QgaGl0ID0gdG9rZW5zW21pbnRdO1xuICBpZiAoaGl0KSByZXR1cm4gdG9rZW5zO1xuICByZXR1cm4ge1xuICAgIC4uLnRva2VucyxcbiAgICBbbWludF06IHsgbWludCwgc3ltYm9sLCBuYW1lOiBzeW1ib2wsIHByaWNlLCBoaXN0b3J5OiBBcnJheSgzMCkuZmlsbChwcmljZSkgfSxcbiAgfTtcbn1cblxuLyogLS0tLS0tLS0tLS0tLS0tLSBhcGxpY2FyIHVuIGV2ZW50byBSRUFMIGRlIGxhIGJsb2NrY2hhaW4gLS0tLS0tLS0tLS0tLS0tLSAqL1xuZnVuY3Rpb24gYXBwbHlFdmVudChwcmV2OiBTaW1TdGF0ZSwgZXY6IE9uY2hhaW5FdmVudCk6IFNpbVN0YXRlIHtcbiAgbGV0IHMgPSB7IC4uLnByZXYgfTtcbiAgY29uc3Qgd2FsbGV0Q2ZnID0gcy5jZmcud2FsbGV0cy5maW5kKCh3KSA9PiB3LmFkZHJlc3MgPT09IGV2LndhbGxldCk7XG4gIGNvbnN0IGFsaWFzID0gd2FsbGV0Q2ZnPy5hbGlhcyA/PyBzaG9ydEFkZHIoZXYud2FsbGV0KTtcblxuICBzID0geyAuLi5zLCB0b2tlbnM6IGVuc3VyZVRva2VuKHMudG9rZW5zLCBldi5taW50LCBldi5zeW1ib2wsIGV2LnByaWNlKSB9O1xuXG4gIC8qIC0tLS0tLS0tLS0gQUlSRFJPUCAvIERVU1RJTkcg4oaSIGR1c3QubG9nIChvY3VsdG8gZGVsIG1vbml0b3IpIC0tLS0tLS0tLS0gKi9cbiAgaWYgKGV2LnR5cGUgPT09IFwiZHVzdFwiKSB7XG4gICAgY29uc3QgZHEgPSBbLi4uKHMuZHVzdGVkW2V2LndhbGxldF0gPz8gW10pXTtcbiAgICBpZiAoIWRxLmluY2x1ZGVzKGV2Lm1pbnQpKSBkcS5wdXNoKGV2Lm1pbnQpO1xuICAgIHMgPSB7IC4uLnMsIGR1c3RlZDogeyAuLi5zLmR1c3RlZCwgW2V2LndhbGxldF06IGRxIH0gfTtcbiAgICBjb25zdCBjdXIgPSBzLndhbGxldFN0YXRzW2V2LndhbGxldF0gPz8gZW1wdHlTdGF0cygpO1xuICAgIHMgPSBidW1wU3RhdHMocywgZXYud2FsbGV0LCB7IGR1c3RJZ25vcmVkOiBjdXIuZHVzdElnbm9yZWQgKyAxIH0pO1xuICAgIHJldHVybiBwdXNoTG9nKFxuICAgICAgcyxcbiAgICAgIFwiZHVzdFwiLFxuICAgICAgYFIwLjUgJCR7ZXYuc3ltYm9sfSDCtyBjb250cmF0bzogJHtldi5taW50fSDCtyAke2FsaWFzfSBsbyByZWNpYmnDsyBTSU4gcGFnYXIgU09MIChhaXJkcm9wL2R1c3RpbmcpIOKGkiBpZ25vcmFkbyDCtyBIQVNIOiAke3Nob3J0SGFzaChldi50eEhhc2gpfWAsXG4gICAgKTtcbiAgfVxuXG4gIGlmICghd2FsbGV0Q2ZnKSB7XG4gICAgcmV0dXJuIHB1c2hMb2cocywgXCJvdXRcIiwgYHNlw7FhbCBkZSB3YWxsZXQgbm8gc2VndWlkYSAoJHtzaG9ydEFkZHIoZXYud2FsbGV0KX0pIOKGkiBpZ25vcmFkYWApO1xuICB9XG5cbiAgLyogLS0tLS0tLS0tLSBDT01QUkEgVsOBTElEQSAoZmlybcOzIHkgcGFnw7MgU09MKSAtLS0tLS0tLS0tICovXG4gIGlmIChldi50eXBlID09PSBcImJ1eVwiKSB7XG4gICAgLyogUjA6IHRva2VuIGVuIHNuYXBzaG90IGRlIGlnbm9yYWRvcyAqL1xuICAgIGNvbnN0IHNuYXAgPSBzLnNuYXBzaG90SWdub3JlZFtldi53YWxsZXRdID8/IFtdO1xuICAgIGlmIChzLmNmZy5zbmFwc2hvdEluaWNpYWwgJiYgc25hcC5pbmNsdWRlcyhldi5taW50KSkge1xuICAgICAgY29uc3QgY3VyID0gcy53YWxsZXRTdGF0c1tldi53YWxsZXRdID8/IGVtcHR5U3RhdHMoKTtcbiAgICAgIHMgPSBidW1wU3RhdHMocywgZXYud2FsbGV0LCB7IGlnbm9yZWQ6IGN1ci5pZ25vcmVkICsgMSB9KTtcbiAgICAgIHJldHVybiBwdXNoTG9nKFxuICAgICAgICBzLFxuICAgICAgICBcImlnbm9yZVwiLFxuICAgICAgICBgUjAgJCR7ZXYuc3ltYm9sfSDCtyBjb250cmF0bzogJHtldi5taW50fSDCtyAke2FsaWFzfSBsbyBvcGVyw7MgcGVybyBZQSBsbyB0ZW7DrWEgKHNuYXBzaG90KSDihpIgSUdOT1JBRE9gLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvKiBSMjogcG9zaWNpw7NuIGFiaWVydGEg4oaSIGlnbm9yYXIgcHJvbWVkaW8gKi9cbiAgICBjb25zdCBvcGVuID0gcy5wb3NpdGlvbnMuZmluZCgocCkgPT4gcC5taW50ID09PSBldi5taW50KTtcbiAgICBpZiAob3Blbikge1xuICAgICAgY29uc3QgY3VyID0gcy53YWxsZXRTdGF0c1tldi53YWxsZXRdID8/IGVtcHR5U3RhdHMoKTtcbiAgICAgIHMgPSBidW1wU3RhdHMocywgZXYud2FsbGV0LCB7IGlnbm9yZWQ6IGN1ci5pZ25vcmVkICsgMSB9KTtcbiAgICAgIHJldHVybiBwdXNoTG9nKFxuICAgICAgICBzLFxuICAgICAgICBcImlnbm9yZVwiLFxuICAgICAgICBgUjIgJHtldi5zeW1ib2x9IOKAlCBjb250cmF0bzogJHtldi5taW50fSDCtyAke2FsaWFzfSBwcm9tZWRpw7Mg4oaSIElHTk9SQURPIChwb3NpY2nDs24gYWJpZXJ0YSlgLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvKiBSMTogRklSU1QtSU4gKi9cbiAgICBjb25zdCBzb2xBVXNhciA9IHdhbGxldENmZy5jYXBpdGFsVXNkIC8gcy5zb2xVc2Q7XG4gICAgaWYgKHMucG9zaXRpb25zLmxlbmd0aCA+PSBzLmNmZy5tYXhQb3NpdGlvbnMpIHtcbiAgICAgIHJldHVybiBwdXNoTG9nKHMsIFwid2FyblwiLCBgUjEg4pqgIGzDrW1pdGUgZGUgJHtzLmNmZy5tYXhQb3NpdGlvbnN9IHBvc2ljaW9uZXMgYWxjYW56YWRvIOKGkiBubyBzZSBlbnRyw7MgZW4gJCR7ZXYuc3ltYm9sfWApO1xuICAgIH1cbiAgICBpZiAocy5yZXNlcnZhU29sIDwgc29sQVVzYXIpIHtcbiAgICAgIHJldHVybiBwdXNoTG9nKFxuICAgICAgICBzLFxuICAgICAgICBcIndhcm5cIixcbiAgICAgICAgYFIxIOKaoCBSRVNFUlZBIEJBSkE6IHNlIG5lY2VzaXRhbiAke3NvbEFVc2FyLnRvRml4ZWQoNCl9IFNPTCB5IGhheSAke3MucmVzZXJ2YVNvbC50b0ZpeGVkKDQpfSDihpIgbm8gc2UgZW50csOzIGVuICQke2V2LnN5bWJvbH1gLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBib3RIYXNoID0gZ2VuQm90SGFzaCgpO1xuICAgIGNvbnN0IHBvc2l0aW9uOiBQb3NpdGlvbiA9IHtcbiAgICAgIGlkOiB1aWQoKSxcbiAgICAgIG1pbnQ6IGV2Lm1pbnQsXG4gICAgICBzeW1ib2w6IGV2LnN5bWJvbCxcbiAgICAgIHdhbGxldEFkZHJlc3M6IGV2LndhbGxldCxcbiAgICAgIGVudHJ5UHJpY2U6IGV2LnByaWNlLFxuICAgICAgYW1vdW50U29sOiBzb2xBVXNhcixcbiAgICAgIGNhcGl0YWxVc2Q6IHdhbGxldENmZy5jYXBpdGFsVXNkLFxuICAgICAgdG9rZW5zOiBldi5wcmljZSA+IDAgPyBzb2xBVXNhciAvIGV2LnByaWNlIDogMCxcbiAgICAgIG9wZW5lZEF0OiBEYXRlLm5vdygpLFxuICAgIH07XG4gICAgcyA9IHsgLi4ucywgcG9zaXRpb25zOiBbLi4ucy5wb3NpdGlvbnMsIHBvc2l0aW9uXSwgcmVzZXJ2YVNvbDogcy5yZXNlcnZhU29sIC0gc29sQVVzYXIgfTtcbiAgICBjb25zdCBjdXIgPSBzLndhbGxldFN0YXRzW2V2LndhbGxldF0gPz8gZW1wdHlTdGF0cygpO1xuICAgIHMgPSBidW1wU3RhdHMocywgZXYud2FsbGV0LCB7IGNvcGllczogY3VyLmNvcGllcyArIDEgfSk7XG5cbiAgICBzID0gcHVzaExvZyhcbiAgICAgIHMsXG4gICAgICBcImJ1eVwiLFxuICAgICAgYFIxOiAke2FsaWFzfSBDT01QUsOTICQke2V2LnN5bWJvbH0gfCBQYWfDsyAke2V2LnNvbEFtb3VudC50b0ZpeGVkKDQpfSBTT0wgfCBIQVNIIENBUDogJHtzaG9ydEhhc2goZXYudHhIYXNoKX0gfCAke3NvbHNjYW5UeChldi50eEhhc2gpfSB8IE1JIEJPVCBDT01QUsOTOiAke3NvbEFVc2FyLnRvRml4ZWQoNCl9IFNPTCAoJHtmbXRVc2Qod2FsbGV0Q2ZnLmNhcGl0YWxVc2QpfSkgfCBIQVNIIEJPVDogJHtzaG9ydEhhc2goYm90SGFzaCl9IHwgJHtzb2xzY2FuVHgoYm90SGFzaCl9YCxcbiAgICApO1xuICAgIHJldHVybiBzO1xuICB9XG5cbiAgLyogLS0tLS0tLS0tLSBWRU5UQSBWw4FMSURBIC0tLS0tLS0tLS0gKi9cbiAgaWYgKGV2LnR5cGUgPT09IFwic2VsbFwiKSB7XG4gICAgY29uc3Qgb3BlbiA9IHMucG9zaXRpb25zLmZpbmQoKHApID0+IHAubWludCA9PT0gZXYubWludCAmJiBwLndhbGxldEFkZHJlc3MgPT09IGV2LndhbGxldCk7XG5cbiAgICBpZiAoIW9wZW4pIHtcbiAgICAgIC8qIFIwOiBzaSBlc3RhYmEgZW4gc25hcHNob3QgeSBsbyB2ZW5kacOzIDEwMCUg4oaSIGxpYmVyYXIgKi9cbiAgICAgIGNvbnN0IHNuYXAgPSBzLnNuYXBzaG90SWdub3JlZFtldi53YWxsZXRdID8/IFtdO1xuICAgICAgaWYgKHNuYXAuaW5jbHVkZXMoZXYubWludCkpIHtcbiAgICAgICAgcyA9IHtcbiAgICAgICAgICAuLi5zLFxuICAgICAgICAgIHNuYXBzaG90SWdub3JlZDoge1xuICAgICAgICAgICAgLi4ucy5zbmFwc2hvdElnbm9yZWQsXG4gICAgICAgICAgICBbZXYud2FsbGV0XTogc25hcC5maWx0ZXIoKG0pID0+IG0gIT09IGV2Lm1pbnQpLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICAgIHJldHVybiBwdXNoTG9nKHMsIFwiaWdub3JlXCIsIGBSMCAke2FsaWFzfSB2ZW5kacOzIDEwMCUgZGUgJCR7ZXYuc3ltYm9sfSDihpIgbGliZXJhZG8gZGUgVE9LRU5TX0lHTk9SQURPU2ApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHB1c2hMb2cocywgXCJpZ25vcmVcIiwgYFIzICR7YWxpYXN9IHZlbmRpw7MgJCR7ZXYuc3ltYm9sfSBwZXJvIGVsIGJvdCBubyB0ZW7DrWEgcG9zaWNpw7NuIOKGkiBuYWRhIHF1ZSBoYWNlcmApO1xuICAgIH1cblxuICAgIC8qIFIzOiBGSVJTVC1PVVQg4oaSIHZlbmRlciAxMDAlICovXG4gICAgY29uc3QgcHJvY2VlZHMgPSBvcGVuLmFtb3VudFNvbCAqIChldi5wcmljZSAvIG9wZW4uZW50cnlQcmljZSk7XG4gICAgY29uc3QgcG5sU29sID0gcHJvY2VlZHMgLSBvcGVuLmFtb3VudFNvbDtcbiAgICBjb25zdCBwbmxQY3QgPSBvcGVuLmVudHJ5UHJpY2UgPiAwID8gKGV2LnByaWNlIC8gb3Blbi5lbnRyeVByaWNlIC0gMSkgKiAxMDAgOiAwO1xuXG4gICAgY29uc3QgdHJhZGU6IENsb3NlZFRyYWRlID0ge1xuICAgICAgLi4ub3BlbixcbiAgICAgIGV4aXRQcmljZTogZXYucHJpY2UsXG4gICAgICBjbG9zZWRBdDogRGF0ZS5ub3coKSxcbiAgICAgIHBubFNvbCxcbiAgICAgIHBubFBjdCxcbiAgICAgIHJlYXNvbjogXCJUUkFERVJfU0VMTFwiLFxuICAgIH07XG5cbiAgICAvKiBSNTogVEVTT1JFUsONQSDigJQgZGV2dWVsdmUgU09MX0FfVVNBUiBhIGxhIHJlc2VydmE7IGdhbmFuY2lhIOKGkiBVU0RDICovXG4gICAgY29uc3QgYm90SGFzaCA9IGdlbkJvdEhhc2goKTtcbiAgICBjb25zdCBnYW5hbmNpYSA9IHBubFNvbDtcbiAgICBsZXQgbmV3UmVzZXJ2YTogbnVtYmVyO1xuICAgIGxldCBuZXdVc2RjID0gcy51c2RjO1xuICAgIGxldCByNUtpbmQ6IExvZ0tpbmQ7XG4gICAgbGV0IHI1VGV4dDogc3RyaW5nO1xuXG4gICAgaWYgKGdhbmFuY2lhID4gMCAmJiBzLmNmZy5hdXRvU3dhcFVzZGMpIHtcbiAgICAgIGNvbnN0IHVzZGNHYWluID0gZ2FuYW5jaWEgKiBzLnNvbFVzZDtcbiAgICAgIG5ld1Jlc2VydmEgPSBzLnJlc2VydmFTb2wgKyBvcGVuLmFtb3VudFNvbDtcbiAgICAgIG5ld1VzZGMgPSBzLnVzZGMgKyB1c2RjR2FpbjtcbiAgICAgIHI1S2luZCA9IFwidHBcIjtcbiAgICAgIHI1VGV4dCA9IGBSNSBHQU5BTkNJQTogKyR7Z2FuYW5jaWEudG9GaXhlZCg0KX0gU09MIOKGkiBzd2FwIFNPTOKGklVTREMgKCske3VzZGNHYWluLnRvRml4ZWQoMil9IFVTREMgYXNlZ3VyYWRvcylgO1xuICAgIH0gZWxzZSBpZiAoZ2FuYW5jaWEgPiAwKSB7XG4gICAgICBuZXdSZXNlcnZhID0gcy5yZXNlcnZhU29sICsgb3Blbi5hbW91bnRTb2wgKyBnYW5hbmNpYTtcbiAgICAgIHI1S2luZCA9IFwidHBcIjtcbiAgICAgIHI1VGV4dCA9IGBSNSBHQU5BTkNJQTogKyR7Z2FuYW5jaWEudG9GaXhlZCg0KX0gU09MIChhdXRvX3N3YXAgVVNEQyBkZXNhY3RpdmFkbywgcXVlZGEgZW4gcmVzZXJ2YSlgO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXdSZXNlcnZhID0gcy5yZXNlcnZhU29sICsgb3Blbi5hbW91bnRTb2wgKyBnYW5hbmNpYTtcbiAgICAgIHI1S2luZCA9IFwic2xcIjtcbiAgICAgIHI1VGV4dCA9IGBSNSBQw4lSRElEQTog4oiSJHtNYXRoLmFicyhnYW5hbmNpYSkudG9GaXhlZCg0KX0gU09MIChsYSBSRVNFUlZBX0dMT0JBTCBxdWVkYSBtw6FzIHBlcXVlw7FhKWA7XG4gICAgfVxuXG4gICAgcyA9IHtcbiAgICAgIC4uLnMsXG4gICAgICBwb3NpdGlvbnM6IHMucG9zaXRpb25zLmZpbHRlcigocCkgPT4gcC5pZCAhPT0gb3Blbi5pZCksXG4gICAgICBjbG9zZWQ6IFt0cmFkZSwgLi4ucy5jbG9zZWRdLnNsaWNlKDAsIDgwKSxcbiAgICAgIHJlc2VydmFTb2w6IG5ld1Jlc2VydmEsXG4gICAgICB1c2RjOiBuZXdVc2RjLFxuICAgIH07XG4gICAgY29uc3QgY3VyID0gcy53YWxsZXRTdGF0c1tldi53YWxsZXRdID8/IGVtcHR5U3RhdHMoKTtcbiAgICBzID0gYnVtcFN0YXRzKHMsIGV2LndhbGxldCwge1xuICAgICAgcG5sU29sOiBjdXIucG5sU29sICsgcG5sU29sLFxuICAgICAgdXNkY1NlY3VyZWQ6IGN1ci51c2RjU2VjdXJlZCArIChnYW5hbmNpYSA+IDAgJiYgcy5jZmcuYXV0b1N3YXBVc2RjID8gZ2FuYW5jaWEgKiBzLnNvbFVzZCA6IDApLFxuICAgIH0pO1xuXG4gICAgcyA9IHB1c2hMb2coXG4gICAgICBzLFxuICAgICAgXCJzZWxsXCIsXG4gICAgICBgUjM6ICR7YWxpYXN9IFZFTkRJw5MgJCR7ZXYuc3ltYm9sfSAxMDAlIEAgJHtmbXRQcmljZShldi5wcmljZSl9IHwgSEFTSCBDQVA6ICR7c2hvcnRIYXNoKGV2LnR4SGFzaCl9IHwgJHtzb2xzY2FuVHgoZXYudHhIYXNoKX0gfCBNSSBCT1QgVkVOREnDkyAxMDAlIHwgSEFTSCBCT1Q6ICR7c2hvcnRIYXNoKGJvdEhhc2gpfSB8ICR7c29sc2NhblR4KGJvdEhhc2gpfSB8IFBuTDogJHtmbXRTaWduZWQocG5sUGN0LCAxLCBcIiVcIil9ICgke2ZtdFNpZ25lZChwbmxTb2wsIDQsIFwiIFNPTFwiKX0pYCxcbiAgICApO1xuICAgIHMgPSBwdXNoTG9nKHMsIHI1S2luZCwgcjVUZXh0KTtcbiAgICByZXR1cm4gcztcbiAgfVxuXG4gIHJldHVybiBzO1xufVxuXG4vKiAtLS0tLS0tLS0tLS0tLS0tIHRpY2s6IHNvbG8gcHJlY2lvcyB5IGJsb3F1ZSAoTk8gaW52ZW50YSB0cmFkZXMpIC0tLS0tLS0tLS0tLS0tLS0gKi9cbmZ1bmN0aW9uIHN0ZXAocHJldjogU2ltU3RhdGUpOiBTaW1TdGF0ZSB7XG4gIGxldCBzOiBTaW1TdGF0ZSA9IHsgLi4ucHJldiwgdGljazogcHJldi50aWNrICsgMSwgYmxvY2s6IHByZXYuYmxvY2sgKyAxIH07XG5cbiAgY29uc3QgdG9rZW5zOiBSZWNvcmQ8c3RyaW5nLCBUb2tlbj4gPSB7fTtcbiAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMocy50b2tlbnMpKSB7XG4gICAgY29uc3QgdCA9IHMudG9rZW5zW2tleV07XG4gICAgbGV0IGRyaWZ0ID0gcmFuZCgtMC4wMTQsIDAuMDE2KTtcbiAgICBpZiAoTWF0aC5yYW5kb20oKSA8IDAuMDUpIGRyaWZ0ICs9IHJhbmQoLTAuMDYsIDAuMTEpO1xuICAgIGNvbnN0IHByaWNlID0gTWF0aC5tYXgodC5wcmljZSAqICgxICsgZHJpZnQpLCB0Lmhpc3RvcnlbMF0gKiAwLjA1KTtcbiAgICB0b2tlbnNba2V5XSA9IHsgLi4udCwgcHJpY2UsIGhpc3Rvcnk6IFsuLi50Lmhpc3Rvcnkuc2xpY2UoLTg5KSwgcHJpY2VdIH07XG4gIH1cbiAgcyA9IHsgLi4ucywgdG9rZW5zIH07XG5cbiAgcmV0dXJuIHM7XG59XG5cbi8qIC0tLS0tLS0tLS0tLS0tLS0gcmVkdWNlciAtLS0tLS0tLS0tLS0tLS0tICovXG5leHBvcnQgZnVuY3Rpb24gcmVkdWNlcihzdGF0ZTogU2ltU3RhdGUsIGFjdGlvbjogQWN0aW9uKTogU2ltU3RhdGUge1xuICBzd2l0Y2ggKGFjdGlvbi50eXBlKSB7XG4gICAgY2FzZSBcIlRJQ0tcIjpcbiAgICAgIHJldHVybiBzdGVwKHN0YXRlKTtcblxuICAgIGNhc2UgXCJUT0dHTEVfQk9UXCI6IHtcbiAgICAgIGNvbnN0IGJvdE9uID0gIXN0YXRlLmJvdE9uO1xuICAgICAgcmV0dXJuIHB1c2hMb2coXG4gICAgICAgIHsgLi4uc3RhdGUsIGJvdE9uIH0sXG4gICAgICAgIGJvdE9uID8gXCJva1wiIDogXCJ3YXJuXCIsXG4gICAgICAgIGJvdE9uXG4gICAgICAgICAgPyBcIlNJU1RFTUEgICAgYm90IGFjdGl2YWRvIMK3IGNvcGlhbmRvIGxhIHByaW1lcmEgY29tcHJhIHbDoWxpZGEgZGUgY2FkYSBzZcOxYWxcIlxuICAgICAgICAgIDogXCJTSVNURU1BICAgIGJvdCBlbiBwYXVzYSDCtyBlbCByYWRhciBkZXRlY3RhIHNlw7FhbGVzIHBlcm8gbm8gZWplY3V0YVwiLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjYXNlIFwiQVBQTFlfQ09ORklHXCI6IHtcbiAgICAgIGNvbnN0IHdhbGxldFN0YXRzOiBSZWNvcmQ8c3RyaW5nLCBXYWxsZXRTdGF0cz4gPSB7IC4uLnN0YXRlLndhbGxldFN0YXRzIH07XG4gICAgICBjb25zdCBzbmFwc2hvdElnbm9yZWQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHsgLi4uc3RhdGUuc25hcHNob3RJZ25vcmVkIH07XG4gICAgICBjb25zdCBkdXN0ZWQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHsgLi4uc3RhdGUuZHVzdGVkIH07XG4gICAgICBmb3IgKGNvbnN0IHcgb2YgYWN0aW9uLmNmZy53YWxsZXRzKSB7XG4gICAgICAgIGlmICghd2FsbGV0U3RhdHNbdy5hZGRyZXNzXSkgd2FsbGV0U3RhdHNbdy5hZGRyZXNzXSA9IGVtcHR5U3RhdHMoKTtcbiAgICAgICAgaWYgKCFzbmFwc2hvdElnbm9yZWRbdy5hZGRyZXNzXSkgc25hcHNob3RJZ25vcmVkW3cuYWRkcmVzc10gPSBbXTtcbiAgICAgICAgaWYgKCFkdXN0ZWRbdy5hZGRyZXNzXSkgZHVzdGVkW3cuYWRkcmVzc10gPSBbXTtcbiAgICAgIH1cbiAgICAgIGxldCBzOiBTaW1TdGF0ZSA9IHtcbiAgICAgICAgLi4uc3RhdGUsXG4gICAgICAgIGNmZzogYWN0aW9uLmNmZyxcbiAgICAgICAgY29uZmlnVGV4dDogYWN0aW9uLnRleHQsXG4gICAgICAgIHJlc2VydmFTb2w6IGFjdGlvbi5jZmcucmVzZXJ2YUdsb2JhbCxcbiAgICAgICAgd2FsbGV0U3RhdHMsXG4gICAgICAgIHNuYXBzaG90SWdub3JlZCxcbiAgICAgICAgZHVzdGVkLFxuICAgICAgfTtcbiAgICAgIHMgPSBwdXNoTG9nKFxuICAgICAgICBzLFxuICAgICAgICBcIm9rXCIsXG4gICAgICAgIGBDT05GSUcgICAgICDinJMgY29uZmlnLnR4dCByZWNhcmdhZGEgwrcgJHthY3Rpb24uY2ZnLndhbGxldHMubGVuZ3RofSB3YWxsZXQocykgwrcgUkVTRVJWQV9HTE9CQUwgJHthY3Rpb24uY2ZnLnJlc2VydmFHbG9iYWwudG9GaXhlZCgyKX0gU09MIMK3IHByZWNpbyBTT0wvVVNEIEVOIFZJVk8gKEp1cGl0ZXIpYCxcbiAgICAgICk7XG4gICAgICByZXR1cm4gcztcbiAgICB9XG5cbiAgICBjYXNlIFwiT05DSEFJTl9FVkVOVFwiOlxuICAgICAgcmV0dXJuIGFwcGx5RXZlbnQoc3RhdGUsIGFjdGlvbi5ldmVudCk7XG5cbiAgICBjYXNlIFwiU05BUFNIT1RfU0VUXCI6IHtcbiAgICAgIGxldCBzOiBTaW1TdGF0ZSA9IHtcbiAgICAgICAgLi4uc3RhdGUsXG4gICAgICAgIHNuYXBzaG90SWdub3JlZDogeyAuLi5zdGF0ZS5zbmFwc2hvdElnbm9yZWQsIFthY3Rpb24ud2FsbGV0XTogYWN0aW9uLm1pbnRzIH0sXG4gICAgICB9O1xuICAgICAgcyA9IHB1c2hMb2coXG4gICAgICAgIHMsXG4gICAgICAgIFwib2tcIixcbiAgICAgICAgYFIwICAgICAgICAgIHNuYXBzaG90IFJFQUwgZGUgJHthY3Rpb24uYWxpYXN9OiAke2FjdGlvbi5taW50cy5sZW5ndGh9IHRva2VuKHMpIHlhIGVuIGNhcnRlcmEg4oaSIFRPS0VOU19JR05PUkFET1NgLFxuICAgICAgKTtcbiAgICAgIC8qIGNhZGEgdG9rZW4gaWdub3JhZG8gdmEgYSBsYSBwZXN0YcOxYSBJR05PUkFET1MuXG4gICAgICAgICBGb3JtYXRvIG9ibGlnYXRvcmlvOiAgSUdOT1JBRE86ICRTWU1CT0wgLSBBYkNkLi4uRWZHaCAtIGNvbnRyYXRvX2NvbXBsZXRvXG4gICAgICAgICDCtyBTWU1CT0wgPSB0aWNrZXIgcmVhbCAoSGVsaXVzIERBUyDihpIgSnVwaXRlcikgbyBVTktOT1dOIOKAlCBudW5jYSBcIihzaW4gdGlja2VyKVwiXG4gICAgICAgICDCtyBlbCDDumx0aW1vIGNvbnRyYXRvIGVzIGxhIGRpcmVjY2nDs24gQ09NUExFVEEgKDMy4oCTNDQgY2hhcnMpLCBzaW4gYWJyZXZpYXIgKi9cbiAgICAgIGZvciAoY29uc3QgbWludCBvZiBhY3Rpb24ubWludHMpIHtcbiAgICAgICAgY29uc3Qgc3ltID0gYWN0aW9uLnN5bWJvbHM/LlttaW50XSB8fCBcIlVOS05PV05cIjtcbiAgICAgICAgcyA9IHB1c2hMb2coXG4gICAgICAgICAgcyxcbiAgICAgICAgICBcImlnbm9yZVwiLFxuICAgICAgICAgIGBJR05PUkFETzogJCR7c3ltfSAtICR7c2hvcnRBZGRyKG1pbnQpfSAtICR7bWludH0g4oCUIHlhIGVzdGFiYSBlbiBsYSBjYXJ0ZXJhIGRlICR7YWN0aW9uLmFsaWFzfSAoUjAgc25hcHNob3QpYCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzO1xuICAgIH1cblxuICAgIGNhc2UgXCJQUklDRVNfVVBEQVRFXCI6IHtcbiAgICAgIGNvbnN0IHRva2VuczogUmVjb3JkPHN0cmluZywgVG9rZW4+ID0geyAuLi5zdGF0ZS50b2tlbnMgfTtcbiAgICAgIGZvciAoY29uc3QgW21pbnQsIHByaWNlXSBvZiBPYmplY3QuZW50cmllcyhhY3Rpb24ucHJpY2VzKSkge1xuICAgICAgICBjb25zdCB0ID0gdG9rZW5zW21pbnRdO1xuICAgICAgICBpZiAodCAmJiBwcmljZSA+IDApIHtcbiAgICAgICAgICB0b2tlbnNbbWludF0gPSB7IC4uLnQsIHByaWNlLCBoaXN0b3J5OiBbLi4udC5oaXN0b3J5LnNsaWNlKC04OSksIHByaWNlXSB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICAuLi5zdGF0ZSxcbiAgICAgICAgdG9rZW5zLFxuICAgICAgICBzb2xVc2Q6IGFjdGlvbi5zb2xVc2QgJiYgYWN0aW9uLnNvbFVzZCA+IDAgPyBhY3Rpb24uc29sVXNkIDogc3RhdGUuc29sVXNkLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjYXNlIFwiQ0xPU0VfUE9TSVRJT05cIjoge1xuICAgICAgY29uc3QgcG9zID0gc3RhdGUucG9zaXRpb25zLmZpbmQoKHApID0+IHAuaWQgPT09IGFjdGlvbi5pZCk7XG4gICAgICBpZiAoIXBvcykgcmV0dXJuIHN0YXRlO1xuICAgICAgY29uc3QgZXY6IE9uY2hhaW5FdmVudCA9IHtcbiAgICAgICAgd2FsbGV0OiBwb3Mud2FsbGV0QWRkcmVzcyxcbiAgICAgICAgdHlwZTogXCJzZWxsXCIsXG4gICAgICAgIG1pbnQ6IHBvcy5taW50LFxuICAgICAgICBzeW1ib2w6IHBvcy5zeW1ib2wsXG4gICAgICAgIHNvbEFtb3VudDogMCxcbiAgICAgICAgdG9rZW5BbW91bnQ6IHBvcy50b2tlbnMsXG4gICAgICAgIHByaWNlOiBzdGF0ZS50b2tlbnNbcG9zLm1pbnRdPy5wcmljZSA/PyBwb3MuZW50cnlQcmljZSxcbiAgICAgICAgdHhIYXNoOiBnZW5Cb3RIYXNoKCksXG4gICAgICAgIGJsb2NrVGltZTogRGF0ZS5ub3coKSxcbiAgICAgIH07XG4gICAgICByZXR1cm4gYXBwbHlFdmVudChzdGF0ZSwgZXYpO1xuICAgIH1cblxuICAgIGNhc2UgXCJSRVNFVFwiOlxuICAgICAgcmV0dXJuIHNlZWRTdGF0ZSgpO1xuXG4gICAgY2FzZSBcIlBSSU5UXCI6IHtcbiAgICAgIGxldCBzID0gc3RhdGU7XG4gICAgICBmb3IgKGNvbnN0IGwgb2YgYWN0aW9uLmxpbmVzKSBzID0gcHVzaExvZyhzLCBsLmtpbmQsIGwudGV4dCk7XG4gICAgICByZXR1cm4gcztcbiAgICB9XG5cbiAgICBjYXNlIFwiQ0xFQVJfTE9HXCI6XG4gICAgICByZXR1cm4geyAuLi5zdGF0ZSwgbG9nOiBbXSB9O1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBzdGF0ZTtcbiAgfVxufVxuXG4vKiAtLS0tLS0tLS0tLS0tLS0tIGRlcml2YWRvcyAtLS0tLS0tLS0tLS0tLS0tICovXG5leHBvcnQgZnVuY3Rpb24gcG9zaXRpb25QbmwocG9zOiBQb3NpdGlvbiwgdG9rZW5zOiBSZWNvcmQ8c3RyaW5nLCBUb2tlbj4pIHtcbiAgY29uc3QgdG9rZW4gPSB0b2tlbnNbcG9zLm1pbnRdO1xuICBjb25zdCBwcmljZSA9IHRva2VuID8gdG9rZW4ucHJpY2UgOiBwb3MuZW50cnlQcmljZTtcbiAgY29uc3QgdmFsdWUgPSBwb3MuZW50cnlQcmljZSA+IDAgPyBwb3MuYW1vdW50U29sICogKHByaWNlIC8gcG9zLmVudHJ5UHJpY2UpIDogcG9zLmFtb3VudFNvbDtcbiAgY29uc3QgcG5sUGN0ID0gcG9zLmVudHJ5UHJpY2UgPiAwID8gKHByaWNlIC8gcG9zLmVudHJ5UHJpY2UgLSAxKSAqIDEwMCA6IDA7XG4gIHJldHVybiB7IHByaWNlLCB2YWx1ZSwgcG5sU29sOiB2YWx1ZSAtIHBvcy5hbW91bnRTb2wsIHBubFBjdDogaXNGaW5pdGUocG5sUGN0KSA/IHBubFBjdCA6IDAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNlc3Npb25TdGF0cyhjbG9zZWQ6IENsb3NlZFRyYWRlW10sIHBvc2l0aW9uczogUG9zaXRpb25bXSwgdG9rZW5zOiBSZWNvcmQ8c3RyaW5nLCBUb2tlbj4pIHtcbiAgY29uc3QgcmVhbGl6ZWQgPSBjbG9zZWQucmVkdWNlKChhLCB0KSA9PiBhICsgdC5wbmxTb2wsIDApO1xuICBjb25zdCB1bnJlYWxpemVkID0gcG9zaXRpb25zLnJlZHVjZSgoYSwgcCkgPT4gYSArIHBvc2l0aW9uUG5sKHAsIHRva2VucykucG5sU29sLCAwKTtcbiAgY29uc3Qgd2lucyA9IGNsb3NlZC5maWx0ZXIoKHQpID0+IHQucG5sU29sID49IDApLmxlbmd0aDtcbiAgcmV0dXJuIHtcbiAgICByZWFsaXplZCxcbiAgICB1bnJlYWxpemVkLFxuICAgIHRvdGFsOiByZWFsaXplZCArIHVucmVhbGl6ZWQsXG4gICAgdHJhZGVzOiBjbG9zZWQubGVuZ3RoLFxuICAgIHdpblJhdGU6IGNsb3NlZC5sZW5ndGggPyAod2lucyAvIGNsb3NlZC5sZW5ndGgpICogMTAwIDogMCxcbiAgfTtcbn1cbiJdLCJtYXBwaW5ncyI6IkFBWUEsU0FBUyxxQkFBcUIsbUJBQW1CO0FBRTFDLGFBQU0sU0FBUztBQUdmLGFBQU0sbUJBQW1CO0FBR3pCLGFBQU0sYUFBYTtBQUduQixhQUFNLE9BQU8sQ0FBQyxHQUFXLE1BQWMsSUFBSSxLQUFLLE9BQU8sS0FBSyxJQUFJO0FBQ2hFLGFBQU0sTUFBTSxNQUFNLEtBQUssT0FBTyxFQUFFLFNBQVMsRUFBRSxFQUFFLE1BQU0sR0FBRyxFQUFFO0FBR3hELGdCQUFTLGFBQXFCO0FBQ25DLFFBQU0sUUFBUTtBQUNkLE1BQUksSUFBSTtB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