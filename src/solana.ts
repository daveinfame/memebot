const WS_URL = "wss://api.mainnet-beta.solana.com";
const RPC_URL = "https://api.mainnet-beta.solana.com";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const metaCache = /* @__PURE__ */ new Map();
async function rpc(method, params, url = RPC_URL) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return json.result;
}
async function heliusAssetSymbol(mint, rpcUrl) {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } })
    });
    if (!res.ok) return null;
    const j = await res.json();
    const sym = j?.result?.content?.metadata?.symbol;
    return typeof sym === "string" && sym.trim() !== "" ? sym.trim() : null;
  } catch {
    return null;
  }
}
async function getTokenMeta(mint, rpcUrl = "") {
  const hit = metaCache.get(mint);
  if (hit) return hit;
  if (rpcUrl && rpcUrl !== RPC_URL) {
    const das = await heliusAssetSymbol(mint, rpcUrl);
    if (das) {
      const meta = { symbol: das, decimals: 6, real: true };
      metaCache.set(mint, meta);
      return meta;
    }
  }
  try {
    const res = await fetch(`https://tokens.jup.ag/token/${mint}`);
    if (res.ok) {
      const j = await res.json();
      if (j && typeof j.symbol === "string" && j.symbol.trim() !== "") {
        const meta = { symbol: j.symbol, decimals: j.decimals ?? 6, real: true };
        metaCache.set(mint, meta);
        return meta;
      }
    }
  } catch {
  }
  const fallback = { symbol: "", decimals: 6, real: false };
  metaCache.set(mint, fallback);
  return fallback;
}
export async function fetchSolUsd() {
  try {
    const res = await fetch(`https://price.jup.ag/v6/price?ids=${SOL_MINT}`);
    if (res.ok) {
      const j = await res.json();
      const p = j?.data?.[SOL_MINT]?.price;
      if (typeof p === "number" && p > 0) return p;
    }
  } catch {
  }
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
    );
    if (res.ok) {
      const j = await res.json();
      const p = j?.solana?.usd;
      if (typeof p === "number" && p > 0) return p;
    }
  } catch {
  }
  return null;
}
export async function resolveSymbols(mints, rpcUrl = "") {
  const out = {};
  for (const m of mints) {
    try {
      const meta = await getTokenMeta(m, rpcUrl);
      out[m] = meta.real ? meta.symbol : "";
    } catch {
      out[m] = "";
    }
  }
  return out;
}
export async function fetchPrices(mints) {
  const out = {};
  if (!mints.length) return out;
  try {
    const res = await fetch(`https://price.jup.ag/v6/price?ids=${mints.join(",")}`);
    if (!res.ok) return out;
    const j = await res.json();
    for (const m of mints) {
      const p = j?.data?.[m]?.price;
      if (typeof p === "number" && p > 0) out[m] = p;
    }
  } catch {
  }
  return out;
}
export async function pingRpc(rpcUrl = "") {
  const url = rpcUrl.trim() || RPC_URL;
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth", params: [] })
    });
    if (!res.ok) return null;
    return Math.round(performance.now() - t0);
  } catch {
    return null;
  }
}
export async function fetchWalletTokenMints(address, rpcUrl = "") {
  try {
    const res = await rpc(
      "getTokenAccountsByOwner",
      [address, { programId: TOKEN_PROGRAM }, { encoding: "jsonParsed" }],
      rpcUrl.trim() || RPC_URL
    );
    const mints = [];
    for (const item of res?.value ?? []) {
      const info = item?.account?.data?.parsed?.info;
      const amount = Number(info?.tokenAmount?.amount ?? 0);
      if (info?.mint && amount > 0 && !mints.includes(info.mint)) mints.push(info.mint);
    }
    return mints;
  } catch {
    return [];
  }
}
function normalizeKeys(message) {
  const raw = message?.accountKeys ?? [];
  if (!raw.length) return [];
  if (typeof raw[0] !== "string") {
    return raw.map((k) => ({ address: k?.pubkey, signer: !!k?.signer }));
  }
  return raw.map((a, i) => ({ address: a, signer: i === 0 }));
}
async function classify(tx, wallet, rpcUrl = "") {
  const meta = tx?.meta;
  if (!meta || meta.err) return null;
  const keys = normalizeKeys(tx?.transaction?.message);
  const isSigner = keys.some((k) => k.address === wallet && k.signer);
  const walletIdx = keys.findIndex((k) => k.address === wallet);
  let solDelta = 0;
  if (walletIdx >= 0 && meta.preBalances && meta.postBalances) {
    solDelta = (meta.postBalances[walletIdx] - meta.preBalances[walletIdx]) / 1e9;
  }
  const preByMint = /* @__PURE__ */ new Map();
  for (const b of meta.preTokenBalances ?? []) {
    if (b.owner === wallet) {
      preByMint.set(b.mint, (preByMint.get(b.mint) ?? 0) + (b.uiTokenAmount?.uiAmount ?? 0));
    }
  }
  const postByMint = /* @__PURE__ */ new Map();
  for (const b of meta.postTokenBalances ?? []) {
    if (b.owner === wallet) {
      postByMint.set(b.mint, (postByMint.get(b.mint) ?? 0) + (b.uiTokenAmount?.uiAmount ?? 0));
    }
  }
  const mints = /* @__PURE__ */ new Set([...preByMint.keys(), ...postByMint.keys()]);
  let bestMint = null;
  let bestDelta = 0;
  for (const m of mints) {
    const d = (postByMint.get(m) ?? 0) - (preByMint.get(m) ?? 0);
    if (Math.abs(d) > Math.abs(bestDelta)) {
      bestDelta = d;
      bestMint = m;
    }
  }
  if (!bestMint || bestDelta === 0) return null;
  if (bestMint === SOL_MINT) return null;
  const { symbol, real } = await getTokenMeta(bestMint);
  const sym = real ? symbol : "(sin ticker)";
  const blockTime = (tx.blockTime ?? 0) * 1e3;
  if (bestDelta > 0) {
    if (isSigner && solDelta < 0) {
      const solAmount2 = Math.abs(solDelta);
      return {
        wallet,
        type: "buy",
        mint: bestMint,
        symbol: sym,
        solAmount: solAmount2,
        tokenAmount: bestDelta,
        price: bestDelta > 0 ? solAmount2 / bestDelta : 0,
        txHash: tx.transaction?.signatures?.[0] ?? "",
        blockTime
      };
    }
    return {
      wallet,
      type: "dust",
      mint: bestMint,
      symbol: sym,
      solAmount: 0,
      tokenAmount: bestDelta,
      price: 0,
      txHash: tx.transaction?.signatures?.[0] ?? "",
      blockTime
    };
  }
  const solAmount = Math.max(0, solDelta);
  const tokenAmount = Math.abs(bestDelta);
  return {
    wallet,
    type: "sell",
    mint: bestMint,
    symbol: sym,
    solAmount,
    tokenAmount,
    price: tokenAmount > 0 ? solAmount / tokenAmount : 0,
    txHash: tx.transaction?.signatures?.[0] ?? "",
    blockTime
  };
}
function toWsUrl(httpUrl) {
  return httpUrl.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
}
export class WalletMonitor {
  constructor(wallet, alias, onEvent, onStatus, onLog, rpcUrl = "") {
    this.wallet = wallet;
    this.alias = alias;
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.onLog = onLog;
    this.ws = null;
    this.subId = null;
    this.seen = /* @__PURE__ */ new Set();
    this.retry = 0;
    this.reconnects = 0;
    this.closedByUser = false;
    this.keepalive = null;
    /** poll de respaldo: barre firmas nuevas por si el WebSocket pierde mensajes */
    this.poll = null;
    this.disconnectedAt = null;
    this.lastBlockTime = 0;
    this.catchupRunning = false;
    this.short = () => `${this.wallet.slice(0, 4)}…${this.wallet.slice(-4)}`;
    /** etiqueta para los logs: alias si existe, si no la dirección corta */
    this.label = () => this.alias && this.alias.trim() ? this.alias : this.short();
    this.currentRpcUrl = rpcUrl.trim();
    this.httpUrl = rpcUrl.trim() || RPC_URL;
    this.wsUrl = rpcUrl.trim() ? toWsUrl(rpcUrl.trim()) : WS_URL;
  }
  start() {
    this.closedByUser = false;
    this.connect();
  }
  stop() {
    this.closedByUser = true;
    this.clearKeepalive();
    this.clearPoll();
    try {
      this.ws?.close();
    } catch {
    }
    this.ws = null;
    this.onStatus("off");
  }
  rpcCall(method, params) {
    return rpc(method, params, this.httpUrl);
  }
  clearKeepalive() {
    if (this.keepalive) {
      clearInterval(this.keepalive);
      this.keepalive = null;
    }
  }
  startKeepalive() {
    this.clearKeepalive();
    this.keepalive = setInterval(() => {
      try {
        this.ws?.send(JSON.stringify({ jsonrpc: "2.0", id: 999, method: "getHealth" }));
      } catch {
      }
    }, 2e4);
  }
  connect() {
    if (this.closedByUser) return;
    this.onStatus("connecting");
    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch {
      this.scheduleRetry("no se pudo abrir WebSocket");
      return;
    }
    this.ws.onopen = () => {
      this.retry = 0;
      this.ws?.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "logsSubscribe",
          params: [{ mentions: [this.wallet] }, { commitment: "confirmed" }]
        })
      );
    };
    this.ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.result !== void 0 && this.subId === null) {
        this.subId = msg.result;
        this.onStatus("live");
        this.startKeepalive();
        this.onConnected();
        return;
      }
      const sig = msg?.params?.result?.value?.signature;
      if (sig) void this.handleSignature(sig);
    };
    this.ws.onerror = () => {
    };
    this.ws.onclose = () => {
      this.subId = null;
      this.clearKeepalive();
      if (this.disconnectedAt === null) this.disconnectedAt = Date.now();
      if (!this.closedByUser) this.scheduleRetry("conexión cerrada por el nodo");
    };
  }
  onConnected() {
    const gap = this.disconnectedAt !== null ? Date.now() - this.disconnectedAt : 0;
    if (this.disconnectedAt !== null) {
      this.reconnects++;
      this.disconnectedAt = null;
      const gapTxt = gap >= 6e4 ? `${(gap / 6e4).toFixed(1)} min` : `${(gap / 1e3).toFixed(0)} s`;
      this.onLog(`RPC         ⦿ reconectado (reconexión #${this.reconnects}) tras ${gapTxt} · recuperando eventos…`, "warn");
      void this.catchUp().then((n) => {
        this.onLog(
          n > 0 ? `RPC         ✓ catch-up: ${n} evento(s) reales recuperados del corte` : `RPC         ✓ catch-up: la wallet no operó durante el corte`,
          n > 0 ? "ok" : "sys"
        );
      });
    } else {
      if (this.lastBlockTime === 0) this.lastBlockTime = Date.now() - 2e3;
      this.startPoll();
      this.onLog(
        `RPC         ⦿ conectado (${this.httpUrl === RPC_URL ? "RPC público · tiene límites" : "RPC propio · apto 24/7"}) · escuchando ${this.label()} en tiempo real + poll de respaldo cada 20 s`,
        "ok"
      );
    }
  }
  clearPoll() {
    if (this.poll) {
      clearInterval(this.poll);
      this.poll = null;
    }
  }
  startPoll() {
    this.clearPoll();
    this.poll = setInterval(() => {
      void this.catchUp().then((n) => {
        if (n > 0) {
          this.onLog(
            `RPC         ✓ poll de respaldo: ${n} evento(s) recuperado(s) que el WebSocket había perdido`,
            "ok"
          );
        }
      });
    }, 2e4);
  }
  scheduleRetry(reason) {
    if (this.closedByUser) return;
    this.onStatus("error");
    this.retry++;
    const wait = Math.min(1500 * this.retry, 12e3);
    this.onLog(`RPC         ✗ ${reason} (${this.label()}) · reintentando en ${(wait / 1e3).toFixed(1)}s…`, "warn");
    setTimeout(() => this.connect(), wait);
  }
  async catchUp() {
    if (this.catchupRunning) return 0;
    this.catchupRunning = true;
    let recovered = 0;
    try {
      const sigs = await this.rpcCall("getSignaturesForAddress", [this.wallet, { limit: 40 }]);
      const candidates = (sigs ?? []).filter((s) => !s.err).filter((s) => (s.blockTime ?? 0) * 1e3 > this.lastBlockTime + 500).sort((a, b) => (a.blockTime ?? 0) - (b.blockTime ?? 0)).slice(0, 20);
      for (const s of candidates) {
        if (this.seen.has(s.signature)) continue;
        const hit = await this.handleSignature(s.signature);
        if (hit) recovered++;
        await new Promise((r) => setTimeout(r, 320));
      }
    } catch {
    } finally {
      this.catchupRunning = false;
    }
    return recovered;
  }
  async handleSignature(sig, attempt = 0) {
    if (this.seen.has(sig)) return false;
    this.seen.add(sig);
    if (this.seen.size > 500) this.seen = new Set([...this.seen].slice(-250));
    try {
      const tx = await this.rpcCall("getTransaction", [
        sig,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }
      ]);
      if (!tx) return false;
      const ev = await classify(tx, this.wallet);
      if (ev) {
        if (ev.blockTime > this.lastBlockTime) this.lastBlockTime = ev.blockTime;
        this.onEvent(ev);
        return true;
      }
      return false;
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        return this.handleSignature(sig, 1);
      }
      return false;
    }
  }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNvbGFuYS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKiA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbiAgIHNvbGFuYS50cyDigJQgY29uZXhpw7NuIFJFQUwgYSBsYSBibG9ja2NoYWluIGRlIFNvbGFuYS5cblxuICAgTmFkYSBhcXXDrSBlcyBzaW11bGFkbzpcbiAgIMK3IFNlIHN1c2NyaWJlIHBvciBXZWJTb2NrZXQgYSBsYXMgdHJhbnNhY2Npb25lcyBkZSB1bmEgd2FsbGV0LlxuICAgwrcgTGVlIGNhZGEgdHJhbnNhY2Npw7NuIGNvbmZpcm1hZGEgKGdldFRyYW5zYWN0aW9uLCBqc29uUGFyc2VkKS5cbiAgIMK3IENhbGN1bGEgbG9zIGRlbHRhcyBSRUFMRVMgZGUgU09MIHkgZGUgdG9rZW5zIFNQTC5cbiAgIMK3IENsYXNpZmljYTogY29tcHJhIHbDoWxpZGEgLyB2ZW50YSB2w6FsaWRhIC8gYWlyZHJvcC1kdXN0aW5nXG4gICAgIChSZWdsYXMgMC41IHkgMyBkZSBsYSBlc3BlY2lmaWNhY2nDs24pLlxuICAgwrcgT2J0aWVuZSBzw61tYm9sbyB5IHByZWNpbyByZWFsIChKdXBpdGVyKS5cbiAgID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PSAqL1xuaW1wb3J0IHR5cGUgeyBPbmNoYWluRXZlbnQgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG5jb25zdCBXU19VUkwgPSBcIndzczovL2FwaS5tYWlubmV0LWJldGEuc29sYW5hLmNvbVwiO1xuY29uc3QgUlBDX1VSTCA9IFwiaHR0cHM6Ly9hcGkubWFpbm5ldC1iZXRhLnNvbGFuYS5jb21cIjtcbmNvbnN0IFNPTF9NSU5UID0gXCJTbzExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTEyXCI7XG5jb25zdCBUT0tFTl9QUk9HUkFNID0gXCJUb2tlbmtlZ1FmZVp5aU53QUpiTmJHS1BGWENXdUJ2ZjlTczYyM1ZRNURBXCI7XG5cbmV4cG9ydCB0eXBlIE1vbml0b3JTdGF0dXMgPSBcImNvbm5lY3RpbmdcIiB8IFwibGl2ZVwiIHwgXCJlcnJvclwiIHwgXCJvZmZcIjtcblxuY29uc3QgbWV0YUNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIHsgc3ltYm9sOiBzdHJpbmc7IGRlY2ltYWxzOiBudW1iZXI7IHJlYWw6IGJvb2xlYW4gfT4oKTtcblxuYXN5bmMgZnVuY3Rpb24gcnBjKG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IHVua25vd25bXSwgdXJsOiBzdHJpbmcgPSBSUENfVVJMKTogUHJvbWlzZTxhbnk+IHtcbiAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2godXJsLCB7XG4gICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICBoZWFkZXJzOiB7IFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiIH0sXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBqc29ucnBjOiBcIjIuMFwiLCBpZDogMSwgbWV0aG9kLCBwYXJhbXMgfSksXG4gIH0pO1xuICBpZiAoIXJlcy5vaykgdGhyb3cgbmV3IEVycm9yKGBSUEMgSFRUUCAke3Jlcy5zdGF0dXN9YCk7XG4gIGNvbnN0IGpzb24gPSBhd2FpdCByZXMuanNvbigpO1xuICBpZiAoanNvbi5lcnJvcikgdGhyb3cgbmV3IEVycm9yKGpzb24uZXJyb3IubWVzc2FnZSA/PyBcIlJQQyBlcnJvclwiKTtcbiAgcmV0dXJuIGpzb24ucmVzdWx0O1xufVxuXG4vKiAtLS0tLS0tLS0tIG1ldGFkYXRvcyB5IHByZWNpb3MgKEp1cGl0ZXIpIC0tLS0tLS0tLS0gKi9cbi8qKiBUaWNrZXIgdsOtYSBIZWxpdXMgREFTIChnZXRBc3NldCDihpIgcmVzdWx0LmNvbnRlbnQubWV0YWRhdGEuc3ltYm9sKS5cbiAgICBTb2xvIHNlIGludGVudGEgY29uIHVuIFJQQyBwcm9waW8gKEhlbGl1cy9EQVMpOyBlbCBww7pibGljbyBubyBsbyBzb3BvcnRhLiAqL1xuYXN5bmMgZnVuY3Rpb24gaGVsaXVzQXNzZXRTeW1ib2wobWludDogc3RyaW5nLCBycGNVcmw6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICB0cnkge1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKHJwY1VybCwge1xuICAgICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICAgIGhlYWRlcnM6IHsgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsganNvbnJwYzogXCIyLjBcIiwgaWQ6IDEsIG1ldGhvZDogXCJnZXRBc3NldFwiLCBwYXJhbXM6IHsgaWQ6IG1pbnQgfSB9KSxcbiAgICB9KTtcbiAgICBpZiAoIXJlcy5vaykgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgaiA9IGF3YWl0IHJlcy5qc29uKCk7XG4gICAgY29uc3Qgc3ltID0gaj8ucmVzdWx0Py5jb250ZW50Py5tZXRhZGF0YT8uc3ltYm9sO1xuICAgIHJldHVybiB0eXBlb2Ygc3ltID09PSBcInN0cmluZ1wiICYmIHN5bS50cmltKCkgIT09IFwiXCIgPyBzeW0udHJpbSgpIDogbnVsbDtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuLyoqXG4gKiBnZXRfdGlja2VyKGNvbnRyYXRvKSDigJQgY2FkZW5hIG9ibGlnYXRvcmlhOlxuICogICAxKSBIZWxpdXMgREFTIChnZXRBc3NldCkgc2kgaGF5IFJQQyBwcm9waW8gY29uZmlndXJhZG9cbiAqICAgMikgSnVwaXRlciB0b2tlbnMgQVBJXG4gKiAgIDMpIFwiXCIgKGVsIGNhbGxlciBtdWVzdHJhIFVOS05PV04g4oCUIE5VTkNBIFwiKHNpbiB0aWNrZXIpXCIgbmkgaW52ZW50YWRvcylcbiAqL1xuYXN5bmMgZnVuY3Rpb24gZ2V0VG9rZW5NZXRhKFxuICBtaW50OiBzdHJpbmcsXG4gIHJwY1VybCA9IFwiXCIsXG4pOiBQcm9taXNlPHsgc3ltYm9sOiBzdHJpbmc7IGRlY2ltYWxzOiBudW1iZXI7IHJlYWw6IGJvb2xlYW4gfT4ge1xuICBjb25zdCBoaXQgPSBtZXRhQ2FjaGUuZ2V0KG1pbnQpO1xuICBpZiAoaGl0KSByZXR1cm4gaGl0O1xuXG4gIC8qIDEpIEhlbGl1cyBEQVMgKHNvbG8gY29uIFJQQyBwcm9waW86IGVsIHDDumJsaWNvIG5vIHRpZW5lIGdldEFzc2V0KSAqL1xuICBpZiAocnBjVXJsICYmIHJwY1VybCAhPT0gUlBDX1VSTCkge1xuICAgIGNvbnN0IGRhcyA9IGF3YWl0IGhlbGl1c0Fzc2V0U3ltYm9sKG1pbnQsIHJwY1VybCk7XG4gICAgaWYgKGRhcykge1xuICAgICAgY29uc3QgbWV0YSA9IHsgc3ltYm9sOiBkYXMsIGRlY2ltYWxzOiA2LCByZWFsOiB0cnVlIH07XG4gICAgICBtZXRhQ2FjaGUuc2V0KG1pbnQsIG1ldGEpO1xuICAgICAgcmV0dXJuIG1ldGE7XG4gICAgfVxuICB9XG5cbiAgLyogMikgSnVwaXRlciAqL1xuICB0cnkge1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKGBodHRwczovL3Rva2Vucy5qdXAuYWcvdG9rZW4vJHttaW50fWApO1xuICAgIGlmIChyZXMub2spIHtcbiAgICAgIGNvbnN0IGogPSBhd2FpdCByZXMuanNvbigpO1xuICAgICAgaWYgKGogJiYgdHlwZW9mIGouc3ltYm9sID09PSBcInN0cmluZ1wiICYmIGouc3ltYm9sLnRyaW0oKSAhPT0gXCJcIikge1xuICAgICAgICBjb25zdCBtZXRhID0geyBzeW1ib2w6IGouc3ltYm9sLCBkZWNpbWFsczogai5kZWNpbWFscyA/PyA2LCByZWFsOiB0cnVlIH07XG4gICAgICAgIG1ldGFDYWNoZS5zZXQobWludCwgbWV0YSk7XG4gICAgICAgIHJldHVybiBtZXRhO1xuICAgICAgfVxuICAgIH1cbiAgfSBjYXRjaCB7XG4gICAgLyogc2luIG1ldGFkYXRvcyAqL1xuICB9XG5cbiAgLyogMykgc2luIHRpY2tlciByZWFsIOKAlCBlbCBjYWxsZXIgaW1wcmltZSBVTktOT1dOIChudW5jYSBzZSBpbnZlbnRhKSAqL1xuICBjb25zdCBmYWxsYmFjayA9IHsgc3ltYm9sOiBcIlwiLCBkZWNpbWFsczogNiwgcmVhbDogZmFsc2UgfTtcbiAgbWV0YUNhY2hlLnNldChtaW50LCBmYWxsYmFjayk7XG4gIHJldHVybiBmYWxsYmFjaztcbn1cblxuLyoqIFByZWNpbyBSRUFMIFNPTC9VU0QuIEludGVudGEgSnVwaXRlciB5LCBzaSBmYWxsYSwgQ29pbkdlY2tvLiBudWxsIHNpIGFtYm9zIGZhbGxhbi4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmZXRjaFNvbFVzZCgpOiBQcm9taXNlPG51bWJlciB8IG51bGw+IHtcbiAgLyogZnVlbnRlIHByaW1hcmlhOiBKdXBpdGVyIFByaWNlIEFQSSAqL1xuICB0cnkge1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKGBodHRwczovL3ByaWNlLmp1cC5hZy92Ni9wcmljZT9pZHM9JHtTT0xfTUlOVH1gKTtcbiAgICBpZiAocmVzLm9rKSB7XG4gICAgICBjb25zdCBqID0gYXdhaXQgcmVzLmpzb24oKTtcbiAgICAgIGNvbnN0IHAgPSBqPy5kYXRhPy5bU09MX01JTlRdPy5wcmljZTtcbiAgICAgIGlmICh0eXBlb2YgcCA9PT0gXCJudW1iZXJcIiAmJiBwID4gMCkgcmV0dXJuIHA7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICAvKiBzaWd1ZSBjb24gZWwgcmVzcGFsZG8gKi9cbiAgfVxuICAvKiByZXNwYWxkbzogQ29pbkdlY2tvICovXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goXG4gICAgICBcImh0dHBzOi8vYXBpLmNvaW5nZWNrby5jb20vYXBpL3YzL3NpbXBsZS9wcmljZT9pZHM9c29sYW5hJnZzX2N1cnJlbmNpZXM9dXNkXCIsXG4gICAgKTtcbiAgICBpZiAocmVzLm9rKSB7XG4gICAgICBjb25zdCBqID0gYXdhaXQgcmVzLmpzb24oKTtcbiAgICAgIGNvbnN0IHAgPSBqPy5zb2xhbmE/LnVzZDtcbiAgICAgIGlmICh0eXBlb2YgcCA9PT0gXCJudW1iZXJcIiAmJiBwID4gMCkgcmV0dXJuIHA7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICAvKiBzaW4gcHJlY2lvICovXG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbi8qKiBTw61tYm9sb3MgUkVBTEVTIHBhcmEgdW5hIGxpc3RhIGRlIG1pbnRzIChwYXJhIGxhIHBlc3Rhw7FhIElHTk9SQURPUykuXG4gICAgQ2FkZW5hOiBIZWxpdXMgREFTIOKGkiBKdXBpdGVyIOKGkiBcIlwiIChlbCBjYWxsZXIgbXVlc3RyYSBVTktOT1dOKS4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXNvbHZlU3ltYm9scyhcbiAgbWludHM6IHN0cmluZ1tdLFxuICBycGNVcmwgPSBcIlwiLFxuKTogUHJvbWlzZTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PiB7XG4gIGNvbnN0IG91dDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBmb3IgKGNvbnN0IG0gb2YgbWludHMpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgbWV0YSA9IGF3YWl0IGdldFRva2VuTWV0YShtLCBycGNVcmwpO1xuICAgICAgb3V0W21dID0gbWV0YS5yZWFsID8gbWV0YS5zeW1ib2wgOiBcIlwiO1xuICAgIH0gY2F0Y2gge1xuICAgICAgb3V0W21dID0gXCJcIjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuLyoqIFByZWNpb3MgUkVBTEVTIFNPTC1kZW5vbWluYWRvcyBubzsgYXF1w60gVVNEIHBhcmEgdW5hIGxpc3RhIGRlIG1pbnRzLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoUHJpY2VzKG1pbnRzOiBzdHJpbmdbXSk6IFByb21pc2U8UmVjb3JkPHN0cmluZywgbnVtYmVyPj4ge1xuICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgaWYgKCFtaW50cy5sZW5ndGgpIHJldHVybiBvdXQ7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goYGh0dHBzOi8vcHJpY2UuanVwLmFnL3Y2L3ByaWNlP2lkcz0ke21pbnRzLmpvaW4oXCIsXCIpfWApO1xuICAgIGlmICghcmVzLm9rKSByZXR1cm4gb3V0O1xuICAgIGNvbnN0IGogPSBhd2FpdCByZXMuanNvbigpO1xuICAgIGZvciAoY29uc3QgbSBvZiBtaW50cykge1xuICAgICAgY29uc3QgcCA9IGo/LmRhdGE/LlttXT8ucHJpY2U7XG4gICAgICBpZiAodHlwZW9mIHAgPT09IFwibnVtYmVyXCIgJiYgcCA+IDApIG91dFttXSA9IHA7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICAvKiBzaW4gcHJlY2lvcyAqL1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbi8qKiBMYXRlbmNpYSBkZWwgUlBDIGVuIG1zIChnZXRIZWFsdGgpLiBudWxsID0gc2luIHJlc3B1ZXN0YS4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwaW5nUnBjKHJwY1VybCA9IFwiXCIpOiBQcm9taXNlPG51bWJlciB8IG51bGw+IHtcbiAgY29uc3QgdXJsID0gcnBjVXJsLnRyaW0oKSB8fCBSUENfVVJMO1xuICBjb25zdCB0MCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICB0cnkge1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKHVybCwge1xuICAgICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICAgIGhlYWRlcnM6IHsgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsganNvbnJwYzogXCIyLjBcIiwgaWQ6IDEsIG1ldGhvZDogXCJnZXRIZWFsdGhcIiwgcGFyYW1zOiBbXSB9KSxcbiAgICB9KTtcbiAgICBpZiAoIXJlcy5vaykgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIE1hdGgucm91bmQocGVyZm9ybWFuY2Uubm93KCkgLSB0MCk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbi8qKiBNaW50cyBxdWUgbGEgd2FsbGV0IHlhIHBvc2VlIChwYXJhIGVsIHNuYXBzaG90IFJFR0xBIDApLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoV2FsbGV0VG9rZW5NaW50cyhhZGRyZXNzOiBzdHJpbmcsIHJwY1VybCA9IFwiXCIpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzID0gYXdhaXQgcnBjKFxuICAgICAgXCJnZXRUb2tlbkFjY291bnRzQnlPd25lclwiLFxuICAgICAgW2FkZHJlc3MsIHsgcHJvZ3JhbUlkOiBUT0tFTl9QUk9HUkFNIH0sIHsgZW5jb2Rpbmc6IFwianNvblBhcnNlZFwiIH1dLFxuICAgICAgcnBjVXJsLnRyaW0oKSB8fCBSUENfVVJMLFxuICAgICk7XG4gICAgY29uc3QgbWludHM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChjb25zdCBpdGVtIG9mIHJlcz8udmFsdWUgPz8gW10pIHtcbiAgICAgIGNvbnN0IGluZm8gPSBpdGVtPy5hY2NvdW50Py5kYXRhPy5wYXJzZWQ/LmluZm87XG4gICAgICBjb25zdCBhbW91bnQgPSBOdW1iZXIoaW5mbz8udG9rZW5BbW91bnQ/LmFtb3VudCA/PyAwKTtcbiAgICAgIGlmIChpbmZvPy5taW50ICYmIGFtb3VudCA+IDAgJiYgIW1pbnRzLmluY2x1ZGVzKGluZm8ubWludCkpIG1pbnRzLnB1c2goaW5mby5taW50KTtcbiAgICB9XG4gICAgcmV0dXJuIG1pbnRzO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gW107XG4gIH1cbn1cblxuLyogLS0tLS0tLS0tLSBjbGFzaWZpY2FjacOzbiBkZSB1bmEgdHJhbnNhY2Npw7NuIC0tLS0tLS0tLS0gKi9cbi8qKlxuICogYWNjb3VudEtleXMgdmllbmUgZW4gRE9TIGZvcm1hdG9zIHNlZ8O6biBlbCB0aXBvIGRlIHRyYW5zYWNjacOzbjpcbiAqICDCtyBsZWdhY3kg4oaSIG9iamV0b3MgeyBwdWJrZXksIHNpZ25lciB9XG4gKiAgwrcgdjAgKEp1cGl0ZXIsIHB1bXAuZnVuLCBSYXlkaXVt4oCmID0gY2FzaSB0b2RvIGhveSkg4oaSIHN0cmluZ3Mgc2ltcGxlcyxcbiAqICAgIGRvbmRlIGxhIFBSSU1FUkEgY3VlbnRhIGVzIGVsIGZlZS1wYXllciB5IHBvciBkZWZpbmljacOzbiBTSUVNUFJFIGZpcm1hLlxuICogU2luIGVzdGEgbm9ybWFsaXphY2nDs24sIGxhcyBjb21wcmFzIHJlYWxlcyAocXVlIHNvbiB2MCkgbnVuY2EgcGFzYWJhbiBlbFxuICogZmlsdHJvIFwiZmlybcOzIHkgcGFnw7MgU09MXCIgeSBjYcOtYW4gY2xhc2lmaWNhZGFzIGNvbW8gZHVzdC4gQVJSRUdMQURPLlxuICovXG5mdW5jdGlvbiBub3JtYWxpemVLZXlzKG1lc3NhZ2U6IGFueSk6IEFycmF5PHsgYWRkcmVzczogc3RyaW5nOyBzaWduZXI6IGJvb2xlYW4gfT4ge1xuICBjb25zdCByYXcgPSBtZXNzYWdlPy5hY2NvdW50S2V5cyA/PyBbXTtcbiAgaWYgKCFyYXcubGVuZ3RoKSByZXR1cm4gW107XG4gIGlmICh0eXBlb2YgcmF3WzBdICE9PSBcInN0cmluZ1wiKSB7XG4gICAgcmV0dXJuIHJhdy5tYXAoKGs6IGFueSkgPT4gKHsgYWRkcmVzczogaz8ucHVia2V5LCBzaWduZXI6ICEhaz8uc2lnbmVyIH0pKTtcbiAgfVxuICByZXR1cm4gcmF3Lm1hcCgoYTogc3RyaW5nLCBpOiBudW1iZXIpID0+ICh7IGFkZHJlc3M6IGEsIHNpZ25lcjogaSA9PT0gMCB9KSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNsYXNzaWZ5KHR4OiBhbnksIHdhbGxldDogc3RyaW5nLCBycGNVcmwgPSBcIlwiKTogUHJvbWlzZTxPbmNoYWluRXZlbnQgfCBudWxsPiB7XG4gIGNvbnN0IG1ldGEgPSB0eD8ubWV0YTtcbiAgaWYgKCFtZXRhIHx8IG1ldGEuZXJyKSByZXR1cm4gbnVsbDtcblxuICBjb25zdCBrZXlzID0gbm9ybWFsaXplS2V5cyh0eD8udHJhbnNhY3Rpb24/Lm1lc3NhZ2UpO1xuICBjb25zdCBpc1NpZ25lciA9IGtleXMuc29tZSgoaykgPT4gay5hZGRyZXNzID09PSB3YWxsZXQgJiYgay5zaWduZXIpO1xuICBjb25zdCB3YWxsZXRJZHggPSBrZXlzLmZpbmRJbmRleCgoaykgPT4gay5hZGRyZXNzID09PSB3YWxsZXQpO1xuXG4gIC8qIGRlbHRhIGRlIFNPTCAocGFnw7MgPSBuZWdhdGl2bywgcmVjaWJpw7MgPSBwb3NpdGl2bykgKi9cbiAgbGV0IHNvbERlbHRhID0gMDtcbiAgaWYgKHdhbGxldElkeCA+PSAwICYmIG1ldGEucHJlQmFsYW5jZXMgJiYgbWV0YS5wb3N0QmFsYW5jZXMpIHtcbiAgICBzb2xEZWx0YSA9IChtZXRhLnBvc3RCYWxhbmNlc1t3YWxsZXRJZHhdIC0gbWV0YS5wcmVCYWxhbmNlc1t3YWxsZXRJZHhdKSAvIDFlOTtcbiAgfVxuXG4gIC8qIGRlbHRhcyBkZSB0b2tlbnMgU1BMIChzb2xvIGN1ZW50YXMgcHJvcGllZGFkIGRlIGxhIHdhbGxldCkgKi9cbiAgY29uc3QgcHJlQnlNaW50ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgZm9yIChjb25zdCBiIG9mIG1ldGEucHJlVG9rZW5CYWxhbmNlcyA/PyBbXSkge1xuICAgIGlmIChiLm93bmVyID09PSB3YWxsZXQpIHtcbiAgICAgIHByZUJ5TWludC5zZXQoYi5taW50LCAocHJlQnlNaW50LmdldChiLm1pbnQpID8/IDApICsgKGIudWlUb2tlbkFtb3VudD8udWlBbW91bnQgPz8gMCkpO1xuICAgIH1cbiAgfVxuICBjb25zdCBwb3N0QnlNaW50ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgZm9yIChjb25zdCBiIG9mIG1ldGEucG9zdFRva2VuQmFsYW5jZXMgPz8gW10pIHtcbiAgICBpZiAoYi5vd25lciA9PT0gd2FsbGV0KSB7XG4gICAgICBwb3N0QnlNaW50LnNldChiLm1pbnQsIChwb3N0QnlNaW50LmdldChiLm1pbnQpID8/IDApICsgKGIudWlUb2tlbkFtb3VudD8udWlBbW91bnQgPz8gMCkpO1xuICAgIH1cbiAgfVxuICBjb25zdCBtaW50cyA9IG5ldyBTZXQ8c3RyaW5nPihbLi4ucHJlQnlNaW50LmtleXMoKSwgLi4ucG9zdEJ5TWludC5rZXlzKCldKTtcbiAgbGV0IGJlc3RNaW50OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgbGV0IGJlc3REZWx0YSA9IDA7XG4gIGZvciAoY29uc3QgbSBvZiBtaW50cykge1xuICAgIGNvbnN0IGQgPSAocG9zdEJ5TWludC5nZXQobSkgPz8gMCkgLSAocHJlQnlNaW50LmdldChtKSA/PyAwKTtcbiAgICBpZiAoTWF0aC5hYnMoZCkgPiBNYXRoLmFicyhiZXN0RGVsdGEpKSB7XG4gICAgICBiZXN0RGVsdGEgPSBkO1xuICAgICAgYmVzdE1pbnQgPSBtO1xuICAgIH1cbiAgfVxuICBpZiAoIWJlc3RNaW50IHx8IGJlc3REZWx0YSA9PT0gMCkgcmV0dXJuIG51bGw7XG4gIGlmIChiZXN0TWludCA9PT0gU09MX01JTlQpIHJldHVybiBudWxsO1xuXG4gIGNvbnN0IHsgc3ltYm9sLCByZWFsIH0gPSBhd2FpdCBnZXRUb2tlbk1ldGEoYmVzdE1pbnQpO1xuICAvKiBzaSBlbCB0b2tlbiBubyB0aWVuZSB0aWNrZXIgcmVnaXN0cmFkbywgbG8gZGVjaW1vczogbm8gbG8gaW52ZW50YW1vcyAqL1xuICBjb25zdCBzeW0gPSByZWFsID8gc3ltYm9sIDogXCIoc2luIHRpY2tlcilcIjtcbiAgY29uc3QgYmxvY2tUaW1lID0gKHR4LmJsb2NrVGltZSA/PyAwKSAqIDEwMDA7XG5cbiAgLyogQ09NUFLDkyB0b2tlbnMgKi9cbiAgaWYgKGJlc3REZWx0YSA+IDApIHtcbiAgICBpZiAoaXNTaWduZXIgJiYgc29sRGVsdGEgPCAwKSB7XG4gICAgICBjb25zdCBzb2xBbW91bnQgPSBNYXRoLmFicyhzb2xEZWx0YSk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICB3YWxsZXQsXG4gICAgICAgIHR5cGU6IFwiYnV5XCIsXG4gICAgICAgIG1pbnQ6IGJlc3RNaW50LFxuICAgICAgICBzeW1ib2w6IHN5bSxcbiAgICAgICAgc29sQW1vdW50LFxuICAgICAgICB0b2tlbkFtb3VudDogYmVzdERlbHRhLFxuICAgICAgICBwcmljZTogYmVzdERlbHRhID4gMCA/IHNvbEFtb3VudCAvIGJlc3REZWx0YSA6IDAsXG4gICAgICAgIHR4SGFzaDogdHgudHJhbnNhY3Rpb24/LnNpZ25hdHVyZXM/LlswXSA/PyBcIlwiLFxuICAgICAgICBibG9ja1RpbWUsXG4gICAgICB9O1xuICAgIH1cbiAgICAvKiByZWNpYmnDsyBzaW4gcGFnYXIgLyBzaW4gZmlybWFyIOKGkiBhaXJkcm9wIG8gZHVzdGluZyAqL1xuICAgIHJldHVybiB7XG4gICAgICB3YWxsZXQsXG4gICAgICB0eXBlOiBcImR1c3RcIixcbiAgICAgIG1pbnQ6IGJlc3RNaW50LFxuICAgICAgc3ltYm9sOiBzeW0sXG4gICAgICBzb2xBbW91bnQ6IDAsXG4gICAgICB0b2tlbkFtb3VudDogYmVzdERlbHRhLFxuICAgICAgcHJpY2U6IDAsXG4gICAgICB0eEhhc2g6IHR4LnRyYW5zYWN0aW9uPy5zaWduYXR1cmVzPy5bMF0gPz8gXCJcIixcbiAgICAgIGJsb2NrVGltZSxcbiAgICB9O1xuICB9XG5cbiAgLyogVkVOREnDkyB0b2tlbnMgKi9cbiAgY29uc3Qgc29sQW1vdW50ID0gTWF0aC5tYXgoMCwgc29sRGVsdGEpO1xuICBjb25zdCB0b2tlbkFtb3VudCA9IE1hdGguYWJzKGJlc3REZWx0YSk7XG4gIHJldHVybiB7XG4gICAgd2FsbGV0LFxuICAgIHR5cGU6IFwic2VsbFwiLFxuICAgIG1pbnQ6IGJlc3RNaW50LFxuICAgIHN5bWJvbDogc3ltLFxuICAgIHNvbEFtb3VudCxcbiAgICB0b2tlbkFtb3VudCxcbiAgICBwcmljZTogdG9rZW5BbW91bnQgPiAwID8gc29sQW1vdW50IC8gdG9rZW5BbW91bnQgOiAwLFxuICAgIHR4SGFzaDogdHgudHJhbnNhY3Rpb24/LnNpZ25hdHVyZXM/LlswXSA/PyBcIlwiLFxuICAgIGJsb2NrVGltZSxcbiAgfTtcbn1cblxuLyogLS0tLS0tLS0tLSBtb25pdG9yIHBvciB3YWxsZXQgLS0tLS0tLS0tLSAqL1xuZnVuY3Rpb24gdG9Xc1VybChodHRwVXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gaHR0cFVybC5yZXBsYWNlKC9eaHR0cHM6L2ksIFwid3NzOlwiKS5yZXBsYWNlKC9eaHR0cDovaSwgXCJ3czpcIik7XG59XG5cbmV4cG9ydCBjbGFzcyBXYWxsZXRNb25pdG9yIHtcbiAgcHJpdmF0ZSB3czogV2ViU29ja2V0IHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgc3ViSWQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSByZXRyeSA9IDA7XG4gIHByaXZhdGUgcmVjb25uZWN0cyA9IDA7XG4gIHByaXZhdGUgY2xvc2VkQnlVc2VyID0gZmFsc2U7XG4gIHByaXZhdGUga2VlcGFsaXZlOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRJbnRlcnZhbD4gfCBudWxsID0gbnVsbDtcbiAgLyoqIHBvbGwgZGUgcmVzcGFsZG86IGJhcnJlIGZpcm1hcyBudWV2YXMgcG9yIHNpIGVsIFdlYlNvY2tldCBwaWVyZGUgbWVuc2FqZXMgKi9cbiAgcHJpdmF0ZSBwb2xsOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRJbnRlcnZhbD4gfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBkaXNjb25uZWN0ZWRBdDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgbGFzdEJsb2NrVGltZSA9IDA7XG4gIHByaXZhdGUgY2F0Y2h1cFJ1bm5pbmcgPSBmYWxzZTtcblxuICBwcml2YXRlIGh0dHBVcmw6IHN0cmluZztcbiAgcHJpdmF0ZSB3c1VybDogc3RyaW5nO1xuICByZWFkb25seSBjdXJyZW50UnBjVXJsOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJpdmF0ZSB3YWxsZXQ6IHN0cmluZyxcbiAgICAvKiogbm9tYnJlIGxlZ2libGUgcGFyYSBsb3MgbWVuc2FqZXMgKHNpIGxhIHdhbGxldCB0aWVuZSBhbGlhcywgc2UgdXNhKSAqL1xuICAgIHByaXZhdGUgYWxpYXM6IHN0cmluZyxcbiAgICBwcml2YXRlIG9uRXZlbnQ6IChlOiBPbmNoYWluRXZlbnQpID0+IHZvaWQsXG4gICAgcHJpdmF0ZSBvblN0YXR1czogKHM6IE1vbml0b3JTdGF0dXMpID0+IHZvaWQsXG4gICAgcHJpdmF0ZSBvbkxvZzogKG1zZzogc3RyaW5nLCBraW5kOiBcIm9rXCIgfCBcIndhcm5cIiB8IFwiZXJyXCIgfCBcInN5c1wiKSA9PiB2b2lkLFxuICAgIHJwY1VybCA9IFwiXCIsXG4gICkge1xuICAgIHRoaXMuY3VycmVudFJwY1VybCA9IHJwY1VybC50cmltKCk7XG4gICAgdGhpcy5odHRwVXJsID0gcnBjVXJsLnRyaW0oKSB8fCBSUENfVVJMO1xuICAgIHRoaXMud3NVcmwgPSBycGNVcmwudHJpbSgpID8gdG9Xc1VybChycGNVcmwudHJpbSgpKSA6IFdTX1VSTDtcbiAgfVxuXG4gIHByaXZhdGUgc2hvcnQgPSAoKSA9PiBgJHt0aGlzLndhbGxldC5zbGljZSgwLCA0KX3igKYke3RoaXMud2FsbGV0LnNsaWNlKC00KX1gO1xuICAvKiogZXRpcXVldGEgcGFyYSBsb3MgbG9nczogYWxpYXMgc2kgZXhpc3RlLCBzaSBubyBsYSBkaXJlY2Npw7NuIGNvcnRhICovXG4gIHByaXZhdGUgbGFiZWwgPSAoKSA9PiAodGhpcy5hbGlhcyAmJiB0aGlzLmFsaWFzLnRyaW0oKSA/IHRoaXMuYWxpYXMgOiB0aGlzLnNob3J0KCkpO1xuXG4gIHN0YXJ0KCkge1xuICAgIHRoaXMuY2xvc2VkQnlVc2VyID0gZmFsc2U7XG4gICAgdGhpcy5jb25uZWN0KCk7XG4gIH1cblxuICBzdG9wKCkge1xuICAgIHRoaXMuY2xvc2VkQnlVc2VyID0gdHJ1ZTtcbiAgICB0aGlzLmNsZWFyS2VlcGFsaXZlKCk7XG4gICAgdGhpcy5jbGVhclBvbGwoKTtcbiAgICB0cnkge1xuICAgICAgdGhpcy53cz8uY2xvc2UoKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8qIHlhIGNlcnJhZG8gKi9cbiAgICB9XG4gICAgdGhpcy53cyA9IG51bGw7XG4gICAgdGhpcy5vblN0YXR1cyhcIm9mZlwiKTtcbiAgfVxuXG4gIHByaXZhdGUgcnBjQ2FsbChtZXRob2Q6IHN0cmluZywgcGFyYW1zOiB1bmtub3duW10pOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiBycGMobWV0aG9kLCBwYXJhbXMsIHRoaXMuaHR0cFVybCk7XG4gIH1cblxuICBwcml2YXRlIGNsZWFyS2VlcGFsaXZlKCkge1xuICAgIGlmICh0aGlzLmtlZXBhbGl2ZSkge1xuICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLmtlZXBhbGl2ZSk7XG4gICAgICB0aGlzLmtlZXBhbGl2ZSA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBzdGFydEtlZXBhbGl2ZSgpIHtcbiAgICB0aGlzLmNsZWFyS2VlcGFsaXZlKCk7XG4gICAgdGhpcy5rZWVwYWxpdmUgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICB0aGlzLndzPy5zZW5kKEpTT04uc3RyaW5naWZ5KHsganNvbnJwYzogXCIyLjBcIiwgaWQ6IDk5OSwgbWV0aG9kOiBcImdldEhlYWx0aFwiIH0pKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvKiBzaSBmYWxsYSwgZWwgb25jbG9zZSByZWNvbmVjdGEgKi9cbiAgICAgIH1cbiAgICB9LCAyMF8wMDApO1xuICB9XG5cbiAgcHJpdmF0ZSBjb25uZWN0KCkge1xuICAgIGlmICh0aGlzLmNsb3NlZEJ5VXNlcikgcmV0dXJuO1xuICAgIHRoaXMub25TdGF0dXMoXCJjb25uZWN0aW5nXCIpO1xuICAgIHRyeSB7XG4gICAgICB0aGlzLndzID0gbmV3IFdlYlNvY2tldCh0aGlzLndzVXJsKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHRoaXMuc2NoZWR1bGVSZXRyeShcIm5vIHNlIHB1ZG8gYWJyaXIgV2ViU29ja2V0XCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMud3Mub25vcGVuID0gKCkgPT4ge1xuICAgICAgdGhpcy5yZXRyeSA9IDA7XG4gICAgICB0aGlzLndzPy5zZW5kKFxuICAgICAgICBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAganNvbnJwYzogXCIyLjBcIixcbiAgICAgICAgICBpZDogMSxcbiAgICAgICAgICBtZXRob2Q6IFwibG9nc1N1YnNjcmliZVwiLFxuICAgICAgICAgIHBhcmFtczogW3sgbWVudGlvbnM6IFt0aGlzLndhbGxldF0gfSwgeyBjb21taXRtZW50OiBcImNvbmZpcm1lZFwiIH1dLFxuICAgICAgICB9KSxcbiAgICAgICk7XG4gICAgfTtcblxuICAgIHRoaXMud3Mub25tZXNzYWdlID0gKGV2KSA9PiB7XG4gICAgICBsZXQgbXNnOiBhbnk7XG4gICAgICB0cnkge1xuICAgICAgICBtc2cgPSBKU09OLnBhcnNlKGV2LmRhdGEpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChtc2cucmVzdWx0ICE9PSB1bmRlZmluZWQgJiYgdGhpcy5zdWJJZCA9PT0gbnVsbCkge1xuICAgICAgICB0aGlzLnN1YklkID0gbXNnLnJlc3VsdDtcbiAgICAgICAgdGhpcy5vblN0YXR1cyhcImxpdmVcIik7XG4gICAgICAgIHRoaXMuc3RhcnRLZWVwYWxpdmUoKTtcbiAgICAgICAgdGhpcy5vbkNvbm5lY3RlZCgpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCBzaWcgPSBtc2c/LnBhcmFtcz8ucmVzdWx0Py52YWx1ZT8uc2lnbmF0dXJlIGFzIHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICAgIGlmIChzaWcpIHZvaWQgdGhpcy5oYW5kbGVTaWduYXR1cmUoc2lnKTtcbiAgICB9O1xuXG4gICAgdGhpcy53cy5vbmVycm9yID0gKCkgPT4ge1xuICAgICAgLyogZWwgb25jbG9zZSBzZSBlbmNhcmdhIGRlIHJlaW50ZW50YXIgKi9cbiAgICB9O1xuXG4gICAgdGhpcy53cy5vbmNsb3NlID0gKCkgPT4ge1xuICAgICAgdGhpcy5zdWJJZCA9IG51bGw7XG4gICAgICB0aGlzLmNsZWFyS2VlcGFsaXZlKCk7XG4gICAgICBpZiAodGhpcy5kaXNjb25uZWN0ZWRBdCA9PT0gbnVsbCkgdGhpcy5kaXNjb25uZWN0ZWRBdCA9IERhdGUubm93KCk7XG4gICAgICBpZiAoIXRoaXMuY2xvc2VkQnlVc2VyKSB0aGlzLnNjaGVkdWxlUmV0cnkoXCJjb25leGnDs24gY2VycmFkYSBwb3IgZWwgbm9kb1wiKTtcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBvbkNvbm5lY3RlZCgpIHtcbiAgICBjb25zdCBnYXAgPSB0aGlzLmRpc2Nvbm5lY3RlZEF0ICE9PSBudWxsID8gRGF0ZS5ub3coKSAtIHRoaXMuZGlzY29ubmVjdGVkQXQgOiAwO1xuICAgIGlmICh0aGlzLmRpc2Nvbm5lY3RlZEF0ICE9PSBudWxsKSB7XG4gICAgICB0aGlzLnJlY29ubmVjdHMrKztcbiAgICAgIHRoaXMuZGlzY29ubmVjdGVkQXQgPSBudWxsO1xuICAgICAgY29uc3QgZ2FwVHh0ID0gZ2FwID49IDYwXzAwMCA/IGAkeyhnYXAgLyA2MF8wMDApLnRvRml4ZWQoMSl9IG1pbmAgOiBgJHsoZ2FwIC8gMTAwMCkudG9GaXhlZCgwKX0gc2A7XG4gICAgICB0aGlzLm9uTG9nKGBSUEMgICAgICAgICDipr8gcmVjb25lY3RhZG8gKHJlY29uZXhpw7NuICMke3RoaXMucmVjb25uZWN0c30pIHRyYXMgJHtnYXBUeHR9IMK3IHJlY3VwZXJhbmRvIGV2ZW50b3PigKZgLCBcIndhcm5cIik7XG4gICAgICB2b2lkIHRoaXMuY2F0Y2hVcCgpLnRoZW4oKG4pID0+IHtcbiAgICAgICAgdGhpcy5vbkxvZyhcbiAgICAgICAgICBuID4gMFxuICAgICAgICAgICAgPyBgUlBDICAgICAgICAg4pyTIGNhdGNoLXVwOiAke259IGV2ZW50byhzKSByZWFsZXMgcmVjdXBlcmFkb3MgZGVsIGNvcnRlYFxuICAgICAgICAgICAgOiBgUlBDICAgICAgICAg4pyTIGNhdGNoLXVwOiBsYSB3YWxsZXQgbm8gb3BlcsOzIGR1cmFudGUgZWwgY29ydGVgLFxuICAgICAgICAgIG4gPiAwID8gXCJva1wiIDogXCJzeXNcIixcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvKiBwcmltZXJhIGNvbmV4acOzbjogYW5jbGFyIFwiYWhvcmFcIiBwYXJhIG5vIGNvcGlhciBoaXN0b3JpYSB2aWVqYSxcbiAgICAgICAgIHkgYXJyYW5jYXIgZWwgcG9sbCBkZSByZXNwYWxkbyAoY2FkYSAyMCBzIGJhcnJlIGZpcm1hcyBudWV2YXMsXG4gICAgICAgICBwb3Igc2kgZWwgV2ViU29ja2V0IGRlamEgZXNjYXBhciBhbGfDum4gbWVuc2FqZSkgKi9cbiAgICAgIGlmICh0aGlzLmxhc3RCbG9ja1RpbWUgPT09IDApIHRoaXMubGFzdEJsb2NrVGltZSA9IERhdGUubm93KCkgLSAyMDAwO1xuICAgICAgdGhpcy5zdGFydFBvbGwoKTtcbiAgICAgIHRoaXMub25Mb2coXG4gICAgICAgIGBSUEMgICAgICAgICDipr8gY29uZWN0YWRvICgke3RoaXMuaHR0cFVybCA9PT0gUlBDX1VSTCA/IFwiUlBDIHDDumJsaWNvIMK3IHRpZW5lIGzDrW1pdGVzXCIgOiBcIlJQQyBwcm9waW8gwrcgYXB0byAyNC83XCJ9KSDCtyBlc2N1Y2hhbmRvICR7dGhpcy5sYWJlbCgpfSBlbiB0aWVtcG8gcmVhbCArIHBvbGwgZGUgcmVzcGFsZG8gY2FkYSAyMCBzYCxcbiAgICAgICAgXCJva1wiLFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGNsZWFyUG9sbCgpIHtcbiAgICBpZiAodGhpcy5wb2xsKSB7XG4gICAgICBjbGVhckludGVydmFsKHRoaXMucG9sbCk7XG4gICAgICB0aGlzLnBvbGwgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc3RhcnRQb2xsKCkge1xuICAgIHRoaXMuY2xlYXJQb2xsKCk7XG4gICAgdGhpcy5wb2xsID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLmNhdGNoVXAoKS50aGVuKChuKSA9PiB7XG4gICAgICAgIGlmIChuID4gMCkge1xuICAgICAgICAgIHRoaXMub25Mb2coXG4gICAgICAgICAgICBgUlBDICAgICAgICAg4pyTIHBvbGwgZGUgcmVzcGFsZG86ICR7bn0gZXZlbnRvKHMpIHJlY3VwZXJhZG8ocykgcXVlIGVsIFdlYlNvY2tldCBoYWLDrWEgcGVyZGlkb2AsXG4gICAgICAgICAgICBcIm9rXCIsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSwgMjBfMDAwKTtcbiAgfVxuXG4gIHByaXZhdGUgc2NoZWR1bGVSZXRyeShyZWFzb246IHN0cmluZykge1xuICAgIGlmICh0aGlzLmNsb3NlZEJ5VXNlcikgcmV0dXJuO1xuICAgIHRoaXMub25TdGF0dXMoXCJlcnJvclwiKTtcbiAgICB0aGlzLnJldHJ5Kys7XG4gICAgY29uc3Qgd2FpdCA9IE1hdGgubWluKDE1MDAgKiB0aGlzLnJldHJ5LCAxMl8wMDApO1xuICAgIHRoaXMub25Mb2coYFJQQyAgICAgICAgIOKclyAke3JlYXNvbn0gKCR7dGhpcy5sYWJlbCgpfSkgwrcgcmVpbnRlbnRhbmRvIGVuICR7KHdhaXQgLyAxMDAwKS50b0ZpeGVkKDEpfXPigKZgLCBcIndhcm5cIik7XG4gICAgc2V0VGltZW91dCgoKSA9PiB0aGlzLmNvbm5lY3QoKSwgd2FpdCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNhdGNoVXAoKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICBpZiAodGhpcy5jYXRjaHVwUnVubmluZykgcmV0dXJuIDA7XG4gICAgdGhpcy5jYXRjaHVwUnVubmluZyA9IHRydWU7XG4gICAgbGV0IHJlY292ZXJlZCA9IDA7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHNpZ3M6IGFueVtdID0gYXdhaXQgdGhpcy5ycGNDYWxsKFwiZ2V0U2lnbmF0dXJlc0ZvckFkZHJlc3NcIiwgW3RoaXMud2FsbGV0LCB7IGxpbWl0OiA0MCB9XSk7XG4gICAgICBjb25zdCBjYW5kaWRhdGVzID0gKHNpZ3MgPz8gW10pXG4gICAgICAgIC5maWx0ZXIoKHMpID0+ICFzLmVycilcbiAgICAgICAgLmZpbHRlcigocykgPT4gKHMuYmxvY2tUaW1lID8/IDApICogMTAwMCA+IHRoaXMubGFzdEJsb2NrVGltZSArIDUwMClcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IChhLmJsb2NrVGltZSA/PyAwKSAtIChiLmJsb2NrVGltZSA/PyAwKSlcbiAgICAgICAgLnNsaWNlKDAsIDIwKTtcbiAgICAgIGZvciAoY29uc3QgcyBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICAgIGlmICh0aGlzLnNlZW4uaGFzKHMuc2lnbmF0dXJlKSkgY29udGludWU7XG4gICAgICAgIGNvbnN0IGhpdCA9IGF3YWl0IHRoaXMuaGFuZGxlU2lnbmF0dXJlKHMuc2lnbmF0dXJlKTtcbiAgICAgICAgaWYgKGhpdCkgcmVjb3ZlcmVkKys7XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyKSA9PiBzZXRUaW1lb3V0KHIsIDMyMCkpO1xuICAgICAgfVxuICAgIH0gY2F0Y2gge1xuICAgICAgLyogUlBDIHNhdHVyYWRvICovXG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHRoaXMuY2F0Y2h1cFJ1bm5pbmcgPSBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHJlY292ZXJlZDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgaGFuZGxlU2lnbmF0dXJlKHNpZzogc3RyaW5nLCBhdHRlbXB0ID0gMCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGlmICh0aGlzLnNlZW4uaGFzKHNpZykpIHJldHVybiBmYWxzZTtcbiAgICB0aGlzLnNlZW4uYWRkKHNpZyk7XG4gICAgaWYgKHRoaXMuc2Vlbi5zaXplID4gNTAwKSB0aGlzLnNlZW4gPSBuZXcgU2V0KFsuLi50aGlzLnNlZW5dLnNsaWNlKC0yNTApKTtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCB0eCA9IGF3YWl0IHRoaXMucnBjQ2FsbChcImdldFRyYW5zYWN0aW9uXCIsIFtcbiAgICAgICAgc2lnLFxuICAgICAgICB7IGVuY29kaW5nOiBcImpzb25QYXJzZWRcIiwgbWF4U3VwcG9ydGVkVHJhbnNhY3Rpb25WZXJzaW9uOiAwIH0sXG4gICAgICBdKTtcbiAgICAgIGlmICghdHgpIHJldHVybiBmYWxzZTtcbiAgICAgIGNvbnN0IGV2ID0gYXdhaXQgY2xhc3NpZnkodHgsIHRoaXMud2FsbGV0KTtcbiAgICAgIGlmIChldikge1xuICAgICAgICBpZiAoZXYuYmxvY2tUaW1lID4gdGhpcy5sYXN0QmxvY2tUaW1lKSB0aGlzLmxhc3RCbG9ja1RpbWUgPSBldi5ibG9ja1RpbWU7XG4gICAgICAgIHRoaXMub25FdmVudChldik7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0gY2F0Y2gge1xuICAgICAgaWYgKGF0dGVtcHQgPT09IDApIHtcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHIpID0+IHNldFRpbWVvdXQociwgMTUwMCkpO1xuICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVTaWduYXR1cmUoc2lnLCAxKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbn1cbiJdLCJtYXBwaW5ncyI6IkFBYUEsTUFBTSxTQUFTO0FBQ2YsTUFBTSxVQUFVO0FBQ2hCLE1BQU0sV0FBVztBQUNqQixNQUFNLGdCQUFnQjtBQUl0QixNQUFNLFlBQVksb0JBQUksSUFBaUU7QUFFdkYsZUFBZSxJQUFJLFFBQWdCLFFBQW1CLE1BQWMsU0FBdUI7QUFDekYsUUFBTSxNQUFNLE1BQU0sTUFBTSxLQUFLO0FBQUEsSUFDM0IsUUFBUTtBQUFBLElBQ1IsU0FBUyxFQUFFLGdCQUFnQixtQkFBbUI7QUFBQSxJQUM5QyxNQUFNLEtBQUssVUFBVSxFQUFFLFNBQVMs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QUMsRUFBRSxHQUFHLEVBQ3BCLE9BQU8sQ0FBQyxPQUFPLEVBQUUsYUFBYSxLQUFLLE1BQU8sS0FBSyxnQkFBZ0IsR0FBRyxFQUNsRSxLQUFLLENBQUMsR0FBRyxPQUFPLEVBQUUsYUFBYSxNQUFNLEVBQUUsYUFBYSxFQUFFLEVBQ3RELE1BQU0sR0FBRyxFQUFFO0FBQ2QsaUJBQVcsS0FBSyxZQUFZO0FBQzFCLFlBQUksS0FBSyxLQUFLLElBQUksRUFBRSxTQUFTLEVBQUc7QUFDaEMsY0FBTSxNQUFNLE1BQU0sS0FBSyxnQkFBZ0IsRUFBRSxTQUFTO0FBQ2xELFlBQUksSUFBSztBQUNULGNBQU0sSUFBSSxRQUFRLENBQUMsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDN0M7QUFBQSxJQUNGLFFBQVE7QUFBQSxJQUVSLFVBQUU7QUFDQSxXQUFLLGlCQUFpQjtBQUFBLElBQ3hCO0FBQ0EsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVBLE1BQWMsZ0JBQWdCLEtBQWEsVUFBVSxHQUFxQjtBQUN4RSxRQUFJLEtBQUssS0FBSyxJQUFJLEdBQUcsRUFBRyxRQUFPO0FBQy9CLFNBQUssS0FBSyxJQUFJLEdBQUc7QUFDakIsUUFBSSxLQUFLLEtBQUssT0FBTyxJQUFLLE1BQUssT0FBTyxJQUFJLElBQUksQ0FBQyxHQUFHLEtBQUssSUFBSSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBRXhFLFFBQUk7QUFDRixZQUFNLEtBQUssTUFBTSxLQUFLLFFBQVEsa0JBQWtCO0FBQUEsUUFDOUM7QUFBQSxRQUNBLEVBQUUsVUFBVSxjQUFjLGdDQUFnQyxFQUFFO0FBQUEsTUFDOUQsQ0FBQztBQUNELFVBQUksQ0FBQyxHQUFJLFFBQU87QUFDaEIsWUFBTSxLQUFLLE1BQU0sU0FBUyxJQUFJLEtBQUssTUFBTTtBQUN6QyxVQUFJLElBQUk7QUFDTixZQUFJLEdBQUcsWUFBWSxLQUFLLGNBQWUsTUFBSyxnQkFBZ0IsR0FBRztBQUMvRCxhQUFLLFFBQVEsRUFBRTtBQUNmLGVBQU87QUFBQSxNQUNUO0FBQ0EsYUFBTztBQUFBLElBQ1QsUUFBUTtBQUNOLFVBQUksWUFBWSxHQUFHO0FBQ2pCLGNBQU0sSUFBSSxRQUFRLENBQUMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDO0FBQzVDLGVBQU8sS0FBSyxnQkFBZ0IsS0FBSyxDQUFDO0FBQUEsTUFDcEM7QUFDQSxhQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Y7QUFDRjsiLCJuYW1lcyI6WyJzb2xBbW91bnQiXX0=