// Arnés: proceeds por proporción (fix 2) + verificador on-chain por tx (fix 3).
// Extrae el código real de index.js para que falle si alguien lo rompe.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8').replace(/\r\n/g, '\n');

function bloque(ini, fin) {
  const a = src.indexOf(ini);
  const b = src.indexOf(fin);
  if (a < 0 || b < 0 || b <= a) throw new Error(`no se pudo extraer ${ini}`);
  return src.slice(a, b);
}

const bProporcion = bloque('// ---------- Proceeds por PROPORCIÓN', '// ---------- Compra ----------');
const bCalculos = bloque('// ---------- Cálculos ----------', 'function usdToSolNeto');
const bFlujo = bloque('// ---------- Pata de pago PROPIA', '// Encuentra qué wallet trackeada');
const bVerif = bloque('async function verificarMultiploEnCadena', 'async function lineaVerificacionOnChain');

const numeroSeguro = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const LAMPORTS_PER_SOL = 1e9;
const SOL_PRICE = 100;
const getSolPriceUSD = async () => SOL_PRICE;
const getHeliusApiKey = () => 'FAKE_KEY';
// Gotcha del arnés: si el código extraído usa un helper y no se pasa como stub,
// el try/catch se lo traga y TODO devuelve null como si el código estuviera mal.
const USDC_STUB = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT_STUB = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const MINTS_A_IGNORAR = new Set([
  'So11111111111111111111111111111111111111112',
  USDC_STUB,
  USDT_STUB
]);
const esMintNoCopiable = (m) => !!m && MINTS_A_IGNORAR.has(m);
const processStub = { env: {} };

// fetch falso: devuelve las tx que le pase el test
let TXS = [];
const fetchStub = async () => ({ ok: true, json: async () => TXS });

const fns = new Function(
  'numeroSeguro',
  'LAMPORTS_PER_SOL',
  'getSolPriceUSD',
  'getHeliusApiKey',
  'esMintNoCopiable',
  'fetch',
  'process',
  'PUMPFUN_FEE_PCT',
  'NETWORK_FEE_SOL',
  [
    bProporcion,
    bCalculos,
    bFlujo,
    bVerif,
    'return { calcularProceedsPorProporcion, calcularResultado, verificarMultiploEnCadena };'
  ].join('\n')
)(numeroSeguro, LAMPORTS_PER_SOL, getSolPriceUSD, getHeliusApiKey, esMintNoCopiable, fetchStub, processStub, 0.0125, 0.0005);

let fallos = 0;
function check(nombre, cond, detalle) {
  if (cond) console.log(`✅ ${nombre}`);
  else {
    fallos++;
    console.log(`❌ ${nombre}${detalle ? ' → ' + JSON.stringify(detalle) : ''}`);
  }
}
const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= Math.abs(b) * tol + 1e-12;

