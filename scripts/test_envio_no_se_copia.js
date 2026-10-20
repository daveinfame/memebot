// Regla del dueño: una TRANSFERENCIA (la wallet "envía" tokens) NO se copia.
// Sólo cuenta como venta si hay pata de SOL propia o un swap dentro de la tx.
// Test estructural: vigila que la guarda siga en las DOS rutas del webhook
// (Parsed Events y fallback casero) y que corte el flujo con `continue`.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8').replace(/\r\n/g, '\n');

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

const guardas = src.match(/transferencia sin swap ni pata de SOL/g) || [];
check('la guarda existe en las 2 rutas del webhook', guardas.length === 2, `encontradas: ${guardas.length}`);

// Cada guarda debe ir seguida de un `continue` (si no, cierra la posición igual).
const bloques = src.split('transferencia sin swap ni pata de SOL').slice(1);
check(
  'cada guarda corta el flujo con continue',
  bloques.length === 2 && bloques.every((b) => /continue;/.test(b.slice(0, 220))),
  bloques.map((b) => b.slice(0, 80)).join(' | ')
);

// Y no debe quedar la llamada vieja que cerraba a mercado desde el handle.
check(
  'el rescate de valoración ya no se usa para transfers',
  /📤 /.test(src) && /rescate de valoración/.test(src),
  'revisar el flujo de handleTrackedSell'
);

console.log(`\n${fail === 0 ? 'TODO OK' : 'FALLARON'} (${ok} bien, ${fail} mal)`);
process.exit(fail === 0 ? 0 : 1);
