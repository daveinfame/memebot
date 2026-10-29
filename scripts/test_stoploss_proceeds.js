// Arnés: valoración del cierre por STOP-LOSS en PAPER.
// Antes: proceeds = amount × precio. Un `amount` corrupto descuadraba el PnL
// (podía reportar -80% cuando la wallet cayó -50%). Ahora: costo × (mercado ÷ compra).
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8').replace(/\r\n/g, '\n');
const ini = src.indexOf('function proceedsStopLossPaper(pos, resultado) {');
if (ini < 0) {
  console.error('❌ no se pudo extraer proceedsStopLossPaper');
  process.exit(1);
}
const fin = src.indexOf('\n}\n', ini);
if (fin < 0) {
  console.error('❌ no se encontró el cierre de la función');
  process.exit(1);
}
const bloque = src.slice(ini, fin + 3);

const f = new Function('RATIO_SALIDA_MIN', 'RATIO_SALIDA_MAX', bloque + '\nreturn proceedsStopLossPaper;');
const valorar = f(0.02, 30);

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

const COSTO = 0.035; // costo real de las posiciones del bot
const PC = 1e-7; // precio de compra

function pos(precioCompra, amount) {
  return {
    token_mint: 'MintXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    symbol: 'TEST',
    amount: amount === undefined ? 441701 : amount,
    cost_basis_sol: COSTO,
    precio_compra_native: precioCompra
  };
}

// 1) -50% exacto (disparo del SL): proceeds = 0.5 × costo
let r = valorar(pos(PC), { precioSolUnitario: 0.5 * PC, valorSol: 999, dexId: 'pumpfun' });
check('-50% → proceeds 0.5× costo', Math.abs(r.proceedsSol - COSTO * 0.5) < 1e-9, JSON.stringify(r));

// 2) -90%: no se colapsa a costo ni a cero
r = valorar(pos(PC), { precioSolUnitario: 0.1 * PC, valorSol: 0, dexId: 'pumpfun' });
check('-90% → proceeds 0.1× costo', Math.abs(r.proceedsSol - COSTO * 0.1) < 1e-9, JSON.stringify(r));

// 3) un amount enorme ya NO infla el resultado (era el bug)
r = valorar(pos(PC, 5e12), { precioSolUnitario: 0.5 * PC, valorSol: 2500000, dexId: 'pumpfun' });
check('amount corrupto (5e12) no cambia proceeds', Math.abs(r.proceedsSol - COSTO * 0.5) < 1e-9, JSON.stringify(r));

// 4) colapso extremo → tope inferior 0.02x
r = valorar(pos(PC), { precioSolUnitario: 0.000001 * PC, valorSol: 0, dexId: 'x' });
check('colapso → tope inferior 0.02x', Math.abs(r.proceedsSol - COSTO * 0.02) < 1e-9, JSON.stringify(r));
check('tope marcado en la fuente', /\[tope\]/.test(r.fuente), r.fuente);

// 5) sin ancla de compra → valor absoluto
r = valorar(pos(0), { precioSolUnitario: 0.5 * PC, valorSol: 0.02, dexId: 'x' });
check('sin ancla → valor absoluto', Math.abs(r.proceedsSol - 0.02) < 1e-9, JSON.stringify(r));
check('sin ancla → fuente lo dice', /absoluto/.test(r.fuente), r.fuente);

// 6) nada de datos → 0
r = valorar(pos(0), { precioSolUnitario: null, valorSol: null });
check('sin datos → 0', r.proceedsSol === 0, JSON.stringify(r));

console.log(`\n${fail === 0 ? 'TODO OK' : 'FALLARON'} (${ok} bien, ${fail} mal)`);
process.exit(fail === 0 ? 0 : 1);
