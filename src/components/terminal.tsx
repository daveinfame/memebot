import { createHotContext as __vite__createHotContext } from "/@vite/client";import.meta.hot = __vite__createHotContext("/src/components/terminal.tsx");import __vite__cjsImport0_react_jsxDevRuntime from "/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=2090559e"; const jsxDEV = __vite__cjsImport0_react_jsxDevRuntime["jsxDEV"];
import * as RefreshRuntime from "/@react-refresh";
const inWebWorker = typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope;
let prevRefreshReg;
let prevRefreshSig;
if (import.meta.hot && !inWebWorker) {
  if (!window.$RefreshReg$) {
    throw new Error(
      "@vitejs/plugin-react can't detect preamble. Something is wrong."
    );
  }
  prevRefreshReg = window.$RefreshReg$;
  prevRefreshSig = window.$RefreshSig$;
  window.$RefreshReg$ = RefreshRuntime.getRefreshReg("/workspace/src/components/terminal.tsx");
  window.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;
}
var _s = $RefreshSig$(), _s2 = $RefreshSig$(), _s3 = $RefreshSig$(), _s4 = $RefreshSig$();
import __vite__cjsImport3_react from "/node_modules/.vite/deps/react.js?v=2090559e"; const useEffect = __vite__cjsImport3_react["useEffect"]; const useMemo = __vite__cjsImport3_react["useMemo"]; const useRef = __vite__cjsImport3_react["useRef"]; const useState = __vite__cjsImport3_react["useState"];
import { fmtPrice, fmtSigned, fmtTime } from "/src/engine.ts";
export function MatrixRain() {
  _s();
  const cols = useMemo(
    () => Array.from({ length: 26 }, (_, i) => ({
      left: i / 26 * 100 + Math.random() * 3,
      dur: 6 + Math.random() * 8,
      delay: -Math.random() * 10,
      opacity: 0.15 + Math.random() * 0.3
    })),
    []
  );
  return /* @__PURE__ */ jsxDEV("div", { className: "rain", "aria-hidden": true, children: cols.map(
    (c, i) => /* @__PURE__ */ jsxDEV(
      "i",
      {
        style: {
          left: `${c.left}%`,
          animationDuration: `${c.dur}s`,
          animationDelay: `${c.delay}s`,
          opacity: c.opacity
        }
      },
      i,
      false,
      {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 39,
        columnNumber: 7
      },
      this
    )
  ) }, void 0, false, {
    fileName: "/workspace/src/components/terminal.tsx",
    lineNumber: 37,
    columnNumber: 5
  }, this);
}
_s(MatrixRain, "IpMPV9yGO71JHnFah39yz2WiFSE=");
_c = MatrixRain;
const LIVE_META = {
  off: { label: "SIN WALLETS", cls: "border-line2 text-dim", dot: "bg-faint" },
  connecting: { label: "CONECTANDO RPC…", cls: "border-cyn/40 text-cyn", dot: "bg-cyn blink-soft" },
  live: { label: "RPC EN VIVO", cls: "border-grn/40 text-grn", dot: "bg-grn led-on" },
  error: { label: "RPC SIN SEÑAL", cls: "border-red/40 text-red", dot: "bg-red blink-soft" }
};
export function TitleBar({
  botOn,
  onToggleBot,
  block,
  liveStatus,
  liveCount,
  liveTotal,
  rpcLatency,
  sseLive = false
}) {
  _s2();
  const [clock, setClock] = useState(() => /* @__PURE__ */ new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(/* @__PURE__ */ new Date()), 1e3);
    return () => clearInterval(id);
  }, []);
  const meta = LIVE_META[liveStatus];
  const latCls = rpcLatency === null ? "text-red" : rpcLatency < 400 ? "text-grn" : rpcLatency < 900 ? "text-ylw" : "text-red";
  const latLabel = rpcLatency === null ? "—" : `${rpcLatency}ms`;
  return /* @__PURE__ */ jsxDEV("div", { className: "flex items-center gap-3 border-b border-line bg-pane/90 px-4 py-2.5", children: [
    /* @__PURE__ */ jsxDEV("div", { className: "flex items-center gap-2.5", children: [
      /* @__PURE__ */ jsxDEV("span", { className: "flex h-4 items-end gap-[3px]", "aria-hidden": true, children: [
        /* @__PURE__ */ jsxDEV("i", { className: "eq-bar h-4 w-[3px] rounded-sm bg-grn [box-shadow:0_0_8px_rgba(0,255,65,0.8)]" }, void 0, false, {
          fileName: "/workspace/src/components/terminal.tsx",
          lineNumber: 96,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("i", { className: "eq-bar h-4 w-[3px] rounded-sm bg-grn/75", style: { animationDelay: "0.28s" } }, void 0, false, {
          fileName: "/workspace/src/components/terminal.tsx",
          lineNumber: 97,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("i", { className: "eq-bar h-4 w-[3px] rounded-sm bg-grn/55", style: { animationDelay: "0.56s" } }, void 0, false, {
          fileName: "/workspace/src/components/terminal.tsx",
          lineNumber: 98,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 95,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("span", { className: "font-crt text-[16px] font-bold tracking-[0.22em] text-grn [text-shadow:0_0_14px_rgba(0,255,65,0.55)]", children: "MEMEBOT" }, void 0, false, {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 100,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("span", { className: "hidden rounded border border-line px-1.5 py-px font-crt text-[11px] tracking-widest text-faint sm:inline", children: "v3.2" }, void 0, false, {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 103,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "/workspace/src/components/terminal.tsx",
      lineNumber: 94,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "flex-1" }, void 0, false, {
      fileName: "/workspace/src/components/terminal.tsx",
      lineNumber: 108,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "hidden items-center gap-4 font-crt text-[14px] tracking-wider text-dim md:flex", children: [
      /* @__PURE__ */ jsxDEV(
        "span",
        {
          title: sseLive ? "Webhook de Helius CONECTADO: el servidor (Railway) empuja cada transacción en tiempo real" : "Sin servidor de webhooks: el bot escucha directo por WebSocket. Despliega en Railway para push 24/7",
          className: `flex items-center gap-1 ${sseLive ? "text-grn" : "text-faint"}`,
          children: [
            /* @__PURE__ */ jsxDEV("span", { className: `h-1.5 w-1.5 rounded-full ${sseLive ? "bg-grn led-on" : "bg-faint"}` }, void 0, false, {
              fileName: "/workspace/src/components/terminal.tsx",
              lineNumber: 119,
              columnNumber: 11
            }, this),
            "WH"
          ]
        },
        void 0,
        true,
        {
          fileName: "/workspace/src/components/terminal.tsx",
          lineNumber: 111,
          columnNumber: 9
        },
        this
      ),
      /* @__PURE__ */ jsxDEV("span", { title: "Latencia del RPC", className: "flex items-center gap-1", children: [
        "RPC ",
        /* @__PURE__ */ jsxDEV("span", { className: `tabular-nums ${latCls}`, children: latLabel }, void 0, false, {
          fileName: "/workspace/src/components/terminal.tsx",
          lineNumber: 123,
          columnNumber: 15
        }, this)
      ] }, void 0, true, {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 122,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("span", { children: [
        "SLOT ",
        /* @__PURE__ */ jsxDEV("span", { className: "text-txt/80 tabular-nums", children: block.toLocaleString("es-ES") }, void 0, false, {
          fileName: "/workspace/src/components/terminal.tsx",
          lineNumber: 126,
          columnNumber: 16
        }, this)
      ] }, void 0, true, {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 125,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("span", { className: "tabular-nums", children: clock.toLocaleTimeString("es-ES", { hour12: false }) }, void 0, false, {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 128,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "/workspace/src/components/terminal.tsx",
      lineNumber: 110,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDEV(
      "div",
      {
        title: liveStatus === "live" ? `${liveCount}/${liveTotal} wallet(s) escuchadas en mainnet en tiempo real` : liveStatus === "off" ? "Añade una wallet para escuchar la blockchain" : liveStatus === "error" ? "Sin conexión al RPC de Solana" : "Conectando…",
        className: `flex items-center gap-2 rounded-md border px-2.5 py-1 font-crt text-[13px] tracking-[0.12em] ${meta.cls}`,
        children: [
          /* @__PURE__ */ jsxDEV("span", { className: `h-2 w-2 rounded-full ${meta.dot}` }, void 0, false, {
            fileName: "/workspace/src/components/terminal.tsx",
            lineNumber: 143,
            columnNumber: 9
          }, this),
          meta.label,
          liveStatus !== "off" && /* @__PURE__ */ jsxDEV("span", { className: "tabular-nums opacity-80", children: [
            liveCount,
            "/",
            liveTotal
          ] }, void 0, true, {
            fileName: "/workspace/src/components/terminal.tsx",
            lineNumber: 146,
            columnNumber: 9
          }, this)
        ]
      },
      void 0,
      true,
      {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 131,
        columnNumber: 7
      },
      this
    ),
    /* @__PURE__ */ jsxDEV(
      "button",
      {
        onClick: onToggleBot,
        className: `flex items-center gap-2 rounded-md border px-3 py-1.5 font-crt text-[14px] tracking-[0.14em] transition-all duration-200 active:scale-95 ${botOn ? "border-grn/40 bg-grn/10 text-grn hover:bg-grn/20 [box-shadow:0_0_18px_-6px_rgba(0,255,65,0.6)]" : "border-ylw/40 bg-ylw/10 text-ylw hover:bg-ylw/20"}`,
        children: [
          /* @__PURE__ */ jsxDEV("span", { className: `h-2 w-2 rounded-full ${botOn ? "bg-grn led-on" : "bg-ylw blink-soft"}` }, void 0, false, {
            fileName: "/workspace/src/components/terminal.tsx",
            lineNumber: 160,
            columnNumber: 9
          }, this),
          botOn ? "EN VIVO" : "EN PAUSA"
        ]
      },
      void 0,
      true,
      {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 152,
        columnNumber: 7
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/workspace/src/components/terminal.tsx",
    lineNumber: 93,
    columnNumber: 5
  }, this);
}
_s2(TitleBar, "rM4JKjfC/bq/ygcq50wQuKTCUsU=");
_c2 = TitleBar;
const COLOR = {
  art: "text-grn font-crt text-[15px] leading-[1.05] [text-shadow:0_0_18px_rgba(0,255,65,0.4)]",
  sys: "text-dim",
  ok: "text-grn",
  buy: "text-grn font-medium [text-shadow:0_0_12px_rgba(0,255,65,0.35)]",
  sell: "text-cyn font-medium [text-shadow:0_0_12px_rgba(92,255,176,0.3)]",
  dca: "text-ylw/80 italic",
  tp: "text-grn font-medium",
  sl: "text-red font-medium",
  warn: "text-ylw",
  err: "text-red",
  cmd: "text-txt",
  out: "text-txt/70",
  mkt: "text-cyn/60",
  dust: "text-faint",
  ignore: "text-faint italic"
};
export function LogStream({ log }) {
  _s3();
  const boxRef = useRef(null);
  const [tab, setTab] = useState("main");
  const [stuck, setStuck] = useState(true);
  const main = log.filter((l) => l.kind !== "dust" && l.kind !== "ignore");
  const dust = log.filter((l) => l.kind === "dust");
  const ignored = log.filter((l) => l.kind === "ignore");
  const shown = tab === "main" ? main : tab === "dust" ? dust : ignored;
  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;
    setStuck(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  };
  useEffect(() => {
    const el = boxRef.current;
    if (el && stuck) el.scrollTop = el.scrollHeight;
  }, [shown.length, stuck, tab]);
  const tabBtn = (t, label, count, accent) => /* @__PURE__ */ jsxDEV(
    "button",
    {
      onClick: () => setTab(t),
      className: `flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-crt text-[12.5px] tracking-wider transition-all ${tab === t ? `${accent} border-current bg-grn/5` : "border-line text-faint hover:text-dim hover:border-line2"}`,
      children: [
        label,
        /* @__PURE__ */ jsxDEV("span", { className: "rounded bg-black/40 px-1 text-[11px] tabular-nums", children: count }, void 0, false, {
          fileName: "/workspace/src/components/terminal.tsx",
          lineNumber: 219,
          columnNumber: 7
        }, this)
      ]
    },
    void 0,
    true,
    {
      fileName: "/workspace/src/components/terminal.tsx",
      lineNumber: 210,
      columnNumber: 3
    },
    this
  );
  return /* @__PURE__ */ jsxDEV("div", { className: "panel relative flex min-h-0 flex-1 flex-col overflow-hidden", children: [
    /* @__PURE__ */ jsxDEV("div", { className: "flex items-center gap-2 border-b border-line px-4 py-2", children: [
      /* @__PURE__ */ jsxDEV("span", { className: "panel-title", children: "~/bot/salida.log" }, void 0, false, {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 226,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("span", { className: "h-px flex-1 bg-line" }, void 0, false, {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 227,
        columnNumber: 9
      }, this),
      tabBtn("main", "PRINCIPAL", main.length, "text-grn"),
      tabBtn("dust", "DUST.LOG", dust.length, "text-ylw"),
      tabBtn("ignore", "IGNORADOS", ignored.length, "text-cyn"),
      /* @__PURE__ */ jsxDEV("span", { className: "hidden items-center gap-1.5 text-[10px] font-medium tracking-[0.14em] text-dim sm:flex", children: [
        /* @__PURE__ */ jsxDEV("span", { className: "h-1.5 w-1.5 rounded-full bg-grn blink-soft" }, void 0, false, {
          fileName: "/workspace/src/components/terminal.tsx",
          lineNumber: 232,
          columnNumber: 11
        }, this),
        "TAIL -F"
      ] }, void 0, true, {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 231,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "/workspace/src/components/terminal.tsx",
      lineNumber: 225,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDEV(
      "div",
      {
        ref: boxRef,
        onScroll,
        className: "min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[1.7]",
        children: [
          shown.length === 0 && /* @__PURE__ */ jsxDEV("p", { className: "mt-6 text-center text-[11px] text-faint", children: tab === "main" ? "— esperando COMPRAS y VENTAS VÁLIDAS de tu wallet —" : tab === "dust" ? "— sin airdrops/dusting registrados —" : "— sin tokens ignorados (snapshot R0) ni promedios descartados —" }, void 0, false, {
            fileName: "/workspace/src/components/terminal.tsx",
            lineNumber: 243,
            columnNumber: 9
          }, this),
          shown.map(
            (l) => /* @__PURE__ */ jsxDEV("div", { className: `line-in whitespace-pre-wrap break-words ${COLOR[l.kind]}`, children: [
              l.kind !== "art" && /* @__PURE__ */ jsxDEV("span", { className: "mr-2.5 select-none text-faint/70", children: fmtTime(l.ts) }, void 0, false, {
                fileName: "/workspace/src/components/terminal.tsx",
                lineNumber: 253,
                columnNumber: 34
              }, this),
              l.kind === "cmd" && /* @__PURE__ */ jsxDEV("span", { className: "mr-1.5 text-grn", children: "❯" }, void 0, false, {
                fileName: "/workspace/src/components/terminal.tsx",
                lineNumber: 254,
                columnNumber: 34
              }, this),
              l.text
            ] }, l.id, true, {
              fileName: "/workspace/src/components/terminal.tsx",
              lineNumber: 252,
              columnNumber: 9
            }, this)
          ),
          /* @__PURE__ */ jsxDEV("div", { className: "h-2" }, void 0, false, {
            fileName: "/workspace/src/components/terminal.tsx",
            lineNumber: 258,
            columnNumber: 9
          }, this)
        ]
      },
      void 0,
      true,
      {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 237,
        columnNumber: 7
      },
      this
    ),
    !stuck && /* @__PURE__ */ jsxDEV(
      "button",
      {
        onClick: () => {
          const el = boxRef.current;
          if (el) el.scrollTop = el.scrollHeight;
          setStuck(true);
        },
        className: "pop-in absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-line2 bg-raise px-3.5 py-1 font-crt text-[13px] tracking-widest text-grn shadow-[0_0_20px_-4px_rgba(0,255,65,0.45)] transition-transform hover:scale-105",
        children: "▼ abajo"
      },
      void 0,
      false,
      {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 262,
        columnNumber: 7
      },
      this
    )
  ] }, void 0, true, {
    fileName: "/workspace/src/components/terminal.tsx",
    lineNumber: 224,
    columnNumber: 5
  }, this);
}
_s3(LogStream, "Rm/KeI/AiFlpgl7cfOmWnIQkovU=");
_c3 = LogStream;
export function TokenStrip({ tokens }) {
  if (!tokens.length) return null;
  const items = [...tokens, ...tokens];
  return /* @__PURE__ */ jsxDEV("div", { className: "relative overflow-hidden border-t border-line bg-pane/70", children: [
    /* @__PURE__ */ jsxDEV("div", { className: "ticker-track py-1.5", children: items.map((t, i) => {
      const chg = (t.price - t.history[0]) / (t.history[0] || 1) * 100;
      const up = chg >= 0;
      return /* @__PURE__ */ jsxDEV("span", { className: "flex items-center gap-2 whitespace-nowrap px-5 font-mono text-[10.5px]", children: [
        /* @__PURE__ */ jsxDEV("span", { className: "font-semibold text-txt/85", children: [
          "$",
          t.symbol
        ] }, void 0, true, {
          fileName: "/workspace/src/components/terminal.tsx",
          lineNumber: 289,
          columnNumber: 15
        }, this),
        /* @__PURE__ */ jsxDEV("span", { className: "text-dim tabular-nums", children: fmtPrice(t.price) }, void 0, false, {
          fileName: "/workspace/src/components/terminal.tsx",
          lineNumber: 290,
          columnNumber: 15
        }, this),
        /* @__PURE__ */ jsxDEV("span", { className: `tabular-nums ${up ? "text-grn" : "text-red"}`, children: fmtSigned(chg, 1, "%") }, void 0, false, {
          fileName: "/workspace/src/components/terminal.tsx",
          lineNumber: 291,
          columnNumber: 15
        }, this),
        /* @__PURE__ */ jsxDEV("span", { className: "text-faint", children: "·" }, void 0, false, {
          fileName: "/workspace/src/components/terminal.tsx",
          lineNumber: 292,
          columnNumber: 15
        }, this)
      ] }, `${t.mint}-${i}`, true, {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 288,
        columnNumber: 13
      }, this);
    }) }, void 0, false, {
      fileName: "/workspace/src/components/terminal.tsx",
      lineNumber: 283,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "pointer-events-none absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-win to-transparent" }, void 0, false, {
      fileName: "/workspace/src/components/terminal.tsx",
      lineNumber: 297,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-win to-transparent" }, void 0, false, {
      fileName: "/workspace/src/components/terminal.tsx",
      lineNumber: 298,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "/workspace/src/components/terminal.tsx",
    lineNumber: 282,
    columnNumber: 5
  }, this);
}
_c4 = TokenStrip;
const HINTS = ["help", "pos", "wallets", "tesoreria", "editar", "zip", "reset"];
export function CommandBar({ onCommand }) {
  _s4();
  const [value, setValue] = useState("");
  const history = useRef([]);
  const hIdx = useRef(-1);
  const inputRef = useRef(null);
  const submit = () => {
    const cmd = value.trim();
    if (!cmd) return;
    history.current = [cmd, ...history.current.filter((h) => h !== cmd)].slice(0, 40);
    hIdx.current = -1;
    onCommand(cmd);
    setValue("");
  };
  const onKey = (e) => {
    if (e.key === "Enter") submit();
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.current.length) {
        hIdx.current = Math.min(hIdx.current + 1, history.current.length - 1);
        setValue(history.current[hIdx.current]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      hIdx.current = Math.max(hIdx.current - 1, -1);
      setValue(hIdx.current === -1 ? "" : history.current[hIdx.current]);
    }
  };
  return /* @__PURE__ */ jsxDEV("div", { className: "border-t border-line bg-pane/90 px-4 py-2.5", children: [
    /* @__PURE__ */ jsxDEV("div", { className: "mb-2 flex items-center gap-1.5 overflow-x-auto", children: [
      /* @__PURE__ */ jsxDEV("span", { className: "shrink-0 text-[9px] font-medium tracking-[0.16em] text-faint", children: "COMANDOS:" }, void 0, false, {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 339,
        columnNumber: 9
      }, this),
      HINTS.map(
        (h) => /* @__PURE__ */ jsxDEV(
          "button",
          {
            onClick: () => {
              setValue(h);
              inputRef.current?.focus();
            },
            className: "shrink-0 rounded border border-line px-2 py-0.5 font-mono text-[10px] text-dim transition-all hover:border-grn/50 hover:text-grn",
            children: h
          },
          h,
          false,
          {
            fileName: "/workspace/src/components/terminal.tsx",
            lineNumber: 341,
            columnNumber: 9
          },
          this
        )
      )
    ] }, void 0, true, {
      fileName: "/workspace/src/components/terminal.tsx",
      lineNumber: 338,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "flex cursor-text items-center gap-2", onClick: () => inputRef.current?.focus(), children: [
      /* @__PURE__ */ jsxDEV("span", { className: "font-mono text-[13px] font-bold text-grn", children: "memebot" }, void 0, false, {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 354,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("span", { className: "font-mono text-[13px] text-faint", children: "❯" }, void 0, false, {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 355,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV(
        "input",
        {
          ref: inputRef,
          value,
          onChange: (e) => setValue(e.target.value),
          onKeyDown: onKey,
          spellCheck: false,
          autoCapitalize: "off",
          autoComplete: "off",
          "aria-label": "consola de comandos",
          placeholder: 'escribe "help" · ↑↓ historial',
          className: "min-w-0 flex-1 bg-transparent font-mono text-[13px] text-txt outline-none placeholder:text-faint/70",
          style: { caretColor: "#00ff41" }
        },
        void 0,
        false,
        {
          fileName: "/workspace/src/components/terminal.tsx",
          lineNumber: 356,
          columnNumber: 9
        },
        this
      ),
      /* @__PURE__ */ jsxDEV("span", { className: "cursor-blink select-none font-mono text-[13px] text-grn", children: "▊" }, void 0, false, {
        fileName: "/workspace/src/components/terminal.tsx",
        lineNumber: 369,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "/workspace/src/components/terminal.tsx",
      lineNumber: 353,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "/workspace/src/components/terminal.tsx",
    lineNumber: 337,
    columnNumber: 5
  }, this);
}
_s4(CommandBar, "Ga5xfvbnNp5uKzqX8MVGzTlKjcs=");
_c5 = CommandBar;
var _c, _c2, _c3, _c4, _c5;
$RefreshReg$(_c, "MatrixRain");
$RefreshReg$(_c2, "TitleBar");
$RefreshReg$(_c3, "LogStream");
$RefreshReg$(_c4, "TokenStrip");
$RefreshReg$(_c5, "CommandBar");
if (import.meta.hot && !inWebWorker) {
  window.$RefreshReg$ = prevRefreshReg;
  window.$RefreshSig$ = prevRefreshSig;
}
if (import.meta.hot && !inWebWorker) {
  RefreshRuntime.__hmr_import(import.meta.url).then((currentExports) => {
    RefreshRuntime.registerExportsForReactRefresh("/workspace/src/components/terminal.tsx", currentExports);
    import.meta.hot.accept((nextExports) => {
      if (!nextExports) return;
      const invalidateMessage = RefreshRuntime.validateRefreshBoundaryAndEnqueueUpdate("/workspace/src/components/terminal.tsx", currentExports, nextExports);
      if (invalidateMessage) import.meta.hot.invalidate(invalidateMessage);
    });
  });
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJtYXBwaW5ncyI6IkFBbUJROzs7Ozs7Ozs7Ozs7Ozs7OztBQW5CUixTQUFTQSxXQUFXQyxTQUFTQyxRQUFRQyxnQkFBZ0I7QUFFckQsU0FBU0MsVUFBVUMsV0FBV0MsZUFBZTtBQUd0QyxnQkFBU0MsYUFBYTtBQUFBQyxLQUFBO0FBQzNCLFFBQU1DLE9BQU9SO0FBQUFBLElBQ1gsTUFDRVMsTUFBTUMsS0FBSyxFQUFFQyxRQUFRLEdBQUcsR0FBRyxDQUFDQyxHQUFHQyxPQUFPO0FBQUEsTUFDcENDLE1BQU9ELElBQUksS0FBTSxNQUFNRSxLQUFLQyxPQUFPLElBQUk7QUFBQSxNQUN2Q0MsS0FBSyxJQUFJRixLQUFLQyxPQUFPLElBQUk7QUFBQSxNQUN6QkUsT0FBTyxDQUFDSCxLQUFLQyxPQUFPLElBQUk7QUFBQSxNQUN4QkcsU0FBUyxPQUFPSixLQUFLQyxPQUFPLElBQUk7QUFBQSxJQUNsQyxFQUFFO0FBQUEsSUFDSjtBQUFBLEVBQ0Y7QUFDQSxTQUNFLHVCQUFDLFNBQUksV0FBVSxRQUFPLGVBQVcsTUFDOUJSLGVBQUtZO0FBQUFBLElBQUksQ0FBQ0MsR0FBR1IsTUFDWjtBQUFBLE1BQUM7QUFBQTtBQUFBLFFBRUMsT0FBTztBQUFBLFVBQ0xDLE1BQU0sR0FBR08sRUFBRVAsSUFBSTtBQUFBLFVBQ2ZRLG1CQUFtQixHQUFHRCxFQUFFSixHQUFHO0FBQUEsVUFDM0JNLGdCQUFnQixHQUFHRixFQUFFSCxLQUFLO0FBQUEsVUFDMUJDLFNBQVNFLEVBQUVGO0FBQUFBLFFBQ2I7QUFBQTtBQUFBLE1BTktOO0FBQUFBLE1BRFA7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQU9JO0FBQUEsRUFFTCxLQVhIO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FZQTtBQUVKO0FBRUFOLEdBNUJnQkQsWUFBVTtBQUFBLEtBQVZBO0FBNkJoQixNQUFNa0IsWUFBWTtBQUFBLEVBQ2hCQyxLQUFLLEVBQUVDLE9BQU8sZUFBZUMsS0FBSyx5QkFBeUJDLEtBQUssV0FBVztBQUFBLEVBQzNFQyxZQUFZLEVBQUVILE9BQU8sbUJBQW1CQyxLQUFLLDBCQUEwQkMsS0FBSyxvQkFBb0I7QUFBQSxFQUNoR0UsTUFBTSxFQUFFSixPQUFPLGVBQWVDLEtBQUssMEJBQTBCQyxLQUFLLGdCQUFnQjtBQUFBLEVBQ2xGRyxPQUFPLEVBQUVMLE9BQU8saUJBQWlCQyxLQUFLLDBCQUEwQkMsS0FBSyxvQkFBb0I7QUFDM0Y7QUFFTyxnQkFBU0ksU0FBUztBQUFBLEVBQ3ZCQztBQUFBQSxFQUNBQztBQUFBQSxFQUNBQztBQUFBQSxFQUNBQztBQUFBQSxFQUNBQztBQUFBQSxFQUNBQztBQUFBQSxFQUNBQztBQUFBQSxFQUNBQyxVQUFVO0FBV1osR0FBRztBQUFBQyxNQUFBO0FBQ0QsUUFBTSxDQUFDQyxPQUFPQyxRQUFRLElBQUl6QyxTQUFTLE1BQU0sb0JBQUkwQyxLQUFLLENBQUM7QUFDbkQ3QyxZQUFVLE1BQU07QUFDZCxVQUFNOEMsS0FBS0MsWUFBWSxNQUFNSCxTQUFTLG9CQUFJQyxLQUFLLENBQUMsR0FBRyxHQUFJO0FBQ3ZELFdBQU8sTUFBTUcsY0FBY0YsRUFBRTtBQUFBLEVBQy9CLEdBQUcsRUFBRTtBQUVMLFFBQU1HLE9BQU94QixVQUFVWSxVQUFVO0FBQ2pDLFFBQU1hLFNBQ0pWLGVBQWUsT0FBTyxhQUFhQSxhQUFhLE1BQU0sYUFBYUEsYUFBYSxNQUFNLGFBQWE7QUFDckcsUUFBTVcsV0FBV1gsZUFBZSxPQUFPLE1BQU0sR0FBR0EsVUFBVTtBQUUxRCxTQUNFLHVCQUFDLFNBQUksV0FBVSx1RUFDYjtBQUFBLDJCQUFDLFNBQUksV0FBVSw2QkFDYjtBQUFBLDZCQUFDLFVBQUssV0FBVSxnQ0FBK0IsZUFBVyxNQUN4RDtBQUFBLCtCQUFDLE9BQUUsV0FBVSxrRkFBYjtBQUFBO0FBQUE7QUFBQTtBQUFBLGVBQTJGO0FBQUEsUUFDM0YsdUJBQUMsT0FBRSxXQUFVLDJDQUEwQyxPQUFPLEVBQUVoQixnQkFBZ0IsUUFBUSxLQUF4RjtBQUFBO0FBQUE7QUFBQTtBQUFBLGVBQTBGO0FBQUEsUUFDMUYsdUJBQUMsT0FBRSxXQUFVLDJDQUEwQyxPQUFPLEVBQUVBLGdCQUFnQixRQUFRLEtBQXhGO0FBQUE7QUFBQTtBQUFBO0FBQUEsZUFBMEY7QUFBQSxXQUg1RjtBQUFBO0FBQUE7QUFBQTtBQUFBLGFBSUE7QUFBQSxNQUNBLHVCQUFDLFVBQUssV0FBVSx3R0FBc0csdUJBQXRIO0FBQUE7QUFBQTtBQUFBO0FBQUEsYUFFQTtBQUFBLE1BQ0EsdUJBQUMsVUFBSyxXQUFVLDRHQUEwRyxvQkFBMUg7QUFBQTtBQUFBO0FBQUE7QUFBQSxhQUVBO0FBQUEsU0FYRjtBQUFBO0FBQUE7QUFBQTtBQUFBLFdBWUE7QUFBQSxJQUVBLHVCQUFDLFNBQUksV0FBVSxZQUFmO0FBQUE7QUFBQTtBQUFBO0FBQUEsV0FBdUI7QUFBQSxJQUV2Qix1QkFBQyxTQUFJLFdBQVUsa0ZBQ2I7QUFBQTtBQUFBLFFBQUM7QUFBQTtBQUFBLFVBQ0MsT0FDRWlCLFVBQ0ksOEZBQ0E7QUFBQSxVQUVOLFdBQVcsMkJBQTJCQSxVQUFVLGFBQWEsWUFBWTtBQUFBLFVBRXpFO0FBQUEsbUNBQUMsVUFBSyxXQUFXLDRCQUE0QkEsVUFBVSxrQkFBa0IsVUFBVSxNQUFuRjtBQUFBO0FBQUE7QUFBQTtBQUFBLG1CQUFzRjtBQUFBO0FBQUE7QUFBQTtBQUFBLFFBUnhGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQVVBO0FBQUEsTUFDQSx1QkFBQyxVQUFLLE9BQU0sb0JBQW1CLFdBQVUsMkJBQXlCO0FBQUE7QUFBQSxRQUM1RCx1QkFBQyxVQUFLLFdBQVcsZ0JBQWdCUyxNQUFNLElBQUtDLHNCQUE1QztBQUFBO0FBQUE7QUFBQTtBQUFBLGVBQXFEO0FBQUEsV0FEM0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxhQUVBO0FBQUEsTUFDQSx1QkFBQyxVQUFJO0FBQUE7QUFBQSxRQUNFLHVCQUFDLFVBQUssV0FBVSw0QkFBNEJmLGdCQUFNZ0IsZUFBZSxPQUFPLEtBQXhFO0FBQUE7QUFBQTtBQUFBO0FBQUEsZUFBMEU7QUFBQSxXQURqRjtBQUFBO0FBQUE7QUFBQTtBQUFBLGFBRUE7QUFBQSxNQUNBLHVCQUFDLFVBQUssV0FBVSxnQkFBZ0JULGdCQUFNVSxtQkFBbUIsU0FBUyxFQUFFQyxRQUFRLE1BQU0sQ0FBQyxLQUFuRjtBQUFBO0FBQUE7QUFBQTtBQUFBLGFBQXFGO0FBQUEsU0FsQnZGO0FBQUE7QUFBQTtBQUFBO0FBQUEsV0FtQkE7QUFBQSxJQUVBO0FBQUEsTUFBQztBQUFBO0FBQUEsUUFDQyxPQUNFakIsZUFBZSxTQUNYLEdBQUdDLFNBQVMsSUFBSUMsU0FBUyxvREFDekJGLGVBQWUsUUFDYixpREFDQUEsZUFBZSxVQUNiLGtDQUNBO0FBQUEsUUFFVixXQUFXLGdHQUFnR1ksS0FBS3JCLEdBQUc7QUFBQSxRQUVuSDtBQUFBLGlDQUFDLFVBQUssV0FBVyx3QkFBd0JxQixLQUFLcEIsR0FBRyxNQUFqRDtBQUFBO0FBQUE7QUFBQTtBQUFBLGlCQUFvRDtBQUFBLFVBQ25Eb0IsS0FBS3RCO0FBQUFBLFVBQ0xVLGVBQWUsU0FDZCx1QkFBQyxVQUFLLFdBQVUsMkJBQ2JDO0FBQUFBO0FBQUFBLFlBQVU7QUFBQSxZQUFFQztBQUFBQSxlQURmO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBRUE7QUFBQTtBQUFBO0FBQUEsTUFqQko7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBbUJBO0FBQUEsSUFFQTtBQUFBLE1BQUM7QUFBQTtBQUFBLFFBQ0MsU0FBU0o7QUFBQUEsUUFDVCxXQUFXLDRJQUNURCxRQUNJLG1HQUNBLGtEQUFrRDtBQUFBLFFBR3hEO0FBQUEsaUNBQUMsVUFBSyxXQUFXLHdCQUF3QkEsUUFBUSxrQkFBa0IsbUJBQW1CLE1BQXRGO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQXlGO0FBQUEsVUFDeEZBLFFBQVEsWUFBWTtBQUFBO0FBQUE7QUFBQSxNQVR2QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFVQTtBQUFBLE9BckVGO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FzRUE7QUFFSjtBQUVBUSxJQTFHZ0JULFVBQVE7QUFBQSxNQUFSQTtBQTJHaEIsTUFBTXNCLFFBQWlDO0FBQUEsRUFDckNDLEtBQUs7QUFBQSxFQUNMQyxLQUFLO0FBQUEsRUFDTEMsSUFBSTtBQUFBLEVBQ0pDLEtBQUs7QUFBQSxFQUNMQyxNQUFNO0FBQUEsRUFDTkMsS0FBSztBQUFBLEVBQ0xDLElBQUk7QUFBQSxFQUNKQyxJQUFJO0FBQUEsRUFDSkMsTUFBTTtBQUFBLEVBQ05DLEtBQUs7QUFBQSxFQUNMQyxLQUFLO0FBQUEsRUFDTEMsS0FBSztBQUFBLEVBQ0xDLEtBQUs7QUFBQSxFQUNMQyxNQUFNO0FBQUEsRUFDTkMsUUFBUTtBQUNWO0FBSU8sZ0JBQVNDLFVBQVUsRUFBRUMsSUFBd0IsR0FBRztBQUFBQyxNQUFBO0FBQ3JELFFBQU1DLFNBQVN4RSxPQUF1QixJQUFJO0FBQzFDLFFBQU0sQ0FBQ3lFLEtBQUtDLE1BQU0sSUFBSXpFLFNBQWMsTUFBTTtBQUMxQyxRQUFNLENBQUMwRSxPQUFPQyxRQUFRLElBQUkzRSxTQUFTLElBQUk7QUFFdkMsUUFBTTRFLE9BQU9QLElBQUlRLE9BQU8sQ0FBQ0MsTUFBTUEsRUFBRUMsU0FBUyxVQUFVRCxFQUFFQyxTQUFTLFFBQVE7QUFDdkUsUUFBTWIsT0FBT0csSUFBSVEsT0FBTyxDQUFDQyxNQUFNQSxFQUFFQyxTQUFTLE1BQU07QUFDaEQsUUFBTUMsVUFBVVgsSUFBSVEsT0FBTyxDQUFDQyxNQUFNQSxFQUFFQyxTQUFTLFFBQVE7QUFDckQsUUFBTUUsUUFBUVQsUUFBUSxTQUFTSSxPQUFPSixRQUFRLFNBQVNOLE9BQU9jO0FBRTlELFFBQU1FLFdBQVdBLE1BQU07QUFDckIsVUFBTUMsS0FBS1osT0FBT2E7QUFDbEIsUUFBSSxDQUFDRCxHQUFJO0FBQ1RSLGFBQVNRLEdBQUdFLGVBQWVGLEdBQUdHLFlBQVlILEdBQUdJLGVBQWUsRUFBRTtBQUFBLEVBQ2hFO0FBRUExRixZQUFVLE1BQU07QUFDZCxVQUFNc0YsS0FBS1osT0FBT2E7QUFDbEIsUUFBSUQsTUFBTVQsTUFBT1MsSUFBR0csWUFBWUgsR0FBR0U7QUFBQUEsRUFDckMsR0FBRyxDQUFDSixNQUFNeEUsUUFBUWlFLE9BQU9GLEdBQUcsQ0FBQztBQUU3QixRQUFNZ0IsU0FBU0EsQ0FBQ0MsR0FBUWpFLE9BQWVrRSxPQUFlQyxXQUNwRDtBQUFBLElBQUM7QUFBQTtBQUFBLE1BQ0MsU0FBUyxNQUFNbEIsT0FBT2dCLENBQUM7QUFBQSxNQUN2QixXQUFXLGdIQUNUakIsUUFBUWlCLElBQ0osR0FBR0UsTUFBTSw2QkFDVCwwREFBMEQ7QUFBQSxNQUcvRG5FO0FBQUFBO0FBQUFBLFFBQ0QsdUJBQUMsVUFBSyxXQUFVLHFEQUFxRGtFLG1CQUFyRTtBQUFBO0FBQUE7QUFBQTtBQUFBLGVBQTJFO0FBQUE7QUFBQTtBQUFBLElBVDdFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVVBO0FBR0YsU0FDRSx1QkFBQyxTQUFJLFdBQVUsK0RBQ2I7QUFBQSwyQkFBQyxTQUFJLFdBQVUsMERBQ2I7QUFBQSw2QkFBQyxVQUFLLFdBQVUsZUFBYyxnQ0FBOUI7QUFBQTtBQUFBO0FBQUE7QUFBQSxhQUE4QztBQUFBLE1BQzlDLHVCQUFDLFVBQUssV0FBVSx5QkFBaEI7QUFBQTtBQUFBO0FBQUE7QUFBQSxhQUFxQztBQUFBLE1BQ3BDRixPQUFPLFFBQVEsYUFBYVosS0FBS25FLFFBQVEsVUFBVTtBQUFBLE1BQ25EK0UsT0FBTyxRQUFRLFlBQVl0QixLQUFLekQsUUFBUSxVQUFVO0FBQUEsTUFDbEQrRSxPQUFPLFVBQVUsYUFBYVIsUUFBUXZFLFFBQVEsVUFBVTtBQUFBLE1BQ3pELHVCQUFDLFVBQUssV0FBVSwwRkFDZDtBQUFBLCtCQUFDLFVBQUssV0FBVSxnREFBaEI7QUFBQTtBQUFBO0FBQUE7QUFBQSxlQUE0RDtBQUFBO0FBQUEsV0FEOUQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxhQUdBO0FBQUEsU0FURjtBQUFBO0FBQUE7QUFBQTtBQUFBLFdBVUE7QUFBQSxJQUVBO0FBQUEsTUFBQztBQUFBO0FBQUEsUUFDQyxLQUFLOEQ7QUFBQUEsUUFDTDtBQUFBLFFBQ0EsV0FBVTtBQUFBLFFBRVRVO0FBQUFBLGdCQUFNeEUsV0FBVyxLQUNoQix1QkFBQyxPQUFFLFdBQVUsMkNBQ1YrRCxrQkFBUSxTQUNMLHdEQUNBQSxRQUFRLFNBQ04seUNBQ0EscUVBTFI7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFNQTtBQUFBLFVBRURTLE1BQU0vRDtBQUFBQSxZQUFJLENBQUM0RCxNQUNWLHVCQUFDLFNBQWUsV0FBVywyQ0FBMkMxQixNQUFNMEIsRUFBRUMsSUFBSSxDQUFDLElBQ2hGRDtBQUFBQSxnQkFBRUMsU0FBUyxTQUFTLHVCQUFDLFVBQUssV0FBVSxvQ0FBb0M1RSxrQkFBUTJFLEVBQUVjLEVBQUUsS0FBaEU7QUFBQTtBQUFBO0FBQUE7QUFBQSxxQkFBa0U7QUFBQSxjQUN0RmQsRUFBRUMsU0FBUyxTQUFTLHVCQUFDLFVBQUssV0FBVSxtQkFBa0IsaUJBQWxDO0FBQUE7QUFBQTtBQUFBO0FBQUEscUJBQW1DO0FBQUEsY0FDdkRELEVBQUVlO0FBQUFBLGlCQUhLZixFQUFFbkMsSUFBWjtBQUFBO0FBQUE7QUFBQTtBQUFBLG1CQUlBO0FBQUEsVUFDRDtBQUFBLFVBQ0QsdUJBQUMsU0FBSSxXQUFVLFNBQWY7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBb0I7QUFBQTtBQUFBO0FBQUEsTUFyQnRCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQXNCQTtBQUFBLElBRUMsQ0FBQytCLFNBQ0E7QUFBQSxNQUFDO0FBQUE7QUFBQSxRQUNDLFNBQVMsTUFBTTtBQUNiLGdCQUFNUyxLQUFLWixPQUFPYTtBQUNsQixjQUFJRCxHQUFJQSxJQUFHRyxZQUFZSCxHQUFHRTtBQUMxQlYsbUJBQVMsSUFBSTtBQUFBLFFBQ2Y7QUFBQSxRQUNBLFdBQVU7QUFBQSxRQUE2TztBQUFBO0FBQUEsTUFOelA7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBU0E7QUFBQSxPQS9DSjtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBaURBO0FBRUo7QUFFQUwsSUF6RmdCRixXQUFTO0FBQUEsTUFBVEE7QUEwRlQsZ0JBQVMwQixXQUFXLEVBQUVDLE9BQTRCLEdBQUc7QUFDMUQsTUFBSSxDQUFDQSxPQUFPdEYsT0FBUSxRQUFPO0FBQzNCLFFBQU11RixRQUFRLENBQUMsR0FBR0QsUUFBUSxHQUFHQSxNQUFNO0FBQ25DLFNBQ0UsdUJBQUMsU0FBSSxXQUFVLDREQUNiO0FBQUEsMkJBQUMsU0FBSSxXQUFVLHVCQUNaQyxnQkFBTTlFLElBQUksQ0FBQ3VFLEdBQUc5RSxNQUFNO0FBQ25CLFlBQU1zRixPQUFRUixFQUFFUyxRQUFRVCxFQUFFVSxRQUFRLENBQUMsTUFBTVYsRUFBRVUsUUFBUSxDQUFDLEtBQUssS0FBTTtBQUMvRCxZQUFNQyxLQUFLSCxPQUFPO0FBQ2xCLGFBQ0UsdUJBQUMsVUFBNEIsV0FBVSwwRUFDckM7QUFBQSwrQkFBQyxVQUFLLFdBQVUsNkJBQTRCO0FBQUE7QUFBQSxVQUFFUixFQUFFWTtBQUFBQSxhQUFoRDtBQUFBO0FBQUE7QUFBQTtBQUFBLGVBQXVEO0FBQUEsUUFDdkQsdUJBQUMsVUFBSyxXQUFVLHlCQUF5QnBHLG1CQUFTd0YsRUFBRVMsS0FBSyxLQUF6RDtBQUFBO0FBQUE7QUFBQTtBQUFBLGVBQTJEO0FBQUEsUUFDM0QsdUJBQUMsVUFBSyxXQUFXLGdCQUFnQkUsS0FBSyxhQUFhLFVBQVUsSUFBS2xHLG9CQUFVK0YsS0FBSyxHQUFHLEdBQUcsS0FBdkY7QUFBQTtBQUFBO0FBQUE7QUFBQSxlQUF5RjtBQUFBLFFBQ3pGLHVCQUFDLFVBQUssV0FBVSxjQUFhLGlCQUE3QjtBQUFBO0FBQUE7QUFBQTtBQUFBLGVBQThCO0FBQUEsV0FKckIsR0FBR1IsRUFBRWEsSUFBSSxJQUFJM0YsQ0FBQyxJQUF6QjtBQUFBO0FBQUE7QUFBQTtBQUFBLGFBS0E7QUFBQSxJQUVKLENBQUMsS0FaSDtBQUFBO0FBQUE7QUFBQTtBQUFBLFdBYUE7QUFBQSxJQUNBLHVCQUFDLFNBQUksV0FBVSxpR0FBZjtBQUFBO0FBQUE7QUFBQTtBQUFBLFdBQTRHO0FBQUEsSUFDNUcsdUJBQUMsU0FBSSxXQUFVLGtHQUFmO0FBQUE7QUFBQTtBQUFBO0FBQUEsV0FBNkc7QUFBQSxPQWhCL0c7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQWlCQTtBQUVKO0FBRUE0RixNQXpCZ0JUO0FBMEJoQixNQUFNVSxRQUFRLENBQUMsUUFBUSxPQUFPLFdBQVcsYUFBYSxVQUFVLE9BQU8sT0FBTztBQUV2RSxnQkFBU0MsV0FBVyxFQUFFQyxVQUFnRCxHQUFHO0FBQUFDLE1BQUE7QUFDOUUsUUFBTSxDQUFDQyxPQUFPQyxRQUFRLElBQUk3RyxTQUFTLEVBQUU7QUFDckMsUUFBTW1HLFVBQVVwRyxPQUFpQixFQUFFO0FBQ25DLFFBQU0rRyxPQUFPL0csT0FBTyxFQUFFO0FBQ3RCLFFBQU1nSCxXQUFXaEgsT0FBeUIsSUFBSTtBQUU5QyxRQUFNaUgsU0FBU0EsTUFBTTtBQUNuQixVQUFNakQsTUFBTTZDLE1BQU1LLEtBQUs7QUFDdkIsUUFBSSxDQUFDbEQsSUFBSztBQUNWb0MsWUFBUWYsVUFBVSxDQUFDckIsS0FBSyxHQUFHb0MsUUFBUWYsUUFBUVAsT0FBTyxDQUFDcUMsTUFBTUEsTUFBTW5ELEdBQUcsQ0FBQyxFQUFFb0QsTUFBTSxHQUFHLEVBQUU7QUFDaEZMLFNBQUsxQixVQUFVO0FBQ2ZzQixjQUFVM0MsR0FBRztBQUNiOEMsYUFBUyxFQUFFO0FBQUEsRUFDYjtBQUVBLFFBQU1PLFFBQVFBLENBQUNDLE1BQTZDO0FBQzFELFFBQUlBLEVBQUVDLFFBQVEsUUFBU04sUUFBTztBQUFBLGFBQ3JCSyxFQUFFQyxRQUFRLFdBQVc7QUFDNUJELFFBQUVFLGVBQWU7QUFDakIsVUFBSXBCLFFBQVFmLFFBQVEzRSxRQUFRO0FBQzFCcUcsYUFBSzFCLFVBQVV2RSxLQUFLMkcsSUFBSVYsS0FBSzFCLFVBQVUsR0FBR2UsUUFBUWYsUUFBUTNFLFNBQVMsQ0FBQztBQUNwRW9HLGlCQUFTVixRQUFRZixRQUFRMEIsS0FBSzFCLE9BQU8sQ0FBQztBQUFBLE1BQ3hDO0FBQUEsSUFDRixXQUFXaUMsRUFBRUMsUUFBUSxhQUFhO0FBQ2hDRCxRQUFFRSxlQUFlO0FBQ2pCVCxXQUFLMUIsVUFBVXZFLEtBQUs0RyxJQUFJWCxLQUFLMUIsVUFBVSxHQUFHLEVBQUU7QUFDNUN5QixlQUFTQyxLQUFLMUIsWUFBWSxLQUFLLEtBQUtlLFFBQVFmLFFBQVEwQixLQUFLMUIsT0FBTyxDQUFDO0FBQUEsSUFDbkU7QUFBQSxFQUNGO0FBRUEsU0FDRSx1QkFBQyxTQUFJLFdBQVUsK0NBQ2I7QUFBQSwyQkFBQyxTQUFJLFdBQVUsa0RBQ2I7QUFBQSw2QkFBQyxVQUFLLFdBQVUsZ0VBQStELHlCQUEvRTtBQUFBO0FBQUE7QUFBQTtBQUFBLGFBQXdGO0FBQUEsTUFDdkZvQixNQUFNdEY7QUFBQUEsUUFBSSxDQUFDZ0csTUFDVjtBQUFBLFVBQUM7QUFBQTtBQUFBLFlBRUMsU0FBUyxNQUFNO0FBQ2JMLHVCQUFTSyxDQUFDO0FBQ1ZILHVCQUFTM0IsU0FBU3NDLE1BQU07QUFBQSxZQUMxQjtBQUFBLFlBQ0EsV0FBVTtBQUFBLFlBRVRSO0FBQUFBO0FBQUFBLFVBUElBO0FBQUFBLFVBRFA7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxRQVNBO0FBQUEsTUFDRDtBQUFBLFNBYkg7QUFBQTtBQUFBO0FBQUE7QUFBQSxXQWNBO0FBQUEsSUFDQSx1QkFBQyxTQUFJLFdBQVUsdUNBQXNDLFNBQVMsTUFBTUgsU0FBUzNCLFNBQVNzQyxNQUFNLEdBQzFGO0FBQUEsNkJBQUMsVUFBSyxXQUFVLDRDQUEyQyx1QkFBM0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxhQUFrRTtBQUFBLE1BQ2xFLHVCQUFDLFVBQUssV0FBVSxvQ0FBbUMsaUJBQW5EO0FBQUE7QUFBQTtBQUFBO0FBQUEsYUFBb0Q7QUFBQSxNQUNwRDtBQUFBLFFBQUM7QUFBQTtBQUFBLFVBQ0MsS0FBS1g7QUFBQUEsVUFDTDtBQUFBLFVBQ0EsVUFBVSxDQUFDTSxNQUFNUixTQUFTUSxFQUFFTSxPQUFPZixLQUFLO0FBQUEsVUFDeEMsV0FBV1E7QUFBQUEsVUFDWCxZQUFZO0FBQUEsVUFDWixnQkFBZTtBQUFBLFVBQ2YsY0FBYTtBQUFBLFVBQ2IsY0FBVztBQUFBLFVBQ1gsYUFBWTtBQUFBLFVBQ1osV0FBVTtBQUFBLFVBQ1YsT0FBTyxFQUFFUSxZQUFZLFVBQVU7QUFBQTtBQUFBLFFBWGpDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQVdtQztBQUFBLE1BRW5DLHVCQUFDLFVBQUssV0FBVSwyREFBMEQsaUJBQTFFO0FBQUE7QUFBQTtBQUFBO0FBQUEsYUFBMkU7QUFBQSxTQWhCN0U7QUFBQTtBQUFBO0FBQUE7QUFBQSxXQWlCQTtBQUFBLE9BakNGO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FrQ0E7QUFFSjtBQUFDakIsSUFuRWVGLFlBQVU7QUFBQSxNQUFWQTtBQUFVLElBQUFvQixJQUFBQyxLQUFBQyxLQUFBeEIsS0FBQXlCO0FBQUEsYUFBQUgsSUFBQTtBQUFBLGFBQUFDLEtBQUE7QUFBQSxhQUFBQyxLQUFBO0FBQUEsYUFBQXhCLEtBQUE7QUFBQSxhQUFBeUIsS0FBQSIsIm5hbWVzIjpbInVzZUVmZmVjdCIsInVzZU1lbW8iLCJ1c2VSZWYiLCJ1c2VTdGF0ZSIsImZtdFByaWNlIiwiZm10U2lnbmVkIiwiZm10VGltZSIsIk1hdHJpeFJhaW4iLCJfcyIsImNvbHMiLCJBcnJheSIsImZyb20iLCJsZW5ndGgiLCJfIiwiaSIsImxlZnQiLCJNYXRoIiwicmFuZG9tIiwiZHVyIiwiZGVsYXkiLCJvcGFjaXR5IiwibWFwIiwiYyIsImFuaW1hdGlvbkR1cmF0aW9uIiwiYW5pbWF0aW9uRGVsYXkiLCJMSVZFX01FVEEiLCJvZmYiLCJsYWJlbCIsImNscyIsImRvdCIsImNvbm5lY3RpbmciLCJsaXZlIiwiZXJyb3IiLCJUaXRsZUJhciIsImJvdE9uIiwib25Ub2dnbGVCb3QiLCJibG9jayIsImxpdmVTdGF0dXMiLCJsaXZlQ291bnQiLCJsaXZlVG90YWwiLCJycGNMYXRlbmN5Iiwic3NlTGl2ZSIsIl9zMiIsImNsb2NrIiwic2V0Q2xvY2siLCJEYXRlIiwiaWQiLCJzZXRJbnRlcnZhbCIsImNsZWFySW50ZXJ2YWwiLCJtZXRhIiwibGF0Q2xzIiwibGF0TGFiZWwiLCJ0b0xvY2FsZVN0cmluZyIsInRvTG9jYWxlVGltZVN0cmluZyIsImhvdXIxMiIsIkNPTE9SIiwiYXJ0Iiwic3lzIiwib2siLCJidXkiLCJzZWxsIiwiZGNhIiwidHAiLCJzbCIsIndhcm4iLCJlcnIiLCJjbWQiLCJvdXQiLCJta3QiLCJkdXN0IiwiaWdub3JlIiwiTG9nU3RyZWFtIiwibG9nIiwiX3MzIiwiYm94UmVmIiwidGFiIiwic2V0VGFiIiwic3R1Y2siLCJzZXRTdHVjayIsIm1haW4iLCJmaWx0ZXIiLCJsIiwia2luZCIsImlnbm9yZWQiLCJzaG93biIsIm9uU2Nyb2xsIiwiZWwiLCJjdXJyZW50Iiwic2Nyb2xsSGVpZ2h0Iiwic2Nyb2xsVG9wIiwiY2xpZW50SGVpZ2h0IiwidGFiQnRuIiwidCIsImNvdW50IiwiYWNjZW50IiwidHMiLCJ0ZXh0IiwiVG9rZW5TdHJpcCIsInRva2VucyIsIml0ZW1zIiwiY2hnIiwicHJpY2UiLCJoaXN0b3J5IiwidXAiLCJzeW1ib2wiLCJtaW50IiwiX2M0IiwiSElOVFMiLCJDb21tYW5kQmFyIiwib25Db21tYW5kIiwiX3M0IiwidmFsdWUiLCJzZXRWYWx1ZSIsImhJZHgiLCJpbnB1dFJlZiIsInN1Ym1pdCIsInRyaW0iLCJoIiwic2xpY2UiLCJvbktleSIsImUiLCJrZXkiLCJwcmV2ZW50RGVmYXVsdCIsIm1pbiIsIm1heCIsImZvY3VzIiwidGFyZ2V0IiwiY2FyZXRDb2xvciIsIl9jIiwiX2MyIiwiX2MzIiwiX2M1Il0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VzIjpbInRlcm1pbmFsLnRzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyB1c2VFZmZlY3QsIHVzZU1lbW8sIHVzZVJlZiwgdXNlU3RhdGUgfSBmcm9tIFwicmVhY3RcIjtcbmltcG9ydCB0eXBlIHsgTG9nS2luZCwgTG9nTGluZSwgVG9rZW4gfSBmcm9tIFwiLi4vdHlwZXNcIjtcbmltcG9ydCB7IGZtdFByaWNlLCBmbXRTaWduZWQsIGZtdFRpbWUgfSBmcm9tIFwiLi4vZW5naW5lXCI7XG5cbi8qID09PT09PT09PT09PT09PT09IExsdXZpYSBkaWdpdGFsIE1hdHJpeCA9PT09PT09PT09PT09PT09PSAqL1xuZXhwb3J0IGZ1bmN0aW9uIE1hdHJpeFJhaW4oKSB7XG4gIGNvbnN0IGNvbHMgPSB1c2VNZW1vKFxuICAgICgpID0+XG4gICAgICBBcnJheS5mcm9tKHsgbGVuZ3RoOiAyNiB9LCAoXywgaSkgPT4gKHtcbiAgICAgICAgbGVmdDogKGkgLyAyNikgKiAxMDAgKyBNYXRoLnJhbmRvbSgpICogMyxcbiAgICAgICAgZHVyOiA2ICsgTWF0aC5yYW5kb20oKSAqIDgsXG4gICAgICAgIGRlbGF5OiAtTWF0aC5yYW5kb20oKSAqIDEwLFxuICAgICAgICBvcGFjaXR5OiAwLjE1ICsgTWF0aC5yYW5kb20oKSAqIDAuMyxcbiAgICAgIH0pKSxcbiAgICBbXSxcbiAgKTtcbiAgcmV0dXJuIChcbiAgICA8ZGl2IGNsYXNzTmFtZT1cInJhaW5cIiBhcmlhLWhpZGRlbj5cbiAgICAgIHtjb2xzLm1hcCgoYywgaSkgPT4gKFxuICAgICAgICA8aVxuICAgICAgICAgIGtleT17aX1cbiAgICAgICAgICBzdHlsZT17e1xuICAgICAgICAgICAgbGVmdDogYCR7Yy5sZWZ0fSVgLFxuICAgICAgICAgICAgYW5pbWF0aW9uRHVyYXRpb246IGAke2MuZHVyfXNgLFxuICAgICAgICAgICAgYW5pbWF0aW9uRGVsYXk6IGAke2MuZGVsYXl9c2AsXG4gICAgICAgICAgICBvcGFjaXR5OiBjLm9wYWNpdHksXG4gICAgICAgICAgfX1cbiAgICAgICAgLz5cbiAgICAgICkpfVxuICAgIDwvZGl2PlxuICApO1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PSBCYXJyYSBzdXBlcmlvciA9PT09PT09PT09PT09PT09PSAqL1xuY29uc3QgTElWRV9NRVRBID0ge1xuICBvZmY6IHsgbGFiZWw6IFwiU0lOIFdBTExFVFNcIiwgY2xzOiBcImJvcmRlci1saW5lMiB0ZXh0LWRpbVwiLCBkb3Q6IFwiYmctZmFpbnRcIiB9LFxuICBjb25uZWN0aW5nOiB7IGxhYmVsOiBcIkNPTkVDVEFORE8gUlBD4oCmXCIsIGNsczogXCJib3JkZXItY3luLzQwIHRleHQtY3luXCIsIGRvdDogXCJiZy1jeW4gYmxpbmstc29mdFwiIH0sXG4gIGxpdmU6IHsgbGFiZWw6IFwiUlBDIEVOIFZJVk9cIiwgY2xzOiBcImJvcmRlci1ncm4vNDAgdGV4dC1ncm5cIiwgZG90OiBcImJnLWdybiBsZWQtb25cIiB9LFxuICBlcnJvcjogeyBsYWJlbDogXCJSUEMgU0lOIFNFw5FBTFwiLCBjbHM6IFwiYm9yZGVyLXJlZC80MCB0ZXh0LXJlZFwiLCBkb3Q6IFwiYmctcmVkIGJsaW5rLXNvZnRcIiB9LFxufSBhcyBjb25zdDtcblxuZXhwb3J0IGZ1bmN0aW9uIFRpdGxlQmFyKHtcbiAgYm90T24sXG4gIG9uVG9nZ2xlQm90LFxuICBibG9jayxcbiAgbGl2ZVN0YXR1cyxcbiAgbGl2ZUNvdW50LFxuICBsaXZlVG90YWwsXG4gIHJwY0xhdGVuY3ksXG4gIHNzZUxpdmUgPSBmYWxzZSxcbn06IHtcbiAgYm90T246IGJvb2xlYW47XG4gIG9uVG9nZ2xlQm90OiAoKSA9PiB2b2lkO1xuICBibG9jazogbnVtYmVyO1xuICBsaXZlU3RhdHVzOiBcIm9mZlwiIHwgXCJjb25uZWN0aW5nXCIgfCBcImxpdmVcIiB8IFwiZXJyb3JcIjtcbiAgbGl2ZUNvdW50OiBudW1iZXI7XG4gIGxpdmVUb3RhbDogbnVtYmVyO1xuICBycGNMYXRlbmN5OiBudW1iZXIgfCBudWxsO1xuICAvKiogd2ViaG9vayBkZSBIZWxpdXMgY29uZWN0YWRvIGFsIHNlcnZpZG9yIChkZXBsb3kgZW4gUmFpbHdheSkgKi9cbiAgc3NlTGl2ZT86IGJvb2xlYW47XG59KSB7XG4gIGNvbnN0IFtjbG9jaywgc2V0Q2xvY2tdID0gdXNlU3RhdGUoKCkgPT4gbmV3IERhdGUoKSk7XG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgY29uc3QgaWQgPSBzZXRJbnRlcnZhbCgoKSA9PiBzZXRDbG9jayhuZXcgRGF0ZSgpKSwgMTAwMCk7XG4gICAgcmV0dXJuICgpID0+IGNsZWFySW50ZXJ2YWwoaWQpO1xuICB9LCBbXSk7XG5cbiAgY29uc3QgbWV0YSA9IExJVkVfTUVUQVtsaXZlU3RhdHVzXTtcbiAgY29uc3QgbGF0Q2xzID1cbiAgICBycGNMYXRlbmN5ID09PSBudWxsID8gXCJ0ZXh0LXJlZFwiIDogcnBjTGF0ZW5jeSA8IDQwMCA/IFwidGV4dC1ncm5cIiA6IHJwY0xhdGVuY3kgPCA5MDAgPyBcInRleHQteWx3XCIgOiBcInRleHQtcmVkXCI7XG4gIGNvbnN0IGxhdExhYmVsID0gcnBjTGF0ZW5jeSA9PT0gbnVsbCA/IFwi4oCUXCIgOiBgJHtycGNMYXRlbmN5fW1zYDtcblxuICByZXR1cm4gKFxuICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTMgYm9yZGVyLWIgYm9yZGVyLWxpbmUgYmctcGFuZS85MCBweC00IHB5LTIuNVwiPlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMi41XCI+XG4gICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZsZXggaC00IGl0ZW1zLWVuZCBnYXAtWzNweF1cIiBhcmlhLWhpZGRlbj5cbiAgICAgICAgICA8aSBjbGFzc05hbWU9XCJlcS1iYXIgaC00IHctWzNweF0gcm91bmRlZC1zbSBiZy1ncm4gW2JveC1zaGFkb3c6MF8wXzhweF9yZ2JhKDAsMjU1LDY1LDAuOCldXCIgLz5cbiAgICAgICAgICA8aSBjbGFzc05hbWU9XCJlcS1iYXIgaC00IHctWzNweF0gcm91bmRlZC1zbSBiZy1ncm4vNzVcIiBzdHlsZT17eyBhbmltYXRpb25EZWxheTogXCIwLjI4c1wiIH19IC8+XG4gICAgICAgICAgPGkgY2xhc3NOYW1lPVwiZXEtYmFyIGgtNCB3LVszcHhdIHJvdW5kZWQtc20gYmctZ3JuLzU1XCIgc3R5bGU9e3sgYW5pbWF0aW9uRGVsYXk6IFwiMC41NnNcIiB9fSAvPlxuICAgICAgICA8L3NwYW4+XG4gICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZvbnQtY3J0IHRleHQtWzE2cHhdIGZvbnQtYm9sZCB0cmFja2luZy1bMC4yMmVtXSB0ZXh0LWdybiBbdGV4dC1zaGFkb3c6MF8wXzE0cHhfcmdiYSgwLDI1NSw2NSwwLjU1KV1cIj5cbiAgICAgICAgICBNRU1FQk9UXG4gICAgICAgIDwvc3Bhbj5cbiAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiaGlkZGVuIHJvdW5kZWQgYm9yZGVyIGJvcmRlci1saW5lIHB4LTEuNSBweS1weCBmb250LWNydCB0ZXh0LVsxMXB4XSB0cmFja2luZy13aWRlc3QgdGV4dC1mYWludCBzbTppbmxpbmVcIj5cbiAgICAgICAgICB2My4yXG4gICAgICAgIDwvc3Bhbj5cbiAgICAgIDwvZGl2PlxuXG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgtMVwiIC8+XG5cbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwiaGlkZGVuIGl0ZW1zLWNlbnRlciBnYXAtNCBmb250LWNydCB0ZXh0LVsxNHB4XSB0cmFja2luZy13aWRlciB0ZXh0LWRpbSBtZDpmbGV4XCI+XG4gICAgICAgIDxzcGFuXG4gICAgICAgICAgdGl0bGU9e1xuICAgICAgICAgICAgc3NlTGl2ZVxuICAgICAgICAgICAgICA/IFwiV2ViaG9vayBkZSBIZWxpdXMgQ09ORUNUQURPOiBlbCBzZXJ2aWRvciAoUmFpbHdheSkgZW1wdWphIGNhZGEgdHJhbnNhY2Npw7NuIGVuIHRpZW1wbyByZWFsXCJcbiAgICAgICAgICAgICAgOiBcIlNpbiBzZXJ2aWRvciBkZSB3ZWJob29rczogZWwgYm90IGVzY3VjaGEgZGlyZWN0byBwb3IgV2ViU29ja2V0LiBEZXNwbGllZ2EgZW4gUmFpbHdheSBwYXJhIHB1c2ggMjQvN1wiXG4gICAgICAgICAgfVxuICAgICAgICAgIGNsYXNzTmFtZT17YGZsZXggaXRlbXMtY2VudGVyIGdhcC0xICR7c3NlTGl2ZSA/IFwidGV4dC1ncm5cIiA6IFwidGV4dC1mYWludFwifWB9XG4gICAgICAgID5cbiAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9e2BoLTEuNSB3LTEuNSByb3VuZGVkLWZ1bGwgJHtzc2VMaXZlID8gXCJiZy1ncm4gbGVkLW9uXCIgOiBcImJnLWZhaW50XCJ9YH0gLz5cbiAgICAgICAgICBXSFxuICAgICAgICA8L3NwYW4+XG4gICAgICAgIDxzcGFuIHRpdGxlPVwiTGF0ZW5jaWEgZGVsIFJQQ1wiIGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGdhcC0xXCI+XG4gICAgICAgICAgUlBDIDxzcGFuIGNsYXNzTmFtZT17YHRhYnVsYXItbnVtcyAke2xhdENsc31gfT57bGF0TGFiZWx9PC9zcGFuPlxuICAgICAgICA8L3NwYW4+XG4gICAgICAgIDxzcGFuPlxuICAgICAgICAgIFNMT1QgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC10eHQvODAgdGFidWxhci1udW1zXCI+e2Jsb2NrLnRvTG9jYWxlU3RyaW5nKFwiZXMtRVNcIil9PC9zcGFuPlxuICAgICAgICA8L3NwYW4+XG4gICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRhYnVsYXItbnVtc1wiPntjbG9jay50b0xvY2FsZVRpbWVTdHJpbmcoXCJlcy1FU1wiLCB7IGhvdXIxMjogZmFsc2UgfSl9PC9zcGFuPlxuICAgICAgPC9kaXY+XG5cbiAgICAgIDxkaXZcbiAgICAgICAgdGl0bGU9e1xuICAgICAgICAgIGxpdmVTdGF0dXMgPT09IFwibGl2ZVwiXG4gICAgICAgICAgICA/IGAke2xpdmVDb3VudH0vJHtsaXZlVG90YWx9IHdhbGxldChzKSBlc2N1Y2hhZGFzIGVuIG1haW5uZXQgZW4gdGllbXBvIHJlYWxgXG4gICAgICAgICAgICA6IGxpdmVTdGF0dXMgPT09IFwib2ZmXCJcbiAgICAgICAgICAgICAgPyBcIkHDsWFkZSB1bmEgd2FsbGV0IHBhcmEgZXNjdWNoYXIgbGEgYmxvY2tjaGFpblwiXG4gICAgICAgICAgICAgIDogbGl2ZVN0YXR1cyA9PT0gXCJlcnJvclwiXG4gICAgICAgICAgICAgICAgPyBcIlNpbiBjb25leGnDs24gYWwgUlBDIGRlIFNvbGFuYVwiXG4gICAgICAgICAgICAgICAgOiBcIkNvbmVjdGFuZG/igKZcIlxuICAgICAgICB9XG4gICAgICAgIGNsYXNzTmFtZT17YGZsZXggaXRlbXMtY2VudGVyIGdhcC0yIHJvdW5kZWQtbWQgYm9yZGVyIHB4LTIuNSBweS0xIGZvbnQtY3J0IHRleHQtWzEzcHhdIHRyYWNraW5nLVswLjEyZW1dICR7bWV0YS5jbHN9YH1cbiAgICAgID5cbiAgICAgICAgPHNwYW4gY2xhc3NOYW1lPXtgaC0yIHctMiByb3VuZGVkLWZ1bGwgJHttZXRhLmRvdH1gfSAvPlxuICAgICAgICB7bWV0YS5sYWJlbH1cbiAgICAgICAge2xpdmVTdGF0dXMgIT09IFwib2ZmXCIgJiYgKFxuICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRhYnVsYXItbnVtcyBvcGFjaXR5LTgwXCI+XG4gICAgICAgICAgICB7bGl2ZUNvdW50fS97bGl2ZVRvdGFsfVxuICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgKX1cbiAgICAgIDwvZGl2PlxuXG4gICAgICA8YnV0dG9uXG4gICAgICAgIG9uQ2xpY2s9e29uVG9nZ2xlQm90fVxuICAgICAgICBjbGFzc05hbWU9e2BmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMiByb3VuZGVkLW1kIGJvcmRlciBweC0zIHB5LTEuNSBmb250LWNydCB0ZXh0LVsxNHB4XSB0cmFja2luZy1bMC4xNGVtXSB0cmFuc2l0aW9uLWFsbCBkdXJhdGlvbi0yMDAgYWN0aXZlOnNjYWxlLTk1ICR7XG4gICAgICAgICAgYm90T25cbiAgICAgICAgICAgID8gXCJib3JkZXItZ3JuLzQwIGJnLWdybi8xMCB0ZXh0LWdybiBob3ZlcjpiZy1ncm4vMjAgW2JveC1zaGFkb3c6MF8wXzE4cHhfLTZweF9yZ2JhKDAsMjU1LDY1LDAuNildXCJcbiAgICAgICAgICAgIDogXCJib3JkZXIteWx3LzQwIGJnLXlsdy8xMCB0ZXh0LXlsdyBob3ZlcjpiZy15bHcvMjBcIlxuICAgICAgICB9YH1cbiAgICAgID5cbiAgICAgICAgPHNwYW4gY2xhc3NOYW1lPXtgaC0yIHctMiByb3VuZGVkLWZ1bGwgJHtib3RPbiA/IFwiYmctZ3JuIGxlZC1vblwiIDogXCJiZy15bHcgYmxpbmstc29mdFwifWB9IC8+XG4gICAgICAgIHtib3RPbiA/IFwiRU4gVklWT1wiIDogXCJFTiBQQVVTQVwifVxuICAgICAgPC9idXR0b24+XG4gICAgPC9kaXY+XG4gICk7XG59XG5cbi8qID09PT09PT09PT09PT09PT09IExvZyBjb24gcGVzdGHDsWFzIChQUklOQ0lQQUwgLyBEVVNUIC8gSUdOT1JBRE9TKSA9PT09PT09PT09PT09PT09PSAqL1xuY29uc3QgQ09MT1I6IFJlY29yZDxMb2dLaW5kLCBzdHJpbmc+ID0ge1xuICBhcnQ6IFwidGV4dC1ncm4gZm9udC1jcnQgdGV4dC1bMTVweF0gbGVhZGluZy1bMS4wNV0gW3RleHQtc2hhZG93OjBfMF8xOHB4X3JnYmEoMCwyNTUsNjUsMC40KV1cIixcbiAgc3lzOiBcInRleHQtZGltXCIsXG4gIG9rOiBcInRleHQtZ3JuXCIsXG4gIGJ1eTogXCJ0ZXh0LWdybiBmb250LW1lZGl1bSBbdGV4dC1zaGFkb3c6MF8wXzEycHhfcmdiYSgwLDI1NSw2NSwwLjM1KV1cIixcbiAgc2VsbDogXCJ0ZXh0LWN5biBmb250LW1lZGl1bSBbdGV4dC1zaGFkb3c6MF8wXzEycHhfcmdiYSg5MiwyNTUsMTc2LDAuMyldXCIsXG4gIGRjYTogXCJ0ZXh0LXlsdy84MCBpdGFsaWNcIixcbiAgdHA6IFwidGV4dC1ncm4gZm9udC1tZWRpdW1cIixcbiAgc2w6IFwidGV4dC1yZWQgZm9udC1tZWRpdW1cIixcbiAgd2FybjogXCJ0ZXh0LXlsd1wiLFxuICBlcnI6IFwidGV4dC1yZWRcIixcbiAgY21kOiBcInRleHQtdHh0XCIsXG4gIG91dDogXCJ0ZXh0LXR4dC83MFwiLFxuICBta3Q6IFwidGV4dC1jeW4vNjBcIixcbiAgZHVzdDogXCJ0ZXh0LWZhaW50XCIsXG4gIGlnbm9yZTogXCJ0ZXh0LWZhaW50IGl0YWxpY1wiLFxufTtcblxudHlwZSBUYWIgPSBcIm1haW5cIiB8IFwiZHVzdFwiIHwgXCJpZ25vcmVcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIExvZ1N0cmVhbSh7IGxvZyB9OiB7IGxvZzogTG9nTGluZVtdIH0pIHtcbiAgY29uc3QgYm94UmVmID0gdXNlUmVmPEhUTUxEaXZFbGVtZW50PihudWxsKTtcbiAgY29uc3QgW3RhYiwgc2V0VGFiXSA9IHVzZVN0YXRlPFRhYj4oXCJtYWluXCIpO1xuICBjb25zdCBbc3R1Y2ssIHNldFN0dWNrXSA9IHVzZVN0YXRlKHRydWUpO1xuXG4gIGNvbnN0IG1haW4gPSBsb2cuZmlsdGVyKChsKSA9PiBsLmtpbmQgIT09IFwiZHVzdFwiICYmIGwua2luZCAhPT0gXCJpZ25vcmVcIik7XG4gIGNvbnN0IGR1c3QgPSBsb2cuZmlsdGVyKChsKSA9PiBsLmtpbmQgPT09IFwiZHVzdFwiKTtcbiAgY29uc3QgaWdub3JlZCA9IGxvZy5maWx0ZXIoKGwpID0+IGwua2luZCA9PT0gXCJpZ25vcmVcIik7XG4gIGNvbnN0IHNob3duID0gdGFiID09PSBcIm1haW5cIiA/IG1haW4gOiB0YWIgPT09IFwiZHVzdFwiID8gZHVzdCA6IGlnbm9yZWQ7XG5cbiAgY29uc3Qgb25TY3JvbGwgPSAoKSA9PiB7XG4gICAgY29uc3QgZWwgPSBib3hSZWYuY3VycmVudDtcbiAgICBpZiAoIWVsKSByZXR1cm47XG4gICAgc2V0U3R1Y2soZWwuc2Nyb2xsSGVpZ2h0IC0gZWwuc2Nyb2xsVG9wIC0gZWwuY2xpZW50SGVpZ2h0IDwgNDgpO1xuICB9O1xuXG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgY29uc3QgZWwgPSBib3hSZWYuY3VycmVudDtcbiAgICBpZiAoZWwgJiYgc3R1Y2spIGVsLnNjcm9sbFRvcCA9IGVsLnNjcm9sbEhlaWdodDtcbiAgfSwgW3Nob3duLmxlbmd0aCwgc3R1Y2ssIHRhYl0pO1xuXG4gIGNvbnN0IHRhYkJ0biA9ICh0OiBUYWIsIGxhYmVsOiBzdHJpbmcsIGNvdW50OiBudW1iZXIsIGFjY2VudDogc3RyaW5nKSA9PiAoXG4gICAgPGJ1dHRvblxuICAgICAgb25DbGljaz17KCkgPT4gc2V0VGFiKHQpfVxuICAgICAgY2xhc3NOYW1lPXtgZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTEuNSByb3VuZGVkLW1kIGJvcmRlciBweC0yLjUgcHktMSBmb250LWNydCB0ZXh0LVsxMi41cHhdIHRyYWNraW5nLXdpZGVyIHRyYW5zaXRpb24tYWxsICR7XG4gICAgICAgIHRhYiA9PT0gdFxuICAgICAgICAgID8gYCR7YWNjZW50fSBib3JkZXItY3VycmVudCBiZy1ncm4vNWBcbiAgICAgICAgICA6IFwiYm9yZGVyLWxpbmUgdGV4dC1mYWludCBob3Zlcjp0ZXh0LWRpbSBob3Zlcjpib3JkZXItbGluZTJcIlxuICAgICAgfWB9XG4gICAgPlxuICAgICAge2xhYmVsfVxuICAgICAgPHNwYW4gY2xhc3NOYW1lPVwicm91bmRlZCBiZy1ibGFjay80MCBweC0xIHRleHQtWzExcHhdIHRhYnVsYXItbnVtc1wiPntjb3VudH08L3NwYW4+XG4gICAgPC9idXR0b24+XG4gICk7XG5cbiAgcmV0dXJuIChcbiAgICA8ZGl2IGNsYXNzTmFtZT1cInBhbmVsIHJlbGF0aXZlIGZsZXggbWluLWgtMCBmbGV4LTEgZmxleC1jb2wgb3ZlcmZsb3ctaGlkZGVuXCI+XG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGdhcC0yIGJvcmRlci1iIGJvcmRlci1saW5lIHB4LTQgcHktMlwiPlxuICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJwYW5lbC10aXRsZVwiPn4vYm90L3NhbGlkYS5sb2c8L3NwYW4+XG4gICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImgtcHggZmxleC0xIGJnLWxpbmVcIiAvPlxuICAgICAgICB7dGFiQnRuKFwibWFpblwiLCBcIlBSSU5DSVBBTFwiLCBtYWluLmxlbmd0aCwgXCJ0ZXh0LWdyblwiKX1cbiAgICAgICAge3RhYkJ0bihcImR1c3RcIiwgXCJEVVNULkxPR1wiLCBkdXN0Lmxlbmd0aCwgXCJ0ZXh0LXlsd1wiKX1cbiAgICAgICAge3RhYkJ0bihcImlnbm9yZVwiLCBcIklHTk9SQURPU1wiLCBpZ25vcmVkLmxlbmd0aCwgXCJ0ZXh0LWN5blwiKX1cbiAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiaGlkZGVuIGl0ZW1zLWNlbnRlciBnYXAtMS41IHRleHQtWzEwcHhdIGZvbnQtbWVkaXVtIHRyYWNraW5nLVswLjE0ZW1dIHRleHQtZGltIHNtOmZsZXhcIj5cbiAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJoLTEuNSB3LTEuNSByb3VuZGVkLWZ1bGwgYmctZ3JuIGJsaW5rLXNvZnRcIiAvPlxuICAgICAgICAgIFRBSUwgLUZcbiAgICAgICAgPC9zcGFuPlxuICAgICAgPC9kaXY+XG5cbiAgICAgIDxkaXZcbiAgICAgICAgcmVmPXtib3hSZWZ9XG4gICAgICAgIG9uU2Nyb2xsPXtvblNjcm9sbH1cbiAgICAgICAgY2xhc3NOYW1lPVwibWluLWgtMCBmbGV4LTEgb3ZlcmZsb3cteS1hdXRvIHB4LTQgcHktMyBmb250LW1vbm8gdGV4dC1bMTJweF0gbGVhZGluZy1bMS43XVwiXG4gICAgICA+XG4gICAgICAgIHtzaG93bi5sZW5ndGggPT09IDAgJiYgKFxuICAgICAgICAgIDxwIGNsYXNzTmFtZT1cIm10LTYgdGV4dC1jZW50ZXIgdGV4dC1bMTFweF0gdGV4dC1mYWludFwiPlxuICAgICAgICAgICAge3RhYiA9PT0gXCJtYWluXCJcbiAgICAgICAgICAgICAgPyBcIuKAlCBlc3BlcmFuZG8gQ09NUFJBUyB5IFZFTlRBUyBWw4FMSURBUyBkZSB0dSB3YWxsZXQg4oCUXCJcbiAgICAgICAgICAgICAgOiB0YWIgPT09IFwiZHVzdFwiXG4gICAgICAgICAgICAgICAgPyBcIuKAlCBzaW4gYWlyZHJvcHMvZHVzdGluZyByZWdpc3RyYWRvcyDigJRcIlxuICAgICAgICAgICAgICAgIDogXCLigJQgc2luIHRva2VucyBpZ25vcmFkb3MgKHNuYXBzaG90IFIwKSBuaSBwcm9tZWRpb3MgZGVzY2FydGFkb3Mg4oCUXCJ9XG4gICAgICAgICAgPC9wPlxuICAgICAgICApfVxuICAgICAgICB7c2hvd24ubWFwKChsKSA9PiAoXG4gICAgICAgICAgPGRpdiBrZXk9e2wuaWR9IGNsYXNzTmFtZT17YGxpbmUtaW4gd2hpdGVzcGFjZS1wcmUtd3JhcCBicmVhay13b3JkcyAke0NPTE9SW2wua2luZF19YH0+XG4gICAgICAgICAgICB7bC5raW5kICE9PSBcImFydFwiICYmIDxzcGFuIGNsYXNzTmFtZT1cIm1yLTIuNSBzZWxlY3Qtbm9uZSB0ZXh0LWZhaW50LzcwXCI+e2ZtdFRpbWUobC50cyl9PC9zcGFuPn1cbiAgICAgICAgICAgIHtsLmtpbmQgPT09IFwiY21kXCIgJiYgPHNwYW4gY2xhc3NOYW1lPVwibXItMS41IHRleHQtZ3JuXCI+4p2vPC9zcGFuPn1cbiAgICAgICAgICAgIHtsLnRleHR9XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICkpfVxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImgtMlwiIC8+XG4gICAgICA8L2Rpdj5cblxuICAgICAgeyFzdHVjayAmJiAoXG4gICAgICAgIDxidXR0b25cbiAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBlbCA9IGJveFJlZi5jdXJyZW50O1xuICAgICAgICAgICAgaWYgKGVsKSBlbC5zY3JvbGxUb3AgPSBlbC5zY3JvbGxIZWlnaHQ7XG4gICAgICAgICAgICBzZXRTdHVjayh0cnVlKTtcbiAgICAgICAgICB9fVxuICAgICAgICAgIGNsYXNzTmFtZT1cInBvcC1pbiBhYnNvbHV0ZSBib3R0b20tMyBsZWZ0LTEvMiB6LTEwIC10cmFuc2xhdGUteC0xLzIgcm91bmRlZC1mdWxsIGJvcmRlciBib3JkZXItbGluZTIgYmctcmFpc2UgcHgtMy41IHB5LTEgZm9udC1jcnQgdGV4dC1bMTNweF0gdHJhY2tpbmctd2lkZXN0IHRleHQtZ3JuIHNoYWRvdy1bMF8wXzIwcHhfLTRweF9yZ2JhKDAsMjU1LDY1LDAuNDUpXSB0cmFuc2l0aW9uLXRyYW5zZm9ybSBob3ZlcjpzY2FsZS0xMDVcIlxuICAgICAgICA+XG4gICAgICAgICAg4pa8IGFiYWpvXG4gICAgICAgIDwvYnV0dG9uPlxuICAgICAgKX1cbiAgICA8L2Rpdj5cbiAgKTtcbn1cblxuLyogPT09PT09PT09PT09PT09PT0gVGlja2VyIGRlIHRva2VucyA9PT09PT09PT09PT09PT09PSAqL1xuZXhwb3J0IGZ1bmN0aW9uIFRva2VuU3RyaXAoeyB0b2tlbnMgfTogeyB0b2tlbnM6IFRva2VuW10gfSkge1xuICBpZiAoIXRva2Vucy5sZW5ndGgpIHJldHVybiBudWxsO1xuICBjb25zdCBpdGVtcyA9IFsuLi50b2tlbnMsIC4uLnRva2Vuc107XG4gIHJldHVybiAoXG4gICAgPGRpdiBjbGFzc05hbWU9XCJyZWxhdGl2ZSBvdmVyZmxvdy1oaWRkZW4gYm9yZGVyLXQgYm9yZGVyLWxpbmUgYmctcGFuZS83MFwiPlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJ0aWNrZXItdHJhY2sgcHktMS41XCI+XG4gICAgICAgIHtpdGVtcy5tYXAoKHQsIGkpID0+IHtcbiAgICAgICAgICBjb25zdCBjaGcgPSAoKHQucHJpY2UgLSB0Lmhpc3RvcnlbMF0pIC8gKHQuaGlzdG9yeVswXSB8fCAxKSkgKiAxMDA7XG4gICAgICAgICAgY29uc3QgdXAgPSBjaGcgPj0gMDtcbiAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgPHNwYW4ga2V5PXtgJHt0Lm1pbnR9LSR7aX1gfSBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMiB3aGl0ZXNwYWNlLW5vd3JhcCBweC01IGZvbnQtbW9ubyB0ZXh0LVsxMC41cHhdXCI+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZvbnQtc2VtaWJvbGQgdGV4dC10eHQvODVcIj4ke3Quc3ltYm9sfTwvc3Bhbj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1kaW0gdGFidWxhci1udW1zXCI+e2ZtdFByaWNlKHQucHJpY2UpfTwvc3Bhbj5cbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPXtgdGFidWxhci1udW1zICR7dXAgPyBcInRleHQtZ3JuXCIgOiBcInRleHQtcmVkXCJ9YH0+e2ZtdFNpZ25lZChjaGcsIDEsIFwiJVwiKX08L3NwYW4+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cInRleHQtZmFpbnRcIj7Ctzwvc3Bhbj5cbiAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICApO1xuICAgICAgICB9KX1cbiAgICAgIDwvZGl2PlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJwb2ludGVyLWV2ZW50cy1ub25lIGFic29sdXRlIGluc2V0LXktMCBsZWZ0LTAgdy0xNCBiZy1ncmFkaWVudC10by1yIGZyb20td2luIHRvLXRyYW5zcGFyZW50XCIgLz5cbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwicG9pbnRlci1ldmVudHMtbm9uZSBhYnNvbHV0ZSBpbnNldC15LTAgcmlnaHQtMCB3LTE0IGJnLWdyYWRpZW50LXRvLWwgZnJvbS13aW4gdG8tdHJhbnNwYXJlbnRcIiAvPlxuICAgIDwvZGl2PlxuICApO1xufVxuXG4vKiA9PT09PT09PT09PT09PT09PSBDb25zb2xhIGRlIGNvbWFuZG9zID09PT09PT09PT09PT09PT09ICovXG5jb25zdCBISU5UUyA9IFtcImhlbHBcIiwgXCJwb3NcIiwgXCJ3YWxsZXRzXCIsIFwidGVzb3JlcmlhXCIsIFwiZWRpdGFyXCIsIFwiemlwXCIsIFwicmVzZXRcIl07XG5cbmV4cG9ydCBmdW5jdGlvbiBDb21tYW5kQmFyKHsgb25Db21tYW5kIH06IHsgb25Db21tYW5kOiAocmF3OiBzdHJpbmcpID0+IHZvaWQgfSkge1xuICBjb25zdCBbdmFsdWUsIHNldFZhbHVlXSA9IHVzZVN0YXRlKFwiXCIpO1xuICBjb25zdCBoaXN0b3J5ID0gdXNlUmVmPHN0cmluZ1tdPihbXSk7XG4gIGNvbnN0IGhJZHggPSB1c2VSZWYoLTEpO1xuICBjb25zdCBpbnB1dFJlZiA9IHVzZVJlZjxIVE1MSW5wdXRFbGVtZW50PihudWxsKTtcblxuICBjb25zdCBzdWJtaXQgPSAoKSA9PiB7XG4gICAgY29uc3QgY21kID0gdmFsdWUudHJpbSgpO1xuICAgIGlmICghY21kKSByZXR1cm47XG4gICAgaGlzdG9yeS5jdXJyZW50ID0gW2NtZCwgLi4uaGlzdG9yeS5jdXJyZW50LmZpbHRlcigoaCkgPT4gaCAhPT0gY21kKV0uc2xpY2UoMCwgNDApO1xuICAgIGhJZHguY3VycmVudCA9IC0xO1xuICAgIG9uQ29tbWFuZChjbWQpO1xuICAgIHNldFZhbHVlKFwiXCIpO1xuICB9O1xuXG4gIGNvbnN0IG9uS2V5ID0gKGU6IFJlYWN0LktleWJvYXJkRXZlbnQ8SFRNTElucHV0RWxlbWVudD4pID0+IHtcbiAgICBpZiAoZS5rZXkgPT09IFwiRW50ZXJcIikgc3VibWl0KCk7XG4gICAgZWxzZSBpZiAoZS5rZXkgPT09IFwiQXJyb3dVcFwiKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBpZiAoaGlzdG9yeS5jdXJyZW50Lmxlbmd0aCkge1xuICAgICAgICBoSWR4LmN1cnJlbnQgPSBNYXRoLm1pbihoSWR4LmN1cnJlbnQgKyAxLCBoaXN0b3J5LmN1cnJlbnQubGVuZ3RoIC0gMSk7XG4gICAgICAgIHNldFZhbHVlKGhpc3RvcnkuY3VycmVudFtoSWR4LmN1cnJlbnRdKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGUua2V5ID09PSBcIkFycm93RG93blwiKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBoSWR4LmN1cnJlbnQgPSBNYXRoLm1heChoSWR4LmN1cnJlbnQgLSAxLCAtMSk7XG4gICAgICBzZXRWYWx1ZShoSWR4LmN1cnJlbnQgPT09IC0xID8gXCJcIiA6IGhpc3RvcnkuY3VycmVudFtoSWR4LmN1cnJlbnRdKTtcbiAgICB9XG4gIH07XG5cbiAgcmV0dXJuIChcbiAgICA8ZGl2IGNsYXNzTmFtZT1cImJvcmRlci10IGJvcmRlci1saW5lIGJnLXBhbmUvOTAgcHgtNCBweS0yLjVcIj5cbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwibWItMiBmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMS41IG92ZXJmbG93LXgtYXV0b1wiPlxuICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJzaHJpbmstMCB0ZXh0LVs5cHhdIGZvbnQtbWVkaXVtIHRyYWNraW5nLVswLjE2ZW1dIHRleHQtZmFpbnRcIj5DT01BTkRPUzo8L3NwYW4+XG4gICAgICAgIHtISU5UUy5tYXAoKGgpID0+IChcbiAgICAgICAgICA8YnV0dG9uXG4gICAgICAgICAgICBrZXk9e2h9XG4gICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4gICAgICAgICAgICAgIHNldFZhbHVlKGgpO1xuICAgICAgICAgICAgICBpbnB1dFJlZi5jdXJyZW50Py5mb2N1cygpO1xuICAgICAgICAgICAgfX1cbiAgICAgICAgICAgIGNsYXNzTmFtZT1cInNocmluay0wIHJvdW5kZWQgYm9yZGVyIGJvcmRlci1saW5lIHB4LTIgcHktMC41IGZvbnQtbW9ubyB0ZXh0LVsxMHB4XSB0ZXh0LWRpbSB0cmFuc2l0aW9uLWFsbCBob3Zlcjpib3JkZXItZ3JuLzUwIGhvdmVyOnRleHQtZ3JuXCJcbiAgICAgICAgICA+XG4gICAgICAgICAgICB7aH1cbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgKSl9XG4gICAgICA8L2Rpdj5cbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZmxleCBjdXJzb3ItdGV4dCBpdGVtcy1jZW50ZXIgZ2FwLTJcIiBvbkNsaWNrPXsoKSA9PiBpbnB1dFJlZi5jdXJyZW50Py5mb2N1cygpfT5cbiAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiZm9udC1tb25vIHRleHQtWzEzcHhdIGZvbnQtYm9sZCB0ZXh0LWdyblwiPm1lbWVib3Q8L3NwYW4+XG4gICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZvbnQtbW9ubyB0ZXh0LVsxM3B4XSB0ZXh0LWZhaW50XCI+4p2vPC9zcGFuPlxuICAgICAgICA8aW5wdXRcbiAgICAgICAgICByZWY9e2lucHV0UmVmfVxuICAgICAgICAgIHZhbHVlPXt2YWx1ZX1cbiAgICAgICAgICBvbkNoYW5nZT17KGUpID0+IHNldFZhbHVlKGUudGFyZ2V0LnZhbHVlKX1cbiAgICAgICAgICBvbktleURvd249e29uS2V5fVxuICAgICAgICAgIHNwZWxsQ2hlY2s9e2ZhbHNlfVxuICAgICAgICAgIGF1dG9DYXBpdGFsaXplPVwib2ZmXCJcbiAgICAgICAgICBhdXRvQ29tcGxldGU9XCJvZmZcIlxuICAgICAgICAgIGFyaWEtbGFiZWw9XCJjb25zb2xhIGRlIGNvbWFuZG9zXCJcbiAgICAgICAgICBwbGFjZWhvbGRlcj0nZXNjcmliZSBcImhlbHBcIiDCtyDihpHihpMgaGlzdG9yaWFsJ1xuICAgICAgICAgIGNsYXNzTmFtZT1cIm1pbi13LTAgZmxleC0xIGJnLXRyYW5zcGFyZW50IGZvbnQtbW9ubyB0ZXh0LVsxM3B4XSB0ZXh0LXR4dCBvdXRsaW5lLW5vbmUgcGxhY2Vob2xkZXI6dGV4dC1mYWludC83MFwiXG4gICAgICAgICAgc3R5bGU9e3sgY2FyZXRDb2xvcjogXCIjMDBmZjQxXCIgfX1cbiAgICAgICAgLz5cbiAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiY3Vyc29yLWJsaW5rIHNlbGVjdC1ub25lIGZvbnQtbW9ubyB0ZXh0LVsxM3B4XSB0ZXh0LWdyblwiPuKWijwvc3Bhbj5cbiAgICAgIDwvZGl2PlxuICAgIDwvZGl2PlxuICApO1xufVxuIl0sImZpbGUiOiIvd29ya3NwYWNlL3NyYy9jb21wb25lbnRzL3Rlcm1pbmFsLnRzeCJ9