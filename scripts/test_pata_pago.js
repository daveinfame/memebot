// Arnés: pata de pago propia (patch 1). Extrae el bloque real de index.js, así
// que si alguien lo rompe, esto falla.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8').replace(/\r\n/g, '\n');
const ini = src.indexOf('// ---------- Pata de pago PROPIA');
const fin = src.indexOf('// Encuentra qué wallet trackeada es la dueña del swap');
if (ini < 0 || fin < 0 || fin < ini) {
  console.error('❌ No se pudo extraer el bloque de atribución');
  process.exit(1);
}
const bloque = src.slice(ini, fin);

const numeroSeguro = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const LAMPORTS_PER_SOL = 1e9;
const SOL_PRICE = 200;
const getSolPriceUSD = async () => SOL_PRICE;
const processStub = { env: { MIN_PAGO_PROPIO_SOL: '0.005' } };

const fns = new Function(
  'numeroSeguro',
  'LAMPORTS_PER_SOL',
  'getSolPriceUSD',
  'process',
  `${bloque}; return { flujoPropioDeWallet, atribuirTradeParsedAWallet };`
)(numeroSeguro, LAMPORTS_PER_SOL, getSolPriceUSD, processStub);

const W = 'WALLET1';
const MINT = 'MINTX';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

let fallos = 0;
function check(nombre, cond, detalle) {
  if (cond) console.log(`✅ ${nombre}`);
  else {
    fallos++;
    console.log(`❌ ${nombre}${detalle ? ' → ' + JSON.stringify(detalle) : ''}`);
  }
}

(async () => {
  // 1. Bundler: pagador compra y reparte tokens; la wallet no paga nada
  const txBundler = {
    accountData: [{ account: W, nativeBalanceChange: 0 }],
    tokenTransfers: [
      { mint: MINT, fromUserAccount: 'PAGADOR', toUserAccount: W, tokenAmount: 1_000_000 },
    ],
    nativeTransfers: [{ fromUserAccount: 'PAGADOR', toUserAccount: 'OTRA', amount: 250_000_000 }],
  };
  const parsedBuy = { direction: 'buy', mint: MINT, solAmount: 0.25, tokenAmount: 1_000_000 };
  check('bundler/multisend (recibe tokens, paga otro) → null', (await fns.atribuirTradeParsedAWallet(txBundler, parsedBuy, W)) === null);

  // 2. Recepción donde la wallet solo paga la fee de red
  const txFeeSolo = {
    accountData: [{ account: W, nativeBalanceChange: -5000 }],
    tokenTransfers: [{ mint: MINT, fromUserAccount: 'PAGADOR', toUserAccount: W, tokenAmount: 5000 }],
  };
  check('recepción con fee de 0.000005 SOL → null', (await fns.atribuirTradeParsedAWallet(txFeeSolo, parsedBuy, W)) === null);

  // 3. Compra normal en SOL
  const txBuy = {
    accountData: [{ account: W, nativeBalanceChange: -250_000_000 }],
    tokenTransfers: [{ mint: MINT, fromUserAccount: 'POOL', toUserAccount: W, tokenAmount: 2_000_000 }],
  };
  const rBuy = await fns.atribuirTradeParsedAWallet(txBuy, parsedBuy, W);
  check('compra normal en SOL → 0.25 SOL / 2M tokens', rBuy && rBuy.solAmount === 0.25 && rBuy.tokenAmount === 2_000_000, rBuy);

  // 4. Compra pagada en USDC (sin delta de SOL)
  const txUsdcBuy = {
    accountData: [{ account: W, nativeBalanceChange: -5000 }],
    tokenTransfers: [
      { mint: USDC, fromUserAccount: W, toUserAccount: 'POOL', tokenAmount: 200 },
      { mint: MINT, fromUserAccount: 'POOL', toUserAccount: W, tokenAmount: 50_000 },
    ],
  };
  const rUsdc = await fns.atribuirTradeParsedAWallet(txUsdcBuy, parsedBuy, W);
  check('compra con 200 USDC a $200/SOL → 1 SOL', rUsdc && Math.abs(rUsdc.solAmount - 1) < 1e-9, rUsdc);

  // 5. Venta normal en SOL
  const txSell = {
    accountData: [{ account: W, nativeBalanceChange: 300_000_000 }],
    tokenTransfers: [{ mint: MINT, fromUserAccount: W, toUserAccount: 'POOL', tokenAmount: 900_000 }],
  };
  const parsedSell = { direction: 'sell', mint: MINT, solAmount: 0.3, tokenAmount: 900_000 };
  const rSell = await fns.atribuirTradeParsedAWallet(txSell, parsedSell, W);
  check('venta normal en SOL → 0.3 SOL', rSell && rSell.solAmount === 0.3 && rSell.tokenAmount === 900_000, rSell);

  // 6. Wallet tipo app: vende tokens y no cobra ella (otro pagador ejecuta)
  const txAppSell = {
    accountData: [{ account: W, nativeBalanceChange: 0 }],
    tokenTransfers: [
      { mint: MINT, fromUserAccount: W, toUserAccount: 'APP', tokenAmount: 900_000 },
      { mint: USDC, fromUserAccount: 'APP', toUserAccount: 'APP2', tokenAmount: 120 },
    ],
  };
  const rApp = await fns.atribuirTradeParsedAWallet(txAppSell, parsedSell, W);
  check('venta tipo app → valorada con el precio del swap, no null', rApp && Math.abs(rApp.solAmount - 0.3) < 1e-9 && rApp.valoradoConSwapDeLaTx === true, rApp);

  // 7. Tx que no mueve el token de la wallet → null
  const txIrrelevante = { accountData: [{ account: W, nativeBalanceChange: -250_000_000 }], tokenTransfers: [] };
  check('tx sin tokens propios → null', (await fns.atribuirTradeParsedAWallet(txIrrelevante, parsedBuy, W)) === null);

  console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK (7 casos)');
  process.exit(fallos ? 1 : 0);
})();
