// Arnés: valoración de tokens de curva de bonding (pumpfun, mcap ~3k, sin `liquidity`).
// Extrae la función REAL de index.js para que falle si alguien la rompe.
//
// Caso que motivó esto: DOOMSDAY (5ajGmg...pump) con mcap 8,108 y sin campo
// `liquidity` era descartada por el filtro (liq>=5000 y mcap>=10000), y entonces
// Jupiter decía NOT_TRADABLE -> posición imposible de valorar ni cerrar.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8').replace(/\r\n/g, '\n');

function bloque(ini, fin) {
  const a = src.indexOf(ini);
  const b = src.indexOf(fin);
  if (a < 0 || b < 0 || b <= a) throw new Error(`no se pudo extraer ${ini}`);
  return src.slice(a, b);
}

const bCotizar = bloque('async function cotizarViaDexScreener', '// ---------- Cotización vía Jupiter ----------');

let PARES = [];
const fetchStub = async () => ({ ok: true, json: async () => ({ pairs: PARES }) });
const avisos = [];

function construir(minMcap, maxMcap, minLiq) {
  const f = new Function(
    'fetch',
    'MIN_MCAP_USD',
    'MAX_MCAP_USD',
    'MIN_LIQ_USD',
    'log',
    'avisarPrecio',
    bCotizar + '\nreturn cotizarViaDexScreener;'
  );
  return f(fetchStub, minMcap, maxMcap, minLiq, () => {}, (...a) => avisos.push(a.join(' ')));
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

// --- Fixtures con la forma REAL de la API de DexScreener ---
// Curva de bonding: sin `liquidity`, mcap de 8k (DOOMSDAY real).
const parCurva = {
  chainId: 'solana',
  dexId: 'pumpfun',
  priceNative: '0.00000007717',
  priceUsd: '0.000008108',
  fdv: 8108.44,
  marketCap: 8108.44
};
// Pool AMM normal.
const parAmm = {
  chainId: 'solana',
  dexId: 'pumpswap',
  priceNative: '0.00000005',
  priceUsd: '0.0000053',
  liquidity: { usd: 33143.15, base: 1e9, quote: 20 },
  marketCap: 154687
};

const CANT = 494632.38; // tokens de la posición real de DOOMSDAY
const PRECIO_COMPRA = 0.0352 / CANT; // 7.11e-8 SOL/token

(async () => {
  // 1) Curva de bonding: antes se descartaba, ahora se valora.
  PARES = [parCurva];
  let r = await construir(1000, 500000000, 0)('5ajGmg4WA9nvrENuRGwZV7eiULokvBfqgCfZX2Rcpump', CANT, null, PRECIO_COMPRA, 30);
  check('curva pumpfun (mcap 8k, sin liquidity) → valorada', r.valorSol !== null, JSON.stringify(r));
  check('valor ≈ 0.0382 SOL', r.valorSol !== null && Math.abs(r.valorSol - 0.038171) < 0.0005, String(r.valorSol));
  check('marcada como curva', r.curva === true, String(r.curva));

  // 2) Si alguien vuelve a exigir liquidez, la curva debe ser descartada otra vez.
  r = await construir(1000, 500000000, 5000)('mint', CANT, null, PRECIO_COMPRA, 30);
  check('MIN_LIQ_USD=5000 → curva descartada (comportamiento previo)', r.error === 'NO_VALID_PAIRS', JSON.stringify(r));

  // 3) Pool AMM: sigue funcionando y no se marca como curva.
  PARES = [parAmm];
  r = await construir(1000, 500000000, 0)('mint', 1000000, null, null, 30);
  check('pool AMM normal → valorada', r.valorSol !== null && r.curva === false, JSON.stringify(r));

  // 4) Candado de ratio: precio 100x el de compra → se descarta.
  PARES = [{ ...parCurva, priceNative: '0.000007717' }]; // ~100x
  r = await construir(1000, 500000000, 0)('mint', CANT, null, PRECIO_COMPRA, 30);
  check('precio 100x el de compra → descartado por ratio', r.error === 'NO_VALID_PAIRS', JSON.stringify(r));

  // 5) Piso de mcap: 500 con MIN_MCAP_USD=1000 → se descarta.
  PARES = [{ ...parCurva, marketCap: 500, fdv: 500 }];
  r = await construir(1000, 500000000, 0)('mint', CANT, null, null, 30);
  check('mcap 500 < piso 1000 → descartado', r.error === 'NO_VALID_PAIRS', JSON.stringify(r));

  // 6) Tope de precio por token: 20 SOL → descartado.
  PARES = [{ ...parCurva, priceNative: '20', marketCap: 500000, fdv: 500000 }];
  r = await construir(1000, 500000000, 0)('mint', 10, null, null, 30);
  check('precio 20 SOL/token → descartado', r.error === 'NO_VALID_PAIRS', JSON.stringify(r));

  console.log(`\n${fail === 0 ? 'TODO OK' : 'FALLARON'} (${ok} bien, ${fail} mal)`);
  process.exit(fail === 0 ? 0 : 1);
})();
