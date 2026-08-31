import { createHotContext as __vite__createHotContext } from "/@vite/client";import.meta.hot = __vite__createHotContext("/src/components/modals.tsx");import __vite__cjsImport0_react_jsxDevRuntime from "/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=2090559e"; const jsxDEV = __vite__cjsImport0_react_jsxDevRuntime["jsxDEV"];
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
  window.$RefreshReg$ = RefreshRuntime.getRefreshReg("/workspace/src/components/modals.tsx");
  window.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;
}
var _s = $RefreshSig$(), _s2 = $RefreshSig$();
import __vite__cjsImport3_react from "/node_modules/.vite/deps/react.js?v=2090559e"; const useMemo = __vite__cjsImport3_react["useMemo"]; const useState = __vite__cjsImport3_react["useState"];
import { parseConfig } from "/src/config.ts";
import {
  OUTCOME_LABEL,
  README,
  buildProjectZip,
  buildSourceBundle,
  copyText,
  deliverBlob,
  deliverTextFile,
  formatBytes,
  listSourceFiles
} from "/src/download.ts?t=1788152212714";
export function ConfigEditor({
  initialText,
  onSave,
  onClose
}) {
  _s();
  const [text, setText] = useState(initialText);
  const [flashErr, setFlashErr] = useState(false);
  const lineCount = useMemo(() => text.split("\n").length, [text]);
  const { errors, walletCount, cfg } = useMemo(() => {
    const r = parseConfig(text);
    return { errors: r.errors, walletCount: r.walletCount, cfg: r.cfg };
  }, [text]);
  const handleSave = () => {
    const ok = onSave(text);
    if (!ok) {
      setFlashErr(true);
      setTimeout(() => setFlashErr(false), 600);
    }
  };
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") onClose();
  };
  const loadFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt,.ini,.conf,text/plain";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") setText(reader.result);
      };
      reader.readAsText(f);
    };
    input.click();
  };
  return /* @__PURE__ */ jsxDEV("div", { className: "absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]", children: /* @__PURE__ */ jsxDEV("div", { className: `panel pop-in flex h-[min(88%,640px)] w-full max-w-3xl flex-col overflow-hidden ${flashErr ? "ring-2 ring-red/70" : ""}`, children: [
    /* @__PURE__ */ jsxDEV("div", { className: "panel-head flex items-center gap-3 border-b border-line px-4 py-3", children: [
      /* @__PURE__ */ jsxDEV("span", { className: "font-crt text-[17px] text-grn", children: "⌘" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 88,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsxDEV("p", { className: "panel-title text-[13px]", children: "~/bot/config.txt" }, void 0, false, {
          fileName: "/workspace/src/components/modals.tsx",
          lineNumber: 90,
          columnNumber: 13
        }, this),
        /* @__PURE__ */ jsxDEV("p", { className: "font-mono text-[10px] text-faint", children: [
          walletCount,
          " wallet(s) · el precio SOL/USD se lee EN VIVO (no se edita) · Ctrl+S guarda"
        ] }, void 0, true, {
          fileName: "/workspace/src/components/modals.tsx",
          lineNumber: 91,
          columnNumber: 13
        }, this)
      ] }, void 0, true, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 89,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "flex-1" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 95,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV("button", { onClick: loadFile, className: "btn", title: "Cargar un config.txt desde tu PC", children: "Cargar…" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 96,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV("button", { onClick: handleSave, className: "btn btn-hot", title: "Guardar y aplicar (Ctrl+S)", children: "Guardar" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 99,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV("button", { onClick: onClose, className: "btn", title: "Cerrar (Esc)", children: "✕" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 102,
        columnNumber: 11
      }, this)
    ] }, void 0, true, {
      fileName: "/workspace/src/components/modals.tsx",
      lineNumber: 87,
      columnNumber: 9
    }, this),
    errors.length > 0 ? /* @__PURE__ */ jsxDEV("div", { className: "max-h-24 overflow-y-auto border-b border-line bg-red/5 px-4 py-2", children: [
      errors.slice(0, 4).map(
        (e, i) => /* @__PURE__ */ jsxDEV("p", { className: "font-mono text-[11px] text-red", children: [
          "✗ ",
          e
        ] }, i, true, {
          fileName: "/workspace/src/components/modals.tsx",
          lineNumber: 110,
          columnNumber: 11
        }, this)
      ),
      errors.length > 4 && /* @__PURE__ */ jsxDEV("p", { className: "font-mono text-[11px] text-red/70", children: [
        "… y ",
        errors.length - 4,
        " más"
      ] }, void 0, true, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 114,
        columnNumber: 35
      }, this)
    ] }, void 0, true, {
      fileName: "/workspace/src/components/modals.tsx",
      lineNumber: 108,
      columnNumber: 9
    }, this) : /* @__PURE__ */ jsxDEV("div", { className: "border-b border-line bg-grn/5 px-4 py-1.5", children: /* @__PURE__ */ jsxDEV("p", { className: "font-mono text-[11px] text-grn", children: [
      "✓ sintaxis correcta · ",
      walletCount,
      " wallet(s) · reserva ",
      cfg.reservaGlobal.toFixed(2),
      " SOL · R0",
      " ",
      cfg.snapshotInicial ? "on" : "off",
      " · R0.5 ",
      cfg.filtroAntiDust ? "on" : "off",
      " · R5",
      " ",
      cfg.autoSwapUsdc ? "on" : "off"
    ] }, void 0, true, {
      fileName: "/workspace/src/components/modals.tsx",
      lineNumber: 118,
      columnNumber: 13
    }, this) }, void 0, false, {
      fileName: "/workspace/src/components/modals.tsx",
      lineNumber: 117,
      columnNumber: 9
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "flex min-h-0 flex-1", children: [
      /* @__PURE__ */ jsxDEV("div", { className: "select-none overflow-hidden border-r border-line bg-pane/60 px-3 py-3 text-right font-mono text-[12px] leading-[1.65] text-faint", children: Array.from(
        { length: lineCount },
        (_, i) => /* @__PURE__ */ jsxDEV("div", { children: i + 1 }, i, false, {
          fileName: "/workspace/src/components/modals.tsx",
          lineNumber: 129,
          columnNumber: 13
        }, this)
      ) }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 127,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV(
        "textarea",
        {
          value: text,
          onChange: (e) => setText(e.target.value),
          onKeyDown: onKey,
          spellCheck: false,
          className: "editor min-h-0 flex-1 overflow-auto px-4 py-3"
        },
        void 0,
        false,
        {
          fileName: "/workspace/src/components/modals.tsx",
          lineNumber: 132,
          columnNumber: 11
        },
        this
      )
    ] }, void 0, true, {
      fileName: "/workspace/src/components/modals.tsx",
      lineNumber: 126,
      columnNumber: 9
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "flex items-center gap-4 border-t border-line bg-pane/70 px-4 py-2 font-mono text-[10px] text-faint", children: [
      /* @__PURE__ */ jsxDEV("span", { children: [
        /* @__PURE__ */ jsxDEV("b", { className: "text-grn", children: "^S" }, void 0, false, {
          fileName: "/workspace/src/components/modals.tsx",
          lineNumber: 143,
          columnNumber: 13
        }, this),
        " guardar"
      ] }, void 0, true, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 142,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV("span", { children: [
        /* @__PURE__ */ jsxDEV("b", { className: "text-grn", children: "Esc" }, void 0, false, {
          fileName: "/workspace/src/components/modals.tsx",
          lineNumber: 146,
          columnNumber: 13
        }, this),
        " cerrar"
      ] }, void 0, true, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 145,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV("span", { className: "ml-auto", children: [
        "[wallets] → ",
        /* @__PURE__ */ jsxDEV("span", { className: "text-dim", children: "DIRECCION = Alias, CapitalUSD" }, void 0, false, {
          fileName: "/workspace/src/components/modals.tsx",
          lineNumber: 149,
          columnNumber: 25
        }, this)
      ] }, void 0, true, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 148,
        columnNumber: 11
      }, this)
    ] }, void 0, true, {
      fileName: "/workspace/src/components/modals.tsx",
      lineNumber: 141,
      columnNumber: 9
    }, this)
  ] }, void 0, true, {
    fileName: "/workspace/src/components/modals.tsx",
    lineNumber: 86,
    columnNumber: 7
  }, this) }, void 0, false, {
    fileName: "/workspace/src/components/modals.tsx",
    lineNumber: 85,
    columnNumber: 5
  }, this);
}
_s(ConfigEditor, "pW0VjWlFmLNMoUI6ItVrPBeKw/M=");
_c = ConfigEditor;
const STEPS = [
  [
    "1",
    "Esta ventana es el bot (MEMEBOT)",
    "Arriba ves la consola en vivo: R1 COMPRÓ (compra válida copiada) y R3 VENDIÓ (venta copiada). Los airdrops van a DUST.LOG y los promedios a IGNORADOS."
  ],
  [
    "2",
    "Empieza desde cero: pon TU wallet",
    "El radar viene vacío. Pulsa ⌘ config.txt (panel derecho) y pégala en [wallets], o en la consola: seguir <dirección> <alias> <usd>. El bot la vigila en la blockchain REAL."
  ],
  [
    "3",
    "Precios reales, dinero paper",
    "SOL LIVE lee el precio de Jupiter cada 10 s (nadie lo escribe a mano). La TESORERÍA usa SOL ficticios: arranca con 1.5 (cámbialo en config.txt con reserva_global)."
  ]
];
export function Onboarding({
  onDone,
  onOpenConfig,
  onDownload
}) {
  return /* @__PURE__ */ jsxDEV("div", { className: "absolute inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm", children: /* @__PURE__ */ jsxDEV("div", { className: "panel pop-in w-full max-w-lg overflow-hidden", children: [
    /* @__PURE__ */ jsxDEV("div", { className: "border-b border-line bg-pane/80 px-5 py-4", children: [
      /* @__PURE__ */ jsxDEV("p", { className: "font-crt text-[24px] font-bold tracking-wide text-grn [text-shadow:0_0_20px_rgba(0,255,65,0.45)]", children: "¿DÓNDE ESTÁ CADA COSA?" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 189,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV("p", { className: "mt-1 font-mono text-[11px] text-dim", children: "30 segundos para orientarte · esto no vuelve a aparecer" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 192,
        columnNumber: 11
      }, this)
    ] }, void 0, true, {
      fileName: "/workspace/src/components/modals.tsx",
      lineNumber: 188,
      columnNumber: 9
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "space-y-4 px-5 py-5", children: STEPS.map(
      ([n, title, body]) => /* @__PURE__ */ jsxDEV("div", { className: "flex gap-3.5", children: [
        /* @__PURE__ */ jsxDEV("span", { className: "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-grn/40 bg-grn/10 font-crt text-[16px] font-bold text-grn", children: n }, void 0, false, {
          fileName: "/workspace/src/components/modals.tsx",
          lineNumber: 197,
          columnNumber: 15
        }, this),
        /* @__PURE__ */ jsxDEV("div", { children: [
          /* @__PURE__ */ jsxDEV("p", { className: "font-mono text-[13px] font-semibold text-txt", children: title }, void 0, false, {
            fileName: "/workspace/src/components/modals.tsx",
            lineNumber: 201,
            columnNumber: 17
          }, this),
          /* @__PURE__ */ jsxDEV("p", { className: "mt-0.5 font-mono text-[11px] leading-relaxed text-dim", children: body }, void 0, false, {
            fileName: "/workspace/src/components/modals.tsx",
            lineNumber: 202,
            columnNumber: 17
          }, this)
        ] }, void 0, true, {
          fileName: "/workspace/src/components/modals.tsx",
          lineNumber: 200,
          columnNumber: 15
        }, this)
      ] }, n, true, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 196,
        columnNumber: 11
      }, this)
    ) }, void 0, false, {
      fileName: "/workspace/src/components/modals.tsx",
      lineNumber: 194,
      columnNumber: 9
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "flex flex-col gap-2 border-t border-line bg-pane/60 px-5 py-4 sm:flex-row", children: [
      /* @__PURE__ */ jsxDEV("button", { onClick: onOpenConfig, className: "btn btn-hot flex-1 justify-center py-2.5 text-[11px]", children: "⌘ ABRIR config.txt" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 208,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV("button", { onClick: onDownload, className: "btn flex-1 justify-center py-2.5 text-[11px]", children: "⇩ DESCARGAR EL BOT" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 211,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV("button", { onClick: onDone, className: "btn flex-1 justify-center py-2.5 text-[11px]", children: "YA LO VI · CERRAR" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 214,
        columnNumber: 11
      }, this)
    ] }, void 0, true, {
      fileName: "/workspace/src/components/modals.tsx",
      lineNumber: 207,
      columnNumber: 9
    }, this)
  ] }, void 0, true, {
    fileName: "/workspace/src/components/modals.tsx",
    lineNumber: 187,
    columnNumber: 7
  }, this) }, void 0, false, {
    fileName: "/workspace/src/components/modals.tsx",
    lineNumber: 186,
    columnNumber: 5
  }, this);
}
_c2 = Onboarding;
export function DownloadCenter({
  configText,
  onClose,
  onLog
}) {
  _s2();
  const [busy, setBusy] = useState(null);
  const [packing, setPacking] = useState(null);
  const [zipDone, setZipDone] = useState(null);
  const files = useMemo(() => listSourceFiles(), []);
  const run = async (key, fn) => {
    setBusy(key);
    try {
      const msg = await fn();
      onLog(`DESCARGA    ${msg}`, "ok");
    } catch {
      onLog(`DESCARGA    ✗ no se pudo entregar ${key}`, "err");
    } finally {
      setBusy(null);
    }
  };
  const downloadZip = async () => {
    setBusy("zip");
    setZipDone(null);
    try {
      const zip = await buildProjectZip((done, total, file) => setPacking({ done, total, file }));
      const o = await deliverBlob("memebot.zip", zip.blob);
      setPacking(null);
      setZipDone({ bytes: zip.bytes, included: zip.included, failed: zip.failed.length });
      onLog(
        `DESCARGA    memebot.zip → ${OUTCOME_LABEL[o]} · ${zip.included}/${files.length} archivos · ${formatBytes(zip.bytes)}`,
        o === "fallo" ? "err" : "ok"
      );
      if (zip.failed.length) {
        onLog(`DESCARGA    ⚠ no se incluyeron: ${zip.failed.join(", ")}`, "warn");
      }
    } catch {
      setPacking(null);
      onLog("DESCARGA    ✗ no se pudo generar el ZIP · usa memebot-source.txt", "err");
    } finally {
      setBusy(null);
    }
  };
  const pct = packing ? Math.round(packing.done / packing.total * 100) : 0;
  return /* @__PURE__ */ jsxDEV("div", { className: "absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]", onClick: onClose, children: /* @__PURE__ */ jsxDEV("div", { className: "panel pop-in flex h-[min(92%,640px)] w-full max-w-2xl flex-col overflow-hidden", onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxDEV("div", { className: "panel-head flex items-center gap-3 border-b border-line px-4 py-3", children: [
      /* @__PURE__ */ jsxDEV("span", { className: "font-crt text-[20px] text-grn", children: "⇩" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 280,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsxDEV("p", { className: "panel-title text-[14px]", children: "CENTRO DE DESCARGA" }, void 0, false, {
          fileName: "/workspace/src/components/modals.tsx",
          lineNumber: 282,
          columnNumber: 13
        }, this),
        /* @__PURE__ */ jsxDEV("p", { className: "font-mono text-[10px] text-faint", children: "llévate el memebot a tu PC · no depende de este chat" }, void 0, false, {
          fileName: "/workspace/src/components/modals.tsx",
          lineNumber: 283,
          columnNumber: 13
        }, this)
      ] }, void 0, true, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 281,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "flex-1" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 285,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV("button", { onClick: onClose, className: "btn px-2.5 py-1", title: "Cerrar (Esc)", children: "✕" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 286,
        columnNumber: 11
      }, this)
    ] }, void 0, true, {
      fileName: "/workspace/src/components/modals.tsx",
      lineNumber: 279,
      columnNumber: 9
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "min-h-0 flex-1 overflow-y-auto px-4 py-3", children: [
      /* @__PURE__ */ jsxDEV(
        "div",
        {
          className: "relative overflow-hidden rounded-lg border border-grn/50 bg-raise/60 px-4 py-3",
          style: { boxShadow: zipDone ? "0 0 26px -8px rgba(0,255,65,0.55)" : "0 0 20px -10px rgba(0,255,65,0.4)" },
          children: [
            /* @__PURE__ */ jsxDEV("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsxDEV("span", { className: "font-crt text-[26px] text-grn [text-shadow:0_0_14px_rgba(0,255,65,0.6)]", children: "⇩" }, void 0, false, {
                fileName: "/workspace/src/components/modals.tsx",
                lineNumber: 298,
                columnNumber: 15
              }, this),
              /* @__PURE__ */ jsxDEV("div", { className: "min-w-0 flex-1", children: [
                /* @__PURE__ */ jsxDEV("p", { className: "font-mono text-[13px] font-bold text-grn", children: "memebot.zip — PROYECTO COMPLETO" }, void 0, false, {
                  fileName: "/workspace/src/components/modals.tsx",
                  lineNumber: 300,
                  columnNumber: 17
                }, this),
                /* @__PURE__ */ jsxDEV("p", { className: "font-mono text-[10.5px] text-dim", children: [
                  files.length,
                  " archivos con carpetas (src/, index.js, Dockerfile…) · listo para Railway o tu PC"
                ] }, void 0, true, {
                  fileName: "/workspace/src/components/modals.tsx",
                  lineNumber: 301,
                  columnNumber: 17
                }, this)
              ] }, void 0, true, {
                fileName: "/workspace/src/components/modals.tsx",
                lineNumber: 299,
                columnNumber: 15
              }, this),
              /* @__PURE__ */ jsxDEV(
                "button",
                {
                  onClick: () => void downloadZip(),
                  disabled: busy === "zip",
                  className: "btn btn-hot px-4 py-2 font-crt text-[14px] tracking-wider disabled:opacity-60",
                  children: busy === "zip" ? packing ? `${pct}%` : "…" : zipDone ? "↻ OTRA VEZ" : "DESCARGAR"
                },
                void 0,
                false,
                {
                  fileName: "/workspace/src/components/modals.tsx",
                  lineNumber: 305,
                  columnNumber: 15
                },
                this
              )
            ] }, void 0, true, {
              fileName: "/workspace/src/components/modals.tsx",
              lineNumber: 297,
              columnNumber: 13
            }, this),
            packing && /* @__PURE__ */ jsxDEV("div", { className: "mt-3", children: [
              /* @__PURE__ */ jsxDEV("div", { className: "h-1.5 w-full overflow-hidden rounded-full bg-black/50", children: /* @__PURE__ */ jsxDEV(
                "div",
                {
                  className: "h-full rounded-full bg-grn transition-[width] duration-150",
                  style: { width: `${pct}%`, boxShadow: "0 0 10px rgba(0,255,65,0.8)" }
                },
                void 0,
                false,
                {
                  fileName: "/workspace/src/components/modals.tsx",
                  lineNumber: 318,
                  columnNumber: 19
                },
                this
              ) }, void 0, false, {
                fileName: "/workspace/src/components/modals.tsx",
                lineNumber: 317,
                columnNumber: 17
              }, this),
              /* @__PURE__ */ jsxDEV("p", { className: "mt-1.5 truncate font-mono text-[10px] text-faint", children: [
                "empacando ",
                packing.done,
                "/",
                packing.total,
                " · ",
                /* @__PURE__ */ jsxDEV("span", { className: "text-dim", children: packing.file }, void 0, false, {
                  fileName: "/workspace/src/components/modals.tsx",
                  lineNumber: 324,
                  columnNumber: 62
                }, this)
              ] }, void 0, true, {
                fileName: "/workspace/src/components/modals.tsx",
                lineNumber: 323,
                columnNumber: 17
              }, this)
            ] }, void 0, true, {
              fileName: "/workspace/src/components/modals.tsx",
              lineNumber: 316,
              columnNumber: 13
            }, this),
            zipDone && !packing && /* @__PURE__ */ jsxDEV("p", { className: "mt-2.5 font-mono text-[10.5px] text-grn", children: [
              "✓ ",
              zipDone.included,
              " archivos · ",
              formatBytes(zipDone.bytes),
              zipDone.failed > 0 ? ` · ⚠ ${zipDone.failed} no legible(s)` : "",
              " · revisa tu carpeta de descargas"
            ] }, void 0, true, {
              fileName: "/workspace/src/components/modals.tsx",
              lineNumber: 330,
              columnNumber: 13
            }, this)
          ]
        },
        void 0,
        true,
        {
          fileName: "/workspace/src/components/modals.tsx",
          lineNumber: 293,
          columnNumber: 11
        },
        this
      ),
      /* @__PURE__ */ jsxDEV("div", { className: "mt-2 space-y-2", children: [
        {
          key: "bundle",
          icon: "≡",
          title: "memebot-source.txt — fallback: todo en uno",
          desc: "por si el .zip no abre en tu sistema (separado por ===== FILE: =====)",
          action: () => run("bundle", async () => {
            const bundle = await buildSourceBundle();
            const o = await deliverTextFile("memebot-source.txt", bundle);
            return `código fuente → ${OUTCOME_LABEL[o]}`;
          }),
          copy: () => buildSourceBundle()
        },
        {
          key: "config",
          icon: "⌘",
          title: "config.txt — tu configuración actual",
          desc: "tal como la tienes ahora (wallets, reserva, reglas)",
          action: () => run("config", async () => {
            const o = await deliverTextFile("config.txt", configText);
            return `config.txt → ${OUTCOME_LABEL[o]}`;
          }),
          copy: () => Promise.resolve(configText)
        },
        {
          key: "readme",
          icon: "▤",
          title: "README.md — instrucciones",
          desc: "cómo correrlo en tu PC y desplegarlo en Railway",
          action: () => run("readme", async () => {
            const o = await deliverTextFile("README.md", README);
            return `README.md → ${OUTCOME_LABEL[o]}`;
          }),
          copy: () => Promise.resolve(README)
        }
      ].map(
        (it) => /* @__PURE__ */ jsxDEV("div", { className: "flex items-center gap-3 rounded-lg border border-line bg-raise/40 px-3 py-2.5 transition-all hover:border-grn/40", children: [
          /* @__PURE__ */ jsxDEV("span", { className: "font-crt text-[18px] text-grn/80", children: it.icon }, void 0, false, {
            fileName: "/workspace/src/components/modals.tsx",
            lineNumber: 379,
            columnNumber: 17
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "min-w-0 flex-1", children: [
            /* @__PURE__ */ jsxDEV("p", { className: "font-mono text-[12px] font-semibold text-txt/90", children: it.title }, void 0, false, {
              fileName: "/workspace/src/components/modals.tsx",
              lineNumber: 381,
              columnNumber: 19
            }, this),
            /* @__PURE__ */ jsxDEV("p", { className: "font-mono text-[10px] text-faint", children: it.desc }, void 0, false, {
              fileName: "/workspace/src/components/modals.tsx",
              lineNumber: 382,
              columnNumber: 19
            }, this)
          ] }, void 0, true, {
            fileName: "/workspace/src/components/modals.tsx",
            lineNumber: 380,
            columnNumber: 17
          }, this),
          /* @__PURE__ */ jsxDEV("button", { onClick: () => void it.action(), disabled: busy === it.key, className: "btn px-3 py-1.5 text-[10.5px] disabled:opacity-60", children: busy === it.key ? "…" : "BAJAR" }, void 0, false, {
            fileName: "/workspace/src/components/modals.tsx",
            lineNumber: 384,
            columnNumber: 17
          }, this),
          /* @__PURE__ */ jsxDEV(
            "button",
            {
              onClick: () => void run(it.key + "-copy", async () => {
                const ok = await copyText(await it.copy());
                return ok ? `${it.key} copiado al portapapeles` : "✗ no se pudo copiar";
              }),
              className: "btn px-2.5 py-1.5 text-[10.5px]",
              children: "COPIAR"
            },
            void 0,
            false,
            {
              fileName: "/workspace/src/components/modals.tsx",
              lineNumber: 387,
              columnNumber: 17
            },
            this
          )
        ] }, it.key, true, {
          fileName: "/workspace/src/components/modals.tsx",
          lineNumber: 378,
          columnNumber: 13
        }, this)
      ) }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 338,
        columnNumber: 11
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "mt-4", children: [
        /* @__PURE__ */ jsxDEV("p", { className: "font-crt text-[13px] tracking-[0.14em] text-grn/80", children: [
          "ARCHIVOS INCLUIDOS (",
          files.length,
          ")"
        ] }, void 0, true, {
          fileName: "/workspace/src/components/modals.tsx",
          lineNumber: 404,
          columnNumber: 13
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "mt-2 grid grid-cols-1 gap-x-4 sm:grid-cols-2", children: files.map(
          (f) => /* @__PURE__ */ jsxDEV("p", { className: "truncate font-mono text-[11px] text-dim", children: [
            /* @__PURE__ */ jsxDEV("span", { className: "text-grn", children: "✓" }, void 0, false, {
              fileName: "/workspace/src/components/modals.tsx",
              lineNumber: 408,
              columnNumber: 19
            }, this),
            " ",
            f.replace(/^\//, "")
          ] }, f, true, {
            fileName: "/workspace/src/components/modals.tsx",
            lineNumber: 407,
            columnNumber: 15
          }, this)
        ) }, void 0, false, {
          fileName: "/workspace/src/components/modals.tsx",
          lineNumber: 405,
          columnNumber: 13
        }, this)
      ] }, void 0, true, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 403,
        columnNumber: 11
      }, this)
    ] }, void 0, true, {
      fileName: "/workspace/src/components/modals.tsx",
      lineNumber: 291,
      columnNumber: 9
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "border-t border-line bg-pane/70 px-4 py-3", children: /* @__PURE__ */ jsxDEV("p", { className: "font-mono text-[10px] leading-relaxed text-faint", children: [
      "descomprime ",
      /* @__PURE__ */ jsxDEV("span", { className: "text-dim", children: "memebot.zip" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 417,
        columnNumber: 25
      }, this),
      " →",
      " ",
      /* @__PURE__ */ jsxDEV("span", { className: "text-dim", children: "npm install" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 418,
        columnNumber: 13
      }, this),
      " → ",
      /* @__PURE__ */ jsxDEV("span", { className: "text-dim", children: "npm run dev" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 418,
        columnNumber: 61
      }, this),
      " · o despliégalo en Railway (guía ",
      /* @__PURE__ */ jsxDEV("span", { className: "text-dim", children: "DEPLOY_RAILWAY.md" }, void 0, false, {
        fileName: "/workspace/src/components/modals.tsx",
        lineNumber: 419,
        columnNumber: 44
      }, this),
      ") · necesita Node.js 18+"
    ] }, void 0, true, {
      fileName: "/workspace/src/components/modals.tsx",
      lineNumber: 416,
      columnNumber: 11
    }, this) }, void 0, false, {
      fileName: "/workspace/src/components/modals.tsx",
      lineNumber: 415,
      columnNumber: 9
    }, this)
  ] }, void 0, true, {
    fileName: "/workspace/src/components/modals.tsx",
    lineNumber: 278,
    columnNumber: 7
  }, this) }, void 0, false, {
    fileName: "/workspace/src/components/modals.tsx",
    lineNumber: 277,
    columnNumber: 5
  }, this);
}
_s2(DownloadCenter, "nHZU7SsQPJU9Yx3Tmo19Xfbulys=");
_c3 = DownloadCenter;
var _c, _c2, _c3;
$RefreshReg$(_c, "ConfigEditor");
$RefreshReg$(_c2, "Onboarding");
$RefreshReg$(_c3, "DownloadCenter");
if (import.meta.hot && !inWebWorker) {
  window.$RefreshReg$ = prevRefreshReg;
  window.$RefreshSig$ = prevRefreshSig;
}
if (import.meta.hot && !inWebWorker) {
  RefreshRuntime.__hmr_import(import.meta.url).then((currentExports) => {
    RefreshRuntime.registerExportsForReactRefresh("/workspace/src/components/modals.tsx", currentExports);
    import.meta.hot.accept((nextExports) => {
      if (!nextExports) return;
      const invalidateMessage = RefreshRuntime.validateRefreshBoundaryAndEnqueueUpdate("/workspace/src/components/modals.tsx", currentExports, nextExports);
      if (invalidateMessage) import.meta.hot.invalidate(invalidateMessage);
    });
  });
}

//# sourceMappingURL=data:application/json;base64,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QTNCO0FBQUE7QUFBQTtBQUFBO0FBQUEsYUFBc0M7QUFBQSxNQUFPO0FBQUEsTUFDOUQsdUJBQUMsVUFBSyxXQUFVLFlBQVcsaUNBQTNCO0FBQUE7QUFBQTtBQUFBO0FBQUEsYUFBNEM7QUFBQSxNQUFPO0FBQUEsU0FIcEY7QUFBQTtBQUFBO0FBQUE7QUFBQSxXQUlBLEtBTEY7QUFBQTtBQUFBO0FBQUE7QUFBQSxXQU1BO0FBQUEsT0EvSUY7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQWdKQSxLQWpKRjtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBa0pBO0FBRUo7QUFBQ2lDLElBek1lSCxnQkFBYztBQUFBLE1BQWRBO0FBQWMsSUFBQXVDLElBQUF4QyxLQUFBeUM7QUFBQSxhQUFBRCxJQUFBO0FBQUEsYUFBQXhDLEtBQUE7QUFBQSxhQUFBeUMsS0FBQSIsIm5hbWVzIjpbInVzZU1lbW8iLCJ1c2VTdGF0ZSIsInBhcnNlQ29uZmlnIiwiT1VUQ09NRV9MQUJFTCIsIlJFQURNRSIsImJ1aWxkUHJvamVjdFppcCIsImJ1aWxkU291cmNlQnVuZGxlIiwiY29weVRleHQiLCJkZWxpdmVyQmxvYiIsImRlbGl2ZXJUZXh0RmlsZSIsImZvcm1hdEJ5dGVzIiwibGlzdFNvdXJjZUZpbGVzIiwiQ29uZmlnRWRpdG9yIiwiaW5pdGlhbFRleHQiLCJvblNhdmUiLCJvbkNsb3NlIiwiX3MiLCJ0ZXh0Iiwic2V0VGV4dCIsImZsYXNoRXJyIiwic2V0Rmxhc2hFcnIiLCJsaW5lQ291bnQiLCJzcGxpdCIsImxlbmd0aCIsImVycm9ycyIsIndhbGxldENvdW50IiwiY2ZnIiwiciIsImhhbmRsZVNhdmUiLCJvayIsInNldFRpbWVvdXQiLCJvbktleSIsImUiLCJjdHJsS2V5IiwibWV0YUtleSIsImtleSIsInRvTG93ZXJDYXNlIiwicHJldmVudERlZmF1bHQiLCJsb2FkRmlsZSIsImlucHV0IiwiZG9jdW1lbnQiLCJjcmVhdGVFbGVtZW50IiwidHlwZSIsImFjY2VwdCIsIm9uY2hhbmdlIiwiZiIsImZpbGVzIiwicmVhZGVyIiwiRmlsZVJlYWRlciIsIm9ubG9hZCIsInJlc3VsdCIsInJlYWRBc1RleHQiLCJjbGljayIsInNsaWNlIiwibWFwIiwiaSIsInJlc2VydmFHbG9iYWwiLCJ0b0ZpeGVkIiwic25hcHNob3RJbmljaWFsIiwiZmlsdHJvQW50aUR1c3QiLCJhdXRvU3dhcFVzZGMiLCJBcnJheSIsImZyb20iLCJfIiwidGFyZ2V0IiwidmFsdWUiLCJTVEVQUyIsIk9uYm9hcmRpbmciLCJvbkRvbmUiLCJvbk9wZW5Db25maWciLCJvbkRvd25sb2FkIiwibiIsInRpdGxlIiwiYm9keSIsIl9jMiIsIkRvd25sb2FkQ2VudGVyIiwiY29uZmlnVGV4dCIsIm9uTG9nIiwiX3MyIiwiYnVzeSIsInNldEJ1c3kiLCJwYWNraW5nIiwic2V0UGFja2luZyIsInppcERvbmUiLCJzZXRaaXBEb25lIiwicnVuIiwiZm4iLCJtc2ciLCJkb3dubG9hZFppcCIsInppcCIsImRvbmUiLCJ0b3RhbCIsImZpbGUiLCJvIiwiYmxvYiIsImJ5dGVzIiwiaW5jbHVkZWQiLCJmYWlsZWQiLCJqb2luIiwicGN0IiwiTWF0aCIsInJvdW5kIiwic3RvcFByb3BhZ2F0aW9uIiwiYm94U2hhZG93Iiwid2lkdGgiLCJpY29uIiwiZGVzYyIsImFjdGlvbiIsImJ1bmRsZSIsImNvcHkiLCJQcm9taXNlIiwicmVzb2x2ZSIsIml0IiwicmVwbGFjZSIsIl9jIiwiX2MzIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VzIjpbIm1vZGFscy50c3giXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdXNlTWVtbywgdXNlUmVmLCB1c2VTdGF0ZSB9IGZyb20gXCJyZWFjdFwiO1xuaW1wb3J0IHsgcGFyc2VDb25maWcgfSBmcm9tIFwiLi4vY29uZmlnXCI7XG5pbXBvcnQge1xuICBPVVRDT01FX0xBQkVMLFxuICBSRUFETUUsXG4gIGJ1aWxkUHJvamVjdFppcCxcbiAgYnVpbGRTb3VyY2VCdW5kbGUsXG4gIGNvcHlUZXh0LFxuICBkZWxpdmVyQmxvYixcbiAgZGVsaXZlclRleHRGaWxlLFxuICBmb3JtYXRCeXRlcyxcbiAgbGlzdFNvdXJjZUZpbGVzLFxufSBmcm9tIFwiLi4vZG93bmxvYWRcIjtcblxuLyogPT09PT09PT09PT09PT09PT0gRWRpdG9yIGRlIGNvbmZpZy50eHQgPT09PT09PT09PT09PT09PT0gKi9cbmV4cG9ydCBmdW5jdGlvbiBDb25maWdFZGl0b3Ioe1xuICBpbml0aWFsVGV4dCxcbiAgb25TYXZlLFxuICBvbkNsb3NlLFxufToge1xuICBpbml0aWFsVGV4dDogc3RyaW5nO1xuICBvblNhdmU6ICh0ZXh0OiBzdHJpbmcpID0+IGJvb2xlYW47XG4gIG9uQ2xvc2U6ICgpID0+IHZvaWQ7XG59KSB7XG4gIGNvbnN0IFt0ZXh0LCBzZXRUZXh0XSA9IHVzZVN0YXRlKGluaXRpYWxUZXh0KTtcbiAgY29uc3QgW2ZsYXNoRXJyLCBzZXRGbGFzaEVycl0gPSB1c2VTdGF0ZShmYWxzZSk7XG4gIGNvbnN0IGxpbmVDb3VudCA9IHVzZU1lbW8oKCkgPT4gdGV4dC5zcGxpdChcIlxcblwiKS5sZW5ndGgsIFt0ZXh0XSk7XG4gIGNvbnN0IHsgZXJyb3JzLCB3YWxsZXRDb3VudCwgY2ZnIH0gPSB1c2VNZW1vKCgpID0+IHtcbiAgICBjb25zdCByID0gcGFyc2VDb25maWcodGV4dCk7XG4gICAgcmV0dXJuIHsgZXJyb3JzOiByLmVycm9ycywgd2FsbGV0Q291bnQ6IHIud2FsbGV0Q291bnQsIGNmZzogci5jZmcgfTtcbiAgfSwgW3RleHRdKTtcblxuICBjb25zdCBoYW5kbGVTYXZlID0gKCkgPT4ge1xuICAgIGNvbnN0IG9rID0gb25TYXZlKHRleHQpO1xuICAgIGlmICghb2spIHtcbiAgICAgIHNldEZsYXNoRXJyKHRydWUpO1xuICAgICAgc2V0VGltZW91dCgoKSA9PiBzZXRGbGFzaEVycihmYWxzZSksIDYwMCk7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IG9uS2V5ID0gKGU6IFJlYWN0LktleWJvYXJkRXZlbnQ8SFRNTFRleHRBcmVhRWxlbWVudD4pID0+IHtcbiAgICBpZiAoKGUuY3RybEtleSB8fCBlLm1ldGFLZXkpICYmIGUua2V5LnRvTG93ZXJDYXNlKCkgPT09IFwic1wiKSB7XG4gICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBoYW5kbGVTYXZlKCk7XG4gICAgfVxuICAgIGlmIChlLmtleSA9PT0gXCJFc2NhcGVcIikgb25DbG9zZSgpO1xuICB9O1xuXG4gIGNvbnN0IGxvYWRGaWxlID0gKCkgPT4ge1xuICAgIGNvbnN0IGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgIGlucHV0LnR5cGUgPSBcImZpbGVcIjtcbiAgICBpbnB1dC5hY2NlcHQgPSBcIi50eHQsLmluaSwuY29uZix0ZXh0L3BsYWluXCI7XG4gICAgaW5wdXQub25jaGFuZ2UgPSAoKSA9PiB7XG4gICAgICBjb25zdCBmID0gaW5wdXQuZmlsZXM/LlswXTtcbiAgICAgIGlmICghZikgcmV0dXJuO1xuICAgICAgY29uc3QgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcbiAgICAgIHJlYWRlci5vbmxvYWQgPSAoKSA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgcmVhZGVyLnJlc3VsdCA9PT0gXCJzdHJpbmdcIikgc2V0VGV4dChyZWFkZXIucmVzdWx0KTtcbiAgICAgIH07XG4gICAgICByZWFkZXIucmVhZEFzVGV4dChmKTtcbiAgICB9O1xuICAgIGlucHV0LmNsaWNrKCk7XG4gIH07XG5cbiAgcmV0dXJuIChcbiAgICA8ZGl2IGNsYXNzTmFtZT1cImFic29sdXRlIGluc2V0LTAgei01MCBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBiZy1ibGFjay83MCBwLTQgYmFja2Ryb3AtYmx1ci1bMnB4XVwiPlxuICAgICAgPGRpdiBjbGFzc05hbWU9e2BwYW5lbCBwb3AtaW4gZmxleCBoLVttaW4oODglLDY0MHB4KV0gdy1mdWxsIG1heC13LTN4bCBmbGV4LWNvbCBvdmVyZmxvdy1oaWRkZW4gJHtmbGFzaEVyciA/IFwicmluZy0yIHJpbmctcmVkLzcwXCIgOiBcIlwifWB9PlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInBhbmVsLWhlYWQgZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTMgYm9yZGVyLWIgYm9yZGVyLWxpbmUgcHgtNCBweS0zXCI+XG4gICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiZm9udC1jcnQgdGV4dC1bMTdweF0gdGV4dC1ncm5cIj7ijJg8L3NwYW4+XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJtaW4tdy0wXCI+XG4gICAgICAgICAgICA8cCBjbGFzc05hbWU9XCJwYW5lbC10aXRsZSB0ZXh0LVsxM3B4XVwiPn4vYm90L2NvbmZpZy50eHQ8L3A+XG4gICAgICAgICAgICA8cCBjbGFzc05hbWU9XCJmb250LW1vbm8gdGV4dC1bMTBweF0gdGV4dC1mYWludFwiPlxuICAgICAgICAgICAgICB7d2FsbGV0Q291bnR9IHdhbGxldChzKSDCtyBlbCBwcmVjaW8gU09ML1VTRCBzZSBsZWUgRU4gVklWTyAobm8gc2UgZWRpdGEpIMK3IEN0cmwrUyBndWFyZGFcbiAgICAgICAgICAgIDwvcD5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXgtMVwiIC8+XG4gICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXtsb2FkRmlsZX0gY2xhc3NOYW1lPVwiYnRuXCIgdGl0bGU9XCJDYXJnYXIgdW4gY29uZmlnLnR4dCBkZXNkZSB0dSBQQ1wiPlxuICAgICAgICAgICAgQ2FyZ2Fy4oCmXG4gICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXtoYW5kbGVTYXZlfSBjbGFzc05hbWU9XCJidG4gYnRuLWhvdFwiIHRpdGxlPVwiR3VhcmRhciB5IGFwbGljYXIgKEN0cmwrUylcIj5cbiAgICAgICAgICAgIEd1YXJkYXJcbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e29uQ2xvc2V9IGNsYXNzTmFtZT1cImJ0blwiIHRpdGxlPVwiQ2VycmFyIChFc2MpXCI+XG4gICAgICAgICAgICDinJVcbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAge2Vycm9ycy5sZW5ndGggPiAwID8gKFxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibWF4LWgtMjQgb3ZlcmZsb3cteS1hdXRvIGJvcmRlci1iIGJvcmRlci1saW5lIGJnLXJlZC81IHB4LTQgcHktMlwiPlxuICAgICAgICAgICAge2Vycm9ycy5zbGljZSgwLCA0KS5tYXAoKGUsIGkpID0+IChcbiAgICAgICAgICAgICAgPHAga2V5PXtpfSBjbGFzc05hbWU9XCJmb250LW1vbm8gdGV4dC1bMTFweF0gdGV4dC1yZWRcIj5cbiAgICAgICAgICAgICAgICDinJcge2V9XG4gICAgICAgICAgICAgIDwvcD5cbiAgICAgICAgICAgICkpfVxuICAgICAgICAgICAge2Vycm9ycy5sZW5ndGggPiA0ICYmIDxwIGNsYXNzTmFtZT1cImZvbnQtbW9ubyB0ZXh0LVsxMXB4XSB0ZXh0LXJlZC83MFwiPuKApiB5IHtlcnJvcnMubGVuZ3RoIC0gNH0gbcOhczwvcD59XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICkgOiAoXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJib3JkZXItYiBib3JkZXItbGluZSBiZy1ncm4vNSBweC00IHB5LTEuNVwiPlxuICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwiZm9udC1tb25vIHRleHQtWzExcHhdIHRleHQtZ3JuXCI+XG4gICAgICAgICAgICAgIOKckyBzaW50YXhpcyBjb3JyZWN0YSDCtyB7d2FsbGV0Q291bnR9IHdhbGxldChzKSDCtyByZXNlcnZhIHtjZmcucmVzZXJ2YUdsb2JhbC50b0ZpeGVkKDIpfSBTT0wgwrcgUjB7XCIgXCJ9XG4gICAgICAgICAgICAgIHtjZmcuc25hcHNob3RJbmljaWFsID8gXCJvblwiIDogXCJvZmZcIn0gwrcgUjAuNSB7Y2ZnLmZpbHRyb0FudGlEdXN0ID8gXCJvblwiIDogXCJvZmZcIn0gwrcgUjV7XCIgXCJ9XG4gICAgICAgICAgICAgIHtjZmcuYXV0b1N3YXBVc2RjID8gXCJvblwiIDogXCJvZmZcIn1cbiAgICAgICAgICAgIDwvcD5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgKX1cblxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggbWluLWgtMCBmbGV4LTFcIj5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInNlbGVjdC1ub25lIG92ZXJmbG93LWhpZGRlbiBib3JkZXItciBib3JkZXItbGluZSBiZy1wYW5lLzYwIHB4LTMgcHktMyB0ZXh0LXJpZ2h0IGZvbnQtbW9ubyB0ZXh0LVsxMnB4XSBsZWFkaW5nLVsxLjY1XSB0ZXh0LWZhaW50XCI+XG4gICAgICAgICAgICB7QXJyYXkuZnJvbSh7IGxlbmd0aDogbGluZUNvdW50IH0sIChfLCBpKSA9PiAoXG4gICAgICAgICAgICAgIDxkaXYga2V5PXtpfT57aSArIDF9PC9kaXY+XG4gICAgICAgICAgICApKX1cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8dGV4dGFyZWFcbiAgICAgICAgICAgIHZhbHVlPXt0ZXh0fVxuICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiBzZXRUZXh0KGUudGFyZ2V0LnZhbHVlKX1cbiAgICAgICAgICAgIG9uS2V5RG93bj17b25LZXl9XG4gICAgICAgICAgICBzcGVsbENoZWNrPXtmYWxzZX1cbiAgICAgICAgICAgIGNsYXNzTmFtZT1cImVkaXRvciBtaW4taC0wIGZsZXgtMSBvdmVyZmxvdy1hdXRvIHB4LTQgcHktM1wiXG4gICAgICAgICAgLz5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtNCBib3JkZXItdCBib3JkZXItbGluZSBiZy1wYW5lLzcwIHB4LTQgcHktMiBmb250LW1vbm8gdGV4dC1bMTBweF0gdGV4dC1mYWludFwiPlxuICAgICAgICAgIDxzcGFuPlxuICAgICAgICAgICAgPGIgY2xhc3NOYW1lPVwidGV4dC1ncm5cIj5eUzwvYj4gZ3VhcmRhclxuICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICA8c3Bhbj5cbiAgICAgICAgICAgIDxiIGNsYXNzTmFtZT1cInRleHQtZ3JuXCI+RXNjPC9iPiBjZXJyYXJcbiAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwibWwtYXV0b1wiPlxuICAgICAgICAgICAgW3dhbGxldHNdIOKGkiA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LWRpbVwiPkRJUkVDQ0lPTiA9IEFsaWFzLCBDYXBpdGFsVVNEPC9zcGFuPlxuICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgPC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgKTtcbn1cblxuLyogPT09PT09PT09PT09PT09PT0gR3XDrWEgaW5pY2lhbCA9PT09PT09PT09PT09PT09PSAqL1xuY29uc3QgU1RFUFM6IEFycmF5PFtzdHJpbmcsIHN0cmluZywgc3RyaW5nXT4gPSBbXG4gIFtcbiAgICBcIjFcIixcbiAgICBcIkVzdGEgdmVudGFuYSBlcyBlbCBib3QgKE1FTUVCT1QpXCIsXG4gICAgXCJBcnJpYmEgdmVzIGxhIGNvbnNvbGEgZW4gdml2bzogUjEgQ09NUFLDkyAoY29tcHJhIHbDoWxpZGEgY29waWFkYSkgeSBSMyBWRU5EScOTICh2ZW50YSBjb3BpYWRhKS4gTG9zIGFpcmRyb3BzIHZhbiBhIERVU1QuTE9HIHkgbG9zIHByb21lZGlvcyBhIElHTk9SQURPUy5cIixcbiAgXSxcbiAgW1xuICAgIFwiMlwiLFxuICAgIFwiRW1waWV6YSBkZXNkZSBjZXJvOiBwb24gVFUgd2FsbGV0XCIsXG4gICAgXCJFbCByYWRhciB2aWVuZSB2YWPDrW8uIFB1bHNhIOKMmCBjb25maWcudHh0IChwYW5lbCBkZXJlY2hvKSB5IHDDqWdhbGEgZW4gW3dhbGxldHNdLCBvIGVuIGxhIGNvbnNvbGE6IHNlZ3VpciA8ZGlyZWNjacOzbj4gPGFsaWFzPiA8dXNkPi4gRWwgYm90IGxhIHZpZ2lsYSBlbiBsYSBibG9ja2NoYWluIFJFQUwuXCIsXG4gIF0sXG4gIFtcbiAgICBcIjNcIixcbiAgICBcIlByZWNpb3MgcmVhbGVzLCBkaW5lcm8gcGFwZXJcIixcbiAgICBcIlNPTCBMSVZFIGxlZSBlbCBwcmVjaW8gZGUgSnVwaXRlciBjYWRhIDEwIHMgKG5hZGllIGxvIGVzY3JpYmUgYSBtYW5vKS4gTGEgVEVTT1JFUsONQSB1c2EgU09MIGZpY3RpY2lvczogYXJyYW5jYSBjb24gMS41IChjw6FtYmlhbG8gZW4gY29uZmlnLnR4dCBjb24gcmVzZXJ2YV9nbG9iYWwpLlwiLFxuICBdLFxuXTtcblxuZXhwb3J0IGZ1bmN0aW9uIE9uYm9hcmRpbmcoe1xuICBvbkRvbmUsXG4gIG9uT3BlbkNvbmZpZyxcbiAgb25Eb3dubG9hZCxcbn06IHtcbiAgb25Eb25lOiAoKSA9PiB2b2lkO1xuICBvbk9wZW5Db25maWc6ICgpID0+IHZvaWQ7XG4gIG9uRG93bmxvYWQ6ICgpID0+IHZvaWQ7XG59KSB7XG4gIHJldHVybiAoXG4gICAgPGRpdiBjbGFzc05hbWU9XCJhYnNvbHV0ZSBpbnNldC0wIHotWzYwXSBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBiZy1ibGFjay84NSBwLTQgYmFja2Ryb3AtYmx1ci1zbVwiPlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJwYW5lbCBwb3AtaW4gdy1mdWxsIG1heC13LWxnIG92ZXJmbG93LWhpZGRlblwiPlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImJvcmRlci1iIGJvcmRlci1saW5lIGJnLXBhbmUvODAgcHgtNSBweS00XCI+XG4gICAgICAgICAgPHAgY2xhc3NOYW1lPVwiZm9udC1jcnQgdGV4dC1bMjRweF0gZm9udC1ib2xkIHRyYWNraW5nLXdpZGUgdGV4dC1ncm4gW3RleHQtc2hhZG93OjBfMF8yMHB4X3JnYmEoMCwyNTUsNjUsMC40NSldXCI+XG4gICAgICAgICAgICDCv0TDk05ERSBFU1TDgSBDQURBIENPU0E/XG4gICAgICAgICAgPC9wPlxuICAgICAgICAgIDxwIGNsYXNzTmFtZT1cIm10LTEgZm9udC1tb25vIHRleHQtWzExcHhdIHRleHQtZGltXCI+MzAgc2VndW5kb3MgcGFyYSBvcmllbnRhcnRlIMK3IGVzdG8gbm8gdnVlbHZlIGEgYXBhcmVjZXI8L3A+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cInNwYWNlLXktNCBweC01IHB5LTVcIj5cbiAgICAgICAgICB7U1RFUFMubWFwKChbbiwgdGl0bGUsIGJvZHldKSA9PiAoXG4gICAgICAgICAgICA8ZGl2IGtleT17bn0gY2xhc3NOYW1lPVwiZmxleCBnYXAtMy41XCI+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZsZXggaC03IHctNyBzaHJpbmstMCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgcm91bmRlZC1tZCBib3JkZXIgYm9yZGVyLWdybi80MCBiZy1ncm4vMTAgZm9udC1jcnQgdGV4dC1bMTZweF0gZm9udC1ib2xkIHRleHQtZ3JuXCI+XG4gICAgICAgICAgICAgICAge259XG4gICAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgICAgPGRpdj5cbiAgICAgICAgICAgICAgICA8cCBjbGFzc05hbWU9XCJmb250LW1vbm8gdGV4dC1bMTNweF0gZm9udC1zZW1pYm9sZCB0ZXh0LXR4dFwiPnt0aXRsZX08L3A+XG4gICAgICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwibXQtMC41IGZvbnQtbW9ubyB0ZXh0LVsxMXB4XSBsZWFkaW5nLXJlbGF4ZWQgdGV4dC1kaW1cIj57Ym9keX08L3A+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgKSl9XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggZmxleC1jb2wgZ2FwLTIgYm9yZGVyLXQgYm9yZGVyLWxpbmUgYmctcGFuZS82MCBweC01IHB5LTQgc206ZmxleC1yb3dcIj5cbiAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e29uT3BlbkNvbmZpZ30gY2xhc3NOYW1lPVwiYnRuIGJ0bi1ob3QgZmxleC0xIGp1c3RpZnktY2VudGVyIHB5LTIuNSB0ZXh0LVsxMXB4XVwiPlxuICAgICAgICAgICAg4oyYIEFCUklSIGNvbmZpZy50eHRcbiAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICA8YnV0dG9uIG9uQ2xpY2s9e29uRG93bmxvYWR9IGNsYXNzTmFtZT1cImJ0biBmbGV4LTEganVzdGlmeS1jZW50ZXIgcHktMi41IHRleHQtWzExcHhdXCI+XG4gICAgICAgICAgICDih6kgREVTQ0FSR0FSIEVMIEJPVFxuICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgIDxidXR0b24gb25DbGljaz17b25Eb25lfSBjbGFzc05hbWU9XCJidG4gZmxleC0xIGp1c3RpZnktY2VudGVyIHB5LTIuNSB0ZXh0LVsxMXB4XVwiPlxuICAgICAgICAgICAgWUEgTE8gVkkgwrcgQ0VSUkFSXG4gICAgICAgICAgPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gICk7XG59XG5cbi8qID09PT09PT09PT09PT09PT09IENlbnRybyBkZSBkZXNjYXJnYSA9PT09PT09PT09PT09PT09PSAqL1xuZXhwb3J0IGZ1bmN0aW9uIERvd25sb2FkQ2VudGVyKHtcbiAgY29uZmlnVGV4dCxcbiAgb25DbG9zZSxcbiAgb25Mb2csXG59OiB7XG4gIGNvbmZpZ1RleHQ6IHN0cmluZztcbiAgb25DbG9zZTogKCkgPT4gdm9pZDtcbiAgb25Mb2c6ICh0ZXh0OiBzdHJpbmcsIGtpbmQ/OiBcIm9rXCIgfCBcIndhcm5cIiB8IFwiZXJyXCIgfCBcInN5c1wiKSA9PiB2b2lkO1xufSkge1xuICBjb25zdCBbYnVzeSwgc2V0QnVzeV0gPSB1c2VTdGF0ZTxzdHJpbmcgfCBudWxsPihudWxsKTtcbiAgY29uc3QgW3BhY2tpbmcsIHNldFBhY2tpbmddID0gdXNlU3RhdGU8eyBkb25lOiBudW1iZXI7IHRvdGFsOiBudW1iZXI7IGZpbGU6IHN0cmluZyB9IHwgbnVsbD4obnVsbCk7XG4gIGNvbnN0IFt6aXBEb25lLCBzZXRaaXBEb25lXSA9IHVzZVN0YXRlPHsgYnl0ZXM6IG51bWJlcjsgaW5jbHVkZWQ6IG51bWJlcjsgZmFpbGVkOiBudW1iZXIgfSB8IG51bGw+KG51bGwpO1xuICBjb25zdCBmaWxlcyA9IHVzZU1lbW8oKCkgPT4gbGlzdFNvdXJjZUZpbGVzKCksIFtdKTtcblxuICBjb25zdCBydW4gPSBhc3luYyAoa2V5OiBzdHJpbmcsIGZuOiAoKSA9PiBQcm9taXNlPHN0cmluZz4pID0+IHtcbiAgICBzZXRCdXN5KGtleSk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG1zZyA9IGF3YWl0IGZuKCk7XG4gICAgICBvbkxvZyhgREVTQ0FSR0EgICAgJHttc2d9YCwgXCJva1wiKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIG9uTG9nKGBERVNDQVJHQSAgICDinJcgbm8gc2UgcHVkbyBlbnRyZWdhciAke2tleX1gLCBcImVyclwiKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgc2V0QnVzeShudWxsKTtcbiAgICB9XG4gIH07XG5cbiAgLyogLS0tLSBlbCBaSVAgcmVhbCAob3BjacOzbiBwcmluY2lwYWwpIC0tLS0gKi9cbiAgY29uc3QgZG93bmxvYWRaaXAgPSBhc3luYyAoKSA9PiB7XG4gICAgc2V0QnVzeShcInppcFwiKTtcbiAgICBzZXRaaXBEb25lKG51bGwpO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB6aXAgPSBhd2FpdCBidWlsZFByb2plY3RaaXAoKGRvbmUsIHRvdGFsLCBmaWxlKSA9PiBzZXRQYWNraW5nKHsgZG9uZSwgdG90YWwsIGZpbGUgfSkpO1xuICAgICAgY29uc3QgbyA9IGF3YWl0IGRlbGl2ZXJCbG9iKFwibWVtZWJvdC56aXBcIiwgemlwLmJsb2IpO1xuICAgICAgc2V0UGFja2luZyhudWxsKTtcbiAgICAgIHNldFppcERvbmUoeyBieXRlczogemlwLmJ5dGVzLCBpbmNsdWRlZDogemlwLmluY2x1ZGVkLCBmYWlsZWQ6IHppcC5mYWlsZWQubGVuZ3RoIH0pO1xuICAgICAgb25Mb2coXG4gICAgICAgIGBERVNDQVJHQSAgICBtZW1lYm90LnppcCDihpIgJHtPVVRDT01FX0xBQkVMW29dfSDCtyAke3ppcC5pbmNsdWRlZH0vJHtmaWxlcy5sZW5ndGh9IGFyY2hpdm9zIMK3ICR7Zm9ybWF0Qnl0ZXMoemlwLmJ5dGVzKX1gLFxuICAgICAgICBvID09PSBcImZhbGxvXCIgPyBcImVyclwiIDogXCJva1wiLFxuICAgICAgKTtcbiAgICAgIGlmICh6aXAuZmFpbGVkLmxlbmd0aCkge1xuICAgICAgICBvbkxvZyhgREVTQ0FSR0EgICAg4pqgIG5vIHNlIGluY2x1eWVyb246ICR7emlwLmZhaWxlZC5qb2luKFwiLCBcIil9YCwgXCJ3YXJuXCIpO1xuICAgICAgfVxuICAgIH0gY2F0Y2gge1xuICAgICAgc2V0UGFja2luZyhudWxsKTtcbiAgICAgIG9uTG9nKFwiREVTQ0FSR0EgICAg4pyXIG5vIHNlIHB1ZG8gZ2VuZXJhciBlbCBaSVAgwrcgdXNhIG1lbWVib3Qtc291cmNlLnR4dFwiLCBcImVyclwiKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgc2V0QnVzeShudWxsKTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgcGN0ID0gcGFja2luZyA/IE1hdGgucm91bmQoKHBhY2tpbmcuZG9uZSAvIHBhY2tpbmcudG90YWwpICogMTAwKSA6IDA7XG5cbiAgcmV0dXJuIChcbiAgICA8ZGl2IGNsYXNzTmFtZT1cImFic29sdXRlIGluc2V0LTAgei01MCBmbGV4IGl0ZW1zLWNlbnRlciBqdXN0aWZ5LWNlbnRlciBiZy1ibGFjay83MCBwLTQgYmFja2Ryb3AtYmx1ci1bMnB4XVwiIG9uQ2xpY2s9e29uQ2xvc2V9PlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJwYW5lbCBwb3AtaW4gZmxleCBoLVttaW4oOTIlLDY0MHB4KV0gdy1mdWxsIG1heC13LTJ4bCBmbGV4LWNvbCBvdmVyZmxvdy1oaWRkZW5cIiBvbkNsaWNrPXsoZSkgPT4gZS5zdG9wUHJvcGFnYXRpb24oKX0+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwicGFuZWwtaGVhZCBmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMyBib3JkZXItYiBib3JkZXItbGluZSBweC00IHB5LTNcIj5cbiAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJmb250LWNydCB0ZXh0LVsyMHB4XSB0ZXh0LWdyblwiPuKHqTwvc3Bhbj5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIm1pbi13LTBcIj5cbiAgICAgICAgICAgIDxwIGNsYXNzTmFtZT1cInBhbmVsLXRpdGxlIHRleHQtWzE0cHhdXCI+Q0VOVFJPIERFIERFU0NBUkdBPC9wPlxuICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwiZm9udC1tb25vIHRleHQtWzEwcHhdIHRleHQtZmFpbnRcIj5sbMOpdmF0ZSBlbCBtZW1lYm90IGEgdHUgUEMgwrcgbm8gZGVwZW5kZSBkZSBlc3RlIGNoYXQ8L3A+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJmbGV4LTFcIiAvPlxuICAgICAgICAgIDxidXR0b24gb25DbGljaz17b25DbG9zZX0gY2xhc3NOYW1lPVwiYnRuIHB4LTIuNSBweS0xXCIgdGl0bGU9XCJDZXJyYXIgKEVzYylcIj5cbiAgICAgICAgICAgIOKclVxuICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICA8L2Rpdj5cblxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIm1pbi1oLTAgZmxleC0xIG92ZXJmbG93LXktYXV0byBweC00IHB5LTNcIj5cbiAgICAgICAgICB7LyogLS0tLSBaSVAgcmVhbDogbGEgb3BjacOzbiBwcmluY2lwYWwgLS0tLSAqL31cbiAgICAgICAgICA8ZGl2XG4gICAgICAgICAgICBjbGFzc05hbWU9XCJyZWxhdGl2ZSBvdmVyZmxvdy1oaWRkZW4gcm91bmRlZC1sZyBib3JkZXIgYm9yZGVyLWdybi81MCBiZy1yYWlzZS82MCBweC00IHB5LTNcIlxuICAgICAgICAgICAgc3R5bGU9e3sgYm94U2hhZG93OiB6aXBEb25lID8gXCIwIDAgMjZweCAtOHB4IHJnYmEoMCwyNTUsNjUsMC41NSlcIiA6IFwiMCAwIDIwcHggLTEwcHggcmdiYSgwLDI1NSw2NSwwLjQpXCIgfX1cbiAgICAgICAgICA+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImZsZXggaXRlbXMtY2VudGVyIGdhcC0zXCI+XG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImZvbnQtY3J0IHRleHQtWzI2cHhdIHRleHQtZ3JuIFt0ZXh0LXNoYWRvdzowXzBfMTRweF9yZ2JhKDAsMjU1LDY1LDAuNildXCI+4oepPC9zcGFuPlxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIm1pbi13LTAgZmxleC0xXCI+XG4gICAgICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwiZm9udC1tb25vIHRleHQtWzEzcHhdIGZvbnQtYm9sZCB0ZXh0LWdyblwiPm1lbWVib3QuemlwIOKAlCBQUk9ZRUNUTyBDT01QTEVUTzwvcD5cbiAgICAgICAgICAgICAgICA8cCBjbGFzc05hbWU9XCJmb250LW1vbm8gdGV4dC1bMTAuNXB4XSB0ZXh0LWRpbVwiPlxuICAgICAgICAgICAgICAgICAge2ZpbGVzLmxlbmd0aH0gYXJjaGl2b3MgY29uIGNhcnBldGFzIChzcmMvLCBpbmRleC5qcywgRG9ja2VyZmlsZeKApikgwrcgbGlzdG8gcGFyYSBSYWlsd2F5IG8gdHUgUENcbiAgICAgICAgICAgICAgICA8L3A+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICA8YnV0dG9uXG4gICAgICAgICAgICAgICAgb25DbGljaz17KCkgPT4gdm9pZCBkb3dubG9hZFppcCgpfVxuICAgICAgICAgICAgICAgIGRpc2FibGVkPXtidXN5ID09PSBcInppcFwifVxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cImJ0biBidG4taG90IHB4LTQgcHktMiBmb250LWNydCB0ZXh0LVsxNHB4XSB0cmFja2luZy13aWRlciBkaXNhYmxlZDpvcGFjaXR5LTYwXCJcbiAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgIHtidXN5ID09PSBcInppcFwiID8gKHBhY2tpbmcgPyBgJHtwY3R9JWAgOiBcIuKAplwiKSA6IHppcERvbmUgPyBcIuKGuyBPVFJBIFZFWlwiIDogXCJERVNDQVJHQVJcIn1cbiAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICA8L2Rpdj5cblxuICAgICAgICAgICAgey8qIHByb2dyZXNvIGVuIHZpdm8gYWwgZW1wYWNhciAqL31cbiAgICAgICAgICAgIHtwYWNraW5nICYmIChcbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJtdC0zXCI+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJoLTEuNSB3LWZ1bGwgb3ZlcmZsb3ctaGlkZGVuIHJvdW5kZWQtZnVsbCBiZy1ibGFjay81MFwiPlxuICAgICAgICAgICAgICAgICAgPGRpdlxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJoLWZ1bGwgcm91bmRlZC1mdWxsIGJnLWdybiB0cmFuc2l0aW9uLVt3aWR0aF0gZHVyYXRpb24tMTUwXCJcbiAgICAgICAgICAgICAgICAgICAgc3R5bGU9e3sgd2lkdGg6IGAke3BjdH0lYCwgYm94U2hhZG93OiBcIjAgMCAxMHB4IHJnYmEoMCwyNTUsNjUsMC44KVwiIH19XG4gICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgIDxwIGNsYXNzTmFtZT1cIm10LTEuNSB0cnVuY2F0ZSBmb250LW1vbm8gdGV4dC1bMTBweF0gdGV4dC1mYWludFwiPlxuICAgICAgICAgICAgICAgICAgZW1wYWNhbmRvIHtwYWNraW5nLmRvbmV9L3twYWNraW5nLnRvdGFsfSDCtyA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LWRpbVwiPntwYWNraW5nLmZpbGV9PC9zcGFuPlxuICAgICAgICAgICAgICAgIDwvcD5cbiAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICApfVxuXG4gICAgICAgICAgICB7emlwRG9uZSAmJiAhcGFja2luZyAmJiAoXG4gICAgICAgICAgICAgIDxwIGNsYXNzTmFtZT1cIm10LTIuNSBmb250LW1vbm8gdGV4dC1bMTAuNXB4XSB0ZXh0LWdyblwiPlxuICAgICAgICAgICAgICAgIOKckyB7emlwRG9uZS5pbmNsdWRlZH0gYXJjaGl2b3Mgwrcge2Zvcm1hdEJ5dGVzKHppcERvbmUuYnl0ZXMpfVxuICAgICAgICAgICAgICAgIHt6aXBEb25lLmZhaWxlZCA+IDAgPyBgIMK3IOKaoCAke3ppcERvbmUuZmFpbGVkfSBubyBsZWdpYmxlKHMpYCA6IFwiXCJ9IMK3IHJldmlzYSB0dSBjYXJwZXRhIGRlIGRlc2Nhcmdhc1xuICAgICAgICAgICAgICA8L3A+XG4gICAgICAgICAgICApfVxuICAgICAgICAgIDwvZGl2PlxuXG4gICAgICAgICAgey8qIC0tLS0gc2VjdW5kYXJpYXMgLS0tLSAqL31cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cIm10LTIgc3BhY2UteS0yXCI+XG4gICAgICAgICAgICB7W1xuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAga2V5OiBcImJ1bmRsZVwiLFxuICAgICAgICAgICAgICAgIGljb246IFwi4omhXCIsXG4gICAgICAgICAgICAgICAgdGl0bGU6IFwibWVtZWJvdC1zb3VyY2UudHh0IOKAlCBmYWxsYmFjazogdG9kbyBlbiB1bm9cIixcbiAgICAgICAgICAgICAgICBkZXNjOiBcInBvciBzaSBlbCAuemlwIG5vIGFicmUgZW4gdHUgc2lzdGVtYSAoc2VwYXJhZG8gcG9yID09PT09IEZJTEU6ID09PT09KVwiLFxuICAgICAgICAgICAgICAgIGFjdGlvbjogKCkgPT5cbiAgICAgICAgICAgICAgICAgIHJ1bihcImJ1bmRsZVwiLCBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJ1bmRsZSA9IGF3YWl0IGJ1aWxkU291cmNlQnVuZGxlKCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG8gPSBhd2FpdCBkZWxpdmVyVGV4dEZpbGUoXCJtZW1lYm90LXNvdXJjZS50eHRcIiwgYnVuZGxlKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGBjw7NkaWdvIGZ1ZW50ZSDihpIgJHtPVVRDT01FX0xBQkVMW29dfWA7XG4gICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBjb3B5OiAoKSA9PiBidWlsZFNvdXJjZUJ1bmRsZSgpLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAga2V5OiBcImNvbmZpZ1wiLFxuICAgICAgICAgICAgICAgIGljb246IFwi4oyYXCIsXG4gICAgICAgICAgICAgICAgdGl0bGU6IFwiY29uZmlnLnR4dCDigJQgdHUgY29uZmlndXJhY2nDs24gYWN0dWFsXCIsXG4gICAgICAgICAgICAgICAgZGVzYzogXCJ0YWwgY29tbyBsYSB0aWVuZXMgYWhvcmEgKHdhbGxldHMsIHJlc2VydmEsIHJlZ2xhcylcIixcbiAgICAgICAgICAgICAgICBhY3Rpb246ICgpID0+XG4gICAgICAgICAgICAgICAgICBydW4oXCJjb25maWdcIiwgYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBvID0gYXdhaXQgZGVsaXZlclRleHRGaWxlKFwiY29uZmlnLnR4dFwiLCBjb25maWdUZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGBjb25maWcudHh0IOKGkiAke09VVENPTUVfTEFCRUxbb119YDtcbiAgICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIGNvcHk6ICgpID0+IFByb21pc2UucmVzb2x2ZShjb25maWdUZXh0KSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGtleTogXCJyZWFkbWVcIixcbiAgICAgICAgICAgICAgICBpY29uOiBcIuKWpFwiLFxuICAgICAgICAgICAgICAgIHRpdGxlOiBcIlJFQURNRS5tZCDigJQgaW5zdHJ1Y2Npb25lc1wiLFxuICAgICAgICAgICAgICAgIGRlc2M6IFwiY8OzbW8gY29ycmVybG8gZW4gdHUgUEMgeSBkZXNwbGVnYXJsbyBlbiBSYWlsd2F5XCIsXG4gICAgICAgICAgICAgICAgYWN0aW9uOiAoKSA9PlxuICAgICAgICAgICAgICAgICAgcnVuKFwicmVhZG1lXCIsIGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbyA9IGF3YWl0IGRlbGl2ZXJUZXh0RmlsZShcIlJFQURNRS5tZFwiLCBSRUFETUUpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYFJFQURNRS5tZCDihpIgJHtPVVRDT01FX0xBQkVMW29dfWA7XG4gICAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBjb3B5OiAoKSA9PiBQcm9taXNlLnJlc29sdmUoUkVBRE1FKSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIF0ubWFwKChpdCkgPT4gKFxuICAgICAgICAgICAgICA8ZGl2IGtleT17aXQua2V5fSBjbGFzc05hbWU9XCJmbGV4IGl0ZW1zLWNlbnRlciBnYXAtMyByb3VuZGVkLWxnIGJvcmRlciBib3JkZXItbGluZSBiZy1yYWlzZS80MCBweC0zIHB5LTIuNSB0cmFuc2l0aW9uLWFsbCBob3Zlcjpib3JkZXItZ3JuLzQwXCI+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiZm9udC1jcnQgdGV4dC1bMThweF0gdGV4dC1ncm4vODBcIj57aXQuaWNvbn08L3NwYW4+XG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJtaW4tdy0wIGZsZXgtMVwiPlxuICAgICAgICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwiZm9udC1tb25vIHRleHQtWzEycHhdIGZvbnQtc2VtaWJvbGQgdGV4dC10eHQvOTBcIj57aXQudGl0bGV9PC9wPlxuICAgICAgICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwiZm9udC1tb25vIHRleHQtWzEwcHhdIHRleHQtZmFpbnRcIj57aXQuZGVzY308L3A+XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgPGJ1dHRvbiBvbkNsaWNrPXsoKSA9PiB2b2lkIGl0LmFjdGlvbigpfSBkaXNhYmxlZD17YnVzeSA9PT0gaXQua2V5fSBjbGFzc05hbWU9XCJidG4gcHgtMyBweS0xLjUgdGV4dC1bMTAuNXB4XSBkaXNhYmxlZDpvcGFjaXR5LTYwXCI+XG4gICAgICAgICAgICAgICAgICB7YnVzeSA9PT0gaXQua2V5ID8gXCLigKZcIiA6IFwiQkFKQVJcIn1cbiAgICAgICAgICAgICAgICA8L2J1dHRvbj5cbiAgICAgICAgICAgICAgICA8YnV0dG9uXG4gICAgICAgICAgICAgICAgICBvbkNsaWNrPXsoKSA9PlxuICAgICAgICAgICAgICAgICAgICB2b2lkIHJ1bihpdC5rZXkgKyBcIi1jb3B5XCIsIGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICBjb25zdCBvayA9IGF3YWl0IGNvcHlUZXh0KGF3YWl0IGl0LmNvcHkoKSk7XG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG9rID8gYCR7aXQua2V5fSBjb3BpYWRvIGFsIHBvcnRhcGFwZWxlc2AgOiBcIuKclyBubyBzZSBwdWRvIGNvcGlhclwiO1xuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwiYnRuIHB4LTIuNSBweS0xLjUgdGV4dC1bMTAuNXB4XVwiXG4gICAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgICAgQ09QSUFSXG4gICAgICAgICAgICAgICAgPC9idXR0b24+XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgKSl9XG4gICAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgICB7LyogLS0tLSBsaXN0YSBkZSBhcmNoaXZvcyAtLS0tICovfVxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibXQtNFwiPlxuICAgICAgICAgICAgPHAgY2xhc3NOYW1lPVwiZm9udC1jcnQgdGV4dC1bMTNweF0gdHJhY2tpbmctWzAuMTRlbV0gdGV4dC1ncm4vODBcIj5BUkNISVZPUyBJTkNMVUlET1MgKHtmaWxlcy5sZW5ndGh9KTwvcD5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwibXQtMiBncmlkIGdyaWQtY29scy0xIGdhcC14LTQgc206Z3JpZC1jb2xzLTJcIj5cbiAgICAgICAgICAgICAge2ZpbGVzLm1hcCgoZikgPT4gKFxuICAgICAgICAgICAgICAgIDxwIGtleT17Zn0gY2xhc3NOYW1lPVwidHJ1bmNhdGUgZm9udC1tb25vIHRleHQtWzExcHhdIHRleHQtZGltXCI+XG4gICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LWdyblwiPuKckzwvc3Bhbj4ge2YucmVwbGFjZSgvXlxcLy8sIFwiXCIpfVxuICAgICAgICAgICAgICAgIDwvcD5cbiAgICAgICAgICAgICAgKSl9XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJib3JkZXItdCBib3JkZXItbGluZSBiZy1wYW5lLzcwIHB4LTQgcHktM1wiPlxuICAgICAgICAgIDxwIGNsYXNzTmFtZT1cImZvbnQtbW9ubyB0ZXh0LVsxMHB4XSBsZWFkaW5nLXJlbGF4ZWQgdGV4dC1mYWludFwiPlxuICAgICAgICAgICAgZGVzY29tcHJpbWUgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1kaW1cIj5tZW1lYm90LnppcDwvc3Bhbj4g4oaSe1wiIFwifVxuICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwidGV4dC1kaW1cIj5ucG0gaW5zdGFsbDwvc3Bhbj4g4oaSIDxzcGFuIGNsYXNzTmFtZT1cInRleHQtZGltXCI+bnBtIHJ1biBkZXY8L3NwYW4+IMK3XG4gICAgICAgICAgICBvIGRlc3BsacOpZ2FsbyBlbiBSYWlsd2F5IChndcOtYSA8c3BhbiBjbGFzc05hbWU9XCJ0ZXh0LWRpbVwiPkRFUExPWV9SQUlMV0FZLm1kPC9zcGFuPikgwrcgbmVjZXNpdGEgTm9kZS5qcyAxOCtcbiAgICAgICAgICA8L3A+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgPC9kaXY+XG4gICk7XG59XG4iXSwiZmlsZSI6Ii93b3Jrc3BhY2Uvc3JjL2NvbXBvbmVudHMvbW9kYWxzLnRzeCJ9