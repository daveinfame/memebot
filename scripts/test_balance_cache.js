// Arnés: caché y corta-circuitos de getBalanceDeTokenEnWallet.
// Verifica que un 429 no se repita en cada ciclo (era el spam de "max usage
// reached" cada 7 s) y que el single-flight no duplique lecturas.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8').replace(/\r\n/g, '\n');
const ini = src.indexOf('// ---------- Balance de token: caché');
const fin = src.indexOf('// ---------- Balance SOL ----------');
if (ini < 0 || fin < 0) {
  console.error('❌ no se pudo extraer el bloque de balance');
  process.exit(1);
}
const bloque = src.slice(ini, fin);

class PublicKey {
  constructor(s) {
    this.s = s;
  }
}

let logs = [];
const log = (nivel, msg) => logs.push({ nivel, msg });

let llamadas = 0;
let modo = 'ok';
const connection = {
  async getParsedTokenAccountsByOwner() {
    llamadas++;
    if (modo === '429') throw new Error('429 Too Many Requests: max usage reached');
    return { value: [{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: 1234.5 } } } } } }] };
  }
};

const fns = new Function(
  'connection',
  'log',
  'PublicKey',
  'process',
  'contarRpc',
  `${bloque}; return { getBalanceDeTokenEnWallet, esErrorDeLimiteRpc, __setCooldown: (ms) => { rpcCooldownHasta = ms; }, __cache: balancesCache };`
)(connection, log, PublicKey, { env: {} }, () => {});

let fallos = 0;
function check(nombre, cond, detalle) {
  if (cond) console.log(`✅ ${nombre}`);
  else {
    fallos++;
    console.log(`❌ ${nombre}${detalle !== undefined ? ' → ' + JSON.stringify(detalle) : ''}`);
  }
}

(async () => {
  // 1. Lectura normal
  const v1 = await fns.getBalanceDeTokenEnWallet('W1', 'M1');
  check('lee el balance', v1 === 1234.5, v1);
  check('una sola llamada de red', llamadas === 1, llamadas);

  // 2. Cache: segunda lectura no toca la red
  const v2 = await fns.getBalanceDeTokenEnWallet('W1', 'M1');
  check('cache evita la segunda llamada', v2 === 1234.5 && llamadas === 1, { v2, llamadas });

  // 3. Single-flight: dos lecturas simultáneas de otra clave = 1 petición
  const [a, b] = await Promise.all([
    fns.getBalanceDeTokenEnWallet('W1', 'M2'),
    fns.getBalanceDeTokenEnWallet('W1', 'M2')
  ]);
  check('single-flight comparte la petición', a === 1234.5 && b === 1234.5 && llamadas === 2, { llamadas });

  // 4. 429 abre el corta-circuitos y no se vuelve a llamar
  fns.__setCooldown(0);
  modo = '429';
  const antes = llamadas;
  const v3 = await fns.getBalanceDeTokenEnWallet('W1', 'M3');
  check('429 devuelve null (sin cache previo)', v3 === null, v3);
  check('429 hace UNA llamada', llamadas === antes + 1, llamadas);
  check('429 avisa una sola vez', logs.filter((l) => l.msg.includes('RPC sin créditos')).length === 1);

  const v4 = await fns.getBalanceDeTokenEnWallet('W1', 'M4');
  check('en cooldown NO se llama a la red', llamadas === antes + 1 && v4 === null, { llamadas, v4 });
  check('en cooldown no se repite el aviso', logs.filter((l) => l.msg.includes('RPC sin créditos')).length === 1);

  // 5. En cooldown se devuelve el último valor conocido, nunca 0
  const v5 = await fns.getBalanceDeTokenEnWallet('W1', 'M1');
  check('en cooldown devuelve el valor cacheado (no 0)', v5 === 1234.5, v5);

  // 6. Detecta las variantes de error de límite
  check('reconoce 429', fns.esErrorDeLimiteRpc('429 Too Many Requests: max usage reached') === true);
  check('reconoce rate limit', fns.esErrorDeLimiteRpc('HTTP 429 rate limit exceeded') === true);
  check('no confunde otro error', fns.esErrorDeLimiteRpc('invalid mint') === false);

  console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK (11 casos)');
  process.exit(fallos ? 1 : 0);
})();
