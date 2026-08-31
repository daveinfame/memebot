import { createHotContext as __vite__createHotContext } from "/@vite/client";import.meta.hot = __vite__createHotContext("/src/main.tsx");import __vite__cjsImport0_react_jsxDevRuntime from "/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=2090559e"; const jsxDEV = __vite__cjsImport0_react_jsxDevRuntime["jsxDEV"];
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
  window.$RefreshReg$ = RefreshRuntime.getRefreshReg("/workspace/src/main.tsx");
  window.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;
}
var _s = $RefreshSig$();
import __vite__cjsImport3_react from "/node_modules/.vite/deps/react.js?v=2090559e"; const React = __vite__cjsImport3_react.__esModule ? __vite__cjsImport3_react.default : __vite__cjsImport3_react; const useEffect = __vite__cjsImport3_react["useEffect"];
import __vite__cjsImport4_reactDom_client from "/node_modules/.vite/deps/react-dom_client.js?v=2090559e"; const ReactDOM = __vite__cjsImport4_reactDom_client.__esModule ? __vite__cjsImport4_reactDom_client.default : __vite__cjsImport4_reactDom_client;
import "/src/index.css?t=1788152212714";
import App from "/src/App.tsx?t=1788152212714";
window.__mainReached = true;
const safeHideSplash = () => {
  try {
    const w = window;
    if (typeof w.__hideBoot === "function") w.__hideBoot();
  } catch {
  }
};
class CrashScreen extends React.Component {
  constructor() {
    super(...arguments);
    this.reset = () => {
      try {
        localStorage.clear();
      } catch {
      }
      window.location.reload();
    };
  }
  render() {
    const msg = this.props.error instanceof Error ? this.props.error.message : String(this.props.error);
    return /* @__PURE__ */ jsxDEV(
      "div",
      {
        style: {
          minHeight: "100vh",
          background: "#000000",
          color: "#d6ffe0",
          fontFamily: "'JetBrains Mono', monospace",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24
        },
        children: /* @__PURE__ */ jsxDEV(
          "div",
          {
            style: {
              maxWidth: 560,
              border: "2px solid rgba(0,255,65,0.5)",
              borderRadius: 12,
              background: "#03110a",
              padding: "28px 30px",
              boxShadow: "0 0 60px -20px rgba(0,255,65,0.45)"
            },
            children: [
              /* @__PURE__ */ jsxDEV("p", { style: { fontFamily: "'VT323', monospace", fontSize: 22, color: "#00ff41", margin: 0 }, children: "╳ KERNEL PANIC — el bot se estrelló" }, void 0, false, {
                fileName: "/workspace/src/main.tsx",
                lineNumber: 70,
                columnNumber: 11
              }, this),
              /* @__PURE__ */ jsxDEV("p", { style: { fontSize: 12, lineHeight: 1.7, color: "#79b58f", whiteSpace: "pre-wrap" }, children: msg }, void 0, false, {
                fileName: "/workspace/src/main.tsx",
                lineNumber: 73,
                columnNumber: 11
              }, this),
              /* @__PURE__ */ jsxDEV(
                "button",
                {
                  onClick: this.reset,
                  style: {
                    marginTop: 16,
                    fontFamily: "'VT323', monospace",
                    fontSize: 16,
                    letterSpacing: "0.1em",
                    color: "#00ff41",
                    background: "rgba(0,255,65,0.1)",
                    border: "1px solid rgba(0,255,65,0.45)",
                    borderRadius: 8,
                    padding: "8px 18px",
                    cursor: "pointer"
                  },
                  children: "REINICIAR EL BOT (borra la memoria)"
                },
                void 0,
                false,
                {
                  fileName: "/workspace/src/main.tsx",
                  lineNumber: 74,
                  columnNumber: 11
                },
                this
              )
            ]
          },
          void 0,
          true,
          {
            fileName: "/workspace/src/main.tsx",
            lineNumber: 60,
            columnNumber: 9
          },
          this
        )
      },
      void 0,
      false,
      {
        fileName: "/workspace/src/main.tsx",
        lineNumber: 48,
        columnNumber: 7
      },
      this
    );
  }
}
class Boundary extends React.Component {
  constructor() {
    super(...arguments);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidMount() {
    safeHideSplash();
  }
  render() {
    if (this.state.error) return /* @__PURE__ */ jsxDEV(CrashScreen, { error: this.state.error }, void 0, false, {
      fileName: "/workspace/src/main.tsx",
      lineNumber: 106,
      columnNumber: 34
    }, this);
    return this.props.children;
  }
}
function MarkBooted() {
  _s();
  useEffect(() => {
    window.__booted = true;
    safeHideSplash();
  }, []);
  return null;
}
_s(MarkBooted, "OD7bBpZva5O2jO+Puf00hKivP7c=");
_c = MarkBooted;
try {
  ReactDOM.createRoot(document.getElementById("root")).render(
    /* @__PURE__ */ jsxDEV(Boundary, { children: [
      /* @__PURE__ */ jsxDEV(MarkBooted, {}, void 0, false, {
        fileName: "/workspace/src/main.tsx",
        lineNumber: 122,
        columnNumber: 7
      }, this),
      /* @__PURE__ */ jsxDEV(App, {}, void 0, false, {
        fileName: "/workspace/src/main.tsx",
        lineNumber: 123,
        columnNumber: 7
      }, this)
    ] }, void 0, true, {
      fileName: "/workspace/src/main.tsx",
      lineNumber: 121,
      columnNumber: 5
    }, this)
  );
} catch (e) {
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000000;color:#baffc9;font-family:monospace;padding:24px"><div style="border:1px solid rgba(0,255,65,.5);border-radius:10px;padding:20px;max-width:520px;white-space:pre-wrap">ERROR AL MONTAR EL BOT:\n' + (e instanceof Error ? e.message : String(e)) + "\n\nPresiona Ctrl+F5 para reintentar.</div></div>";
  }
}
var _c;
$RefreshReg$(_c, "MarkBooted");
if (import.meta.hot && !inWebWorker) {
  window.$RefreshReg$ = prevRefreshReg;
  window.$RefreshSig$ = prevRefreshSig;
}
if (import.meta.hot && !inWebWorker) {
  RefreshRuntime.__hmr_import(import.meta.url).then((currentExports) => {
    RefreshRuntime.registerExportsForReactRefresh("/workspace/src/main.tsx", currentExports);
    import.meta.hot.accept((nextExports) => {
      if (!nextExports) return;
      const invalidateMessage = RefreshRuntime.validateRefreshBoundaryAndEnqueueUpdate("/workspace/src/main.tsx", currentExports, nextExports);
      if (invalidateMessage) import.meta.hot.invalidate(invalidateMessage);
    });
  });
}

