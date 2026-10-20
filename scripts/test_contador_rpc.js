// Arnés: contador de llamadas RPC (créditos de Helius).
// Extrae el contador real de index.js para que falle si alguien lo rompe.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8').replace(/\r\n/g, '\n');

function bloque(ini, fin) {
  const a = src.indexOf(ini);
  const b = src.indexOf(fin);
  if (a < 0 || b < 0 || b <= a) throw new Error(`no se pudo extraer ${ini}`);
  return src.slice(a, b);
}

const bContador = bloque('const rpcContador =', 'async function getTokenInfoHelius');
const f = new Function(bContador + '\nreturn { contarRpc, resumenRpcDelMinuto, rpcContador };');
const { contarRpc, resumenRpcDelMinuto, rpcContador } = f();

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

check('sin llamadas, el resumen es null', resumenRpcDelMinuto() === null);

contarRpc('balance');
contarRpc('balance');
contarRpc('tokenInfo');
const r = resumenRpcDelMinuto();
check('cuenta por tipo (balance 2)', typeof r === 'string' && r.includes('balance 2'), String(r));
check('total del minuto = 3', typeof r === 'string' && r.includes('3 llamada(s)'), String(r));
check('acumula el total del día = 3', rpcContador.totalDia === 3, String(rpcContador.totalDia));
check('el minuto se reinicia tras leerlo', resumenRpcDelMinuto() === null);

contarRpc('saldoSol');
const r2 = resumenRpcDelMinuto();
check('el día sigue acumulando (4)', rpcContador.totalDia === 4, String(rpcContador.totalDia));
check('el minuto nuevo cuenta solo 1', typeof r2 === 'string' && r2.includes('1 llamada(s)'), String(r2));

// Cambio de día: debe reiniciar el acumulado del día
rpcContador.fecha = '2000-01-01';
contarRpc('balance');
check('cambio de día reinicia el total', rpcContador.totalDia === 1, String(rpcContador.totalDia));

console.log(`\n${fail === 0 ? 'TODO OK' : 'FALLARON'} (${ok} bien, ${fail} mal)`);
process.exit(fail === 0 ? 0 : 1);
