// Arnés: guard de caja en PAPER. Regla del dueño: sin dinero no se copia, y el
// saldo NUNCA queda negativo. Las posiciones abiertas no son caja: su valor
// vuelve al saldo sólo cuando se cierran. Caso real: el bot siguió copiando con
// saldo -$7.09.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8').replace(/\r\n/g, '\n');

const ini = src.indexOf('function cajaNeta(');
const fin = src.indexOf('const MIN_PAGO_PROPIO_SOL');
if (ini < 0) {
  console.error('❌ no se encontraron los helpers de caja');
  process.exit(1);
}
const bloque = src.slice(ini, src.indexOf('function cajaAlcanza(') + 400);
const corte = bloque.indexOf('\n}\n', bloque.indexOf('function cajaAlcanza(')) + 3;
const f = new Function('Number', bloque.slice(0, corte) + '\nreturn { cajaNeta, cajaAlcanza };');
const { cajaNeta, cajaAlcanza } = f(Number);

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

// cajaNeta
check('saldo -7.09 cuenta como 0', cajaNeta(-7.09) === 0);
check('saldo null cuenta como 0', cajaNeta(null) === 0);
check('saldo undefined cuenta como 0', cajaNeta(undefined) === 0);
check('saldo 12.5 se respeta', cajaNeta('12.5') === 12.5);
check('saldo 0 es 0', cajaNeta(0) === 0);

// cajaAlcanza
check('caja 3.99 < costo 4.00 → NO copia', cajaAlcanza(3.99, 4) === false);
check('caja 4.00 = costo 4.00 → SÍ copia', cajaAlcanza(4, 4) === true);
check('caja 0 → NO copia', cajaAlcanza(0, 4) === false);
check('caja -7.09 (caso real) → NO copia', cajaAlcanza(-7.09, 4) === false);
check('caja 100 → SÍ copia', cajaAlcanza(100, 4) === true);
check('costo 0 no bloquea', cajaAlcanza(0, 0) === true);
check('costo inválido no bloquea', cajaAlcanza(0, NaN) === true);

// El SQL nunca deja el saldo bajo cero
check('el UPDATE usa GREATEST(0, …)', src.includes('GREATEST(0, COALESCE(current_usdc'));

// El guard existe en el camino de compra PAPER
check('el guard registra "sin caja"', src.includes('sin caja ($${cajaDisponible.toFixed(2)}'));
check('avisa que se reanuda al cerrar', src.includes('Se reanuda cuando cierren las posiciones abiertas'));

console.log(`\n${fail === 0 ? 'TODO OK' : 'FALLARON'} (${ok} bien, ${fail} mal)`);
process.exit(fail === 0 ? 0 : 1);
