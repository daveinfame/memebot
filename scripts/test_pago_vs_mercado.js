// Arnés: "pago vs mercado" — una compra sólo se copia si la wallet pagó una
// parte sustancial del valor recibido. Caso real: Bestcook "compró" AAPLx
// pagando 0.25 USDC (≈0.0026 SOL) por 0.0106 tokens que valían 3.5767 SOL/token
// (≈0.038 SOL) → 7% del valor: era una RECEPCIÓN pagada por otro (relayer).
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8').replace(/\r\n/g, '\n');

const ini = src.indexOf('const MIN_PAGO_VS_MERCADO');
const fin = src.indexOf('async function', ini);
if (ini < 0 || fin < 0) {
  console.error('❌ no se pudo extraer el bloque de pago vs mercado');
  process.exit(1);
}
const bloque = src.slice(ini, fin);

const f = new Function('process', 'Number', bloque + '\nreturn { MIN_PAGO_VS_MERCADO, esPagoInsuficiente };');
const { MIN_PAGO_VS_MERCADO, esPagoInsuficiente } = f({ env: {} }, Number);

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

check('umbral por defecto = 0.30', MIN_PAGO_VS_MERCADO === 0.3, String(MIN_PAGO_VS_MERCADO));

// Caso real AAPLx: pagó 0.2487 SOL/token y el mercado estaba en 3.5767
const precioAaplTrade = 0.002636 / 0.0106;
check(
  'AAPLx recibida (7% del valor) → NO se copia',
  esPagoInsuficiente(precioAaplTrade, 3.5767) === true,
  `${((precioAaplTrade / 3.5767) * 100).toFixed(1)}%`
);

// Compra limpia: pagó prácticamente el precio de mercado
check('compra limpia (98%) → SÍ se copia', esPagoInsuficiente(3.5, 3.5767) === false);
check('compra con slippage (70%) → SÍ se copia', esPagoInsuficiente(2.5, 3.5767) === false);

// Memecoin comprado a mercado con algo de deslizamiento
check('memecoin (60% del mercado) → SÍ se copia', esPagoInsuficiente(6e-8, 1e-7) === false);
check('memecoin a 20% del mercado → NO se copia', esPagoInsuficiente(2e-8, 1e-7) === true);

// Bordes
check('sin precio de trade → no bloquea', esPagoInsuficiente(0, 1e-7) === false);
check('sin precio de mercado → no bloquea', esPagoInsuficiente(1e-7, 0) === false);
check('precio igual al mercado → no bloquea', esPagoInsuficiente(1e-7, 1e-7) === false);
check('umbral ajustable (0.5 rechaza 40%)', esPagoInsuficiente(4e-8, 1e-7, 0.5) === true);

console.log(`\n${fail === 0 ? 'TODO OK' : 'FALLARON'} (${ok} bien, ${fail} mal)`);
process.exit(fail === 0 ? 0 : 1);
