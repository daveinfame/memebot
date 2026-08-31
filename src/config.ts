export const DEFAULT_CONFIG_TEXT = `# ====================================================
#   MEMEBOT · config.txt
#   Edítalo con el comando \`editar\` y guarda con Ctrl+S.
#   El precio SOL/USD se lee EN VIVO (Jupiter) — no se escribe a mano.
# ====================================================

[bot]
reserva_global = 1.5       # RESERVA_GLOBAL: SOL (paper) depositados en la wallet del bot
# rpc_url: TU endpoint de Solana. Vacío = RPC público (tiene límites).
#   Para 24/7 usa Helius (1M créditos GRATIS/mes): https://dashboard.helius.dev
# rpc_url      = https://mainnet.helius-rpc.com/?api-key=TU_KEY
slippage       = 12        # % máximo de slippage permitido
max_posiciones = 4         # posiciones abiertas al mismo tiempo
prioridad      = turbo     # turbo | rapida | normal
escudo_mev     = si        # si | no  (protección anti-sandwich)

[reglas]
snapshot_inicial = si      # REGLA 0: ignorar tokens que la wallet ya tenía al seguirla
filtro_anti_dust = si      # REGLA 0.5: solo compras donde la wallet FIRMA y PAGA SOL

[salidas]
# REGLA 3: cuando el trader VENDE, el bot vende 100% de la posición.
usar_take_profit = no      # si | no
take_profit      = 100     # % de ganancia que dispara la venta
usar_stop_loss   = no      # si | no
stop_loss        = 25      # % de pérdida que dispara la venta
auto_swap_usdc   = si      # REGLA 5: la GANANCIA de cada venta se asegura en USDC

[wallets]
# Wallets a copiar con capital en USD. Una por línea.
# Formato:  DIRECCION = Alias, CapitalUSD
#
# ← PEGA AQUÍ la wallet real que quieres seguir (quita el '#'):
# 9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin = CAP, 5
#
# También puedes escribirla en la consola:  seguir <dirección> <alias> <usd>

# ── LAS REGLAS DEL BOT ───────────────────────────────
#  R0    SNAPSHOT: al seguir a W, se ignora lo que ya tenía hasta que lo venda 100%.
#  R0.5  ANTI-DUST: solo cuenta si W firma y PAGA SOL (los airdrops van a dust.log).
#  R1    FIRST-IN: primera compra válida de X → el bot compra (capital de W en USD→SOL).
#  R2    Mientras la posición de X esté abierta, los promedios se IGNORAN.
#  R3    FIRST-OUT: primera venta de W → el bot vende 100% de X.
#  R4    RE-ENTRADA: solo tras cerrar (R3) se puede volver a comprar X.
#  R5    TESORERÍA: de cada venta vuelve SOL_A_USAR a la reserva; si hay GANANCIA
#        se hace swap SOL→USDC (profit asegurado). Si hay PÉRDIDA, se asume.
`;
export const ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const num = (raw) => parseFloat(raw.replace(",", "."));
const bool = (raw) => /^(si|sí|true|on|1)$/i.test(raw.trim());
export function parseConfig(text) {
  const errors = [];
  const cfg = {
    reservaGlobal: 1.5,
    rpcUrl: "",
    slippage: 12,
    maxPositions: 4,
    feeMode: "turbo",
    mev: true,
    tpOn: false,
    tpPct: 100,
    slOn: false,
    slPct: 25,
    autoSwapUsdc: true,
    snapshotInicial: true,
    filtroAntiDust: true,
    wallets: []
  };
  const seen = /* @__PURE__ */ new Set();
  let section = "";
  text.split("\n").forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) return;
    const sec = line.match(/^\[([\w-]+)\]$/);
    if (sec) {
      section = sec[1].toLowerCase();
      return;
    }
    if (section === "wallets") {
      const [addrPart, rest] = line.split("=");
      const address = (addrPart ?? "").trim();
      const parts = (rest ?? "").split(",");
      const alias = (parts[0] ?? "").trim() || address.slice(0, 4) + "…" + address.slice(-4);
      const capital = parts.length > 1 ? num(parts[1]) : NaN;
      if (!ADDR_RE.test(address)) {
        errors.push(`línea ${lineNo}: "${address}" no parece una wallet de Solana (base58, 32–44 chars)`);
        return;
      }
      if (Number.isNaN(capital) || capital < 1 || capital > 1e6) {
        errors.push(`línea ${lineNo}: el capital debe ser un número en USD (formato: DIRECCION = Alias, 5)`);
        return;
      }
      if (seen.has(address)) {
        errors.push(`línea ${lineNo}: wallet duplicada (${address.slice(0, 6)}…)`);
        return;
      }
      seen.add(address);
      cfg.wallets.push({ address, alias: alias || "wallet", capitalUsd: capital });
      return;
    }
    const kv = line.split("=");
    if (kv.length < 2) {
      errors.push(`línea ${lineNo}: no se entiende "${line}" (formato: clave = valor)`);
      return;
    }
    const key = kv[0].trim().toLowerCase();
    const val = kv.slice(1).join("=").trim();
    const range = (name, v, min, max) => {
      if (Number.isNaN(v) || v < min || v > max) {
        errors.push(`línea ${lineNo}: ${name} debe estar entre ${min} y ${max}`);
        return null;
      }
      return v;
    };
    if (section === "bot") {
      if (key === "reserva_global") {
        const v = range("reserva_global", num(val), 0.01, 1e5);
        if (v !== null) cfg.reservaGlobal = v;
      } else if (key === "sol_usd") {
        errors.push(`línea ${lineNo}: "sol_usd" ya no se edita a mano — el precio se lee EN VIVO de Jupiter. Borra esa línea.`);
      } else if (key === "rpc_url") {
        const v = val.trim();
        if (v && !/^https?:\/\//i.test(v)) {
          errors.push(`línea ${lineNo}: rpc_url debe empezar por https://`);
        } else {
          cfg.rpcUrl = v.replace(/\/+$/, "");
        }
      } else if (key === "slippage") {
        const v = range("slippage", num(val), 1, 49);
        if (v !== null) cfg.slippage = v;
      } else if (key === "max_posiciones") {
        const v = range("max_posiciones", Math.round(num(val)), 1, 10);
        if (v !== null) cfg.maxPositions = v;
      } else if (key === "prioridad") {
        if (/^(turbo|rapida|rápida|normal)$/i.test(val)) {
          cfg.feeMode = /turbo/i.test(val) ? "turbo" : /normal/i.test(val) ? "normal" : "rapida";
        } else {
          errors.push(`línea ${lineNo}: prioridad debe ser turbo, rapida o normal`);
        }
      } else if (key === "escudo_mev") {
        cfg.mev = bool(val);
      } else {
        errors.push(`línea ${lineNo}: clave desconocida "${key}" en [bot]`);
      }
    } else if (section === "salidas") {
      if (key === "usar_take_profit" || key === "usar_tp") cfg.tpOn = bool(val);
      else if (key === "take_profit" || key === "tp") {
        const v = range("take_profit", num(val), 5, 1e4);
        if (v !== null) cfg.tpPct = v;
      } else if (key === "usar_stop_loss" || key === "usar_sl") cfg.slOn = bool(val);
      else if (key === "stop_loss" || key === "sl") {
        const v = range("stop_loss", num(val), 3, 95);
        if (v !== null) cfg.slPct = v;
      } else if (key === "auto_swap_usdc") {
        cfg.autoSwapUsdc = bool(val);
      } else {
        errors.push(`línea ${lineNo}: clave desconocida "${key}" en [salidas]`);
      }
    } else if (section === "reglas") {
      if (key === "snapshot_inicial") cfg.snapshotInicial = bool(val);
      else if (key === "filtro_anti_dust") cfg.filtroAntiDust = bool(val);
      else errors.push(`línea ${lineNo}: clave desconocida "${key}" en [reglas]`);
    } else if (!section) {
      errors.push(`línea ${lineNo}: "${key}" está fuera de cualquier sección ([bot], [reglas], [salidas], [wallets])`);
    }
  });
  return { cfg, errors, walletCount: cfg.wallets.length };
}
export function addWalletLine(text, wallet) {
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => l.trim().toLowerCase() === "[wallets]");
  const line = `${wallet.address} = ${wallet.alias}, ${wallet.capitalUsd}`;
  if (idx === -1) {
    return text.trimEnd() + `

[wallets]
${line}
`;
  }
  let insertAt = idx + 1;
  for (let i = idx + 1; i < lines.length; i++) {
    const t = lines[i].replace(/#.*$/, "").trim();
    if (t.startsWith("[")) break;
    if (t) insertAt = i + 1;
  }
  lines.splice(insertAt, 0, line);
  return lines.join("\n");
}
export function removeWalletLine(text, match) {
  const q = match.trim().toLowerCase();
  const lines = text.split("\n");
  let removed = false;
  const out = lines.filter((raw) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line || line.startsWith("[")) return true;
    const [addrPart, rest] = line.split("=");
    const addr = (addrPart ?? "").trim().toLowerCase();
    const alias = ((rest ?? "").split(",")[0] ?? "").trim().toLowerCase();
    const hit = ADDR_RE.test(addr) && (addr === q || addr.startsWith(q)) || alias !== "" && alias === q;
    if (hit) removed = true;
    return !hit;
  });
  return { text: out.join("\n"), removed };
}
export const BANNER = `███╗   ███╗███████╗███╗   ███╗███████╗██████╗  ██████╗ ████████╗
████╗ ████║██╔════╝████╗ ████║██╔════╝██╔══██╗██╔═══██╗╚══██╔══╝
██╔████╔██║█████╗  ██╔████╔██║█████╗  ██████╔╝██║   ██║   ██║
██║╚██╔╝██║██╔══╝  ██║╚██╔╝██║██╔══╝  ██╔══██╗██║   ██║   ██║
██║ ╚═╝ ██║███████╗██║ ╚═╝ ██║███████╗██████╔╝╚██████╔╝   ██║
╚═╝     ╚═╝╚══════╝╚═╝     ╚═╝╚══════╝╚═════╝  ╚═════╝    ╚═╝`;
export const TAGLINE = "memebot · copy trading de memecoins · solana · una entrada y una salida por señal";
export const RULES_BOX = `┌─ LAS REGLAS ──────────────────────────────────────────┐
│ R0   snapshot: ignora lo que la wallet ya tenía       │
│ R0.5 anti-dust: solo si firma y PAGA SOL              │
│ R1   first-in: primera compra válida → el bot compra  │
│ R2   promedios → se IGNORAN                           │
│ R3   first-out: primera venta → el bot vende 100%     │
│ R5   ganancia → swap a USDC (profit asegurado)        │
└───────────────────────────────────────────────────────┘`;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNvbmZpZy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IEJvdENvbmZpZywgUGFyc2VSZXN1bHQsIFdhbGxldENmZyB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuICAgY29uZmlnLnR4dCDigJQgZWwgYXJjaGl2byBkZSB0ZXh0byBwbGFubyBxdWUgZ29iaWVybmEgZWwgYm90LlxuICAgTk9UQTogZWwgcHJlY2lvIFNPTC9VU0QgTk8gc2UgZWRpdGEgYXF1w60uIEVsIGJvdCBsbyBsZWUgRU4gVklWT1xuICAgZGUgbGEgSnVwaXRlciBQcmljZSBBUEkgY2FkYSAxMCBzIChTT0xfUFJJQ0VfTElWRSksIGNvbiBmYWxsYmFjayAkMTA1LlxuICAgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09ICovXG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0NPTkZJR19URVhUID0gYCMgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuIyAgIE1FTUVCT1QgwrcgY29uZmlnLnR4dFxuIyAgIEVkw610YWxvIGNvbiBlbCBjb21hbmRvIFxcYGVkaXRhclxcYCB5IGd1YXJkYSBjb24gQ3RybCtTLlxuIyAgIEVsIHByZWNpbyBTT0wvVVNEIHNlIGxlZSBFTiBWSVZPIChKdXBpdGVyKSDigJQgbm8gc2UgZXNjcmliZSBhIG1hbm8uXG4jID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuW2JvdF1cbnJlc2VydmFfZ2xvYmFsID0gMS41ICAgICAgICMgUkVTRVJWQV9HTE9CQUw6IFNPTCAocGFwZXIpIGRlcG9zaXRhZG9zIGVuIGxhIHdhbGxldCBkZWwgYm90XG4jIHJwY191cmw6IFRVIGVuZHBvaW50IGRlIFNvbGFuYS4gVmFjw61vID0gUlBDIHDDumJsaWNvICh0aWVuZSBsw61taXRlcykuXG4jICAgUGFyYSAyNC83IHVzYSBIZWxpdXMgKDFNIGNyw6lkaXRvcyBHUkFUSVMvbWVzKTogaHR0cHM6Ly9kYXNoYm9hcmQuaGVsaXVzLmRldlxuIyBycGNfdXJsICAgICAgPSBodHRwczovL21haW5uZXQuaGVsaXVzLXJwYy5jb20vP2FwaS1rZXk9VFVfS0VZXG5zbGlwcGFnZSAgICAgICA9IDEyICAgICAgICAjICUgbcOheGltbyBkZSBzbGlwcGFnZSBwZXJtaXRpZG9cbm1heF9wb3NpY2lvbmVzID0gNCAgICAgICAgICMgcG9zaWNpb25lcyBhYmllcnRhcyBhbCBtaXNtbyB0aWVtcG9cbnByaW9yaWRhZCAgICAgID0gdHVyYm8gICAgICMgdHVyYm8gfCByYXBpZGEgfCBub3JtYWxcbmVzY3Vkb19tZXYgICAgID0gc2kgICAgICAgICMgc2kgfCBubyAgKHByb3RlY2Npw7NuIGFudGktc2FuZHdpY2gpXG5cbltyZWdsYXNdXG5zbmFwc2hvdF9pbmljaWFsID0gc2kgICAgICAjIFJFR0xBIDA6IGlnbm9yYXIgdG9rZW5zIHF1ZSBsYSB3YWxsZXQgeWEgdGVuw61hIGFsIHNlZ3VpcmxhXG5maWx0cm9fYW50aV9kdXN0ID0gc2kgICAgICAjIFJFR0xBIDAuNTogc29sbyBjb21wcmFzIGRvbmRlIGxhIHdhbGxldCBGSVJNQSB5IFBBR0EgU09MXG5cbltzYWxpZGFzXVxuIyBSRUdMQSAzOiBjdWFuZG8gZWwgdHJhZGVyIFZFTkRFLCBlbCBib3QgdmVuZGUgMTAwJSBkZSBsYSBwb3NpY2nDs24uXG51c2FyX3Rha2VfcHJvZml0ID0gbm8gICAgICAjIHNpIHwgbm9cbnRha2VfcHJvZml0ICAgICAgPSAxMDAgICAgICMgJSBkZSBnYW5hbmNpYSBxdWUgZGlzcGFyYSBsYSB2ZW50YVxudXNhcl9zdG9wX2xvc3MgICA9IG5vICAgICAgIyBzaSB8IG5vXG5zdG9wX2xvc3MgICAgICAgID0gMjUgICAgICAjICUgZGUgcMOpcmRpZGEgcXVlIGRpc3BhcmEgbGEgdmVudGFcbmF1dG9fc3dhcF91c2RjICAgPSBzaSAgICAgICMgUkVHTEEgNTogbGEgR0FOQU5DSUEgZGUgY2FkYSB2ZW50YSBzZSBhc2VndXJhIGVuIFVTRENcblxuW3dhbGxldHNdXG4jIFdhbGxldHMgYSBjb3BpYXIgY29uIGNhcGl0YWwgZW4gVVNELiBVbmEgcG9yIGzDrW5lYS5cbiMgRm9ybWF0bzogIERJUkVDQ0lPTiA9IEFsaWFzLCBDYXBpdGFsVVNEXG4jXG4jIOKGkCBQRUdBIEFRVcONIGxhIHdhbGxldCByZWFsIHF1ZSBxdWllcmVzIHNlZ3VpciAocXVpdGEgZWwgJyMnKTpcbiMgOXhRZVd2RzgxNmJVeDlFUGpIbWFUMjN5dlZNMlpXYnJycFpiOVB1c1ZGaW4gPSBDQVAsIDVcbiNcbiMgVGFtYmnDqW4gcHVlZGVzIGVzY3JpYmlybGEgZW4gbGEgY29uc29sYTogIHNlZ3VpciA8ZGlyZWNjacOzbj4gPGFsaWFzPiA8dXNkPlxuXG4jIOKUgOKUgCBMQVMgUkVHTEFTIERFTCBCT1Qg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4jICBSMCAgICBTTkFQU0hPVDogYWwgc2VndWlyIGEgVywgc2UgaWdub3JhIGxvIHF1ZSB5YSB0ZW7DrWEgaGFzdGEgcXVlIGxvIHZlbmRhIDEwMCUuXG4jICBSMC41ICBBTlRJLURVU1Q6IHNvbG8gY3VlbnRhIHNpIFcgZmlybWEgeSBQQUdBIFNPTCAobG9zIGFpcmRyb3BzIHZhbiBhIGR1c3QubG9nKS5cbiMgIFIxICAgIEZJUlNULUlOOiBwcmltZXJhIGNvbXByYSB2w6FsaWRhIGRlIFgg4oaSIGVsIGJvdCBjb21wcmEgKGNhcGl0YWwgZGUgVyBlbiBVU0TihpJTT0wpLlxuIyAgUjIgICAgTWllbnRyYXMgbGEgcG9zaWNpw7NuIGRlIFggZXN0w6kgYWJpZXJ0YSwgbG9zIHByb21lZGlvcyBzZSBJR05PUkFOLlxuIyAgUjMgICAgRklSU1QtT1VUOiBwcmltZXJhIHZlbnRhIGRlIFcg4oaSIGVsIGJvdCB2ZW5kZSAxMDAlIGRlIFguXG4jICBSNCAgICBSRS1FTlRSQURBOiBzb2xvIHRyYXMgY2VycmFyIChSMykgc2UgcHVlZGUgdm9sdmVyIGEgY29tcHJhciBYLlxuIyAgUjUgICAgVEVTT1JFUsONQTogZGUgY2FkYSB2ZW50YSB2dWVsdmUgU09MX0FfVVNBUiBhIGxhIHJlc2VydmE7IHNpIGhheSBHQU5BTkNJQVxuIyAgICAgICAgc2UgaGFjZSBzd2FwIFNPTOKGklVTREMgKHByb2ZpdCBhc2VndXJhZG8pLiBTaSBoYXkgUMOJUkRJREEsIHNlIGFzdW1lLlxuYDtcblxuZXhwb3J0IGNvbnN0IEFERFJfUkUgPSAvXlsxLTlBLUhKLU5QLVphLWttLXpdezMyLDQ0fSQvO1xuXG5jb25zdCBudW0gPSAocmF3OiBzdHJpbmcpID0+IHBhcnNlRmxvYXQocmF3LnJlcGxhY2UoXCIsXCIsIFwiLlwiKSk7XG5jb25zdCBib29sID0gKHJhdzogc3RyaW5nKSA9PiAvXihzaXxzw618dHJ1ZXxvbnwxKSQvaS50ZXN0KHJhdy50cmltKCkpO1xuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VDb25maWcodGV4dDogc3RyaW5nKTogUGFyc2VSZXN1bHQge1xuICBjb25zdCBlcnJvcnM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IGNmZzogQm90Q29uZmlnID0ge1xuICAgIHJlc2VydmFHbG9iYWw6IDEuNSxcbiAgICBycGNVcmw6IFwiXCIsXG4gICAgc2xpcHBhZ2U6IDEyLFxuICAgIG1heFBvc2l0aW9uczogNCxcbiAgICBmZWVNb2RlOiBcInR1cmJvXCIsXG4gICAgbWV2OiB0cnVlLFxuICAgIHRwT246IGZhbHNlLFxuICAgIHRwUGN0OiAxMDAsXG4gICAgc2xPbjogZmFsc2UsXG4gICAgc2xQY3Q6IDI1LFxuICAgIGF1dG9Td2FwVXNkYzogdHJ1ZSxcbiAgICBzbmFwc2hvdEluaWNpYWw6IHRydWUsXG4gICAgZmlsdHJvQW50aUR1c3Q6IHRydWUsXG4gICAgd2FsbGV0czogW10sXG4gIH07XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgbGV0IHNlY3Rpb24gPSBcIlwiO1xuXG4gIHRleHQuc3BsaXQoXCJcXG5cIikuZm9yRWFjaCgocmF3TGluZSwgaWR4KSA9PiB7XG4gICAgY29uc3QgbGluZU5vID0gaWR4ICsgMTtcbiAgICBjb25zdCBsaW5lID0gcmF3TGluZS5yZXBsYWNlKC8jLiokLywgXCJcIikudHJpbSgpO1xuICAgIGlmICghbGluZSkgcmV0dXJuO1xuXG4gICAgY29uc3Qgc2VjID0gbGluZS5tYXRjaCgvXlxcWyhbXFx3LV0rKVxcXSQvKTtcbiAgICBpZiAoc2VjKSB7XG4gICAgICBzZWN0aW9uID0gc2VjWzFdLnRvTG93ZXJDYXNlKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLyogLS0tLSBbd2FsbGV0c106ICBESVJFQ0NJT04gPSBBbGlhcywgQ2FwaXRhbFVTRCAtLS0tICovXG4gICAgaWYgKHNlY3Rpb24gPT09IFwid2FsbGV0c1wiKSB7XG4gICAgICBjb25zdCBbYWRkclBhcnQsIHJlc3RdID0gbGluZS5zcGxpdChcIj1cIik7XG4gICAgICBjb25zdCBhZGRyZXNzID0gKGFkZHJQYXJ0ID8/IFwiXCIpLnRyaW0oKTtcbiAgICAgIGNvbnN0IHBhcnRzID0gKHJlc3QgPz8gXCJcIikuc3BsaXQoXCIsXCIpO1xuICAgICAgY29uc3QgYWxpYXMgPSAocGFydHNbMF0gPz8gXCJcIikudHJpbSgpIHx8IGFkZHJlc3Muc2xpY2UoMCwgNCkgKyBcIuKAplwiICsgYWRkcmVzcy5zbGljZSgtNCk7XG4gICAgICBjb25zdCBjYXBpdGFsID0gcGFydHMubGVuZ3RoID4gMSA/IG51bShwYXJ0c1sxXSkgOiBOYU47XG5cbiAgICAgIGlmICghQUREUl9SRS50ZXN0KGFkZHJlc3MpKSB7XG4gICAgICAgIGVycm9ycy5wdXNoKGBsw61uZWEgJHtsaW5lTm99OiBcIiR7YWRkcmVzc31cIiBubyBwYXJlY2UgdW5hIHdhbGxldCBkZSBTb2xhbmEgKGJhc2U1OCwgMzLigJM0NCBjaGFycylgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKE51bWJlci5pc05hTihjYXBpdGFsKSB8fCBjYXBpdGFsIDwgMSB8fCBjYXBpdGFsID4gMTAwMDAwMCkge1xuICAgICAgICBlcnJvcnMucHVzaChgbMOtbmVhICR7bGluZU5vfTogZWwgY2FwaXRhbCBkZWJlIHNlciB1biBuw7ptZXJvIGVuIFVTRCAoZm9ybWF0bzogRElSRUNDSU9OID0gQWxpYXMsIDUpYCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChzZWVuLmhhcyhhZGRyZXNzKSkge1xuICAgICAgICBlcnJvcnMucHVzaChgbMOtbmVhICR7bGluZU5vfTogd2FsbGV0IGR1cGxpY2FkYSAoJHthZGRyZXNzLnNsaWNlKDAsIDYpfeKApilgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc2Vlbi5hZGQoYWRkcmVzcyk7XG4gICAgICBjZmcud2FsbGV0cy5wdXNoKHsgYWRkcmVzcywgYWxpYXM6IGFsaWFzIHx8IFwid2FsbGV0XCIsIGNhcGl0YWxVc2Q6IGNhcGl0YWwgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLyogLS0tLSBjbGF2ZSA9IHZhbG9yIC0tLS0gKi9cbiAgICBjb25zdCBrdiA9IGxpbmUuc3BsaXQoXCI9XCIpO1xuICAgIGlmIChrdi5sZW5ndGggPCAyKSB7XG4gICAgICBlcnJvcnMucHVzaChgbMOtbmVhICR7bGluZU5vfTogbm8gc2UgZW50aWVuZGUgXCIke2xpbmV9XCIgKGZvcm1hdG86IGNsYXZlID0gdmFsb3IpYCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGtleSA9IGt2WzBdLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IHZhbCA9IGt2LnNsaWNlKDEpLmpvaW4oXCI9XCIpLnRyaW0oKTtcblxuICAgIGNvbnN0IHJhbmdlID0gKG5hbWU6IHN0cmluZywgdjogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIgfCBudWxsID0+IHtcbiAgICAgIGlmIChOdW1iZXIuaXNOYU4odikgfHwgdiA8IG1pbiB8fCB2ID4gbWF4KSB7XG4gICAgICAgIGVycm9ycy5wdXNoKGBsw61uZWEgJHtsaW5lTm99OiAke25hbWV9IGRlYmUgZXN0YXIgZW50cmUgJHttaW59IHkgJHttYXh9YCk7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHY7XG4gICAgfTtcblxuICAgIGlmIChzZWN0aW9uID09PSBcImJvdFwiKSB7XG4gICAgICBpZiAoa2V5ID09PSBcInJlc2VydmFfZ2xvYmFsXCIpIHtcbiAgICAgICAgY29uc3QgdiA9IHJhbmdlKFwicmVzZXJ2YV9nbG9iYWxcIiwgbnVtKHZhbCksIDAuMDEsIDEwMDAwMCk7XG4gICAgICAgIGlmICh2ICE9PSBudWxsKSBjZmcucmVzZXJ2YUdsb2JhbCA9IHY7XG4gICAgICB9IGVsc2UgaWYgKGtleSA9PT0gXCJzb2xfdXNkXCIpIHtcbiAgICAgICAgZXJyb3JzLnB1c2goYGzDrW5lYSAke2xpbmVOb306IFwic29sX3VzZFwiIHlhIG5vIHNlIGVkaXRhIGEgbWFubyDigJQgZWwgcHJlY2lvIHNlIGxlZSBFTiBWSVZPIGRlIEp1cGl0ZXIuIEJvcnJhIGVzYSBsw61uZWEuYCk7XG4gICAgICB9IGVsc2UgaWYgKGtleSA9PT0gXCJycGNfdXJsXCIpIHtcbiAgICAgICAgY29uc3QgdiA9IHZhbC50cmltKCk7XG4gICAgICAgIGlmICh2ICYmICEvXmh0dHBzPzpcXC9cXC8vaS50ZXN0KHYpKSB7XG4gICAgICAgICAgZXJyb3JzLnB1c2goYGzDrW5lYSAke2xpbmVOb306IHJwY191cmwgZGViZSBlbXBlemFyIHBvciBodHRwczovL2ApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNmZy5ycGNVcmwgPSB2LnJlcGxhY2UoL1xcLyskLywgXCJcIik7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoa2V5ID09PSBcInNsaXBwYWdlXCIpIHtcbiAgICAgICAgY29uc3QgdiA9IHJhbmdlKFwic2xpcHBhZ2VcIiwgbnVtKHZhbCksIDEsIDQ5KTtcbiAgICAgICAgaWYgKHYgIT09IG51bGwpIGNmZy5zbGlwcGFnZSA9IHY7XG4gICAgICB9IGVsc2UgaWYgKGtleSA9PT0gXCJtYXhfcG9zaWNpb25lc1wiKSB7XG4gICAgICAgIGNvbnN0IHYgPSByYW5nZShcIm1heF9wb3NpY2lvbmVzXCIsIE1hdGgucm91bmQobnVtKHZhbCkpLCAxLCAxMCk7XG4gICAgICAgIGlmICh2ICE9PSBudWxsKSBjZmcubWF4UG9zaXRpb25zID0gdjtcbiAgICAgIH0gZWxzZSBpZiAoa2V5ID09PSBcInByaW9yaWRhZFwiKSB7XG4gICAgICAgIGlmICgvXih0dXJib3xyYXBpZGF8csOhcGlkYXxub3JtYWwpJC9pLnRlc3QodmFsKSkge1xuICAgICAgICAgIGNmZy5mZWVNb2RlID0gL3R1cmJvL2kudGVzdCh2YWwpID8gXCJ0dXJib1wiIDogL25vcm1hbC9pLnRlc3QodmFsKSA/IFwibm9ybWFsXCIgOiBcInJhcGlkYVwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGVycm9ycy5wdXNoKGBsw61uZWEgJHtsaW5lTm99OiBwcmlvcmlkYWQgZGViZSBzZXIgdHVyYm8sIHJhcGlkYSBvIG5vcm1hbGApO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGtleSA9PT0gXCJlc2N1ZG9fbWV2XCIpIHtcbiAgICAgICAgY2ZnLm1ldiA9IGJvb2wodmFsKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVycm9ycy5wdXNoKGBsw61uZWEgJHtsaW5lTm99OiBjbGF2ZSBkZXNjb25vY2lkYSBcIiR7a2V5fVwiIGVuIFtib3RdYCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChzZWN0aW9uID09PSBcInNhbGlkYXNcIikge1xuICAgICAgaWYgKGtleSA9PT0gXCJ1c2FyX3Rha2VfcHJvZml0XCIgfHwga2V5ID09PSBcInVzYXJfdHBcIikgY2ZnLnRwT24gPSBib29sKHZhbCk7XG4gICAgICBlbHNlIGlmIChrZXkgPT09IFwidGFrZV9wcm9maXRcIiB8fCBrZXkgPT09IFwidHBcIikge1xuICAgICAgICBjb25zdCB2ID0gcmFuZ2UoXCJ0YWtlX3Byb2ZpdFwiLCBudW0odmFsKSwgNSwgMTAwMDApO1xuICAgICAgICBpZiAodiAhPT0gbnVsbCkgY2ZnLnRwUGN0ID0gdjtcbiAgICAgIH0gZWxzZSBpZiAoa2V5ID09PSBcInVzYXJfc3RvcF9sb3NzXCIgfHwga2V5ID09PSBcInVzYXJfc2xcIikgY2ZnLnNsT24gPSBib29sKHZhbCk7XG4gICAgICBlbHNlIGlmIChrZXkgPT09IFwic3RvcF9sb3NzXCIgfHwga2V5ID09PSBcInNsXCIpIHtcbiAgICAgICAgY29uc3QgdiA9IHJhbmdlKFwic3RvcF9sb3NzXCIsIG51bSh2YWwpLCAzLCA5NSk7XG4gICAgICAgIGlmICh2ICE9PSBudWxsKSBjZmcuc2xQY3QgPSB2O1xuICAgICAgfSBlbHNlIGlmIChrZXkgPT09IFwiYXV0b19zd2FwX3VzZGNcIikge1xuICAgICAgICBjZmcuYXV0b1N3YXBVc2RjID0gYm9vbCh2YWwpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZXJyb3JzLnB1c2goYGzDrW5lYSAke2xpbmVOb306IGNsYXZlIGRlc2Nvbm9jaWRhIFwiJHtrZXl9XCIgZW4gW3NhbGlkYXNdYCk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChzZWN0aW9uID09PSBcInJlZ2xhc1wiKSB7XG4gICAgICBpZiAoa2V5ID09PSBcInNuYXBzaG90X2luaWNpYWxcIikgY2ZnLnNuYXBzaG90SW5pY2lhbCA9IGJvb2wodmFsKTtcbiAgICAgIGVsc2UgaWYgKGtleSA9PT0gXCJmaWx0cm9fYW50aV9kdXN0XCIpIGNmZy5maWx0cm9BbnRpRHVzdCA9IGJvb2wodmFsKTtcbiAgICAgIGVsc2UgZXJyb3JzLnB1c2goYGzDrW5lYSAke2xpbmVOb306IGNsYXZlIGRlc2Nvbm9jaWRhIFwiJHtrZXl9XCIgZW4gW3JlZ2xhc11gKTtcbiAgICB9IGVsc2UgaWYgKCFzZWN0aW9uKSB7XG4gICAgICBlcnJvcnMucHVzaChgbMOtbmVhICR7bGluZU5vfTogXCIke2tleX1cIiBlc3TDoSBmdWVyYSBkZSBjdWFscXVpZXIgc2VjY2nDs24gKFtib3RdLCBbcmVnbGFzXSwgW3NhbGlkYXNdLCBbd2FsbGV0c10pYCk7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4geyBjZmcsIGVycm9ycywgd2FsbGV0Q291bnQ6IGNmZy53YWxsZXRzLmxlbmd0aCB9O1xufVxuXG4vKiAtLS0tLS0tLS0tIG1hbmlwdWxhY2nDs24gZGVsIHRleHRvIChjb21hbmRvcyBzZWd1aXIvZGVqYXIpIC0tLS0tLS0tLS0gKi9cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZFdhbGxldExpbmUodGV4dDogc3RyaW5nLCB3YWxsZXQ6IFdhbGxldENmZyk6IHN0cmluZyB7XG4gIGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdChcIlxcblwiKTtcbiAgY29uc3QgaWR4ID0gbGluZXMuZmluZEluZGV4KChsKSA9PiBsLnRyaW0oKS50b0xvd2VyQ2FzZSgpID09PSBcIlt3YWxsZXRzXVwiKTtcbiAgY29uc3QgbGluZSA9IGAke3dhbGxldC5hZGRyZXNzfSA9ICR7d2FsbGV0LmFsaWFzfSwgJHt3YWxsZXQuY2FwaXRhbFVzZH1gO1xuICBpZiAoaWR4ID09PSAtMSkge1xuICAgIHJldHVybiB0ZXh0LnRyaW1FbmQoKSArIGBcXG5cXG5bd2FsbGV0c11cXG4ke2xpbmV9XFxuYDtcbiAgfVxuICBsZXQgaW5zZXJ0QXQgPSBpZHggKyAxO1xuICBmb3IgKGxldCBpID0gaWR4ICsgMTsgaSA8IGxpbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgdCA9IGxpbmVzW2ldLnJlcGxhY2UoLyMuKiQvLCBcIlwiKS50cmltKCk7XG4gICAgaWYgKHQuc3RhcnRzV2l0aChcIltcIikpIGJyZWFrO1xuICAgIGlmICh0KSBpbnNlcnRBdCA9IGkgKyAxO1xuICB9XG4gIGxpbmVzLnNwbGljZShpbnNlcnRBdCwgMCwgbGluZSk7XG4gIHJldHVybiBsaW5lcy5qb2luKFwiXFxuXCIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlV2FsbGV0TGluZSh0ZXh0OiBzdHJpbmcsIG1hdGNoOiBzdHJpbmcpOiB7IHRleHQ6IHN0cmluZzsgcmVtb3ZlZDogYm9vbGVhbiB9IHtcbiAgY29uc3QgcSA9IG1hdGNoLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICBjb25zdCBsaW5lcyA9IHRleHQuc3BsaXQoXCJcXG5cIik7XG4gIGxldCByZW1vdmVkID0gZmFsc2U7XG4gIGNvbnN0IG91dCA9IGxpbmVzLmZpbHRlcigocmF3KSA9PiB7XG4gICAgY29uc3QgbGluZSA9IHJhdy5yZXBsYWNlKC8jLiokLywgXCJcIikudHJpbSgpO1xuICAgIGlmICghbGluZSB8fCBsaW5lLnN0YXJ0c1dpdGgoXCJbXCIpKSByZXR1cm4gdHJ1ZTtcbiAgICBjb25zdCBbYWRkclBhcnQsIHJlc3RdID0gbGluZS5zcGxpdChcIj1cIik7XG4gICAgY29uc3QgYWRkciA9IChhZGRyUGFydCA/PyBcIlwiKS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBhbGlhcyA9ICgocmVzdCA/PyBcIlwiKS5zcGxpdChcIixcIilbMF0gPz8gXCJcIikudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgaGl0ID1cbiAgICAgIChBRERSX1JFLnRlc3QoYWRkcikgJiYgKGFkZHIgPT09IHEgfHwgYWRkci5zdGFydHNXaXRoKHEpKSkgfHxcbiAgICAgIChhbGlhcyAhPT0gXCJcIiAmJiBhbGlhcyA9PT0gcSk7XG4gICAgaWYgKGhpdCkgcmVtb3ZlZCA9IHRydWU7XG4gICAgcmV0dXJuICFoaXQ7XG4gIH0pO1xuICByZXR1cm4geyB0ZXh0OiBvdXQuam9pbihcIlxcblwiKSwgcmVtb3ZlZCB9O1xufVxuXG4vKiAtLS0tLS0tLS0tIGJhbm5lciBBU0NJSSAtLS0tLS0tLS0tICovXG5cbmV4cG9ydCBjb25zdCBCQU5ORVIgPSBg4paI4paI4paI4pWXICAg4paI4paI4paI4pWX4paI4paI4paI4paI4paI4paI4paI4pWX4paI4paI4paI4pWXICAg4paI4paI4paI4pWX4paI4paI4paI4paI4paI4paI4paI4pWX4paI4paI4paI4paI4paI4paI4pWXICDilojilojilojilojilojilojilZcg4paI4paI4paI4paI4paI4paI4paI4paI4pWXXG7ilojilojilojilojilZcg4paI4paI4paI4paI4pWR4paI4paI4pWU4pWQ4pWQ4pWQ4pWQ4pWd4paI4paI4paI4paI4pWXIOKWiOKWiOKWiOKWiOKVkeKWiOKWiOKVlOKVkOKVkOKVkOKVkOKVneKWiOKWiOKVlOKVkOKVkOKWiOKWiOKVl+KWiOKWiOKVlOKVkOKVkOKVkOKWiOKWiOKVl+KVmuKVkOKVkOKWiOKWiOKVlOKVkOKVkOKVnVxu4paI4paI4pWU4paI4paI4paI4paI4pWU4paI4paI4pWR4paI4paI4paI4paI4paI4pWXICDilojilojilZTilojilojilojilojilZTilojilojilZHilojilojilojilojilojilZcgIOKWiOKWiOKWiOKWiOKWiOKWiOKVlOKVneKWiOKWiOKVkSAgIOKWiOKWiOKVkSAgIOKWiOKWiOKVkVxu4paI4paI4pWR4pWa4paI4paI4pWU4pWd4paI4paI4pWR4paI4paI4pWU4pWQ4pWQ4pWdICDilojilojilZHilZrilojilojilZTilZ3ilojilojilZHilojilojilZTilZDilZDilZ0gIOKWiOKWiOKVlOKVkOKVkOKWiOKWiOKVl+KWiOKWiOKVkSAgIOKWiOKWiOKVkSAgIOKWiOKWiOKVkVxu4paI4paI4pWRIOKVmuKVkOKVnSDilojilojilZHilojilojilojilojilojilojilojilZfilojilojilZEg4pWa4pWQ4pWdIOKWiOKWiOKVkeKWiOKWiOKWiOKWiOKWiOKWiOKWiOKVl+KWiOKWiOKWiOKWiOKWiOKWiOKVlOKVneKVmuKWiOKWiOKWiOKWiOKWiOKWiOKVlOKVnSAgIOKWiOKWiOKVkVxu4pWa4pWQ4pWdICAgICDilZrilZDilZ3ilZrilZDilZDilZDilZDilZDilZDilZ3ilZrilZDilZ0gICAgIOKVmuKVkOKVneKVmuKVkOKVkOKVkOKVkOKVkOKVkOKVneKVmuKVkOKVkOKVkOKVkOKVkOKVnSAg4pWa4pWQ4pWQ4pWQ4pWQ4pWQ4pWdICAgIOKVmuKVkOKVnWA7XG5cbmV4cG9ydCBjb25zdCBUQUdMSU5FID0gXCJtZW1lYm90IMK3IGNvcHkgdHJhZGluZyBkZSBtZW1lY29pbnMgwrcgc29sYW5hIMK3IHVuYSBlbnRyYWRhIHkgdW5hIHNhbGlkYSBwb3Igc2XDsWFsXCI7XG5cbmV4cG9ydCBjb25zdCBSVUxFU19CT1ggPSBg4pSM4pSAIExBUyBSRUdMQVMg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSQXG7ilIIgUjAgICBzbmFwc2hvdDogaWdub3JhIGxvIHF1ZSBsYSB3YWxsZXQgeWEgdGVuw61hICAgICAgIOKUglxu4pSCIFIwLjUgYW50aS1kdXN0OiBzb2xvIHNpIGZpcm1hIHkgUEFHQSBTT0wgICAgICAgICAgICAgIOKUglxu4pSCIFIxICAgZmlyc3QtaW46IHByaW1lcmEgY29tcHJhIHbDoWxpZGEg4oaSIGVsIGJvdCBjb21wcmEgIOKUglxu4pSCIFIyICAgcHJvbWVkaW9zIOKGkiBzZSBJR05PUkFOICAgICAgICAgICAgICAgICAgICAgICAgICAg4pSCXG7ilIIgUjMgICBmaXJzdC1vdXQ6IHByaW1lcmEgdmVudGEg4oaSIGVsIGJvdCB2ZW5kZSAxMDAlICAgICDilIJcbuKUgiBSNSAgIGdhbmFuY2lhIOKGkiBzd2FwIGEgVVNEQyAocHJvZml0IGFzZWd1cmFkbykgICAgICAgIOKUglxu4pSU4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSYYDtcbiJdLCJtYXBwaW5ncyI6IkFBUU8sYUFBTSxzQkFBc0I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQWdENUIsYUFBTSxVQUFVO0FBRXZCLE1BQU0sTUFBTSxDQUFDLFFBQWdCLFdBQVcsSUFBSSxRQUFRLEtBQUssR0FBRyxDQUFDO0FBQzdELE1BQU0sT0FBTyxDQUFDLFFBQWdCLHVCQUF1QixLQUFLLElBQUksS0FBSyxDQUFDO0FBRTdELGdCQUFTLFlBQVksTUFBMkI7QUFDckQsUUFBTSxTQUFtQixDQUFDO0FBQzFCLFFBQU0sTUFBaUI7QUFBQSxJQUNyQixlQUFlO0FBQUEsSUFDZixRQUFRO0FBQUEsSUFDUixVQUFVO0FBQUEsSUFDVixjQUFjO0FBQUEsSUFDZCxTQUFTO0FBQUEsSUFDVCxLQUFLO0FBQUEsSUFDTCxNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsSUFDUCxjQUFjO0FBQUEsSUFDZCxpQkFBaUI7QUFBQSxJQUNqQixnQkFBZ0I7QUFBQSxJQUNoQixTQUFTLENBQUM7QUFBQSxFQUNaO0FBQ0EsUUFBTSxPQUFPLG9CQUFJLElBQVk7QUFDN0IsTUFBSSxVQUFVO0FBRWQsT0FBSyxNQUFNLElBQUksRUFBRSxRQUFRLENBQUMsU0FBUyxRQUFRO0FBQ3pDLFVB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