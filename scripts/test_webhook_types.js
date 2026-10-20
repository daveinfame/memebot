// Arnés: filtro del webhook de Helius.
// Cada evento entregado cuesta 1 crédito y 'ANY' entrega todo (incluidas las
// transferencias que el bot ya ignora). El default debe ser SWAP y tienen que
// quedar configurables por HELIUS_WEBHOOK_TYPES.
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

check('el default es SWAP', /process\.env\.HELIUS_WEBHOOK_TYPES \|\| 'SWAP'/.test(src));
check('ya no se registra ANY', !/transactionTypes: \['ANY'\]/.test(src));
check('el payload usa la lista calculada', /transactionTypes: tiposWebhook,/.test(src));
check('se normaliza y limpia la lista', /\.map\(\(t\) => t\.trim\(\)\.toUpperCase\(\)\)/.test(src) && /\.filter\(Boolean\)/.test(src));
check('protege la lista vacía (vacío = todos en Helius)', /tiposWebhook\.length === 0\) tiposWebhook\.push\('SWAP'\)/.test(src));

// Simulación de la normalización tal como está en el código
const parsear = (v) => {
  const lista = (v || 'SWAP')
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  if (lista.length === 0) lista.push('SWAP');
  return lista;
};

check('sin variable → [SWAP]', JSON.stringify(parsear('')) === '["SWAP"]', JSON.stringify(parsear('')));
check('"swap, transfer" → [SWAP,TRANSFER]', JSON.stringify(parsear('swap, transfer')) === '["SWAP","TRANSFER"]', JSON.stringify(parsear('swap, transfer')));
check('solo comas → [SWAP] no lista vacía', JSON.stringify(parsear(', ,')) === '["SWAP"]', JSON.stringify(parsear(', ,')));

console.log(`\n${fail === 0 ? 'TODO OK' : 'FALLARON'} (${ok} bien, ${fail} mal)`);
process.exit(fail === 0 ? 0 : 1);
