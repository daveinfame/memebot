// Arnés: valoración de un cierre por RECONCILIACIÓN (la wallet quedó en 0 sin
// que se viera la venta). Antes: proceeds = amount × precio y, si salía >3x o
// <0.33x, se colapsaba a cost_basis → un 5x real se reportaba como 0% y un -70%
// también como 0%. Ahora el múltiplo sale del PRECIO (mercado ÷ compra).
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8').replace(/\r\n/g, '\n');
const ini = src.indexOf('async function calcularProceedsParaReconciliacion(pos) {');
if (ini < 0) {
  console.error('❌ no se pudo extraer calcularProceedsParaReconciliacion');
  process.exit(1);
}
const fin = src.indexOf('\n}\n', ini);
if (fin < 0) {
  console.error('❌ no se encontró el cierre de la función');
  process.exit(1);
}
const bloque = src.slice(ini, fin + 3);

const RATIO_SALIDA_MIN = 0.02;
const RATIO_SALIDA_MAX = 30;

function construir(estimar) {
  const f = new Function(
    'getTokenInfoHelius',
    'estimarValorEnSol',
    'log',
    'RATIO_SALIDA_MIN',
    'RATIO_SALIDA_MAX',
    bloque + '\nreturn calcularProceedsParaReconciliacion;'
  );
  return f(
    async () => ({ decimals: 6 }),
    estimar,
    () => {},
    RATIO_SALIDA_MIN,
    RATIO_SALIDA_MAX
  );
}

const COSTO = 0.035; // 0.035 SOL de costo, como las posiciones reales

function pos(precioCompra) {
  return { token_mint: 'MintXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', symbol: 'TEST', amount: 441701, cost_basis_sol: COSTO, precio_compra_native: precioCompra, origen_dex: 'pumpfun' };
}

let ok = 0;
let fail = 0;
function check(nombre, cond, extra = '') {
  if (cond) {
    ok++;
    console.log('✅', nombre);
  } else {
    fail++;
    console.log('❌', nombre, extra);
  }
}

const PC = 1e-7; // precio de compra 1e-7 SOL/token

(async () => {
  // 1) 5x: antes se reportaba 0%
  let r = await construir(async () => ({ valorSol: null, precioSolUnitario: 5e-7, dexId: 'pumpfun', error: null }))(pos(PC));
  check('5x → proceeds 5× costo (antes 0%)', Math.abs(r.proceedsSol - COSTO * 5) < 1e-9, JSON.stringify(r));
  check('5x → fuente dice 5.00x', /5\.00x/.test(r.fuente), r.fuente);

  // 2) -70%: antes también 0%
  r = await construir(async () => ({ valorSol: null, precioSolUnitario: 0.3 * PC, dexId: 'pumpfun', error: null }))(pos(PC));
  check('-70% → proceeds 0.3× costo (antes 0%)', Math.abs(r.proceedsSol - COSTO * 0.3) < 1e-9, JSON.stringify(r));

  // 3) 100x → se limita a 30x, no a costo
  r = await construir(async () => ({ valorSol: null, precioSolUnitario: 100 * PC, dexId: 'pumpswap', error: null }))(pos(PC));
  check('100x → tope 30x', Math.abs(r.proceedsSol - COSTO * 30) < 1e-9, JSON.stringify(r));
  check('100x → fuente marca [tope]', /\[tope\]/.test(r.fuente), r.fuente);

  // 4) colapso a 0.0001x → tope inferior 0.02x
  r = await construir(async () => ({ valorSol: null, precioSolUnitario: 0.0001 * PC, dexId: 'pumpfun', error: null }))(pos(PC));
  check('0.0001x → tope inferior 0.02x', Math.abs(r.proceedsSol - COSTO * 0.02) < 1e-9, JSON.stringify(r));

  // 5) sin ancla de compra → usa valor absoluto con cordura
  r = await construir(async () => ({ valorSol: COSTO * 2, precioSolUnitario: 2 * PC, dexId: 'pumpfun', error: null }))(pos(0));
  check('sin ancla → valor absoluto 2× costo', Math.abs(r.proceedsSol - COSTO * 2) < 1e-9, JSON.stringify(r));
  check('sin ancla → fuente "mercado absoluto"', /mercado absoluto/.test(r.fuente), r.fuente);

  // 6) no tradable → cost_basis
  r = await construir(async () => ({ valorSol: null, precioSolUnitario: null, error: 'NOT_TRADABLE' }))(pos(PC));
  check('NOT_TRADABLE → cost_basis', Math.abs(r.proceedsSol - COSTO) < 1e-9 && /no tradable/.test(r.fuente), JSON.stringify(r));

  // 7) sin precio → cost_basis fallback
  r = await construir(async () => ({ valorSol: null, precioSolUnitario: null, error: 'NO_VALID_PAIRS' }))(pos(PC));
  check('sin precio → cost_basis (PnL 0)', Math.abs(r.proceedsSol - COSTO) < 1e-9 && /fallback/.test(r.fuente), JSON.stringify(r));

  console.log(`\n${fail === 0 ? 'TODO OK' : 'FALLARON'} (${ok} bien, ${fail} mal)`);
  process.exit(fail === 0 ? 0 : 1);
})();
