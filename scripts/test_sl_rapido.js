// Arnés: SL rápido. Dos cambios que atacan las salidas en -60%:
//  1. revisarStopLoss cada 15 s (antes 60 s).
//  2. caída violenta: -25% en ≤3 min → vender ya, sin esperar el -50%.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8').replace(/\r\n/g, '\n');

const ini = src.indexOf('const CAIDA_VIOLENTA_PCT');
const fin = src.indexOf('\n\n', src.indexOf('function esCaidaViolenta('));
if (ini < 0 || fin < 0) {
  console.error('❌ no se pudo extraer el bloque de caída violenta');
  process.exit(1);
}
const bloque = src.slice(ini, src.indexOf('\n}\n', ini) + 3);
const f = new Function('process', 'Number', bloque + '\nreturn { CAIDA_VIOLENTA_PCT, CAIDA_VENTANA_MS, esCaidaViolenta };');
const { CAIDA_VIOLENTA_PCT, CAIDA_VENTANA_MS, esCaidaViolenta } = f({ env: {} }, Number);

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

check('umbral por defecto = 25%', CAIDA_VIOLENTA_PCT === 0.25, String(CAIDA_VIOLENTA_PCT));
check('ventana = 3 minutos', CAIDA_VENTANA_MS === 180000, String(CAIDA_VENTANA_MS));

// Caídas
check('cae 25% exacto → dispara', esCaidaViolenta(100, 75) === true);
check('cae 30% → dispara', esCaidaViolenta(100, 70) === true);
check('cae 50% → dispara', esCaidaViolenta(100, 50) === true);
check('cae 24% → NO dispara', esCaidaViolenta(100, 76) === false);
check('cae 10% → NO dispara', esCaidaViolenta(100, 90) === false);
check('sube 10% → NO dispara', esCaidaViolenta(100, 110) === false);
check('igual → NO dispara', esCaidaViolenta(100, 100) === false);

// Precios reales de memecoin (exponenciales)
check('memecoin 6.2e-8 → 4.0e-8 dispara', esCaidaViolenta(6.2e-8, 4.0e-8) === true);
check('memecoin 6.2e-8 → 5.9e-8 no dispara', esCaidaViolenta(6.2e-8, 5.9e-8) === false);

// Bordes
check('sin precio previo → no dispara', esCaidaViolenta(0, 50) === false);
check('sin precio actual → no dispara', esCaidaViolenta(100, 0) === false);
check('umbral ajustable (0.1 rechaza -15%)', esCaidaViolenta(100, 85, 0.1) === true);

// El intervalo del SL y la regla están en el código
check('SL cada 15 s', src.includes('setInterval(revisarStopLoss, 15_000)'));
check('la regla se evalúa antes del umbral', src.includes('Caida violenta (se evalua antes del umbral'));

console.log(`\n${fail === 0 ? 'TODO OK' : 'FALLARON'} (${ok} bien, ${fail} mal)`);
process.exit(fail === 0 ? 0 : 1);