(async () => {
  // ===== Fix 2: proceeds por proporción =====
  // compra a 2e-5 SOL/token (0.02 SOL por 1000 tokens)
  const pos = { precio_compra_native: 2e-5, cost_basis_sol: 0.035, amount: 1750 };

  const t2x = { solAmount: 0.04, tokenAmount: 1000 }; // 4e-5 SOL/token → 2x
  const r2x = fns.calcularProceedsPorProporcion(t2x, pos);
  check('precio x2 → proceeds = 2 × costo', r2x && cerca(r2x.ratio, 2) && cerca(r2x.proceedsSol, 0.07), r2x);

  // El bug original: un `amount` enorme amplificaba la ganancia. Aquí no debe influir.
  const rAmountLoco = fns.calcularProceedsPorProporcion(t2x, { ...pos, amount: 1e12 });
  check('amount corrupto (1e12) → mismo proceeds', rAmountLoco && cerca(rAmountLoco.proceedsSol, 0.07), rAmountLoco);

  const rPerdida = fns.calcularProceedsPorProporcion({ solAmount: 0.01, tokenAmount: 1000 }, pos); // 1e-5 → 0.5x
  check('precio a la mitad → 0.5x, proceeds = 0.0175', rPerdida && cerca(rPerdida.ratio, 0.5) && cerca(rPerdida.proceedsSol, 0.0175), rPerdida);

  const rTope = fns.calcularProceedsPorProporcion({ solAmount: 2, tokenAmount: 1000 }, pos); // 2e-3 → 100x
  check('precio x100 → tope 30x', rTope && cerca(rTope.ratio, 30) && rTope.clampado === true, rTope);

  check('solAmountEstimado → null', fns.calcularProceedsPorProporcion({ ...t2x, solAmountEstimado: true }, pos) === null);
  check('sin precio_compra_native → null', fns.calcularProceedsPorProporcion(t2x, { ...pos, precio_compra_native: null }) === null);
  check('venta en polvo (0.004 SOL) → null', fns.calcularProceedsPorProporcion({ solAmount: 0.004, tokenAmount: 1 }, pos) === null);

  // Bug PB: la salida ya no se valora con la pata wSOL de la ruta. Con la
  // proporción, una wallet que perdió 11% da ~0.89x (antes: 0.00x / -100%).
  const pbPos = { precio_compra_native: 2e-5, cost_basis_sol: 0.0349, amount: 1745 };
  const pbTrade = { solAmount: 0.01786, tokenAmount: 1000 }; // 1.786e-5 → 0.893x
  const rPbProp = fns.calcularProceedsPorProporcion(pbTrade, pbPos);
  const rPb = fns.calcularResultado(pbPos.cost_basis_sol, rPbProp.proceedsSol, SOL_PRICE, true);
  check('wallet -11% → ~0.89x (no 0.00x)', rPbProp && cerca(rPbProp.ratio, 0.893, 0.01) && rPb.multiplicador > 0.8 && rPb.pct > -20, {
    ratio: rPbProp.ratio,
    mult: rPb.multiplicador,
    pct: rPb.pct
  });
  const rCero = fns.calcularResultado(0.0349, 0, SOL_PRICE, true);
  check('proceeds 0 (liquidez retirada) → sigue siendo -100%', cerca(rCero.multiplicador, 0) && cerca(rCero.pct, -100), {
    mult: rCero.multiplicador
  });

  // ===== Fix 3: verificador on-chain por tx =====
  const W = 'WALLET1';
  const MINT = 'MINTX';
  const OTRO = 'OTROMINT';

  // Compra 1 SOL → 1M tokens; venta 1M tokens → 1.5 SOL  ⇒ 1.5x
  const txCompra = {
    accountData: [{ account: W, nativeBalanceChange: -1_000_000_000 }],
    tokenTransfers: [{ mint: MINT, fromUserAccount: 'POOL', toUserAccount: W, tokenAmount: 1_000_000 }]
  };
  const txVenta = {
    accountData: [{ account: W, nativeBalanceChange: 1_500_000_000 }],
    tokenTransfers: [{ mint: MINT, fromUserAccount: W, toUserAccount: 'POOL', tokenAmount: 1_000_000 }]
  };

  TXS = [txCompra, txVenta];
  const v1 = await fns.verificarMultiploEnCadena(W, MINT);
  check('compra 1 SOL / venta 1.5 SOL → 1.50x', v1 && v1.verificable && cerca(v1.multiple, 1.5), v1);

  // Ruido: tx de OTRO token con mucho SOL no debe contaminar el múltiplo
  const txOtroToken = {
    accountData: [{ account: W, nativeBalanceChange: -50_000_000_000 }],
    tokenTransfers: [{ mint: OTRO, fromUserAccount: 'POOL', toUserAccount: W, tokenAmount: 5 }]
  };
  const txOtroTokenVenta = {
    accountData: [{ account: W, nativeBalanceChange: 90_000_000_000 }],
    tokenTransfers: [{ mint: OTRO, fromUserAccount: W, toUserAccount: 'POOL', tokenAmount: 5 }]
  };
  TXS = [txCompra, txVenta, txOtroToken, txOtroTokenVenta];
  const v2 = await fns.verificarMultiploEnCadena(W, MINT);
  check('tx de otros tokens no contaminan → sigue 1.50x', v2 && v2.verificable && cerca(v2.multiple, 1.5), v2);

  // Recepción del mint (bundler) sin pago propio: no debe contar como compra
  const txRecepcion = {
    accountData: [{ account: W, nativeBalanceChange: 0 }],
    tokenTransfers: [{ mint: MINT, fromUserAccount: 'BUNDLER', toUserAccount: W, tokenAmount: 9_000_000 }]
  };
  TXS = [txCompra, txVenta, txRecepcion];
  const v3 = await fns.verificarMultiploEnCadena(W, MINT);
  check('recepción sin pago no falsea el múltiplo → 1.50x', v3 && v3.verificable && cerca(v3.multiple, 1.5), v3);

  // Tx ambigua: la wallet paga 0.4 SOL y en la misma tx recibe polvo del mint +
  // otro token. Ese SOL no es de este mint: la tx se ignora.
  const txAmbigua = {
    accountData: [{ account: W, nativeBalanceChange: -400_000_000 }],
    tokenTransfers: [
      { mint: MINT, fromUserAccount: 'POOL', toUserAccount: W, tokenAmount: 0.000001 },
      { mint: OTRO, fromUserAccount: 'POOL', toUserAccount: W, tokenAmount: 1000 }
    ]
  };
  TXS = [txCompra, txVenta, txAmbigua];
  const v5 = await fns.verificarMultiploEnCadena(W, MINT);
  check('tx ambigua (polvo + otro token) se ignora → 1.50x', v5 && v5.verificable && cerca(v5.multiple, 1.5), v5);

  // Dos round trips: manda la tx dominante de cada lado (1M tokens), no la suma
  const txCompra2 = {
    accountData: [{ account: W, nativeBalanceChange: -300_000_000 }],
    tokenTransfers: [{ mint: MINT, fromUserAccount: 'POOL', toUserAccount: W, tokenAmount: 200_000 }]
  };
  const txVenta2 = {
    accountData: [{ account: W, nativeBalanceChange: 100_000_000 }],
    tokenTransfers: [{ mint: MINT, fromUserAccount: W, toUserAccount: 'POOL', tokenAmount: 200_000 }]
  };
  TXS = [txCompra, txVenta, txCompra2, txVenta2];
  const v6 = await fns.verificarMultiploEnCadena(W, MINT);
  check('dos round trips → usa la dominante (1.50x)', v6 && v6.verificable && cerca(v6.multiple, 1.5), v6);

  // Wallet tipo app: no mueve SOL ni USDC propio
  TXS = [
    {
      accountData: [{ account: W, nativeBalanceChange: 0 }],
      tokenTransfers: [
        { mint: MINT, fromUserAccount: 'APP', toUserAccount: W, tokenAmount: 1_000_000 },
        { mint: MINT, fromUserAccount: W, toUserAccount: 'APP', tokenAmount: 1_000_000 }
      ]
    }
  ];
  const v4 = await fns.verificarMultiploEnCadena(W, MINT);
  check('wallet tipo app → no verificable', v4 && v4.verificable === false, v4);

  console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK (15 casos)');
  process.exit(fallos ? 1 : 0);
})();
