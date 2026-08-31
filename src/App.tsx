function App() {
  _s();
  const [state, dispatch] = useReducer(reducer, void 0, loadState);
  const [editorOpen, setEditorOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [showTour, setShowTour] = useState(() => {
    try {
      return localStorage.getItem(TOUR_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const booted = useRef(false);
  const monitorsRef = useRef(/* @__PURE__ */ new Map());
  const [monStatus, setMonStatus] = useState({});
  const [rpcLatency, setRpcLatency] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      const ms = await pingRpc(stateRef.current.cfg.rpcUrl);
      if (!cancelled) setRpcLatency(ms);
    };
    void ping();
    const id = setInterval(() => void ping(), 5e3);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  const [sseLive, setSseLive] = useState(false);
  const sseSeen = useRef(/* @__PURE__ */ new Set());
  const sseAnnounced = useRef(false);
  useEffect(() => {
    let es = null;
    let retry = null;
    let cancelled = false;
    const connect = () => {
      if (cancelled) return;
      try {
        es = new EventSource("/events");
      } catch {
        return;
      }
      es.onopen = () => {
        if (cancelled) return;
        setSseLive(true);
        if (!sseAnnounced.current) {
          sseAnnounced.current = true;
          dispatch({
            type: "PRINT",
            lines: [
              {
                kind: "ok",
                text: "WEBHOOK     ⦿ conectado al servidor (SSE) — los webhooks de Helius llegarán por push en tiempo real"
              }
            ]
          });
        }
      };
      es.onmessage = (m) => {
        try {
          const ev = JSON.parse(m.data);
          if (!ev || !ev.txHash) return;
          if (sseSeen.current.has(ev.txHash)) return;
          sseSeen.current.add(ev.txHash);
          if (sseSeen.current.size > 500) {
            sseSeen.current = new Set([...sseSeen.current].slice(-250));
          }
          dispatch({ type: "ONCHAIN_EVENT", event: ev });
        } catch {
        }
      };
      es.onerror = () => {
        setSseLive(false);
        es?.close();
        if (!cancelled) retry = setTimeout(connect, 8e3);
      };
    };
    connect();
    return () => {
      cancelled = true;
      es?.close();
      if (retry) clearTimeout(retry);
    };
  }, []);
  const lastSolRef = useRef(null);
  const warnedStale = useRef(false);
  const loggedLive = useRef(false);
  const [solLive, setSolLive] = useState(null);
  const [solStale, setSolStale] = useState(false);
  const [solUpdatedAt, setSolUpdatedAt] = useState(null);
  const [solReadings, setSolReadings] = useState([]);
  const [solTick, setSolTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const s = stateRef.current;
      const mints = [
        .../* @__PURE__ */ new Set([...Object.keys(s.tokens), ...s.positions.map((p) => p.mint)])
      ];
      const [solUsd, prices] = await Promise.all([fetchSolUsd(), fetchPrices(mints)]);
      if (cancelled) return;
      if (solUsd && solUsd > 0) {
        warnedStale.current = false;
        lastSolRef.current = solUsd;
        setSolLive(solUsd);
        setSolStale(false);
        setSolUpdatedAt(Date.now());
        setSolReadings((r) => [...r.slice(-59), { t: Date.now(), p: solUsd }]);
        setSolTick((n) => n + 1);
        dispatch({ type: "PRICES_UPDATE", prices, solUsd });
        if (!loggedLive.current) {
          loggedLive.current = true;
          dispatch({
            type: "PRINT",
            lines: [
              {
                kind: "ok",
                text: `PRECIO      ✓ SOL_PRICE_LIVE = $${solUsd.toFixed(2)} (en vivo · Jupiter/CoinGecko · refresco cada 10 s)`
              }
            ]
          });
        }
      } else {
        setSolStale(true);
        if (lastSolRef.current === null) {
          lastSolRef.current = SOL_USD_FALLBACK;
          setSolLive(SOL_USD_FALLBACK);
          setSolUpdatedAt(Date.now());
          setSolReadings((r) => [...r.slice(-59), { t: Date.now(), p: SOL_USD_FALLBACK }]);
        }
        dispatch({ type: "PRICES_UPDATE", prices, solUsd: SOL_USD_FALLBACK });
        if (!warnedStale.current) {
          warnedStale.current = true;
          dispatch({
            type: "PRINT",
            lines: [
              {
                kind: "warn",
                text: `PRECIO      ⚠ Jupiter no respondió · usando fallback $${SOL_USD_FALLBACK} (se reintenta cada 10 s)`
              }
            ]
          });
        }
      }
    };
    void refresh();
    const id = setInterval(() => void refresh(), 1e4);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  const FIVE_MIN = 5 * 6e4;
  const nowMs = Date.now();
  const baseline = solReadings.find((r) => nowMs - r.t >= FIVE_MIN) ?? solReadings[0] ?? null;
  const sol = {
    price: solLive,
    changePct: solLive && baseline && baseline.p > 0 ? (solLive - baseline.p) / baseline.p * 100 : 0,
    stale: solStale,
    updatedAt: solUpdatedAt,
    history: solReadings.map((r) => r.p),
    tick: solTick
  };
  const closeTour = () => {
    setShowTour(false);
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
    }
  };
  useEffect(() => {
    saveState(state);
  }, [state]);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const s = stateRef.current;
    const boot = [
      ["art", BANNER],
      ["sys", `            ${TAGLINE}`],
      ["sys", ""],
      ["sys", "BOOT        memebot v3.2 · MONITOREO REAL DE MAINNET (señales y precios on-chain)"],
      ["sys", "BOOT        leyendo config.txt …"],
      [
        "ok",
        `CONFIG      ✓ TESORERÍA: RESERVA_GLOBAL ${s.cfg.reservaGlobal.toFixed(2)} SOL (paper) · slippage ≤${s.cfg.slippage}%`
      ],
      [
        "ok",
        `CONFIG      ✓ reglas → R0 snapshot ${s.cfg.snapshotInicial ? "on" : "off"} · R0.5 anti-dust ${s.cfg.filtroAntiDust ? "on" : "off"} · R5 auto-swap USDC ${s.cfg.autoSwapUsdc ? "on" : "off"}`
      ],
      [
        "ok",
        `CONFIG      ✓ precio SOL/USD en vivo vía Jupiter cada 10 s (fallback $${SOL_USD_FALLBACK}) · nunca manual`
      ],
      ["sys", `RED         RPC: ${s.cfg.rpcUrl ? s.cfg.rpcUrl.slice(0, 52) + "…" : "público wss://api.mainnet-beta.solana.com"}`],
      ["sys", RULES_BOX]
    ];
    if (s.cfg.wallets.length === 0) {
      boot.push(
        ["warn", "RADAR       sin wallets todavía · añade la tuya:  seguir <dirección> [alias] [usd]"],
        ["sys", "            (o pulsa ⌘ config.txt y edítalo en [wallets])"]
      );
    } else {
      boot.push(
        [
          "ok",
          "RADAR       siguiendo " + s.cfg.wallets.map((w) => `${w.alias} (${fmtUsd(w.capitalUsd)})`).join(", ") + " · esperando la primera compra válida…"
        ]
      );
    }
    boot.push(
      ["sys", ""],
      ["warn", "DESCARGA    ¿quieres el bot en tu PC? escribe `zip` o pulsa ⇩ en el panel derecho"],
      ["sys", 'CONSOLA     escribe "help" para ver los comandos']
    );
    dispatch({ type: "CLEAR_LOG" });
    const timers = boot.map(
      ([kind, text], i) => setTimeout(() => dispatch({ type: "PRINT", lines: [{ kind, text }] }), 260 + i * 140)
    );
    return () => timers.forEach(clearTimeout);
  }, []);
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: "TICK" }), 1100);
    return () => clearInterval(id);
  }, []);
  const walletKey = state.cfg.rpcUrl + "|" + state.cfg.wallets.map((w) => w.address).sort().join(",");
  useEffect(() => {
    const desired = stateRef.current.cfg.wallets;
    const rpcUrl = stateRef.current.cfg.rpcUrl;
    const monitors = monitorsRef.current;
    for (const [addr, mon] of [...monitors]) {
      if (mon.currentRpcUrl !== rpcUrl) {
        mon.stop();
        monitors.delete(addr);
        setMonStatus((p) => {
          const n = { ...p };
          delete n[addr];
          return n;
        });
      }
    }
    for (const [addr, mon] of [...monitors]) {
      if (!desired.some((w) => w.address === addr)) {
        mon.stop();
        monitors.delete(addr);
        setMonStatus((p) => {
          const n = { ...p };
          delete n[addr];
          return n;
        });
      }
    }
    for (const w of desired) {
      if (monitors.has(w.address)) continue;
      const mon = new WalletMonitor(
        w.address,
        w.alias,
        (ev) => dispatch({ type: "ONCHAIN_EVENT", event: ev }),
        (st) => setMonStatus((p) => ({ ...p, [w.address]: st })),
        (msg, kind) => dispatch({ type: "PRINT", lines: [{ kind, text: msg }] }),
        rpcUrl
      );
      monitors.set(w.address, mon);
      mon.start();
      if (stateRef.current.cfg.snapshotInicial) {
        void fetchWalletTokenMints(w.address, rpcUrl).then(async (mints) => {
          const symbols = await resolveSymbols(mints, rpcUrl);
          dispatch({ type: "SNAPSHOT_SET", wallet: w.address, mints, alias: w.alias, symbols });
        });
      }
    }
  }, [walletKey]);
  useEffect(() => {
    return () => {
      for (const mon of monitorsRef.current.values()) mon.stop();
      monitorsRef.current.clear();
    };
  }, []);
  const print = (lines) => dispatch({ type: "PRINT", lines });
  const out = (text, kind = "out") => print([{ kind, text }]);
  const openDownloadCenter = () => setDownloadOpen(true);
  const applyConfig = (text) => {
    const res = parseConfig(text);
    if (res.errors.length) {
      print(
        [
          {
            kind: "err",
            text: `CONFIG      ✗ config.txt rechazada · ${res.errors.length} error(es) · sigue la última config válida`
          },
          ...res.errors.slice(0, 3).map((e) => ({ kind: "err", text: `CONFIG        - ${e}` }))
        ]
      );
      return false;
    }
    dispatch({ type: "APPLY_CONFIG", text, cfg: res.cfg });
    return true;
  };
  const runCommand = (raw) => {
    const s = stateRef.current;
    print([{ kind: "cmd", text: raw }]);
    const [cmd, ...args] = raw.trim().split(/\s+/);
    switch ((cmd ?? "").toLowerCase()) {
      case "help":
      case "ayuda":
        print(
          [
            { kind: "sys", text: "COMANDOS    disponibles en la consola:" },
            ...HELP.map(([c, d]) => ({ kind: "out", text: `  ${c.padEnd(30, " ")} ${d}` }))
          ]
        );
        break;
      case "clear":
      case "cls":
        dispatch({ type: "CLEAR_LOG" });
        break;
      case "banner":
        print([{ kind: "art", text: BANNER }, { kind: "sys", text: `            ${TAGLINE}` }]);
        break;
      case "estado":
      case "status": {
        const st = sessionStats(s.closed, s.positions, s.tokens);
        print(
          [
            { kind: "sys", text: `ESTADO      bot: ${s.botOn ? "ACTIVO (copiando)" : "EN PAUSA"} · slot ${s.block.toLocaleString("es-ES")}` },
            { kind: "out", text: `            wallets: ${s.cfg.wallets.length} · posiciones: ${s.positions.length}/${s.cfg.maxPositions} · reserva ${s.reservaSol.toFixed(3)} SOL · USDC ${s.usdc.toFixed(2)}` },
            { kind: "out", text: `            pnl flotante: ${fmtSigned(st.unrealized, 4, " SOL")} · trades ${st.trades} · win ${fmtPct(st.winRate, 0)} · SOL/USD $${s.solUsd.toFixed(2)}` },
            { kind: "out", text: `            reglas: R0 ${s.cfg.snapshotInicial ? "on" : "off"} · R0.5 ${s.cfg.filtroAntiDust ? "on" : "off"} · R5 ${s.cfg.autoSwapUsdc ? "on" : "off"}` },
            { kind: "out", text: `            rpc: ${s.cfg.rpcUrl ? "propio (24/7)" : "público (pon el tuyo en config.txt → rpc_url)"}` },
            { kind: "out", text: `            webhook Helius: ${sseLive ? "CONECTADO al servidor (push en vivo vía Railway)" : "sin servidor — solo escucha directa por WebSocket"}` }
          ]
        );
        break;
      }
      case "iniciar":
      case "start":
        if (!s.botOn) dispatch({ type: "TOGGLE_BOT" });
        else
          out("            el bot ya está activo", "sys");
        break;
      case "pausa":
      case "pausar":
      case "stop":
        if (s.botOn) dispatch({ type: "TOGGLE_BOT" });
        else
          out("            el bot ya está en pausa", "sys");
        break;
      case "pos":
      case "posiciones": {
        if (!s.positions.length) {
          out("POSICIONES  sin posiciones abiertas · POSICION_ABIERTA[*] = FALSE");
          break;
        }
        print(
          [
            { kind: "sys", text: "POSICIONES  SIMBOLO    ENTRADA       AHORA         PNL       DE" },
            ...s.positions.map((p) => {
              const { pnlPct, price } = positionPnl(p, s.tokens);
              const alias = s.cfg.wallets.find((w) => w.address === p.walletAddress)?.alias ?? "—";
              return {
                kind: "out",
                text: `            ${p.symbol.padEnd(10, " ").slice(0, 10)} ${fmtPrice(p.entryPrice).padEnd(13, " ")} ${fmtPrice(price).padEnd(13, " ")} ${fmtSigned(pnlPct, 1, "%").padEnd(9, " ")} ${alias}`
              };
            })
          ]
        );
        break;
      }
      case "historial": {
        if (!s.closed.length) {
          out("HISTORIAL   todavía no hay ventas cerradas");
          break;
        }
        print(
          [
            { kind: "sys", text: "HISTORIAL   SIMBOLO    RESULTADO             MOTIVO            HORA" },
            ...s.closed.slice(0, 10).map((t) => ({
              kind: "out",
              text: `            ${t.symbol.padEnd(10, " ").slice(0, 10)} ${(t.pnlSol >= 0 ? "GANANCIA " : "PÉRDIDA  ") + fmtSigned(t.pnlSol, 4, " SOL")}   ${t.reason.padEnd(17, " ")} ${fmtTime(t.closedAt)}`
            }))
          ]
        );
        break;
      }
      case "tesoreria":
      case "tesorería":
      case "balance":
      case "saldo": {
        const st = sessionStats(s.closed, s.positions, s.tokens);
        print(
          [
            { kind: "sys", text: `TESORERÍA   RESERVA_GLOBAL: ${s.reservaSol.toFixed(4)} SOL · USDC asegurados (R5): ${s.usdc.toFixed(2)} · SOL/USD $${s.solUsd.toFixed(2)}` },
            { kind: "out", text: `            invertido: ${s.positions.reduce((a, p) => a + p.amountSol, 0).toFixed(4)} SOL · pnl flotante ${fmtSigned(st.unrealized, 4, " SOL")}` },
            { kind: "out", text: `            pnl realizado: ${fmtSigned(st.realized, 4, " SOL")} · trades ${st.trades} · win ${fmtPct(st.winRate, 0)}` }
          ]
        );
        break;
      }
      case "wallets": {
        if (!s.cfg.wallets.length) {
          out('WALLETS     no hay wallets en config.txt · usa "seguir <dirección>"');
          break;
        }
        print(
          [
            { kind: "sys", text: "WALLETS     ALIAS            CAPITAL   R1  R2  DUST  SNAP   PNL(SOL)     USDC" },
            ...s.cfg.wallets.map((w) => {
              const st = s.walletStats[w.address];
              const snap = s.snapshotIgnored[w.address]?.length ?? 0;
              const dust = s.dusted[w.address]?.length ?? 0;
              return {
                kind: "out",
                text: `            ${w.alias.slice(0, 15).padEnd(15, " ")} ${fmtUsd(w.capitalUsd).padStart(7, " ")}   ${String(st?.copies ?? 0).padStart(2, " ")}  ${String(st?.ignored ?? 0).padStart(2, " ")}   ${String(dust).padStart(3, " ")}   ${String(snap).padStart(3, " ")}  ${fmtSigned(st?.pnlSol ?? 0, 4).padStart(10, " ")}  ${(st?.usdcSecured ?? 0).toFixed(2)}`
              };
            })
          ]
        );
        break;
      }
      case "seguir":
      case "copiar": {
        const addr = args[0] ?? "";
        const alias = args[1] ?? addr.slice(0, 4) + "…" + addr.slice(-4);
        const usd = args[2] !== void 0 ? parseFloat(args[2].replace(",", ".")) : 5;
        if (!ADDR_RE.test(addr)) {
          out("RADAR       ✗ eso no parece una dirección de Solana · uso: seguir <dirección> [alias] [usd]", "err");
          break;
        }
        if (Number.isNaN(usd) || usd < 1 || usd > 1e6) {
          out("RADAR       ✗ el capital debe ser un número en USD (ej: seguir <dir> MiTrader 15)", "err");
          break;
        }
        if (s.cfg.wallets.some((w) => w.address === addr)) {
          out("RADAR       ✗ esa wallet ya está en config.txt", "err");
          break;
        }
        applyConfig(addWalletLine(s.configText, { address: addr, alias, capitalUsd: usd }));
        break;
      }
      case "dejar": {
        const q = args[0] ?? "";
        if (!q) {
          out("RADAR       ✗ uso: dejar <alias|dirección>", "err");
          break;
        }
        const res = removeWalletLine(s.configText, q);
        if (!res.removed) {
          out(`RADAR       ✗ "${q}" no está en config.txt`, "err");
          break;
        }
        applyConfig(res.text);
        break;
      }
      case "vender":
      case "sell": {
        const sym = (args[0] ?? "").toUpperCase();
        const pos = s.positions.find((p) => p.symbol.toUpperCase() === sym);
        if (!pos) {
          out(`VENTA       ✗ no hay ninguna posición abierta en $${sym || "?"}`, "err");
          break;
        }
        dispatch({ type: "CLOSE_POSITION", id: pos.id });
        break;
      }
      case "editar":
      case "edit":
      case "config":
      case "nano":
        setEditorOpen(true);
        break;
      case "recargar":
      case "reload":
        applyConfig(s.configText);
        break;
      case "zip":
      case "descargar-bot":
      case "exportar":
        openDownloadCenter();
        break;
      case "descargar": {
        const blob = new Blob([s.configText], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "config.txt";
        a.click();
        URL.revokeObjectURL(url);
        out("ARCHIVO     config.txt descargada · edítala y cárgala con `editar → Cargar…`");
        break;
      }
      case "reset": {
        try {
          localStorage.removeItem(LS_KEY);
          localStorage.removeItem(TOUR_KEY);
        } catch {
        }
        out("SISTEMA     reiniciando de cero…", "warn");
        setTimeout(() => window.location.reload(), 700);
        break;
      }
      default:
        out(`CONSOLA     ✗ comando desconocido: "${cmd}" · escribe "help"`, "err");
    }
  };
  const onEditorSave = (text) => {
    const ok = applyConfig(text);
    if (ok) setEditorOpen(false);
    return ok;
  };
  const totalW = state.cfg.wallets.length;
  const liveW = state.cfg.wallets.filter((w) => monStatus[w.address] === "live").length;
  const liveStatus = totalW === 0 ? "off" : liveW === totalW ? "live" : Object.values(monStatus).some((s) => s === "error") ? "error" : "connecting";
  return /* @__PURE__ */ jsxDEV("div", { className: "min-h-dvh", children: [
    /* @__PURE__ */ jsxDEV("div", { className: "ambient" }, void 0, false, {
      fileName: "/workspace/src/App.tsx",
      lineNumber: 670,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDEV(MatrixRain, {}, void 0, false, {
      fileName: "/workspace/src/App.tsx",
      lineNumber: 671,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "relative z-10 flex min-h-dvh items-center justify-center p-2.5 sm:p-5", children: /* @__PURE__ */ jsxDEV("div", { className: "crt boot-in flex h-[calc(100dvh-1.25rem)] w-full max-w-[1440px] flex-col overflow-hidden rounded-xl border-2 border-grn/30 bg-win shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95),0_0_80px_-18px_rgba(0,255,65,0.45)] sm:h-[calc(100dvh-2.5rem)]", children: [
      /* @__PURE__ */ jsxDEV(
        TitleBar,
        {
          botOn: state.botOn,
          onToggleBot: () => dispatch({ type: "TOGGLE_BOT" }),
          block: state.block,
          liveStatus,
          liveCount: liveW,
          liveTotal: totalW,
          rpcLatency,
          sseLive
        },
        void 0,
        false,
        {
          fileName: "/workspace/src/App.tsx",
          lineNumber: 674,
          columnNumber: 11
        },
        this
      ),
      /* @__PURE__ */ jsxDEV("div", { className: "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:flex-row lg:overflow-hidden", children: [
        /* @__PURE__ */ jsxDEV("div", { className: "flex min-h-0 flex-col gap-3 lg:flex-[1.65]", children: [
          /* @__PURE__ */ jsxDEV("div", { className: "flex h-[54vh] min-h-0 flex-col lg:h-auto lg:flex-1", children: /* @__PURE__ */ jsxDEV(LogStream, { log: state.log }, void 0, false, {
            fileName: "/workspace/src/App.tsx",
            lineNumber: 688,
            columnNumber: 17
          }, this) }, void 0, false, {
            fileName: "/workspace/src/App.tsx",
            lineNumber: 687,
            columnNumber: 15
          }, this),
          /* @__PURE__ */ jsxDEV(TokenStrip, { tokens: Object.values(state.tokens) }, void 0, false, {
            fileName: "/workspace/src/App.tsx",
            lineNumber: 690,
            columnNumber: 15
          }, this)
        ] }, void 0, true, {
          fileName: "/workspace/src/App.tsx",
          lineNumber: 686,
          columnNumber: 13
        }, this),
        /* @__PURE__ */ jsxDEV("aside", { className: "shrink-0 pb-1 lg:w-[336px]", children: /* @__PURE__ */ jsxDEV(
          SidePanels,
          {
            state,
            onClosePosition: (sym) => runCommand(`vender ${sym}`),
            onEditConfig: () => setEditorOpen(true),
            onDownloadZip: openDownloadCenter,
            downloading: downloadOpen,
            sol
          },
          void 0,
          false,
          {
            fileName: "/workspace/src/App.tsx",
            lineNumber: 693,
            columnNumber: 15
          },
          this
        ) }, void 0, false, {
          fileName: "/workspace/src/App.tsx",
          lineNumber: 692,
          columnNumber: 13
        }, this)
      ] }, void 0, true, {
        fileName: "/workspace/src/App.tsx",
        lineNumber: 685,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV(CommandBar, { onCommand: runCommand }, void 0, false, {
        fileName: "/workspace/src/App.tsx",
        lineNumber: 704,
        columnNumber: 11
      }, this),
      editorOpen && /* @__PURE__ */ jsxDEV(
        ConfigEditor,
        {
          initialText: state.configText,
          onSave: onEditorSave,
          onClose: () => setEditorOpen(false)
        },
        void 0,
        false,
        {
          fileName: "/workspace/src/App.tsx",
          lineNumber: 707,
          columnNumber: 11
        },
        this
      ),
      showTour && /* @__PURE__ */ jsxDEV(
        Onboarding,
        {
          onDone: closeTour,
          onOpenConfig: () => {
            closeTour();
            setEditorOpen(true);
          },
          onDownload: () => {
            closeTour();
            openDownloadCenter();
          }
        },
        void 0,
        false,
        {
          fileName: "/workspace/src/App.tsx",
          lineNumber: 715,
          columnNumber: 11
        },
        this
      ),
      downloadOpen && /* @__PURE__ */ jsxDEV(
        DownloadCenter,
        {
          configText: state.configText,
          onClose: () => setDownloadOpen(false),
          onLog: (text, kind) => print([{ kind: kind ?? "sys", text }])
        },
        void 0,
        false,
        {
          fileName: "/workspace/src/App.tsx",
          lineNumber: 729,
          columnNumber: 11
        },
        this
      )
    ] }, void 0, true, {
      fileName: "/workspace/src/App.tsx",
      lineNumber: 673,
      columnNumber: 9
    }, this) }, void 0, false, {
      fileName: "/workspace/src/App.tsx",
      lineNumber: 672,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "/workspace/src/App.tsx",
    lineNumber: 669,
    columnNumber: 5
  }, this);
}
_s(App, "KALCJTtDPXVUK10SmQlmTIFbkyk=");
_c = App;
var _c;
$RefreshReg$(_c, "App");
if (import.meta.hot && !inWebWorker) {
  window.$RefreshReg$ = prevRefreshReg;
  window.$RefreshSig$ = prevRefreshSig;
}
if (import.meta.hot && !inWebWorker) {
  RefreshRuntime.__hmr_import(import.meta.url).then((currentExports) => {
    RefreshRuntime.registerExportsForReactRefresh("/workspace/src/App.tsx", currentExports);
    import.meta.hot.accept((nextExports) => {
      if (!nextExports) return;
      const invalidateMessage = RefreshRuntime.validateRefreshBoundaryAndEnqueueUpdate("/workspace/src/App.tsx", currentExports, nextExports);
      if (invalidateMessage) import.meta.hot.invalidate(invalidateMessage);
    });
  });
}

//# sourceMappingURL=data:application/json;base64,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LFFBQUM7QUFBQTtBQUFBLFVBQ0MsWUFBWUwsTUFBTWtNO0FBQUFBLFVBQ2xCLFNBQVMsTUFBTTVMLGdCQUFnQixLQUFLO0FBQUEsVUFDcEMsT0FBTyxDQUFDbUMsTUFBTUQsU0FDWm9HLE1BQU0sQ0FBQyxFQUFFcEcsTUFBT0EsUUFBUSxPQUFtQkMsS0FBSyxDQUFDLENBQUM7QUFBQTtBQUFBLFFBSnREO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQUtHO0FBQUEsU0E3RFA7QUFBQTtBQUFBO0FBQUE7QUFBQSxXQWdFQSxLQWpFRjtBQUFBO0FBQUE7QUFBQTtBQUFBLFdBa0VBO0FBQUEsT0FyRUY7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQXNFQTtBQUVKO0FBQUMxQyxHQXBwQnVCRCxLQUFHO0FBQUEsS0FBSEE7QUFBRyxJQUFBZ087QUFBQSxhQUFBQSxJQUFBIiwibmFtZXMiOlsidXNlRWZmZWN0IiwidXNlUmVkdWNlciIsInVzZVJlZiIsInVzZVN0YXRlIiwiQUREUl9SRSIsIkJBTk5FUiIsIlJVTEVTX0JPWCIsIlRBR0xJTkUiLCJhZGRXYWxsZXRMaW5lIiwicGFyc2VDb25maWciLCJyZW1vdmVXYWxsZXRMaW5lIiwiTFNfS0VZIiwiU09MX1VTRF9GQUxMQkFDSyIsImZtdFBjdCIsImZtdFByaWNlIiwiZm10U2lnbmVkIiwiZm10VGltZSIsImZtdFVzZCIsImxvYWRTdGF0ZSIsInBvc2l0aW9uUG5sIiwicmVkdWNlciIsInNhdmVTdGF0ZSIsInNlc3Npb25TdGF0cyIsImZldGNoUHJpY2VzIiwiZmV0Y2hTb2xVc2QiLCJmZXRjaFdhbGxldFRva2VuTWludHMiLCJwaW5nUnBjIiwicmVzb2x2ZVN5bWJvbHMiLCJXYWxsZXRNb25pdG9yIiwiQ29tbWFuZEJhciIsIkxvZ1N0cmVhbSIsIk1hdHJpeFJhaW4iLCJUaXRsZUJhciIsIlRva2VuU3RyaXAiLCJTaWRlUGFuZWxzIiwiQ29uZmlnRWRpdG9yIiwiRG93bmxvYWRDZW50ZXIiLCJPbmJvYXJkaW5nIiwiVE9VUl9LRVkiLCJIRUxQIiwiQXBwIiwiX3MiLCJzdGF0ZSIsImRpc3BhdGNoIiwidW5kZWZpbmVkIiwiZWRpdG9yT3BlbiIsInNldEVkaXRvck9wZW4iLCJkb3dubG9hZE9wZW4iLCJzZXREb3dubG9hZE9wZW4iLCJzaG93VG91ciIsInNldFNob3dUb3VyIiwibG9jYWxTdG9yYWdlIiwiZ2V0SXRlbSIsInN0YXRlUmVmIiwiY3VycmVudCIsImJvb3RlZCIsIm1vbml0b3JzUmVmIiwiTWFwIiwibW9uU3RhdHVzIiwic2V0TW9uU3RhdHVzIiwicnBjTGF0ZW5jeSIsInNldFJwY0xhdGVuY3kiLCJjYW5jZWxsZWQiLCJwaW5nIiwibXMiLCJjZmciLCJycGNVcmwiLCJpZCIsInNldEludGVydmFsIiwiY2xlYXJJbnRlcnZhbCIsInNzZUxpdmUiLCJzZXRTc2VMaXZlIiwic3NlU2VlbiIsIlNldCIsInNzZUFubm91bmNlZCIsImVzIiwicmV0cnkiLCJjb25uZWN0IiwiRXZlbnRTb3VyY2UiLCJvbm9wZW4iLCJ0eXBlIiwibGluZXMiLCJraW5kIiwidGV4dCIsIm9ubWVzc2FnZSIsIm0iLCJldiIsIkpTT04iLCJwYXJzZSIsImRhdGEiLCJ0eEhhc2giLCJoYXMiLCJhZGQiLCJzaXplIiwic2xpY2UiLCJldmVudCIsIm9uZXJyb3IiLCJjbG9zZSIsInNldFRpbWVvdXQiLCJjbGVhclRpbWVvdXQiLCJsYXN0U29sUmVmIiwid2FybmVkU3RhbGUiLCJsb2dnZWRMaXZlIiwic29sTGl2ZSIsInNldFNvbExpdmUiLCJzb2xTdGFsZSIsInNldFNvbFN0YWxlIiwic29sVXBkYXRlZEF0Iiwic2V0U29sVXBkYXRlZEF0Iiwic29sUmVhZGluZ3MiLCJzZXRTb2xSZWFkaW5ncyIsInNvbFRpY2siLCJzZXRTb2xUaWNrIiwicmVmcmVzaCIsInMiLCJtaW50cyIsIk9iamVjdCIsImtleXMiLCJ0b2tlbnMiLCJwb3NpdGlvbnMiLCJtYXAiLCJwIiwibWludCIsInNvbFVzZCIsInByaWNlcyIsIlByb21pc2UiLCJhbGwiLCJEYXRlIiwibm93IiwiciIsInQiLCJuIiwidG9GaXhlZCIsIkZJVkVfTUlOIiwibm93TXMiLCJiYXNlbGluZSIsImZpbmQiLCJzb2wiLCJwcmljZSIsImNoYW5nZVBjdCIsInN0YWxlIiwidXBkYXRlZEF0IiwiaGlzdG9yeSIsInRpY2siLCJjbG9zZVRvdXIiLCJzZXRJdGVtIiwiYm9vdCIsInJlc2VydmFHbG9iYWwiLCJzbGlwcGFnZSIsInNuYXBzaG90SW5pY2lhbCIsImZpbHRyb0FudGlEdXN0IiwiYXV0b1N3YXBVc2RjIiwid2FsbGV0cyIsImxlbmd0aCIsInB1c2giLCJ3IiwiYWxpYXMiLCJjYXBpdGFsVXNkIiwiam9pbiIsInRpbWVycyIsImkiLCJmb3JFYWNoIiwid2FsbGV0S2V5IiwiYWRkcmVzcyIsInNvcnQiLCJkZXNpcmVkIiwibW9uaXRvcnMiLCJhZGRyIiwibW9uIiwiY3VycmVudFJwY1VybCIsInN0b3AiLCJkZWxldGUiLCJzb21lIiwic3QiLCJtc2ciLCJzZXQiLCJzdGFydCIsInRoZW4iLCJzeW1ib2xzIiwid2FsbGV0IiwidmFsdWVzIiwiY2xlYXIiLCJwcmludCIsIm91dCIsIm9wZW5Eb3dubG9hZENlbnRlciIsImFwcGx5Q29uZmlnIiwicmVzIiwiZXJyb3JzIiwiZSIsInJ1bkNvbW1hbmQiLCJyYXciLCJjbWQiLCJhcmdzIiwidHJpbSIsInNwbGl0IiwidG9Mb3dlckNhc2UiLCJjIiwiZCIsInBhZEVuZCIsImNsb3NlZCIsImJvdE9uIiwiYmxvY2siLCJ0b0xvY2FsZVN0cmluZyIsIm1heFBvc2l0aW9ucyIsInJlc2VydmFTb2wiLCJ1c2RjIiwidW5yZWFsaXplZCIsInRyYWRlcyIsIndpblJhdGUiLCJwbmxQY3QiLCJ3YWxsZXRBZGRyZXNzIiwic3ltYm9sIiwiZW50cnlQcmljZSIsInBubFNvbCIsInJlYXNvbiIsImNsb3NlZEF0IiwicmVkdWNlIiwiYSIsImFtb3VudFNvbCIsInJlYWxpemVkIiwid2FsbGV0U3RhdHMiLCJzbmFwIiwic25hcHNob3RJZ25vcmVkIiwiZHVzdCIsImR1c3RlZCIsInBhZFN0YXJ0IiwiU3RyaW5nIiwiY29waWVzIiwiaWdub3JlZCIsInVzZGNTZWN1cmVkIiwidXNkIiwicGFyc2VGbG9hdCIsInJlcGxhY2UiLCJ0ZXN0IiwiTnVtYmVyIiwiaXNOYU4iLCJjb25maWdUZXh0IiwicSIsInJlbW92ZWQiLCJzeW0iLCJ0b1VwcGVyQ2FzZSIsInBvcyIsImJsb2IiLCJCbG9iIiwidXJsIiwiVVJMIiwiY3JlYXRlT2JqZWN0VVJMIiwiZG9jdW1lbnQiLCJjcmVhdGVFbGVtZW50IiwiaHJlZiIsImRvd25sb2FkIiwiY2xpY2siLCJyZXZva2VPYmplY3RVUkwiLCJyZW1vdmVJdGVtIiwid2luZG93IiwibG9jYXRpb24iLCJyZWxvYWQiLCJvbkVkaXRvclNhdmUiLCJvayIsInRvdGFsVyIsImxpdmVXIiwiZmlsdGVyIiwibGl2ZVN0YXR1cyIsImxvZyIsIl9jIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VzIjpbIkFwcC50c3giXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdXNlRWZmZWN0LCB1c2VSZWR1Y2VyLCB1c2VSZWYsIHVzZVN0YXRlIH0gZnJvbSBcInJlYWN0XCI7XG5pbXBvcnQge1xuICBBRERSX1JFLFxuICBCQU5ORVIsXG4gIFJVTEVTX0JPWCxcbiAgVEFHTElORSxcbiAgYWRkV2FsbGV0TGluZSxcbiAgcGFyc2VDb25maWcsXG4gIHJlbW92ZVdhbGxldExpbmUsXG59IGZyb20gXCIuL2NvbmZpZ1wiO1xuaW1wb3J0IHtcbiAgTFNfS0VZLFxuICBTT0xfVVNEX0ZBTExCQUNLLFxuICBmbXRQY3QsXG4gIGZtdFByaWNlLFxuICBmbXRTaWduZWQsXG4gIGZtdFRpbWUsXG4gIGZtdFVzZCxcbiAgbG9hZFN0YXRlLFxuICBwb3NpdGlvblBubCxcbiAgcmVkdWNlcixcbiAgc2F2ZVN0YXRlLFxuICBzZXNzaW9uU3RhdHMsXG4gIHNob3J0QWRkcixcbn0gZnJvbSBcIi4vZW5naW5lXCI7XG5pbXBvcnQge1xuICBmZXRjaFByaWNlcyxcbiAgZmV0Y2hTb2xVc2QsXG4gIGZldGNoV2FsbGV0VG9rZW5NaW50cyxcbiAgcGluZ1JwYyxcbiAgcmVzb2x2ZVN5bWJvbHMsXG4gIFdhbGxldE1vbml0b3IsXG4gIHR5cGUgTW9uaXRvclN0YXR1cyxcbn0gZnJvbSBcIi4vc29sYW5hXCI7XG5pbXBvcnQgdHlwZSB7IExvZ0tpbmQgfSBmcm9tIFwiLi90eXBlc1wiO1xuaW1wb3J0IHsgQ29tbWFuZEJhciwgTG9nU3RyZWFtLCBNYXRyaXhSYWluLCBUaXRsZUJhciwgVG9rZW5TdHJpcCB9IGZyb20gXCIuL2NvbXBvbmVudHMvdGVybWluYWxcIjtcbmltcG9ydCBTaWRlUGFuZWxzLCB7IHR5cGUgU29sTGl2ZSB9IGZyb20gXCIuL2NvbXBvbmVudHMvcGFuZWxzXCI7XG5pbXBvcnQgeyBDb25maWdFZGl0b3IsIERvd25sb2FkQ2VudGVyLCBPbmJvYXJkaW5nIH0gZnJvbSBcIi4vY29tcG9uZW50cy9tb2RhbHNcIjtcblxuY29uc3QgVE9VUl9LRVkgPSBcIm1lbWVib3Q6dG91clwiO1xuXG5jb25zdCBIRUxQOiBBcnJheTxbc3RyaW5nLCBzdHJpbmddPiA9IFtcbiAgW1wiaGVscFwiLCBcImVzdGEgbGlzdGFcIl0sXG4gIFtcImVzdGFkb1wiLCBcInJlc3VtZW4gZGVsIGJvdCwgcmVnbGFzIHkgUlBDXCJdLFxuICBbXCJpbmljaWFyIHwgcGF1c2FcIiwgXCJhY3RpdmFyIG8gcGF1c2FyIGxhIGNvcGlhIGRlIHRyYWRlc1wiXSxcbiAgW1wicG9zXCIsIFwicG9zaWNpb25lcyBhYmllcnRhcyAoUE9TSUNJT05fQUJJRVJUQVsqXSlcIl0sXG4gIFtcImhpc3RvcmlhbFwiLCBcIsO6bHRpbWFzIHZlbnRhcyBjZXJyYWRhcyAoR0FOQU5DSUEvUMOJUkRJREEpXCJdLFxuICBbXCJ0ZXNvcmVyaWFcIiwgXCJSRVNFUlZBX0dMT0JBTCwgVVNEQyBhc2VndXJhZG9zIHkgU09MX1BSSUNFX0xJVkVcIl0sXG4gIFtcIndhbGxldHNcIiwgXCJ3YWxsZXRzIGNvcGlhZGFzIGNvbiBzdSBjYXBpdGFsIGVuIFVTRFwiXSxcbiAgW1wic2VndWlyIDxkaXJlY2Npw7NuPiBbYWxpYXNdIFt1c2RdXCIsIFwiYcOxYWRlIFRVIHdhbGxldCBhbCByYWRhclwiXSxcbiAgW1wiZGVqYXIgPGFsaWFzfGRpcmVjY2nDs24+XCIsIFwicXVpdGEgdW5hIHdhbGxldCBkZSBjb25maWcudHh0XCJdLFxuICBbXCJ2ZW5kZXIgPFNJTUJPTE8+XCIsIFwiY2llcnJlIG1hbnVhbCBkZSB1bmEgcG9zaWNpw7NuXCJdLFxuICBbXCJlZGl0YXJcIiwgXCJhYnJlIGNvbmZpZy50eHQgZW4gZWwgZWRpdG9yXCJdLFxuICBbXCJyZWNhcmdhclwiLCBcInJlLWxlZSBjb25maWcudHh0XCJdLFxuICBbXCJkZXNjYXJnYXJcIiwgXCJiYWphIGNvbmZpZy50eHQgYSB0dSBQQ1wiXSxcbiAgW1wiemlwXCIsIFwiQ0VOVFJPIERFIERFU0NBUkdBOiB0b2RvIGVsIGJvdCBlbiB1biBhcmNoaXZvXCJdLFxuICBbXCJyZXNldFwiLCBcImJvcnJhIHRvZG8geSBhcnJhbmNhIGRlIGNlcm9cIl0sXG4gIFtcImJhbm5lclwiLCBcImltcHJpbWUgZWwgbG9nb1wiXSxcbiAgW1wiY2xlYXJcIiwgXCJsaW1waWEgbGEgY29uc29sYVwiXSxcbl07XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIEFwcCgpIHtcbiAgY29uc3QgW3N0YXRlLCBkaXNwYXRjaF0gPSB1c2VSZWR1Y2VyKHJlZHVjZXIsIHVuZGVmaW5lZCwgbG9hZFN0YXRlKTtcbiAgY29uc3QgW2VkaXRvck9wZW4sIHNldEVkaXRvck9wZW5dID0gdXNlU3RhdGUoZmFsc2UpO1xuICBjb25zdCBbZG93bmxvYWRPcGVuLCBzZXREb3dubG9hZE9wZW5dID0gdXNlU3RhdGUoZmFsc2UpO1xuICBjb25zdCBbc2hvd1RvdXIsIHNldFNob3dUb3VyXSA9IHVzZVN0YXRlKCgpID0+IHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGxvY2FsU3RvcmFnZS5nZXRJdGVtKFRPVVJfS0VZKSAhPT0gXCIxXCI7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH0pO1xuICBjb25zdCBzdGF0ZVJlZiA9IHVzZVJlZihzdGF0ZSk7XG4gIHN0YXRlUmVmLmN1cnJlbnQgPSBzdGF0ZTtcbiAgY29uc3QgYm9vdGVkID0gdXNlUmVmKGZhbHNlKTtcblxuICAvKiAtLS0tLS0tLS0tIG1vbml0b3JlbyBSRUFMIHBvciB3YWxsZXQgLS0tLS0tLS0tLSAqL1xuICBjb25zdCBtb25pdG9yc1JlZiA9IHVzZVJlZjxNYXA8c3RyaW5nLCBXYWxsZXRNb25pdG9yPj4obmV3IE1hcCgpKTtcbiAgY29uc3QgW21vblN0YXR1cywgc2V0TW9uU3RhdHVzXSA9IHVzZVN0YXRlPFJlY29yZDxzdHJpbmcsIE1vbml0b3JTdGF0dXM+Pih7fSk7XG5cbiAgLyogLS0tLS0tLS0tLSBsYXRlbmNpYSBkZWwgUlBDIChzZW3DoWZvcm8gZGUgbGEgYmFycmEgc3VwZXJpb3IpIC0tLS0tLS0tLS0gKi9cbiAgY29uc3QgW3JwY0xhdGVuY3ksIHNldFJwY0xhdGVuY3ldID0gdXNlU3RhdGU8bnVtYmVyIHwgbnVsbD4obnVsbCk7XG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgbGV0IGNhbmNlbGxlZCA9IGZhbHNlO1xuICAgIGNvbnN0IHBpbmcgPSBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBtcyA9IGF3YWl0IHBpbmdScGMoc3RhdGVSZWYuY3VycmVudC5jZmcucnBjVXJsKTtcbiAgICAgIGlmICghY2FuY2VsbGVkKSBzZXRScGNMYXRlbmN5KG1zKTtcbiAgICB9O1xuICAgIHZvaWQgcGluZygpO1xuICAgIGNvbnN0IGlkID0gc2V0SW50ZXJ2YWwoKCkgPT4gdm9pZCBwaW5nKCksIDUwMDApO1xuICAgIHJldHVybiAoKSA9PiB7XG4gICAgICBjYW5jZWxsZWQgPSB0cnVlO1xuICAgICAgY2xlYXJJbnRlcnZhbChpZCk7XG4gICAgfTtcbiAgfSwgW10pO1xuXG4gIC8qIC0tLS0tLS0tLS0gd2ViaG9va3MgZGUgSGVsaXVzIHbDrWEgZWwgc2Vydmlkb3IgKFNTRSBlbiAvZXZlbnRzKSAtLS0tLS0tLS0tXG4gICAgIEVuIFJhaWx3YXkgZWwgc2Vydmlkb3IgcmVjaWJlIGxvcyB3ZWJob29rcyB5IGxvcyBlbXB1amEgYWwgbmF2ZWdhZG9yLlxuICAgICBFbiBkZXYvcHJldmlldyBubyBoYXkgc2Vydmlkb3Ig4oaSIGxhIGNvbmV4acOzbiBmYWxsYSBlbiBzaWxlbmNpbyB5IGVsIGJvdFxuICAgICBzaWd1ZSBlc2N1Y2hhbmRvIGRpcmVjdG8gcG9yIFdlYlNvY2tldC4gRGVkdXAgcG9yIGhhc2ggZGUgdHJhbnNhY2Npw7NuLiAqL1xuICBjb25zdCBbc3NlTGl2ZSwgc2V0U3NlTGl2ZV0gPSB1c2VTdGF0ZShmYWxzZSk7XG4gIGNvbnN0IHNzZVNlZW4gPSB1c2VSZWY8U2V0PHN0cmluZz4+KG5ldyBTZXQoKSk7XG4gIGNvbnN0IHNzZUFubm91bmNlZCA9IHVzZVJlZihmYWxzZSk7XG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgbGV0IGVzOiBFdmVudFNvdXJjZSB8IG51bGwgPSBudWxsO1xuICAgIGxldCByZXRyeTogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCBudWxsID0gbnVsbDtcbiAgICBsZXQgY2FuY2VsbGVkID0gZmFsc2U7XG5cbiAgICBjb25zdCBjb25uZWN0ID0gKCkgPT4ge1xuICAgICAgaWYgKGNhbmNlbGxlZCkgcmV0dXJuO1xuICAgICAgdHJ5IHtcbiAgICAgICAgZXMgPSBuZXcgRXZlbnRTb3VyY2UoXCIvZXZlbnRzXCIpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGVzLm9ub3BlbiA9ICgpID0+IHtcbiAgICAgICAgaWYgKGNhbmNlbGxlZCkgcmV0dXJuO1xuICAgICAgICBzZXRTc2VMaXZlKHRydWUpO1xuICAgICAgICBpZiAoIXNzZUFubm91bmNlZC5jdXJyZW50KSB7XG4gICAgICAgICAgc3NlQW5ub3VuY2VkLmN1cnJlbnQgPSB0cnVlO1xuICAgICAgICAgIGRpc3BhdGNoKHtcbiAgICAgICAgICAgIHR5cGU6IFwiUFJJTlRcIixcbiAgICAgICAgICAgIGxpbmVzOiBbXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBraW5kOiBcIm9rXCIsXG4gICAgICAgICAgICAgICAgdGV4dDogXCJXRUJIT09LICAgICDipr8gY29uZWN0YWRvIGFsIHNlcnZpZG9yIChTU0UpIOKAlCBsb3Mgd2ViaG9va3MgZGUgSGVsaXVzIGxsZWdhcsOhbiBwb3IgcHVzaCBlbiB0aWVtcG8gcmVhbFwiLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGVzLm9ubWVzc2FnZSA9IChtKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgZXYgPSBKU09OLnBhcnNlKG0uZGF0YSk7XG4gICAgICAgICAgaWYgKCFldiB8fCAhZXYudHhIYXNoKSByZXR1cm47XG4gICAgICAgICAgaWYgKHNzZVNlZW4uY3VycmVudC5oYXMoZXYudHhIYXNoKSkgcmV0dXJuO1xuICAgICAgICAgIHNzZVNlZW4uY3VycmVudC5hZGQoZXYudHhIYXNoKTtcbiAgICAgICAgICBpZiAoc3NlU2Vlbi5jdXJyZW50LnNpemUgPiA1MDApIHtcbiAgICAgICAgICAgIHNzZVNlZW4uY3VycmVudCA9IG5ldyBTZXQoWy4uLnNzZVNlZW4uY3VycmVudF0uc2xpY2UoLTI1MCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiT05DSEFJTl9FVkVOVFwiLCBldmVudDogZXYgfSk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIC8qIHBheWxvYWQgbm8gdsOhbGlkbyAqL1xuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgZXMub25lcnJvciA9ICgpID0+IHtcbiAgICAgICAgc2V0U3NlTGl2ZShmYWxzZSk7XG4gICAgICAgIGVzPy5jbG9zZSgpO1xuICAgICAgICBpZiAoIWNhbmNlbGxlZCkgcmV0cnkgPSBzZXRUaW1lb3V0KGNvbm5lY3QsIDgwMDApO1xuICAgICAgfTtcbiAgICB9O1xuXG4gICAgY29ubmVjdCgpO1xuICAgIHJldHVybiAoKSA9PiB7XG4gICAgICBjYW5jZWxsZWQgPSB0cnVlO1xuICAgICAgZXM/LmNsb3NlKCk7XG4gICAgICBpZiAocmV0cnkpIGNsZWFyVGltZW91dChyZXRyeSk7XG4gICAgfTtcbiAgfSwgW10pO1xuXG4gIC8qIC0tLS0tLS0tLS0gU09MX1BSSUNFX0xJVkU6IEp1cGl0ZXIgY2FkYSAxMCBzLCBmYWxsYmFjayAkMTA1IC0tLS0tLS0tLS1cbiAgICAgRWwgdXN1YXJpbyBOVU5DQSBlc2NyaWJlIGVsIHByZWNpbyBhIG1hbm8uICovXG4gIGNvbnN0IGxhc3RTb2xSZWYgPSB1c2VSZWY8bnVtYmVyIHwgbnVsbD4obnVsbCk7XG4gIGNvbnN0IHdhcm5lZFN0YWxlID0gdXNlUmVmKGZhbHNlKTtcbiAgY29uc3QgbG9nZ2VkTGl2ZSA9IHVzZVJlZihmYWxzZSk7XG4gIGNvbnN0IFtzb2xMaXZlLCBzZXRTb2xMaXZlXSA9IHVzZVN0YXRlPG51bWJlciB8IG51bGw+KG51bGwpO1xuICBjb25zdCBbc29sU3RhbGUsIHNldFNvbFN0YWxlXSA9IHVzZVN0YXRlKGZhbHNlKTtcbiAgY29uc3QgW3NvbFVwZGF0ZWRBdCwgc2V0U29sVXBkYXRlZEF0XSA9IHVzZVN0YXRlPG51bWJlciB8IG51bGw+KG51bGwpO1xuICAvKiogbGVjdHVyYXMgY29uIHRpbWVzdGFtcDogcGFyYSBsYSBjaGlzcGEgeSBwYXJhIGVsICUgY29udHJhIGhhY2UgNSBtaW4gKi9cbiAgY29uc3QgW3NvbFJlYWRpbmdzLCBzZXRTb2xSZWFkaW5nc10gPSB1c2VTdGF0ZTxBcnJheTx7IHQ6IG51bWJlcjsgcDogbnVtYmVyIH0+PihbXSk7XG4gIC8qKiBzZSBpbmNyZW1lbnRhIGVuIGNhZGEgYWN0dWFsaXphY2nDs24gZXhpdG9zYSDihpIgaGFjZSBwYXJwYWRlYXIgZWwgcHJlY2lvICovXG4gIGNvbnN0IFtzb2xUaWNrLCBzZXRTb2xUaWNrXSA9IHVzZVN0YXRlKDApO1xuXG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgbGV0IGNhbmNlbGxlZCA9IGZhbHNlO1xuICAgIGNvbnN0IHJlZnJlc2ggPSBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBzID0gc3RhdGVSZWYuY3VycmVudDtcbiAgICAgIGNvbnN0IG1pbnRzID0gW1xuICAgICAgICAuLi5uZXcgU2V0KFsuLi5PYmplY3Qua2V5cyhzLnRva2VucyksIC4uLnMucG9zaXRpb25zLm1hcCgocCkgPT4gcC5taW50KV0pLFxuICAgICAgXTtcbiAgICAgIGNvbnN0IFtzb2xVc2QsIHByaWNlc10gPSBhd2FpdCBQcm9taXNlLmFsbChbZmV0Y2hTb2xVc2QoKSwgZmV0Y2hQcmljZXMobWludHMpXSk7XG4gICAgICBpZiAoY2FuY2VsbGVkKSByZXR1cm47XG5cbiAgICAgIGlmIChzb2xVc2QgJiYgc29sVXNkID4gMCkge1xuICAgICAgICB3YXJuZWRTdGFsZS5jdXJyZW50ID0gZmFsc2U7XG4gICAgICAgIGxhc3RTb2xSZWYuY3VycmVudCA9IHNvbFVzZDtcbiAgICAgICAgc2V0U29sTGl2ZShzb2xVc2QpO1xuICAgICAgICBzZXRTb2xTdGFsZShmYWxzZSk7XG4gICAgICAgIHNldFNvbFVwZGF0ZWRBdChEYXRlLm5vdygpKTtcbiAgICAgICAgc2V0U29sUmVhZGluZ3MoKHIpID0+IFsuLi5yLnNsaWNlKC01OSksIHsgdDogRGF0ZS5ub3coKSwgcDogc29sVXNkIH1dKTtcbiAgICAgICAgc2V0U29sVGljaygobikgPT4gbiArIDEpOyAvKiBwYXJwYWRlbyBlbiBjYWRhIHJlZnJlc2NvLCBhdW5xdWUgZWwgcHJlY2lvIG5vIGNhbWJpZSAqL1xuICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiUFJJQ0VTX1VQREFURVwiLCBwcmljZXMsIHNvbFVzZCB9KTtcbiAgICAgICAgaWYgKCFsb2dnZWRMaXZlLmN1cnJlbnQpIHtcbiAgICAgICAgICBsb2dnZWRMaXZlLmN1cnJlbnQgPSB0cnVlO1xuICAgICAgICAgIGRpc3BhdGNoKHtcbiAgICAgICAgICAgIHR5cGU6IFwiUFJJTlRcIixcbiAgICAgICAgICAgIGxpbmVzOiBbXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBraW5kOiBcIm9rXCIsXG4gICAgICAgICAgICAgICAgdGV4dDogYFBSRUNJTyAgICAgIOKckyBTT0xfUFJJQ0VfTElWRSA9ICQke3NvbFVzZC50b0ZpeGVkKDIpfSAoZW4gdml2byDCtyBKdXBpdGVyL0NvaW5HZWNrbyDCtyByZWZyZXNjbyBjYWRhIDEwIHMpYCxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8qIEp1cGl0ZXIgZmFsbMOzIOKGkiBmYWxsYmFjayAkMTA1LCByZWludGVudG8gZW4gbGEgc2lndWllbnRlIHJvbmRhICovXG4gICAgICAgIHNldFNvbFN0YWxlKHRydWUpO1xuICAgICAgICBpZiAobGFzdFNvbFJlZi5jdXJyZW50ID09PSBudWxsKSB7XG4gICAgICAgICAgbGFzdFNvbFJlZi5jdXJyZW50ID0gU09MX1VTRF9GQUxMQkFDSztcbiAgICAgICAgICBzZXRTb2xMaXZlKFNPTF9VU0RfRkFMTEJBQ0spO1xuICAgICAgICAgIHNldFNvbFVwZGF0ZWRBdChEYXRlLm5vdygpKTtcbiAgICAgICAgICBzZXRTb2xSZWFkaW5ncygocikgPT4gWy4uLnIuc2xpY2UoLTU5KSwgeyB0OiBEYXRlLm5vdygpLCBwOiBTT0xfVVNEX0ZBTExCQUNLIH1dKTtcbiAgICAgICAgfVxuICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiUFJJQ0VTX1VQREFURVwiLCBwcmljZXMsIHNvbFVzZDogU09MX1VTRF9GQUxMQkFDSyB9KTtcbiAgICAgICAgaWYgKCF3YXJuZWRTdGFsZS5jdXJyZW50KSB7XG4gICAgICAgICAgd2FybmVkU3RhbGUuY3VycmVudCA9IHRydWU7XG4gICAgICAgICAgZGlzcGF0Y2goe1xuICAgICAgICAgICAgdHlwZTogXCJQUklOVFwiLFxuICAgICAgICAgICAgbGluZXM6IFtcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGtpbmQ6IFwid2FyblwiLFxuICAgICAgICAgICAgICAgIHRleHQ6IGBQUkVDSU8gICAgICDimqAgSnVwaXRlciBubyByZXNwb25kacOzIMK3IHVzYW5kbyBmYWxsYmFjayAkJHtTT0xfVVNEX0ZBTExCQUNLfSAoc2UgcmVpbnRlbnRhIGNhZGEgMTAgcylgLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG4gICAgdm9pZCByZWZyZXNoKCk7XG4gICAgY29uc3QgaWQgPSBzZXRJbnRlcnZhbCgoKSA9PiB2b2lkIHJlZnJlc2goKSwgMTBfMDAwKTtcbiAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgY2FuY2VsbGVkID0gdHJ1ZTtcbiAgICAgIGNsZWFySW50ZXJ2YWwoaWQpO1xuICAgIH07XG4gIH0sIFtdKTtcblxuICAvKiAlIGNvbnRyYSBsYSBsZWN0dXJhIGRlIGhhY2UgfjUgbWluIChvIGxhIG3DoXMgYW50aWd1YSBzaSBhw7puIG5vIGhheSA1IG1pbikgKi9cbiAgY29uc3QgRklWRV9NSU4gPSA1ICogNjBfMDAwO1xuICBjb25zdCBub3dNcyA9IERhdGUubm93KCk7XG4gIGNvbnN0IGJhc2VsaW5lID1cbiAgICBzb2xSZWFkaW5ncy5maW5kKChyKSA9PiBub3dNcyAtIHIudCA+PSBGSVZFX01JTikgPz8gc29sUmVhZGluZ3NbMF0gPz8gbnVsbDtcbiAgY29uc3Qgc29sOiBTb2xMaXZlID0ge1xuICAgIHByaWNlOiBzb2xMaXZlLFxuICAgIGNoYW5nZVBjdDpcbiAgICAgIHNvbExpdmUgJiYgYmFzZWxpbmUgJiYgYmFzZWxpbmUucCA+IDBcbiAgICAgICAgPyAoKHNvbExpdmUgLSBiYXNlbGluZS5wKSAvIGJhc2VsaW5lLnApICogMTAwXG4gICAgICAgIDogMCxcbiAgICBzdGFsZTogc29sU3RhbGUsXG4gICAgdXBkYXRlZEF0OiBzb2xVcGRhdGVkQXQsXG4gICAgaGlzdG9yeTogc29sUmVhZGluZ3MubWFwKChyKSA9PiByLnApLFxuICAgIHRpY2s6IHNvbFRpY2ssXG4gIH07XG5cbiAgY29uc3QgY2xvc2VUb3VyID0gKCkgPT4ge1xuICAgIHNldFNob3dUb3VyKGZhbHNlKTtcbiAgICB0cnkge1xuICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oVE9VUl9LRVksIFwiMVwiKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIC8qIHNpbiBhbG1hY2VuYW1pZW50byAqL1xuICAgIH1cbiAgfTtcblxuICAvKiAtLS0tLS0tLS0tIHBlcnNpc3RlbmNpYSAtLS0tLS0tLS0tICovXG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgc2F2ZVN0YXRlKHN0YXRlKTtcbiAgfSwgW3N0YXRlXSk7XG5cbiAgLyogLS0tLS0tLS0tLSBzZWN1ZW5jaWEgZGUgYXJyYW5xdWUgLS0tLS0tLS0tLSAqL1xuICB1c2VFZmZlY3QoKCkgPT4ge1xuICAgIGlmIChib290ZWQuY3VycmVudCkgcmV0dXJuO1xuICAgIGJvb3RlZC5jdXJyZW50ID0gdHJ1ZTtcbiAgICBjb25zdCBzID0gc3RhdGVSZWYuY3VycmVudDtcbiAgICBjb25zdCBib290OiBBcnJheTxbTG9nS2luZCwgc3RyaW5nXT4gPSBbXG4gICAgICBbXCJhcnRcIiwgQkFOTkVSXSxcbiAgICAgIFtcInN5c1wiLCBgICAgICAgICAgICAgJHtUQUdMSU5FfWBdLFxuICAgICAgW1wic3lzXCIsIFwiXCJdLFxuICAgICAgW1wic3lzXCIsIFwiQk9PVCAgICAgICAgbWVtZWJvdCB2My4yIMK3IE1PTklUT1JFTyBSRUFMIERFIE1BSU5ORVQgKHNlw7FhbGVzIHkgcHJlY2lvcyBvbi1jaGFpbilcIl0sXG4gICAgICBbXCJzeXNcIiwgXCJCT09UICAgICAgICBsZXllbmRvIGNvbmZpZy50eHQg4oCmXCJdLFxuICAgICAgW1xuICAgICAgICBcIm9rXCIsXG4gICAgICAgIGBDT05GSUcgICAgICDinJMgVEVTT1JFUsONQTogUkVTRVJWQV9HTE9CQUwgJHtzLmNmZy5yZXNlcnZhR2xvYmFsLnRvRml4ZWQoMil9IFNPTCAocGFwZXIpIMK3IHNsaXBwYWdlIOKJpCR7cy5jZmcuc2xpcHBhZ2V9JWAsXG4gICAgICBdLFxuICAgICAgW1xuICAgICAgICBcIm9rXCIsXG4gICAgICAgIGBDT05GSUcgICAgICDinJMgcmVnbGFzIOKGkiBSMCBzbmFwc2hvdCAke3MuY2ZnLnNuYXBzaG90SW5pY2lhbCA/IFwib25cIiA6IFwib2ZmXCJ9IMK3IFIwLjUgYW50aS1kdXN0ICR7cy5jZmcuZmlsdHJvQW50aUR1c3QgPyBcIm9uXCIgOiBcIm9mZlwifSDCtyBSNSBhdXRvLXN3YXAgVVNEQyAke3MuY2ZnLmF1dG9Td2FwVXNkYyA/IFwib25cIiA6IFwib2ZmXCJ9YCxcbiAgICAgIF0sXG4gICAgICBbXG4gICAgICAgIFwib2tcIixcbiAgICAgICAgYENPTkZJRyAgICAgIOKckyBwcmVjaW8gU09ML1VTRCBlbiB2aXZvIHbDrWEgSnVwaXRlciBjYWRhIDEwIHMgKGZhbGxiYWNrICQke1NPTF9VU0RfRkFMTEJBQ0t9KSDCtyBudW5jYSBtYW51YWxgLFxuICAgICAgXSxcbiAgICAgIFtcInN5c1wiLCBgUkVEICAgICAgICAgUlBDOiAke3MuY2ZnLnJwY1VybCA/IHMuY2ZnLnJwY1VybC5zbGljZSgwLCA1MikgKyBcIuKAplwiIDogXCJww7pibGljbyB3c3M6Ly9hcGkubWFpbm5ldC1iZXRhLnNvbGFuYS5jb21cIn1gXSxcbiAgICAgIFtcInN5c1wiLCBSVUxFU19CT1hdLFxuICAgIF07XG4gICAgaWYgKHMuY2ZnLndhbGxldHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBib290LnB1c2goXG4gICAgICAgIFtcIndhcm5cIiwgXCJSQURBUiAgICAgICBzaW4gd2FsbGV0cyB0b2RhdsOtYSDCtyBhw7FhZGUgbGEgdHV5YTogIHNlZ3VpciA8ZGlyZWNjacOzbj4gW2FsaWFzXSBbdXNkXVwiXSxcbiAgICAgICAgW1wic3lzXCIsIFwiICAgICAgICAgICAgKG8gcHVsc2Eg4oyYIGNvbmZpZy50eHQgeSBlZMOtdGFsbyBlbiBbd2FsbGV0c10pXCJdLFxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYm9vdC5wdXNoKFtcbiAgICAgICAgXCJva1wiLFxuICAgICAgICBcIlJBREFSICAgICAgIHNpZ3VpZW5kbyBcIiArXG4gICAgICAgICAgcy5jZmcud2FsbGV0cy5tYXAoKHcpID0+IGAke3cuYWxpYXN9ICgke2ZtdFVzZCh3LmNhcGl0YWxVc2QpfSlgKS5qb2luKFwiLCBcIikgK1xuICAgICAgICAgIFwiIMK3IGVzcGVyYW5kbyBsYSBwcmltZXJhIGNvbXByYSB2w6FsaWRh4oCmXCIsXG4gICAgICBdKTtcbiAgICB9XG4gICAgYm9vdC5wdXNoKFxuICAgICAgW1wic3lzXCIsIFwiXCJdLFxuICAgICAgW1wid2FyblwiLCBcIkRFU0NBUkdBICAgIMK/cXVpZXJlcyBlbCBib3QgZW4gdHUgUEM/IGVzY3JpYmUgYHppcGAgbyBwdWxzYSDih6kgZW4gZWwgcGFuZWwgZGVyZWNob1wiXSxcbiAgICAgIFtcInN5c1wiLCAnQ09OU09MQSAgICAgZXNjcmliZSBcImhlbHBcIiBwYXJhIHZlciBsb3MgY29tYW5kb3MnXSxcbiAgICApO1xuICAgIGRpc3BhdGNoKHsgdHlwZTogXCJDTEVBUl9MT0dcIiB9KTtcbiAgICBjb25zdCB0aW1lcnMgPSBib290Lm1hcCgoW2tpbmQsIHRleHRdLCBpKSA9PlxuICAgICAgc2V0VGltZW91dCgoKSA9PiBkaXNwYXRjaCh7IHR5cGU6IFwiUFJJTlRcIiwgbGluZXM6IFt7IGtpbmQsIHRleHQgfV0gfSksIDI2MCArIGkgKiAxNDApLFxuICAgICk7XG4gICAgcmV0dXJuICgpID0+IHRpbWVycy5mb3JFYWNoKGNsZWFyVGltZW91dCk7XG4gIH0sIFtdKTtcblxuICAvKiAtLS0tLS0tLS0tIGJ1Y2xlIGRlbCBtb3RvciAtLS0tLS0tLS0tICovXG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgY29uc3QgaWQgPSBzZXRJbnRlcnZhbCgoKSA9PiBkaXNwYXRjaCh7IHR5cGU6IFwiVElDS1wiIH0pLCAxMTAwKTtcbiAgICByZXR1cm4gKCkgPT4gY2xlYXJJbnRlcnZhbChpZCk7XG4gIH0sIFtdKTtcblxuICAvKiAtLS0tLS0tLS0tIG1vbml0b3JlcyBSRUFMRVM6IHVubyBwb3IgY2FkYSB3YWxsZXQgZGUgY29uZmlnIC0tLS0tLS0tLS0gKi9cbiAgY29uc3Qgd2FsbGV0S2V5ID1cbiAgICBzdGF0ZS5jZmcucnBjVXJsICsgXCJ8XCIgKyBzdGF0ZS5jZmcud2FsbGV0cy5tYXAoKHcpID0+IHcuYWRkcmVzcykuc29ydCgpLmpvaW4oXCIsXCIpO1xuICB1c2VFZmZlY3QoKCkgPT4ge1xuICAgIGNvbnN0IGRlc2lyZWQgPSBzdGF0ZVJlZi5jdXJyZW50LmNmZy53YWxsZXRzO1xuICAgIGNvbnN0IHJwY1VybCA9IHN0YXRlUmVmLmN1cnJlbnQuY2ZnLnJwY1VybDtcbiAgICBjb25zdCBtb25pdG9ycyA9IG1vbml0b3JzUmVmLmN1cnJlbnQ7XG5cbiAgICAvKiBzaSBjYW1iacOzIGVsIGVuZHBvaW50LCByZWluaWNpYXIgVE9ET1MgY29uIGVsIG51ZXZvICovXG4gICAgZm9yIChjb25zdCBbYWRkciwgbW9uXSBvZiBbLi4ubW9uaXRvcnNdKSB7XG4gICAgICBpZiAobW9uLmN1cnJlbnRScGNVcmwgIT09IHJwY1VybCkge1xuICAgICAgICBtb24uc3RvcCgpO1xuICAgICAgICBtb25pdG9ycy5kZWxldGUoYWRkcik7XG4gICAgICAgIHNldE1vblN0YXR1cygocCkgPT4ge1xuICAgICAgICAgIGNvbnN0IG4gPSB7IC4uLnAgfTtcbiAgICAgICAgICBkZWxldGUgblthZGRyXTtcbiAgICAgICAgICByZXR1cm4gbjtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLyogZGV0ZW5lciBsYXMgcXVlIHlhIG5vIGVzdMOhbiAqL1xuICAgIGZvciAoY29uc3QgW2FkZHIsIG1vbl0gb2YgWy4uLm1vbml0b3JzXSkge1xuICAgICAgaWYgKCFkZXNpcmVkLnNvbWUoKHcpID0+IHcuYWRkcmVzcyA9PT0gYWRkcikpIHtcbiAgICAgICAgbW9uLnN0b3AoKTtcbiAgICAgICAgbW9uaXRvcnMuZGVsZXRlKGFkZHIpO1xuICAgICAgICBzZXRNb25TdGF0dXMoKHApID0+IHtcbiAgICAgICAgICBjb25zdCBuID0geyAuLi5wIH07XG4gICAgICAgICAgZGVsZXRlIG5bYWRkcl07XG4gICAgICAgICAgcmV0dXJuIG47XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8qIGFycmFuY2FyIGxhcyBudWV2YXMgKi9cbiAgICBmb3IgKGNvbnN0IHcgb2YgZGVzaXJlZCkge1xuICAgICAgaWYgKG1vbml0b3JzLmhhcyh3LmFkZHJlc3MpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IG1vbiA9IG5ldyBXYWxsZXRNb25pdG9yKFxuICAgICAgICB3LmFkZHJlc3MsXG4gICAgICAgIHcuYWxpYXMsXG4gICAgICAgIChldikgPT4gZGlzcGF0Y2goeyB0eXBlOiBcIk9OQ0hBSU5fRVZFTlRcIiwgZXZlbnQ6IGV2IH0pLFxuICAgICAgICAoc3QpID0+IHNldE1vblN0YXR1cygocCkgPT4gKHsgLi4ucCwgW3cuYWRkcmVzc106IHN0IH0pKSxcbiAgICAgICAgKG1zZywga2luZCkgPT5cbiAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiUFJJTlRcIiwgbGluZXM6IFt7IGtpbmQ6IGtpbmQgYXMgTG9nS2luZCwgdGV4dDogbXNnIH1dIH0pLFxuICAgICAgICBycGNVcmwsXG4gICAgICApO1xuICAgICAgbW9uaXRvcnMuc2V0KHcuYWRkcmVzcywgbW9uKTtcbiAgICAgIG1vbi5zdGFydCgpO1xuXG4gICAgICAvKiBSRUdMQSAwIOKAlCBzbmFwc2hvdCBSRUFMIGRlIGxvIHF1ZSB5YSB0aWVuZSBsYSB3YWxsZXQuXG4gICAgICAgICBSZXN1ZWx2ZSBsb3Mgc8OtbWJvbG9zIHBhcmEgcXVlIGxhIHBlc3Rhw7FhIElHTk9SQURPUyBzZWEgbGVnaWJsZS4gKi9cbiAgICAgIGlmIChzdGF0ZVJlZi5jdXJyZW50LmNmZy5zbmFwc2hvdEluaWNpYWwpIHtcbiAgICAgICAgdm9pZCBmZXRjaFdhbGxldFRva2VuTWludHMody5hZGRyZXNzLCBycGNVcmwpLnRoZW4oYXN5bmMgKG1pbnRzKSA9PiB7XG4gICAgICAgICAgLyogdGlja2VyIHJlYWw6IEhlbGl1cyBEQVMgKHNpIGhheSBSUEMgcHJvcGlvKSDihpIgSnVwaXRlciDihpIgVU5LTk9XTiAqL1xuICAgICAgICAgIGNvbnN0IHN5bWJvbHMgPSBhd2FpdCByZXNvbHZlU3ltYm9scyhtaW50cywgcnBjVXJsKTtcbiAgICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiU05BUFNIT1RfU0VUXCIsIHdhbGxldDogdy5hZGRyZXNzLCBtaW50cywgYWxpYXM6IHcuYWxpYXMsIHN5bWJvbHMgfSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfSwgW3dhbGxldEtleV0pO1xuXG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgcmV0dXJuICgpID0+IHtcbiAgICAgIGZvciAoY29uc3QgbW9uIG9mIG1vbml0b3JzUmVmLmN1cnJlbnQudmFsdWVzKCkpIG1vbi5zdG9wKCk7XG4gICAgICBtb25pdG9yc1JlZi5jdXJyZW50LmNsZWFyKCk7XG4gICAgfTtcbiAgfSwgW10pO1xuXG4gIC8qIC0tLS0tLS0tLS0gaW1wcmltaXIgZW4gY29uc29sYSAtLS0tLS0tLS0tICovXG4gIGNvbnN0IHByaW50ID0gKGxpbmVzOiBBcnJheTx7IGtpbmQ6IExvZ0tpbmQ7IHRleHQ6IHN0cmluZyB9PikgPT5cbiAgICBkaXNwYXRjaCh7IHR5cGU6IFwiUFJJTlRcIiwgbGluZXMgfSk7XG4gIGNvbnN0IG91dCA9ICh0ZXh0OiBzdHJpbmcsIGtpbmQ6IExvZ0tpbmQgPSBcIm91dFwiKSA9PiBwcmludChbeyBraW5kLCB0ZXh0IH1dKTtcblxuICBjb25zdCBvcGVuRG93bmxvYWRDZW50ZXIgPSAoKSA9PiBzZXREb3dubG9hZE9wZW4odHJ1ZSk7XG5cbiAgLyogLS0tLS0tLS0tLSBhcGxpY2FyIGNvbmZpZy50eHQgLS0tLS0tLS0tLSAqL1xuICBjb25zdCBhcHBseUNvbmZpZyA9ICh0ZXh0OiBzdHJpbmcpOiBib29sZWFuID0+IHtcbiAgICBjb25zdCByZXMgPSBwYXJzZUNvbmZpZyh0ZXh0KTtcbiAgICBpZiAocmVzLmVycm9ycy5sZW5ndGgpIHtcbiAgICAgIHByaW50KFtcbiAgICAgICAge1xuICAgICAgICAgIGtpbmQ6IFwiZXJyXCIsXG4gICAgICAgICAgdGV4dDogYENPTkZJRyAgICAgIOKclyBjb25maWcudHh0IHJlY2hhemFkYSDCtyAke3Jlcy5lcnJvcnMubGVuZ3RofSBlcnJvcihlcykgwrcgc2lndWUgbGEgw7psdGltYSBjb25maWcgdsOhbGlkYWAsXG4gICAgICAgIH0sXG4gICAgICAgIC4uLnJlcy5lcnJvcnMuc2xpY2UoMCwgMykubWFwKChlKSA9PiAoeyBraW5kOiBcImVyclwiIGFzIGNvbnN0LCB0ZXh0OiBgQ09ORklHICAgICAgICAtICR7ZX1gIH0pKSxcbiAgICAgIF0pO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBkaXNwYXRjaCh7IHR5cGU6IFwiQVBQTFlfQ09ORklHXCIsIHRleHQsIGNmZzogcmVzLmNmZyB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuICAvKiAtLS0tLS0tLS0tIGNvbnNvbGEgZGUgY29tYW5kb3MgLS0tLS0tLS0tLSAqL1xuICBjb25zdCBydW5Db21tYW5kID0gKHJhdzogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgcyA9IHN0YXRlUmVmLmN1cnJlbnQ7XG4gICAgcHJpbnQoW3sga2luZDogXCJjbWRcIiwgdGV4dDogcmF3IH1dKTtcbiAgICBjb25zdCBbY21kLCAuLi5hcmdzXSA9IHJhdy50cmltKCkuc3BsaXQoL1xccysvKTtcblxuICAgIHN3aXRjaCAoKGNtZCA/PyBcIlwiKS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgICBjYXNlIFwiaGVscFwiOlxuICAgICAgY2FzZSBcImF5dWRhXCI6XG4gICAgICAgIHByaW50KFtcbiAgICAgICAgICB7IGtpbmQ6IFwic3lzXCIsIHRleHQ6IFwiQ09NQU5ET1MgICAgZGlzcG9uaWJsZXMgZW4gbGEgY29uc29sYTpcIiB9LFxuICAgICAgICAgIC4uLkhFTFAubWFwKChbYywgZF0pID0+ICh7IGtpbmQ6IFwib3V0XCIgYXMgY29uc3QsIHRleHQ6IGAgICR7Yy5wYWRFbmQoMzAsIFwiIFwiKX0gJHtkfWAgfSkpLFxuICAgICAgICBdKTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgXCJjbGVhclwiOlxuICAgICAgY2FzZSBcImNsc1wiOlxuICAgICAgICBkaXNwYXRjaCh7IHR5cGU6IFwiQ0xFQVJfTE9HXCIgfSk7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlIFwiYmFubmVyXCI6XG4gICAgICAgIHByaW50KFt7IGtpbmQ6IFwiYXJ0XCIsIHRleHQ6IEJBTk5FUiB9LCB7IGtpbmQ6IFwic3lzXCIsIHRleHQ6IGAgICAgICAgICAgICAke1RBR0xJTkV9YCB9XSk7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlIFwiZXN0YWRvXCI6XG4gICAgICBjYXNlIFwic3RhdHVzXCI6IHtcbiAgICAgICAgY29uc3Qgc3QgPSBzZXNzaW9uU3RhdHMocy5jbG9zZWQsIHMucG9zaXRpb25zLCBzLnRva2Vucyk7XG4gICAgICAgIHByaW50KFtcbiAgICAgICAgICB7IGtpbmQ6IFwic3lzXCIsIHRleHQ6IGBFU1RBRE8gICAgICBib3Q6ICR7cy5ib3RPbiA/IFwiQUNUSVZPIChjb3BpYW5kbylcIiA6IFwiRU4gUEFVU0FcIn0gwrcgc2xvdCAke3MuYmxvY2sudG9Mb2NhbGVTdHJpbmcoXCJlcy1FU1wiKX1gIH0sXG4gICAgICAgICAgeyBraW5kOiBcIm91dFwiLCB0ZXh0OiBgICAgICAgICAgICAgd2FsbGV0czogJHtzLmNmZy53YWxsZXRzLmxlbmd0aH0gwrcgcG9zaWNpb25lczogJHtzLnBvc2l0aW9ucy5sZW5ndGh9LyR7cy5jZmcubWF4UG9zaXRpb25zfSDCtyByZXNlcnZhICR7cy5yZXNlcnZhU29sLnRvRml4ZWQoMyl9IFNPTCDCtyBVU0RDICR7cy51c2RjLnRvRml4ZWQoMil9YCB9LFxuICAgICAgICAgIHsga2luZDogXCJvdXRcIiwgdGV4dDogYCAgICAgICAgICAgIHBubCBmbG90YW50ZTogJHtmbXRTaWduZWQoc3QudW5yZWFsaXplZCwgNCwgXCIgU09MXCIpfSDCtyB0cmFkZXMgJHtzdC50cmFkZXN9IMK3IHdpbiAke2ZtdFBjdChzdC53aW5SYXRlLCAwKX0gwrcgU09ML1VTRCAkJHtzLnNvbFVzZC50b0ZpeGVkKDIpfWAgfSxcbiAgICAgICAgICB7IGtpbmQ6IFwib3V0XCIsIHRleHQ6IGAgICAgICAgICAgICByZWdsYXM6IFIwICR7cy5jZmcuc25hcHNob3RJbmljaWFsID8gXCJvblwiIDogXCJvZmZcIn0gwrcgUjAuNSAke3MuY2ZnLmZpbHRyb0FudGlEdXN0ID8gXCJvblwiIDogXCJvZmZcIn0gwrcgUjUgJHtzLmNmZy5hdXRvU3dhcFVzZGMgPyBcIm9uXCIgOiBcIm9mZlwifWAgfSxcbiAgICAgICAgICB7IGtpbmQ6IFwib3V0XCIsIHRleHQ6IGAgICAgICAgICAgICBycGM6ICR7cy5jZmcucnBjVXJsID8gXCJwcm9waW8gKDI0LzcpXCIgOiBcInDDumJsaWNvIChwb24gZWwgdHV5byBlbiBjb25maWcudHh0IOKGkiBycGNfdXJsKVwifWAgfSxcbiAgICAgICAgICB7IGtpbmQ6IFwib3V0XCIsIHRleHQ6IGAgICAgICAgICAgICB3ZWJob29rIEhlbGl1czogJHtzc2VMaXZlID8gXCJDT05FQ1RBRE8gYWwgc2Vydmlkb3IgKHB1c2ggZW4gdml2byB2w61hIFJhaWx3YXkpXCIgOiBcInNpbiBzZXJ2aWRvciDigJQgc29sbyBlc2N1Y2hhIGRpcmVjdGEgcG9yIFdlYlNvY2tldFwifWAgfSxcbiAgICAgICAgXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBjYXNlIFwiaW5pY2lhclwiOlxuICAgICAgY2FzZSBcInN0YXJ0XCI6XG4gICAgICAgIGlmICghcy5ib3RPbikgZGlzcGF0Y2goeyB0eXBlOiBcIlRPR0dMRV9CT1RcIiB9KTtcbiAgICAgICAgZWxzZSBvdXQoXCIgICAgICAgICAgICBlbCBib3QgeWEgZXN0w6EgYWN0aXZvXCIsIFwic3lzXCIpO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSBcInBhdXNhXCI6XG4gICAgICBjYXNlIFwicGF1c2FyXCI6XG4gICAgICBjYXNlIFwic3RvcFwiOlxuICAgICAgICBpZiAocy5ib3RPbikgZGlzcGF0Y2goeyB0eXBlOiBcIlRPR0dMRV9CT1RcIiB9KTtcbiAgICAgICAgZWxzZSBvdXQoXCIgICAgICAgICAgICBlbCBib3QgeWEgZXN0w6EgZW4gcGF1c2FcIiwgXCJzeXNcIik7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlIFwicG9zXCI6XG4gICAgICBjYXNlIFwicG9zaWNpb25lc1wiOiB7XG4gICAgICAgIGlmICghcy5wb3NpdGlvbnMubGVuZ3RoKSB7XG4gICAgICAgICAgb3V0KFwiUE9TSUNJT05FUyAgc2luIHBvc2ljaW9uZXMgYWJpZXJ0YXMgwrcgUE9TSUNJT05fQUJJRVJUQVsqXSA9IEZBTFNFXCIpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHByaW50KFtcbiAgICAgICAgICB7IGtpbmQ6IFwic3lzXCIsIHRleHQ6IFwiUE9TSUNJT05FUyAgU0lNQk9MTyAgICBFTlRSQURBICAgICAgIEFIT1JBICAgICAgICAgUE5MICAgICAgIERFXCIgfSxcbiAgICAgICAgICAuLi5zLnBvc2l0aW9ucy5tYXAoKHApID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgcG5sUGN0LCBwcmljZSB9ID0gcG9zaXRpb25QbmwocCwgcy50b2tlbnMpO1xuICAgICAgICAgICAgY29uc3QgYWxpYXMgPSBzLmNmZy53YWxsZXRzLmZpbmQoKHcpID0+IHcuYWRkcmVzcyA9PT0gcC53YWxsZXRBZGRyZXNzKT8uYWxpYXMgPz8gXCLigJRcIjtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGtpbmQ6IFwib3V0XCIgYXMgY29uc3QsXG4gICAgICAgICAgICAgIHRleHQ6IGAgICAgICAgICAgICAke3Auc3ltYm9sLnBhZEVuZCgxMCwgXCIgXCIpLnNsaWNlKDAsIDEwKX0gJHtmbXRQcmljZShwLmVudHJ5UHJpY2UpLnBhZEVuZCgxMywgXCIgXCIpfSAke2ZtdFByaWNlKHByaWNlKS5wYWRFbmQoMTMsIFwiIFwiKX0gJHtmbXRTaWduZWQocG5sUGN0LCAxLCBcIiVcIikucGFkRW5kKDksIFwiIFwiKX0gJHthbGlhc31gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBjYXNlIFwiaGlzdG9yaWFsXCI6IHtcbiAgICAgICAgaWYgKCFzLmNsb3NlZC5sZW5ndGgpIHtcbiAgICAgICAgICBvdXQoXCJISVNUT1JJQUwgICB0b2RhdsOtYSBubyBoYXkgdmVudGFzIGNlcnJhZGFzXCIpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHByaW50KFtcbiAgICAgICAgICB7IGtpbmQ6IFwic3lzXCIsIHRleHQ6IFwiSElTVE9SSUFMICAgU0lNQk9MTyAgICBSRVNVTFRBRE8gICAgICAgICAgICAgTU9USVZPICAgICAgICAgICAgSE9SQVwiIH0sXG4gICAgICAgICAgLi4ucy5jbG9zZWQuc2xpY2UoMCwgMTApLm1hcCgodCkgPT4gKHtcbiAgICAgICAgICAgIGtpbmQ6IFwib3V0XCIgYXMgY29uc3QsXG4gICAgICAgICAgICB0ZXh0OiBgICAgICAgICAgICAgJHt0LnN5bWJvbC5wYWRFbmQoMTAsIFwiIFwiKS5zbGljZSgwLCAxMCl9ICR7KHQucG5sU29sID49IDAgPyBcIkdBTkFOQ0lBIFwiIDogXCJQw4lSRElEQSAgXCIpICsgZm10U2lnbmVkKHQucG5sU29sLCA0LCBcIiBTT0xcIil9ICAgJHt0LnJlYXNvbi5wYWRFbmQoMTcsIFwiIFwiKX0gJHtmbXRUaW1lKHQuY2xvc2VkQXQpfWAsXG4gICAgICAgICAgfSkpLFxuICAgICAgICBdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGNhc2UgXCJ0ZXNvcmVyaWFcIjpcbiAgICAgIGNhc2UgXCJ0ZXNvcmVyw61hXCI6XG4gICAgICBjYXNlIFwiYmFsYW5jZVwiOlxuICAgICAgY2FzZSBcInNhbGRvXCI6IHtcbiAgICAgICAgY29uc3Qgc3QgPSBzZXNzaW9uU3RhdHMocy5jbG9zZWQsIHMucG9zaXRpb25zLCBzLnRva2Vucyk7XG4gICAgICAgIHByaW50KFtcbiAgICAgICAgICB7IGtpbmQ6IFwic3lzXCIsIHRleHQ6IGBURVNPUkVSw41BICAgUkVTRVJWQV9HTE9CQUw6ICR7cy5yZXNlcnZhU29sLnRvRml4ZWQoNCl9IFNPTCDCtyBVU0RDIGFzZWd1cmFkb3MgKFI1KTogJHtzLnVzZGMudG9GaXhlZCgyKX0gwrcgU09ML1VTRCAkJHtzLnNvbFVzZC50b0ZpeGVkKDIpfWAgfSxcbiAgICAgICAgICB7IGtpbmQ6IFwib3V0XCIsIHRleHQ6IGAgICAgICAgICAgICBpbnZlcnRpZG86ICR7cy5wb3NpdGlvbnMucmVkdWNlKChhLCBwKSA9PiBhICsgcC5hbW91bnRTb2wsIDApLnRvRml4ZWQoNCl9IFNPTCDCtyBwbmwgZmxvdGFudGUgJHtmbXRTaWduZWQoc3QudW5yZWFsaXplZCwgNCwgXCIgU09MXCIpfWAgfSxcbiAgICAgICAgICB7IGtpbmQ6IFwib3V0XCIsIHRleHQ6IGAgICAgICAgICAgICBwbmwgcmVhbGl6YWRvOiAke2ZtdFNpZ25lZChzdC5yZWFsaXplZCwgNCwgXCIgU09MXCIpfSDCtyB0cmFkZXMgJHtzdC50cmFkZXN9IMK3IHdpbiAke2ZtdFBjdChzdC53aW5SYXRlLCAwKX1gIH0sXG4gICAgICAgIF0pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgY2FzZSBcIndhbGxldHNcIjoge1xuICAgICAgICBpZiAoIXMuY2ZnLndhbGxldHMubGVuZ3RoKSB7XG4gICAgICAgICAgb3V0KCdXQUxMRVRTICAgICBubyBoYXkgd2FsbGV0cyBlbiBjb25maWcudHh0IMK3IHVzYSBcInNlZ3VpciA8ZGlyZWNjacOzbj5cIicpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHByaW50KFtcbiAgICAgICAgICB7IGtpbmQ6IFwic3lzXCIsIHRleHQ6IFwiV0FMTEVUUyAgICAgQUxJQVMgICAgICAgICAgICBDQVBJVEFMICAgUjEgIFIyICBEVVNUICBTTkFQICAgUE5MKFNPTCkgICAgIFVTRENcIiB9LFxuICAgICAgICAgIC4uLnMuY2ZnLndhbGxldHMubWFwKCh3KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzdCA9IHMud2FsbGV0U3RhdHNbdy5hZGRyZXNzXTtcbiAgICAgICAgICAgIGNvbnN0IHNuYXAgPSBzLnNuYXBzaG90SWdub3JlZFt3LmFkZHJlc3NdPy5sZW5ndGggPz8gMDtcbiAgICAgICAgICAgIGNvbnN0IGR1c3QgPSBzLmR1c3RlZFt3LmFkZHJlc3NdPy5sZW5ndGggPz8gMDtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGtpbmQ6IFwib3V0XCIgYXMgY29uc3QsXG4gICAgICAgICAgICAgIHRleHQ6IGAgICAgICAgICAgICAke3cuYWxpYXMuc2xpY2UoMCwgMTUpLnBhZEVuZCgxNSwgXCIgXCIpfSAke2ZtdFVzZCh3LmNhcGl0YWxVc2QpLnBhZFN0YXJ0KDcsIFwiIFwiKX0gICAke1N0cmluZyhzdD8uY29waWVzID8/IDApLnBhZFN0YXJ0KDIsIFwiIFwiKX0gICR7U3RyaW5nKHN0Py5pZ25vcmVkID8/IDApLnBhZFN0YXJ0KDIsIFwiIFwiKX0gICAke1N0cmluZyhkdXN0KS5wYWRTdGFydCgzLCBcIiBcIil9ICAgJHtTdHJpbmcoc25hcCkucGFkU3RhcnQoMywgXCIgXCIpfSAgJHtmbXRTaWduZWQoc3Q/LnBubFNvbCA/PyAwLCA0KS5wYWRTdGFydCgxMCwgXCIgXCIpfSAgJHsoc3Q/LnVzZGNTZWN1cmVkID8/IDApLnRvRml4ZWQoMil9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSksXG4gICAgICAgIF0pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgY2FzZSBcInNlZ3VpclwiOlxuICAgICAgY2FzZSBcImNvcGlhclwiOiB7XG4gICAgICAgIGNvbnN0IGFkZHIgPSBhcmdzWzBdID8/IFwiXCI7XG4gICAgICAgIGNvbnN0IGFsaWFzID0gYXJnc1sxXSA/PyBhZGRyLnNsaWNlKDAsIDQpICsgXCLigKZcIiArIGFkZHIuc2xpY2UoLTQpO1xuICAgICAgICBjb25zdCB1c2QgPSBhcmdzWzJdICE9PSB1bmRlZmluZWQgPyBwYXJzZUZsb2F0KGFyZ3NbMl0ucmVwbGFjZShcIixcIiwgXCIuXCIpKSA6IDU7XG4gICAgICAgIGlmICghQUREUl9SRS50ZXN0KGFkZHIpKSB7XG4gICAgICAgICAgb3V0KFwiUkFEQVIgICAgICAg4pyXIGVzbyBubyBwYXJlY2UgdW5hIGRpcmVjY2nDs24gZGUgU29sYW5hIMK3IHVzbzogc2VndWlyIDxkaXJlY2Npw7NuPiBbYWxpYXNdIFt1c2RdXCIsIFwiZXJyXCIpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGlmIChOdW1iZXIuaXNOYU4odXNkKSB8fCB1c2QgPCAxIHx8IHVzZCA+IDEwMDAwMDApIHtcbiAgICAgICAgICBvdXQoXCJSQURBUiAgICAgICDinJcgZWwgY2FwaXRhbCBkZWJlIHNlciB1biBuw7ptZXJvIGVuIFVTRCAoZWo6IHNlZ3VpciA8ZGlyPiBNaVRyYWRlciAxNSlcIiwgXCJlcnJcIik7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHMuY2ZnLndhbGxldHMuc29tZSgodykgPT4gdy5hZGRyZXNzID09PSBhZGRyKSkge1xuICAgICAgICAgIG91dChcIlJBREFSICAgICAgIOKclyBlc2Egd2FsbGV0IHlhIGVzdMOhIGVuIGNvbmZpZy50eHRcIiwgXCJlcnJcIik7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgYXBwbHlDb25maWcoYWRkV2FsbGV0TGluZShzLmNvbmZpZ1RleHQsIHsgYWRkcmVzczogYWRkciwgYWxpYXMsIGNhcGl0YWxVc2Q6IHVzZCB9KSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBjYXNlIFwiZGVqYXJcIjoge1xuICAgICAgICBjb25zdCBxID0gYXJnc1swXSA/PyBcIlwiO1xuICAgICAgICBpZiAoIXEpIHtcbiAgICAgICAgICBvdXQoXCJSQURBUiAgICAgICDinJcgdXNvOiBkZWphciA8YWxpYXN8ZGlyZWNjacOzbj5cIiwgXCJlcnJcIik7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzID0gcmVtb3ZlV2FsbGV0TGluZShzLmNvbmZpZ1RleHQsIHEpO1xuICAgICAgICBpZiAoIXJlcy5yZW1vdmVkKSB7XG4gICAgICAgICAgb3V0KGBSQURBUiAgICAgICDinJcgXCIke3F9XCIgbm8gZXN0w6EgZW4gY29uZmlnLnR4dGAsIFwiZXJyXCIpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGFwcGx5Q29uZmlnKHJlcy50ZXh0KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGNhc2UgXCJ2ZW5kZXJcIjpcbiAgICAgIGNhc2UgXCJzZWxsXCI6IHtcbiAgICAgICAgY29uc3Qgc3ltID0gKGFyZ3NbMF0gPz8gXCJcIikudG9VcHBlckNhc2UoKTtcbiAgICAgICAgY29uc3QgcG9zID0gcy5wb3NpdGlvbnMuZmluZCgocCkgPT4gcC5zeW1ib2wudG9VcHBlckNhc2UoKSA9PT0gc3ltKTtcbiAgICAgICAgaWYgKCFwb3MpIHtcbiAgICAgICAgICBvdXQoYFZFTlRBICAgICAgIOKclyBubyBoYXkgbmluZ3VuYSBwb3NpY2nDs24gYWJpZXJ0YSBlbiAkJHtzeW0gfHwgXCI/XCJ9YCwgXCJlcnJcIik7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZGlzcGF0Y2goeyB0eXBlOiBcIkNMT1NFX1BPU0lUSU9OXCIsIGlkOiBwb3MuaWQgfSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBjYXNlIFwiZWRpdGFyXCI6XG4gICAgICBjYXNlIFwiZWRpdFwiOlxuICAgICAgY2FzZSBcImNvbmZpZ1wiOlxuICAgICAgY2FzZSBcIm5hbm9cIjpcbiAgICAgICAgc2V0RWRpdG9yT3Blbih0cnVlKTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgXCJyZWNhcmdhclwiOlxuICAgICAgY2FzZSBcInJlbG9hZFwiOlxuICAgICAgICBhcHBseUNvbmZpZyhzLmNvbmZpZ1RleHQpO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSBcInppcFwiOlxuICAgICAgY2FzZSBcImRlc2Nhcmdhci1ib3RcIjpcbiAgICAgIGNhc2UgXCJleHBvcnRhclwiOlxuICAgICAgICBvcGVuRG93bmxvYWRDZW50ZXIoKTtcbiAgICAgICAgYnJlYWs7XG5cbiAgICAgIGNhc2UgXCJkZXNjYXJnYXJcIjoge1xuICAgICAgICBjb25zdCBibG9iID0gbmV3IEJsb2IoW3MuY29uZmlnVGV4dF0sIHsgdHlwZTogXCJ0ZXh0L3BsYWluO2NoYXJzZXQ9dXRmLThcIiB9KTtcbiAgICAgICAgY29uc3QgdXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcbiAgICAgICAgY29uc3QgYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhXCIpO1xuICAgICAgICBhLmhyZWYgPSB1cmw7XG4gICAgICAgIGEuZG93bmxvYWQgPSBcImNvbmZpZy50eHRcIjtcbiAgICAgICAgYS5jbGljaygpO1xuICAgICAgICBVUkwucmV2b2tlT2JqZWN0VVJMKHVybCk7XG4gICAgICAgIG91dChcIkFSQ0hJVk8gICAgIGNvbmZpZy50eHQgZGVzY2FyZ2FkYSDCtyBlZMOtdGFsYSB5IGPDoXJnYWxhIGNvbiBgZWRpdGFyIOKGkiBDYXJnYXLigKZgXCIpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgY2FzZSBcInJlc2V0XCI6IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShMU19LRVkpO1xuICAgICAgICAgIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKFRPVVJfS0VZKTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgLyogc2luIGFsbWFjZW5hbWllbnRvICovXG4gICAgICAgIH1cbiAgICAgICAgb3V0KFwiU0lTVEVNQSAgICAgcmVpbmljaWFuZG8gZGUgY2Vyb+KAplwiLCBcIndhcm5cIik7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gd2luZG93LmxvY2F0aW9uLnJlbG9hZCgpLCA3MDApO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgb3V0KGBDT05TT0xBICAgICDinJcgY29tYW5kbyBkZXNjb25vY2lkbzogXCIke2NtZH1cIiDCtyBlc2NyaWJlIFwiaGVscFwiYCwgXCJlcnJcIik7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IG9uRWRpdG9yU2F2ZSA9ICh0ZXh0OiBzdHJpbmcpOiBib29sZWFuID0+IHtcbiAgICBjb25zdCBvayA9IGFwcGx5Q29uZmlnKHRleHQpO1xuICAgIGlmIChvaykgc2V0RWRpdG9yT3BlbihmYWxzZSk7XG4gICAgcmV0dXJuIG9rO1xuICB9O1xuXG4gIC8qIGVzdGFkbyBhZ3JlZ2FkbyBkZSBsb3MgbW9uaXRvcmVzIHJlYWxlcyAqL1xuICBjb25zdCB0b3RhbFcgPSBzdGF0ZS5jZmcud2FsbGV0cy5sZW5ndGg7XG4gIGNvbnN0IGxpdmVXID0gc3RhdGUuY2ZnLndhbGxldHMuZmlsdGVyKCh3KSA9PiBtb25TdGF0dXNbdy5hZGRyZXNzXSA9PT0gXCJsaXZlXCIpLmxlbmd0aDtcbiAgY29uc3QgbGl2ZVN0YXR1czogXCJvZmZcIiB8IFwiY29ubmVjdGluZ1wiIHwgXCJsaXZlXCIgfCBcImVycm9yXCIgPVxuICAgIHRvdGFsVyA9PT0gMFxuICAgICAgPyBcIm9mZlwiXG4gICAgICA6IGxpdmVXID09PSB0b3RhbFdcbiAgICAgICAgPyBcImxpdmVcIlxuICAgICAgICA6IE9iamVjdC52YWx1ZXMobW9uU3RhdHVzKS5zb21lKChzKSA9PiBzID09PSBcImVycm9yXCIpXG4gICAgICAgICAgPyBcImVycm9yXCJcbiAgICAgICAgICA6IFwiY29ubmVjdGluZ1wiO1xuXG4gIHJldHVybiAoXG4gICAgPGRpdiBjbGFzc05hbWU9XCJtaW4taC1kdmhcIj5cbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwiYW1iaWVudFwiIC8+XG4gICAgICA8TWF0cml4UmFpbiAvPlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJyZWxhdGl2ZSB6LTEwIGZsZXggbWluLWgtZHZoIGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBwLTIuNSBzbTpwLTVcIj5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJjcnQgYm9vdC1pbiBmbGV4IGgtW2NhbGMoMTAwZHZoLTEuMjVyZW0pXSB3LWZ1bGwgbWF4LXctWzE0NDBweF0gZmxleC1jb2wgb3ZlcmZsb3ctaGlkZGVuIHJvdW5kZWQteGwgYm9yZGVyLTIgYm9yZGVyLWdybi8zMCBiZy13aW4gc2hhZG93LVswXzQwcHhfOTBweF8tMzBweF9yZ2JhKDAsMCwwLDAuOTUpLDBfMF84MHB4Xy0xOHB4X3JnYmEoMCwyNTUsNjUsMC40NSldIHNtOmgtW2NhbGMoMTAwZHZoLTIuNXJlbSldXCI+XG4gICAgICAgICAgPFRpdGxlQmFyXG4gICAgICAgICAgICBib3RPbj17c3RhdGUuYm90T259XG4gICAgICAgICAgICBvblRvZ2dsZUJvdD17KCkgPT4gZGlzcGF0Y2goeyB0eXBlOiBcIlRPR0dMRV9CT1RcIiB9KX1cbiAgICAgICAgICAgIGJsb2NrPXtzdGF0ZS5ibG9ja31cbiAgICAgICAgICAgIGxpdmVTdGF0dXM9e2xpdmVTdGF0dXN9XG4gICAgICAgICAgICBsaXZlQ291bnQ9e2xpdmVXfVxuICAgICAgICAgICAgbGl2ZVRvdGFsPXt0b3RhbFd9XG4gICAgICAgICAgICBycGNMYXRlbmN5PXtycGNMYXRlbmN5fVxuICAgICAgICAgICAgc3NlTGl2ZT17c3NlTGl2ZX1cbiAgICAgICAgICAvPlxuXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IG1pbi1oLTAgZmxleC0xIGZsZXgtY29sIGdhcC0zIG92ZXJmbG93LXktYXV0byBwLTMgbGc6ZmxleC1yb3cgbGc6b3ZlcmZsb3ctaGlkZGVuXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggbWluLWgtMCBmbGV4LWNvbCBnYXAtMyBsZzpmbGV4LVsxLjY1XVwiPlxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaC1bNTR2aF0gbWluLWgtMCBmbGV4LWNvbCBsZzpoLWF1dG8gbGc6ZmxleC0xXCI+XG4gICAgICAgICAgICAgICAgPExvZ1N0cmVhbSBsb2c9e3N0YXRlLmxvZ30gLz5cbiAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgIDxUb2tlblN0cmlwIHRva2Vucz17T2JqZWN0LnZhbHVlcyhzdGF0ZS50b2tlbnMpfSAvPlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8YXNpZGUgY2xhc3NOYW1lPVwic2hyaW5rLTAgcGItMSBsZzp3LVszMzZweF1cIj5cbiAgICAgICAgICAgICAgPFNpZGVQYW5lbHNcbiAgICAgICAgICAgICAgICBzdGF0ZT17c3RhdGV9XG4gICAgICAgICAgICAgICAgb25DbG9zZVBvc2l0aW9uPXsoc3ltKSA9PiBydW5Db21tYW5kKGB2ZW5kZXIgJHtzeW19YCl9XG4gICAgICAgICAgICAgICAgb25FZGl0Q29uZmlnPXsoKSA9PiBzZXRFZGl0b3JPcGVuKHRydWUpfVxuICAgICAgICAgICAgICAgIG9uRG93bmxvYWRaaXA9e29wZW5Eb3dubG9hZENlbnRlcn1cbiAgICAgICAgICAgICAgICBkb3dubG9hZGluZz17ZG93bmxvYWRPcGVufVxuICAgICAgICAgICAgICAgIHNvbD17c29sfVxuICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgPC9hc2lkZT5cbiAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgIDxDb21tYW5kQmFyIG9uQ29tbWFuZD17cnVuQ29tbWFuZH0gLz5cblxuICAgICAgICAgIHtlZGl0b3JPcGVuICYmIChcbiAgICAgICAgICAgIDxDb25maWdFZGl0b3JcbiAgICAgICAgICAgICAgaW5pdGlhbFRleHQ9e3N0YXRlLmNvbmZpZ1RleHR9XG4gICAgICAgICAgICAgIG9uU2F2ZT17b25FZGl0b3JTYXZlfVxuICAgICAgICAgICAgICBvbkNsb3NlPXsoKSA9PiBzZXRFZGl0b3JPcGVuKGZhbHNlKX1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgKX1cblxuICAgICAgICAgIHtzaG93VG91ciAmJiAoXG4gICAgICAgICAgICA8T25ib2FyZGluZ1xuICAgICAgICAgICAgICBvbkRvbmU9e2Nsb3NlVG91cn1cbiAgICAgICAgICAgICAgb25PcGVuQ29uZmlnPXsoKSA9PiB7XG4gICAgICAgICAgICAgICAgY2xvc2VUb3VyKCk7XG4gICAgICAgICAgICAgICAgc2V0RWRpdG9yT3Blbih0cnVlKTtcbiAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgb25Eb3dubG9hZD17KCkgPT4ge1xuICAgICAgICAgICAgICAgIGNsb3NlVG91cigpO1xuICAgICAgICAgICAgICAgIG9wZW5Eb3dubG9hZENlbnRlcigpO1xuICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgLz5cbiAgICAgICAgICApfVxuXG4gICAgICAgICAge2Rvd25sb2FkT3BlbiAmJiAoXG4gICAgICAgICAgICA8RG93bmxvYWRDZW50ZXJcbiAgICAgICAgICAgICAgY29uZmlnVGV4dD17c3RhdGUuY29uZmlnVGV4dH1cbiAgICAgICAgICAgICAgb25DbG9zZT17KCkgPT4gc2V0RG93bmxvYWRPcGVuKGZhbHNlKX1cbiAgICAgICAgICAgICAgb25Mb2c9eyh0ZXh0LCBraW5kKSA9PlxuICAgICAgICAgICAgICAgIHByaW50KFt7IGtpbmQ6IChraW5kID8/IFwic3lzXCIpIGFzIExvZ0tpbmQsIHRleHQgfV0pXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8+XG4gICAgICAgICAgKX1cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgKTtcbn1cbiJdLCJmaWxlIjoiL3dvcmtzcGFjZS9zcmMvQXBwLnRzeCJ9