//# sourceMappingURL=data:application/json;base64,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QUFDLGVBQVksT0FBTyxLQUFLd0IsTUFBTXhCLFNBQS9CO0FBQUE7QUFBQTtBQUFBO0FBQUEsV0FBcUM7QUFDbEUsV0FBTyxLQUFLRCxNQUFNNEI7QUFBQUEsRUFDcEI7QUFDRjtBQUVBLFNBQVNDLGFBQWE7QUFBQUMsS0FBQTtBQUNwQi9DLFlBQVUsTUFBTTtBQUNkLElBQUNHLE9BQTZDNkMsV0FBVztBQUN6RDNDLG1CQUFlO0FBQUEsRUFDakIsR0FBRyxFQUFFO0FBQ0wsU0FBTztBQUNUO0FBQUMwQyxHQU5RRCxZQUFVO0FBQUEsS0FBVkE7QUFRVCxJQUFJO0FBQ0Y3QyxXQUFTZ0QsV0FBV0MsU0FBU0MsZUFBZSxNQUFNLENBQUUsRUFBRXBDO0FBQUFBLElBQ3BELHVCQUFDLFlBQ0M7QUFBQSw2QkFBQyxnQkFBRDtBQUFBO0FBQUE7QUFBQTtBQUFBLGFBQVc7QUFBQSxNQUNYLHVCQUFDLFNBQUQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxhQUFJO0FBQUEsU0FGTjtBQUFBO0FBQUE7QUFBQTtBQUFBLFdBR0E7QUFBQSxFQUNGO0FBQ0YsU0FBU3FDLEdBQUc7QUFDVixRQUFNQyxPQUFPSCxTQUFTQyxlQUFlLE1BQU07QUFDM0MsTUFBSUUsTUFBTTtBQUNSQSxTQUFLQyxZQUNILDZTQUdDRixhQUFhakMsUUFBUWlDLEVBQUVoQyxVQUFVQyxPQUFPK0IsQ0FBQyxLQUMxQztBQUFBLEVBQ0o7QUFDRjtBQUFDLElBQUFHO0FBQUEsYUFBQUEsSUFBQSIsIm5hbWVzIjpbIlJlYWN0IiwidXNlRWZmZWN0IiwiUmVhY3RET00iLCJBcHAiLCJ3aW5kb3ciLCJfX21haW5SZWFjaGVkIiwic2FmZUhpZGVTcGxhc2giLCJ3IiwiX19oaWRlQm9vdCIsIkNyYXNoU2NyZWVuIiwiQ29tcG9uZW50IiwicmVzZXQiLCJsb2NhbFN0b3JhZ2UiLCJjbGVhciIsImxvY2F0aW9uIiwicmVsb2FkIiwicmVuZGVyIiwibXNnIiwicHJvcHMiLCJlcnJvciIsIkVycm9yIiwibWVzc2FnZSIsIlN0cmluZyIsIm1pbkhlaWdodCIsImJhY2tncm91bmQiLCJjb2xvciIsImZvbnRGYW1pbHkiLCJkaXNwbGF5IiwiYWxpZ25JdGVtcyIsImp1c3RpZnlDb250ZW50IiwicGFkZGluZyIsIm1heFdpZHRoIiwiYm9yZGVyIiwiYm9yZGVyUmFkaXVzIiwiYm94U2hhZG93IiwiZm9udFNpemUiLCJtYXJnaW4iLCJsaW5lSGVpZ2h0Iiwid2hpdGVTcGFjZSIsIm1hcmdpblRvcCIsImxldHRlclNwYWNpbmciLCJjdXJzb3IiLCJCb3VuZGFyeSIsInN0YXRlIiwiZ2V0RGVyaXZlZFN0YXRlRnJvbUVycm9yIiwiY29tcG9uZW50RGlkTW91bnQiLCJjaGlsZHJlbiIsIk1hcmtCb290ZWQiLCJfcyIsIl9fYm9vdGVkIiwiY3JlYXRlUm9vdCIsImRvY3VtZW50IiwiZ2V0RWxlbWVudEJ5SWQiLCJlIiwicm9vdCIsImlubmVySFRNTCIsIl9jIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VzIjpbIm1haW4udHN4Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBSZWFjdCwgeyB1c2VFZmZlY3QgfSBmcm9tIFwicmVhY3RcIjtcbmltcG9ydCBSZWFjdERPTSBmcm9tIFwicmVhY3QtZG9tL2NsaWVudFwiO1xuaW1wb3J0IFwiLi9pbmRleC5jc3NcIjtcbmltcG9ydCBBcHAgZnJvbSBcIi4vQXBwLnRzeFwiO1xuXG4od2luZG93IGFzIHVua25vd24gYXMgeyBfX21haW5SZWFjaGVkPzogYm9vbGVhbiB9KS5fX21haW5SZWFjaGVkID0gdHJ1ZTtcblxuY29uc3Qgc2FmZUhpZGVTcGxhc2ggPSAoKSA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgdyA9IHdpbmRvdyBhcyB1bmtub3duIGFzIHsgX19oaWRlQm9vdD86ICgpID0+IHZvaWQgfTtcbiAgICBpZiAodHlwZW9mIHcuX19oaWRlQm9vdCA9PT0gXCJmdW5jdGlvblwiKSB3Ll9faGlkZUJvb3QoKTtcbiAgfSBjYXRjaCB7XG4gICAgLyogeWEgbm8gZXhpc3RlICovXG4gIH1cbn07XG5cbmNsYXNzIENyYXNoU2NyZWVuIGV4dGVuZHMgUmVhY3QuQ29tcG9uZW50PHsgZXJyb3I6IHVua25vd24gfSwgbmV2ZXI+IHtcbiAgcmVzZXQgPSAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGxvY2FsU3RvcmFnZS5jbGVhcigpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgLyogc2luIGFsbWFjZW5hbWllbnRvICovXG4gICAgfVxuICAgIHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKTtcbiAgfTtcbiAgcmVuZGVyKCkge1xuICAgIGNvbnN0IG1zZyA9IHRoaXMucHJvcHMuZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IHRoaXMucHJvcHMuZXJyb3IubWVzc2FnZSA6IFN0cmluZyh0aGlzLnByb3BzLmVycm9yKTtcbiAgICByZXR1cm4gKFxuICAgICAgPGRpdlxuICAgICAgICBzdHlsZT17e1xuICAgICAgICAgIG1pbkhlaWdodDogXCIxMDB2aFwiLFxuICAgICAgICAgIGJhY2tncm91bmQ6IFwiIzAwMDAwMFwiLFxuICAgICAgICAgIGNvbG9yOiBcIiNkNmZmZTBcIixcbiAgICAgICAgICBmb250RmFtaWx5OiBcIidKZXRCcmFpbnMgTW9ubycsIG1vbm9zcGFjZVwiLFxuICAgICAgICAgIGRpc3BsYXk6IFwiZmxleFwiLFxuICAgICAgICAgIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsXG4gICAgICAgICAganVzdGlmeUNvbnRlbnQ6IFwiY2VudGVyXCIsXG4gICAgICAgICAgcGFkZGluZzogMjQsXG4gICAgICAgIH19XG4gICAgICA+XG4gICAgICAgIDxkaXZcbiAgICAgICAgICBzdHlsZT17e1xuICAgICAgICAgICAgbWF4V2lkdGg6IDU2MCxcbiAgICAgICAgICAgIGJvcmRlcjogXCIycHggc29saWQgcmdiYSgwLDI1NSw2NSwwLjUpXCIsXG4gICAgICAgICAgICBib3JkZXJSYWRpdXM6IDEyLFxuICAgICAgICAgICAgYmFja2dyb3VuZDogXCIjMDMxMTBhXCIsXG4gICAgICAgICAgICBwYWRkaW5nOiBcIjI4cHggMzBweFwiLFxuICAgICAgICAgICAgYm94U2hhZG93OiBcIjAgMCA2MHB4IC0yMHB4IHJnYmEoMCwyNTUsNjUsMC40NSlcIixcbiAgICAgICAgICB9fVxuICAgICAgICA+XG4gICAgICAgICAgPHAgc3R5bGU9e3sgZm9udEZhbWlseTogXCInVlQzMjMnLCBtb25vc3BhY2VcIiwgZm9udFNpemU6IDIyLCBjb2xvcjogXCIjMDBmZjQxXCIsIG1hcmdpbjogMCB9fT5cbiAgICAgICAgICAgIOKVsyBLRVJORUwgUEFOSUMg4oCUIGVsIGJvdCBzZSBlc3RyZWxsw7NcbiAgICAgICAgICA8L3A+XG4gICAgICAgICAgPHAgc3R5bGU9e3sgZm9udFNpemU6IDEyLCBsaW5lSGVpZ2h0OiAxLjcsIGNvbG9yOiBcIiM3OWI1OGZcIiwgd2hpdGVTcGFjZTogXCJwcmUtd3JhcFwiIH19Pnttc2d9PC9wPlxuICAgICAgICAgIDxidXR0b25cbiAgICAgICAgICAgIG9uQ2xpY2s9e3RoaXMucmVzZXR9XG4gICAgICAgICAgICBzdHlsZT17e1xuICAgICAgICAgICAgICBtYXJnaW5Ub3A6IDE2LFxuICAgICAgICAgICAgICBmb250RmFtaWx5OiBcIidWVDMyMycsIG1vbm9zcGFjZVwiLFxuICAgICAgICAgICAgICBmb250U2l6ZTogMTYsXG4gICAgICAgICAgICAgIGxldHRlclNwYWNpbmc6IFwiMC4xZW1cIixcbiAgICAgICAgICAgICAgY29sb3I6IFwiIzAwZmY0MVwiLFxuICAgICAgICAgICAgICBiYWNrZ3JvdW5kOiBcInJnYmEoMCwyNTUsNjUsMC4xKVwiLFxuICAgICAgICAgICAgICBib3JkZXI6IFwiMXB4IHNvbGlkIHJnYmEoMCwyNTUsNjUsMC40NSlcIixcbiAgICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiA4LFxuICAgICAgICAgICAgICBwYWRkaW5nOiBcIjhweCAxOHB4XCIsXG4gICAgICAgICAgICAgIGN1cnNvcjogXCJwb2ludGVyXCIsXG4gICAgICAgICAgICB9fVxuICAgICAgICAgID5cbiAgICAgICAgICAgIFJFSU5JQ0lBUiBFTCBCT1QgKGJvcnJhIGxhIG1lbW9yaWEpXG4gICAgICAgICAgPC9idXR0b24+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgKTtcbiAgfVxufVxuXG5jbGFzcyBCb3VuZGFyeSBleHRlbmRzIFJlYWN0LkNvbXBvbmVudDx7IGNoaWxkcmVuOiBSZWFjdC5SZWFjdE5vZGUgfSwgeyBlcnJvcjogdW5rbm93biB9PiB7XG4gIHN0YXRlID0geyBlcnJvcjogbnVsbCBhcyB1bmtub3duIH07XG4gIHN0YXRpYyBnZXREZXJpdmVkU3RhdGVGcm9tRXJyb3IoZXJyb3I6IHVua25vd24pIHtcbiAgICByZXR1cm4geyBlcnJvciB9O1xuICB9XG4gIGNvbXBvbmVudERpZE1vdW50KCkge1xuICAgIHNhZmVIaWRlU3BsYXNoKCk7XG4gIH1cbiAgcmVuZGVyKCkge1xuICAgIGlmICh0aGlzLnN0YXRlLmVycm9yKSByZXR1cm4gPENyYXNoU2NyZWVuIGVycm9yPXt0aGlzLnN0YXRlLmVycm9yfSAvPjtcbiAgICByZXR1cm4gdGhpcy5wcm9wcy5jaGlsZHJlbjtcbiAgfVxufVxuXG5mdW5jdGlvbiBNYXJrQm9vdGVkKCkge1xuICB1c2VFZmZlY3QoKCkgPT4ge1xuICAgICh3aW5kb3cgYXMgdW5rbm93biBhcyB7IF9fYm9vdGVkPzogYm9vbGVhbiB9KS5fX2Jvb3RlZCA9IHRydWU7XG4gICAgc2FmZUhpZGVTcGxhc2goKTtcbiAgfSwgW10pO1xuICByZXR1cm4gbnVsbDtcbn1cblxudHJ5IHtcbiAgUmVhY3RET00uY3JlYXRlUm9vdChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvb3RcIikhKS5yZW5kZXIoXG4gICAgPEJvdW5kYXJ5PlxuICAgICAgPE1hcmtCb290ZWQgLz5cbiAgICAgIDxBcHAgLz5cbiAgICA8L0JvdW5kYXJ5PixcbiAgKTtcbn0gY2F0Y2ggKGUpIHtcbiAgY29uc3Qgcm9vdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwicm9vdFwiKTtcbiAgaWYgKHJvb3QpIHtcbiAgICByb290LmlubmVySFRNTCA9XG4gICAgICAnPGRpdiBzdHlsZT1cIm1pbi1oZWlnaHQ6MTAwdmg7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO2JhY2tncm91bmQ6IzAwMDAwMDtjb2xvcjojYmFmZmM5O2ZvbnQtZmFtaWx5Om1vbm9zcGFjZTtwYWRkaW5nOjI0cHhcIj4nICtcbiAgICAgICc8ZGl2IHN0eWxlPVwiYm9yZGVyOjFweCBzb2xpZCByZ2JhKDAsMjU1LDY1LC41KTtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzoyMHB4O21heC13aWR0aDo1MjBweDt3aGl0ZS1zcGFjZTpwcmUtd3JhcFwiPicgK1xuICAgICAgXCJFUlJPUiBBTCBNT05UQVIgRUwgQk9UOlxcblwiICtcbiAgICAgIChlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSkpICtcbiAgICAgIFwiXFxuXFxuUHJlc2lvbmEgQ3RybCtGNSBwYXJhIHJlaW50ZW50YXIuPC9kaXY+PC9kaXY+XCI7XG4gIH1cbn1cbiJdLCJmaWxlIjoiL3dvcmtzcGFjZS9zcmMvbWFpbi50c3gifQ==