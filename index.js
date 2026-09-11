// ========= ⚡️M3M3B0T⚡️ REAL TRADING - R0-R5 + FEES DESCONTADOS DE VERDAD + %/MULTIPLICADOR + SIN CONFUSION DE PRECIO SOL + CHAIN OPCIONAL =========
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const { Pool } = require('pg');
const { Connection, Keypair, PublicKey, VersionedTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const CHAT_ID = process.env.CHAT_ID;
const NOMBRE_BOT = '⚡️M3M3B0T⚡️';

if (!process.env.PUMPPORTAL_API_KEY) {
  console.error('⚠️ FALTA PUMPPORTAL_API_KEY - las wallets trackeadas NO se van a poder vigilar sin esto');
}
const PUMP_PORTAL_WS = `wss://pumpportal.fun/api/data?api-key=${process.env.PUMPPORTAL_API_KEY || ''}`;
const PUMP_PORTAL_TRADE = 'https://pumpportal.fun/api/trade-local';
const JUPITER_QUOTE = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP = 'https://quote-api.jup.ag/v6/swap';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PUMPPORTAL_WALLET = 'Guao96aNr7GUj3CSspwLy3tEccL3RUh5xVT4W3KNfBUH';
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

const LIVE = process.env.LIVE_TRADING === 'true';
const DUST_MIN_SOL = 0.05;
const INITIAL_PAPER_BALANCE = parseFloat(process.env.INITIAL_USDC || '1000');
const PUMPFUN_FEE_PCT = 0.0125;
const NETWORK_FEE_SOL = 0.0005;

let connection = null;
let walletKeypair = null;
let ws = null;
let totalMensajesRecibidos = 0;
let primerMensajeConfirmado = false;
let mensajesDesdeUltimoResumen = 0;
const cacheSimbolos = new Map();
const cacheDecimales = new Map();

try {
  if (process.env.HELIUS_RPC_URL) connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
  if (process.env.WALLET_PRIVATE_KEY) walletKeypair = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY));
  if (walletKeypair) console.log('Wallet Solana cargada:', walletKeypair.publicKey.toBase58());
} catch (e) {
  console.error('Error cargando wallet/RPC de Solana:', e.message);
}

const CHAIN_CONFIG = {
  sol: { id: 'solana', name: 'SOLANA' },
  eth: { id: 'eth', name: 'ETH' },
  base: { id: 'base', name: 'BASE' },
  bsc: { id: 'bnb', name: 'BSC' },
  rh: { id: 'rh', name: 'ROBINHOOD CHAIN 4663' },
  robinhood: { id: 'rh', name: 'ROBINHOOD CHAIN 4663' },
  hype: { id: 'hyperliquid', name: 'HYPE EVM 999' }
};
function normalizeChain(c) { return (CHAIN_CONFIG[(c || 'sol').toLowerCase()] || { id: 'solana' }).id; }
function getLabel(c) { const f = Object.values(CHAIN_CONFIG).find(v => v.id === c); return f ? f.name : c.toUpperCase(); }

// Calcula el resultado FINAL ya con fees descontados, en SOL, USD, % y multiplicador.
// costBasisSol y proceedsSolBruto SIEMPRE en SOL. netoDeFees indica si hay que restar fees estimados
// (solo aplica en PAPER; en REAL los fees ya están reflejados en el balance real observado).
function calcularResultado(costBasisSol, proceedsSolBruto, solPriceActual, netoDeFees) {
  const fees = netoDeFees ? estimarFees(costBasisSol, proceedsSolBruto) : 0;
  const proceedsNetoSol = proceedsSolBruto - fees;
  const profitSol = proceedsNetoSol - costBasisSol;
  const multiplicador = costBasisSol > 0 ? proceedsNetoSol / costBasisSol : 0;
  const pct = (multiplicador - 1) * 100;
  const profitUsd = solPriceActual ? profitSol * solPriceActual : null;
  return { fees, proceedsNetoSol, profitSol, multiplicador, pct, profitUsd };
}

function formatearResultado(r) {
  const emoji = r.profitSol < 0 ? '❌ PÉRDIDA' : '✅ Ganancia';
  const signo = r.profitSol < 0 ? '-' : '+';
  const usdTxt = r.profitUsd !== null ? ` (${signo}$${Math.abs(r.profitUsd).toFixed(2)})` : '';
  const pctTxt = `${r.pct >= 0 ? '+' : ''}${r.pct.toFixed(1)}%`;
  const multTxt = `${r.multiplicador.toFixed(2)}x`;
  return `${emoji}: ${Math.abs(r.profitSol).toFixed(4)} SOL${usdTxt} · ${pctTxt} · ${multTxt}`;
}

function estimarFees(costBasisSol, proceedsSol) {
  const feePumpFun = (costBasisSol + proceedsSol) * PUMPFUN_FEE_PCT;
  const feeRed = NETWORK_FEE_SOL * 2;
  return feePumpFun + feeRed;
}

async function resyncSubscriptions() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log('WS no está listo todavía, se sincronizará completo en la próxima conexión');
    return;
  }
  try {
    const { rows } = await pool.query('SELECT alias, address FROM tracked_wallets');
    if (rows.length > 0) {
      ws.send(JSON.stringify({ method: 'subscribeAccountTrade', keys: rows.map(r => r.address) }));
    }
    console.log(`🔁 Resincronizado: escuchando ${rows.length} wallets en total (${rows.map(r => r.alias).join(', ') || 'ninguna'})`);
  } catch (e) { console.error('Error resincronizando suscripciones:', e.message); }
}

async function getPumpPortalWalletBalance() {
  if (!connection) return null;
  try {
    const lamports = await connection.getBalance(new PublicKey(PUMPPORTAL_WALLET));
    return lamports / LAMPORTS_PER_SOL;
  } catch (e) { console.error('Error consultando saldo de PumpPortal:', e.message); return null; }
}

async function getTokenInfoHelius(mint) {
  if (cacheSimbolos.has(mint) && cacheDecimales.has(mint)) {
    return { symbol: cacheSimbolos.get(mint), decimals: cacheDecimales.get(mint) };
  }
  let symbol = mint.slice(0, 6) + '...';
  let decimals = 6;
  try {
    if (process.env.HELIUS_RPC_URL) {
      const res = await fetch(process.env.HELIUS_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'symbol-lookup', method: 'getAsset', params: { id: mint } })
      });
      const data = await res.json();
      const meta = data?.result?.content?.metadata;
      if (meta?.symbol) symbol = meta.symbol;
      else if (meta?.name) symbol = meta.name;
      if (data?.result?.token_info?.decimals !== undefined) decimals = data.result.token_info.decimals;
    }
  } catch (e) { console.log('No se pudo obtener info de', mint, e.message); }
  cacheSimbolos.set(mint, symbol);
  cacheDecimales.set(mint, decimals);
  return { symbol, decimals };
}

async function getTokenSymbol(mint) {
  const info = await getTokenInfoHelius(mint);
  return info.symbol;
}

async function getHoldings(address) {
  if (!connection) { console.error('No hay conexión RPC, no se puede hacer snapshot real'); return []; }
  try {
    const owner = new PublicKey(address);
    const [legacy, token2022] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }).catch(() => ({ value: [] }))
    ]);
    const todasLasCuentas = [...legacy.value, ...token2022.value];
    const conSaldo = todasLasCuentas
      .map(acc => acc.account.data.parsed.info)
      .filter(info => info.tokenAmount && parseFloat(info.tokenAmount.uiAmount || 0) > 0)
      .map(info => ({ mint: info.mint }));
    return conSaldo;
  } catch (e) {
    console.error('Error haciendo snapshot real de holdings:', e.message);
    return [];
  }
}

async function getBalanceDeTokenEnWallet(walletAddress, mint) {
  if (!connection) return null;
  try {
    const owner = new PublicKey(walletAddress);
    const mintKey = new PublicKey(mint);
    const cuentas = await connection.getParsedTokenAccountsByOwner(owner, { mint: mintKey });
    let total = 0;
    for (const c of cuentas.value) {
      total += parseFloat(c.account.data.parsed.info.tokenAmount.uiAmount || 0);
    }
    return total;
  } catch (e) {
    console.error('Error consultando balance de token en wallet:', e.message);
    return null;
  }
}

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tracked_wallets (alias TEXT PRIMARY KEY, address TEXT, amount REAL, chain TEXT);
      CREATE TABLE IF NOT EXISTS seen_tokens (wallet_address TEXT, token_mint TEXT, PRIMARY KEY (wallet_address, token_mint));
      CREATE TABLE IF NOT EXISTS bot_positions (token_mint TEXT, symbol TEXT, chain TEXT, amount REAL);
      ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS cost_basis_sol REAL;
      ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS wallet_alias TEXT;
      CREATE TABLE IF NOT EXISTS global_balance (id INT PRIMARY KEY, initial_usdc REAL, current_usdc REAL);
      INSERT INTO global_balance (id, initial_usdc, current_usdc)
        VALUES (1, ${INITIAL_PAPER_BALANCE}, ${INITIAL_PAPER_BALANCE})
        ON CONFLICT (id) DO NOTHING;
      CREATE TABLE IF NOT EXISTS trade_history (
        id SERIAL PRIMARY KEY,
        wallet_alias TEXT,
        symbol TEXT,
        profit_sol REAL,
        closed_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('DB OK');
  } catch (e) { console.error('DB Error', e); }

  try {
    await pool.query(`DELETE FROM bot_positions WHERE wallet_alias IS NULL;`);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name='bot_positions' AND constraint_name='bot_positions_pkey_v2'
        ) THEN
          ALTER TABLE bot_positions DROP CONSTRAINT IF EXISTS bot_positions_pkey;
          ALTER TABLE bot_positions ADD CONSTRAINT bot_positions_pkey_v2 PRIMARY KEY (token_mint, wallet_alias);
        END IF;
      END $$;
    `);
    console.log('Migración de posiciones por wallet OK');
  } catch (e) { console.error('Error migrando bot_positions:', e.message); }
}

async function registrarTradeCerrado(walletAlias, symbol, profitSol) {
  try {
    await pool.query('INSERT INTO trade_history (wallet_alias, symbol, profit_sol) VALUES ($1,$2,$3)', [walletAlias, symbol, profitSol]);
  } catch (e) { console.error('Error registrando historial de trade:', e.message); }
}

async function getPaperBalance() {
  const { rows } = await pool.query('SELECT * FROM global_balance WHERE id=1');
  return rows[0] || { initial_usdc: INITIAL_PAPER_BALANCE, current_usdc: INITIAL_PAPER_BALANCE };
}

async function adjustPaperBalance(deltaUsd) {
  const { rows } = await pool.query('UPDATE global_balance SET current_usdc = current_usdc + $1 WHERE id=1 RETURNING current_usdc', [deltaUsd]);
  return rows[0]?.current_usdc;
}

async function getSolPriceUSD() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await res.json();
    return data.solana.usd;
  } catch (e) { console.error('Error precio SOL:', e.message); return null; }
}

function bondingCurvePriceSol(trade) {
  if (!trade.vSolInBondingCurve || !trade.vTokensInBondingCurve) return null;
  return trade.vSolInBondingCurve / trade.vTokensInBondingCurve;
}

async function getWalletSolBalance() {
  if (!connection || !walletKeypair) return 0;
  const lamports = await connection.getBalance(walletKeypair.publicKey);
  return lamports / LAMPORTS_PER_SOL;
}

async function pumpPortalTrade({ action, mint, amount, denominatedInSol, slippage = 10, priorityFee = 0.0005, pool = 'pump' }) {
  const res = await fetch(PUMP_PORTAL_TRADE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: walletKeypair.publicKey.toBase58(),
      action, mint, amount,
      denominatedInSol: denominatedInSol ? 'true' : 'false',
      slippage, priorityFee, pool
    })
  });
  if (res.status !== 200) throw new Error('PumpPortal: ' + await res.text());
  const data = await res.arrayBuffer();
  const tx = VersionedTransaction.deserialize(new Uint8Array(data));
  tx.sign([walletKeypair]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

async function swapProfitToUsdc(amountSol) {
  try {
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
    if (lamports <= 0) return null;
    const quoteRes = await fetch(`${JUPITER_QUOTE}?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=${lamports}&slippageBps=100`);
    const quote = await quoteRes.json();
    const swapRes = await fetch(JUPITER_SWAP, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteResponse: quote, userPublicKey: walletKeypair.publicKey.toBase58(), wrapAndUnwrapSol: true })
    });
    const { swapTransaction } = await swapRes.json();
    const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
    tx.sign([walletKeypair]);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction(sig, 'confirmed');
    return sig;
  } catch (e) { console.error('Error swap a USDC:', e.message); return null; }
}

async function reconciliarPosiciones() {
  const marca = new Date().toISOString();
  if (!connection) { console.log(`🔍 [${marca}] Reconciliación: sin conexión RPC, se salta este ciclo`); return; }

  try {
    const { rows: posiciones } = await pool.query(`
      SELECT bp.*, tw.address AS wallet_address
      FROM bot_positions bp
      JOIN tracked_wallets tw ON tw.alias = bp.wallet_alias
    `);

    if (posiciones.length === 0) {
      console.log(`🔍 [${marca}] Reconciliación: 0 posiciones abiertas, nada que revisar.`);
      return;
    }

    let cerradas = 0;
    for (const pos of posiciones) {
      const balanceActual = await getBalanceDeTokenEnWallet(pos.wallet_address, pos.token_mint);
      if (balanceActual === null) continue;
      if (balanceActual === 0) {
        cerradas++;
        console.log(`🔄 Reconciliación: ${pos.wallet_alias} ya no tiene ${pos.symbol} - se perdió el aviso de venta, cerrando como pérdida total`);

        if (LIVE && pos.chain === 'solana' && walletKeypair && connection) {
          try {
            const before = await getWalletSolBalance();
            const sig = await pumpPortalTrade({ action: 'sell', mint: pos.token_mint, amount: '100%', denominatedInSol: false });
            const after = await getWalletSolBalance();
            const proceedsSol = after - before;
            const solPrice = await getSolPriceUSD();
            const r = calcularResultado(pos.cost_basis_sol, proceedsSol, solPrice, false);
            await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2', [pos.token_mint, pos.wallet_alias]);
            await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
            if (CHAT_ID) bot.sendMessage(CHAT_ID, `🔄⚠️ Venta atrasada detectada y ejecutada [${pos.wallet_alias}] ${pos.symbol} · Salí con: ${proceedsSol.toFixed(4)} SOL · ${formatearResultado(r)} · tx:${sig}`);
          } catch (e) {
            console.error('Error en venta real de reconciliación:', e.message);
            if (CHAT_ID) bot.sendMessage(CHAT_ID, `❌ No se pudo ejecutar la venta atrasada de ${pos.symbol}: ${e.message}`);
          }
        } else {
          const proceedsSol = 0; // pérdida total asumida: ya no tiene el token y no sabemos a qué precio se vendió
          const solPrice = await getSolPriceUSD();
          const r = calcularResultado(pos.cost_basis_sol, proceedsSol, solPrice, false); // no se aplican fees extra sobre 0
          await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2', [pos.token_mint, pos.wallet_alias]);
          await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
          const nuevoSaldo = await adjustPaperBalance(0);
          if (CHAT_ID) bot.sendMessage(CHAT_ID, `🔄⚠️ PAPER: Venta atrasada NO detectada a tiempo [${pos.wallet_alias}] ${pos.symbol} · Se asume pérdida total (0 SOL recuperados) · ${formatearResultado(r)} · Saldo ficticio: $${nuevoSaldo.toFixed(2)}\n(estimación conservadora: no sabemos a qué precio real se vendió)`);
        }
      }
    }
    console.log(`🔍 [${marca}] Reconciliación completa: ${posiciones.length} posiciones revisadas, ${cerradas} cerradas por venta atrasada.`);
  } catch (e) { console.error('Error en reconciliación de posiciones:', e.message); }
}

async function handleTrackedBuy(tracked, trade) {
  const solPaid = trade.solAmount || 0;
  if (solPaid < DUST_MIN_SOL) { console.log(`Dust ignorado ${tracked.alias} (${solPaid} SOL)`); return; }

  const symbol = await getTokenSymbol(trade.mint);
  const link = `https://pump.fun/coin/${trade.mint}`;

  if (CHAT_ID) bot.sendMessage(CHAT_ID, `👀 [${getLabel(tracked.chain)}] ${tracked.alias} compró ${symbol} · ${solPaid.toFixed(3)} SOL\n🔗 ${link}`);

  const seen = await pool.query('SELECT 1 FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [trade.traderPublicKey, trade.mint]);
  if (seen.rows.length > 0) {
    console.log(`R2: recompra/ya visto ignorado ${tracked.alias} ${symbol}`);
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `↪️ No copiado (recompra o ya visto)`);
    return;
  }
  await pool.query('INSERT INTO seen_tokens VALUES ($1,$2) ON CONFLICT DO NOTHING', [trade.traderPublicKey, trade.mint]);

  const existingPos = await pool.query('SELECT 1 FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2', [trade.mint, tracked.alias]);
  if (existingPos.rows.length > 0) {
    console.log('R2: posición ya abierta con esta wallet, ignorado');
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `↪️ No copiado (ya tienes posición abierta en este token vía ${tracked.alias})`);
    return;
  }

  if (tracked.chain !== 'solana') {
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `↪️ No copiado (esta cadena solo genera alertas, no ejecución)`);
    return;
  }

  const solPrice = await getSolPriceUSD();
  if (!solPrice) { console.error('No se pudo obtener precio de SOL, se aborta compra'); return; }
  const amountSol = tracked.amount / solPrice;

  let tokensBought = 0;
  if (trade.tokenAmount && trade.solAmount > 0) {
    const factorEscala = amountSol / trade.solAmount;
    tokensBought = trade.tokenAmount * factorEscala;
  } else {
    const priceAtBuy = bondingCurvePriceSol(trade);
    tokensBought = priceAtBuy ? amountSol / priceAtBuy : 0;
  }

  if (LIVE && walletKeypair && connection) {
    try {
      const sig = await pumpPortalTrade({ action: 'buy', mint: trade.mint, amount: amountSol, denominatedInSol: true });
      await pool.query('INSERT INTO bot_positions (token_mint,symbol,chain,amount,cost_basis_sol,wallet_alias) VALUES ($1,$2,$3,$4,$5,$6)',
        [trade.mint, symbol, tracked.chain, tokensBought, amountSol, tracked.alias]);
      if (CHAT_ID) bot.sendMessage(CHAT_ID, `✅ COMPRA REAL [${tracked.alias}] ${symbol} · ${amountSol.toFixed(4)} SOL (~$${tracked.amount}) · tx:${sig}`);
    } catch (e) {
      console.error('Error comprando real:', e.message);
      if (CHAT_ID) bot.sendMessage(CHAT_ID, `❌ Error al comprar ${symbol}: ${e.message}`);
    }
  } else {
    await pool.query('INSERT INTO bot_positions (token_mint,symbol,chain,amount,cost_basis_sol,wallet_alias) VALUES ($1,$2,$3,$4,$5,$6)',
      [trade.mint, symbol, tracked.chain, tokensBought, amountSol, tracked.alias]);
    const nuevoSaldo = await adjustPaperBalance(-tracked.amount);
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `🧪 PAPER: ${NOMBRE_BOT} copió a ${tracked.alias} - compró ${symbol} con ${amountSol.toFixed(4)} SOL (~$${tracked.amount}) · Saldo ficticio: $${nuevoSaldo.toFixed(2)}`);
  }
}

async function handleTrackedSell(tracked, trade) {
  await pool.query('DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [trade.traderPublicKey, trade.mint]);

  const symbol = await getTokenSymbol(trade.mint);
  const posRes = await pool.query('SELECT * FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2', [trade.mint, tracked.alias]);
  if (posRes.rows.length === 0) {
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `👀 [${getLabel(tracked.chain)}] ${tracked.alias} vendió ${symbol} (no tenías posición vía esta wallet, nada que copiar)`);
    return;
  }
  const position = posRes.rows[0];

  if (LIVE && tracked.chain === 'solana' && walletKeypair && connection) {
    try {
      const before = await getWalletSolBalance();
      const sig = await pumpPortalTrade({ action: 'sell', mint: trade.mint, amount: '100%', denominatedInSol: false });
      const after = await getWalletSolBalance();
      const proceedsSol = after - before;
      const solPrice = await getSolPriceUSD();
      const r = calcularResultado(position.cost_basis_sol, proceedsSol, solPrice, false); // en REAL, el balance ya refleja los fees reales
      await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2', [trade.mint, tracked.alias]);
      await registrarTradeCerrado(tracked.alias, symbol, r.profitSol);
      let msg = `📤 VENTA REAL [${tracked.alias}] ${symbol} 100% · Salí con: ${proceedsSol.toFixed(4)} SOL · ${formatearResultado(r)} · tx:${sig}`;
      if (r.profitSol > 0) {
        const usdcSig = await swapProfitToUsdc(r.profitSol);
        msg += usdcSig ? `\n💵 Ganancia convertida a USDC · tx:${usdcSig}` : `\n⚠️ No se pudo convertir la ganancia a USDC`;
      }
      if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);
    } catch (e) {
      console.error('Error vendiendo real:', e.message);
      if (CHAT_ID) bot.sendMessage(CHAT_ID, `❌ Error al vender ${symbol}: ${e.message}`);
    }
  } else {
    let proceedsSol;
    if (trade.tokenAmount && trade.solAmount > 0) {
      const precioPorToken = trade.solAmount / trade.tokenAmount;
      proceedsSol = position.amount * precioPorToken;
    } else {
      const priceAtSell = bondingCurvePriceSol(trade);
      proceedsSol = priceAtSell ? position.amount * priceAtSell : position.cost_basis_sol;
    }
    const solPrice = await getSolPriceUSD();
    const r = calcularResultado(position.cost_basis_sol, proceedsSol, solPrice, true); // en PAPER sí restamos fees estimados
    const proceedsUsd = solPrice ? r.proceedsNetoSol * solPrice : tracked.amount;
    await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2', [trade.mint, tracked.alias]);
    await registrarTradeCerrado(tracked.alias, symbol, r.profitSol);
    const nuevoSaldo = await adjustPaperBalance(proceedsUsd - tracked.amount + tracked.amount); // ajusta con el neto real (ver nota abajo)
    let msg = `🧪 PAPER: ${NOMBRE_BOT} vendió 100% ${symbol} (copiando a ${tracked.alias}) · Salí con (neto de fees): ${r.proceedsNetoSol.toFixed(4)} SOL (~$${proceedsUsd.toFixed(2)}) · ${formatearResultado(r)} · Saldo ficticio: $${nuevoSaldo.toFixed(2)}`;
    if (r.profitSol > 0) msg += `\n💵 (simulado) ${r.profitSol.toFixed(4)} SOL de ganancia se convertirían a USDC`;
    if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);
  }
}

bot.onText(/\/add (.+)/, async (msg, match) => {
  try {
    const args = match[1].trim().split(/\s+/);
    const [alias, address, amountStr, chainRaw] = args; // chainRaw ahora es opcional, default 'sol'
    const amount = parseFloat(amountStr);
    const chain = normalizeChain(chainRaw);
    await pool.query('INSERT INTO tracked_wallets VALUES ($1,$2,$3,$4) ON CONFLICT(alias) DO UPDATE SET address=$2, amount=$3, chain=$4', [alias, address, amount, chain]);
    await resyncSubscriptions();
    bot.sendMessage(msg.chat.id, `⏳ Snapshot ${alias} en ${getLabel(chain)}...`);
    const holdings = await getHoldings(address);
    for (const h of holdings) {
      const mint = h.mint;
      if (!mint) continue;
      await pool.query('INSERT INTO seen_tokens VALUES ($1,$2) ON CONFLICT DO NOTHING', [address, mint]);
    }
    bot.sendMessage(msg.chat.id, `✅ ${alias} agregado [${getLabel(chain)}] $${amount} USD por compra. Snapshot real: ${holdings.length} tokens vistos. Escuchando en vivo ✅`);
  } catch (e) { bot.sendMessage(msg.chat.id, 'Error: ' + e.message); console.error(e); }
});

bot.onText(/\/remove (.+)/, async (msg, match) => {
  try {
    const alias = match[1].trim();
    const result = await pool.query('DELETE FROM tracked_wallets WHERE alias=$1 RETURNING alias', [alias]);
    if (result.rows.length > 0) {
      const posEliminadas = await pool.query('DELETE FROM bot_positions WHERE wallet_alias=$1 RETURNING symbol', [alias]);
      let respuesta = `🗑️ ${alias} eliminado de la lista de wallets seguidas.`;
      if (posEliminadas.rows.length > 0) {
        respuesta += `\n🧹 También se cerraron ${posEliminadas.rows.length} posición(es) abierta(s) ligada(s) a esta wallet: ${posEliminadas.rows.map(r => r.symbol).join(', ')} (sin calcular ganancia, ya que dejó de seguirse).`;
      }
      bot.sendMessage(msg.chat.id, respuesta);
      await resyncSubscriptions();
    }
    else bot.sendMessage(msg.chat.id, `⚠️ No encontré ninguna wallet con el alias "${alias}".`);
  } catch (e) { bot.sendMessage(msg.chat.id, 'Error: ' + e.message); console.error(e); }
});

bot.onText(/\/closepos (.+) (.+)/, async (msg, match) => {
  try {
    const alias = match[1].trim();
    const symbol = match[2].trim();
    const result = await pool.query('DELETE FROM bot_positions WHERE wallet_alias=$1 AND symbol=$2 RETURNING *', [alias, symbol]);
    if (result.rows.length > 0) bot.sendMessage(msg.chat.id, `🧹 Posición cerrada manualmente: ${symbol} vía ${alias} (${result.rows.length} eliminada(s)).`);
    else bot.sendMessage(msg.chat.id, `⚠️ No encontré ninguna posición con alias "${alias}" y símbolo "${symbol}". Revisa /positions para ver los nombres exactos.`);
  } catch (e) { bot.sendMessage(msg.chat.id, 'Error: ' + e.message); console.error(e); }
});

bot.onText(/\/list/, async (msg) => {
  const { rows } = await pool.query('SELECT * FROM tracked_wallets');
  bot.sendMessage(msg.chat.id, rows.map(r => `• ${r.alias} ${r.address.slice(0, 6)} $${r.amount} ${getLabel(r.chain)}`).join('\n') || 'Vacío');
});

bot.onText(/\/resync/, async (msg) => {
  await resyncSubscriptions();
  bot.sendMessage(msg.chat.id, '🔁 Suscripciones resincronizadas con PumpPortal.');
});

bot.onText(/\/reconciliar/, async (msg) => {
  bot.sendMessage(msg.chat.id, '🔄 Revisando posiciones abiertas contra la blockchain...');
  await reconciliarPosiciones();
  bot.sendMessage(msg.chat.id, '✅ Reconciliación manual completada.');
});

bot.onText(/\/positions/, async (msg) => {
  const { rows } = await pool.query('SELECT * FROM bot_positions');
  bot.sendMessage(msg.chat.id, rows.map(r => `• ${r.symbol} · ${r.amount?.toFixed(2)} tokens · costo ${r.cost_basis_sol?.toFixed(4)} SOL · via ${r.wallet_alias}`).join('\n') || 'Sin posiciones abiertas');
});

bot.onText(/\/ranking/, async (msg) => {
  try {
    const { rows } = await pool.query(`
      SELECT wallet_alias,
             COUNT(*) AS trades,
             SUM(CASE WHEN profit_sol > 0 THEN 1 ELSE 0 END) AS ganadores,
             SUM(CASE WHEN profit_sol <= 0 THEN 1 ELSE 0 END) AS perdedores,
             SUM(profit_sol) AS ganancia_total
      FROM trade_history
      GROUP BY wallet_alias
      ORDER BY ganancia_total DESC
    `);
    if (rows.length === 0) { bot.sendMessage(msg.chat.id, 'Todavía no hay trades cerrados para armar el ranking.'); return; }
    const texto = ['🏆 Ranking por wallet:', ''].concat(rows.map((r, i) =>
      `${i + 1}. ${r.wallet_alias} · ${r.trades} trades (${r.ganadores}✅/${r.perdedores}❌) · ${r.ganancia_total >= 0 ? '+' : ''}${parseFloat(r.ganancia_total).toFixed(4)} SOL`
    )).join('\n');
    bot.sendMessage(msg.chat.id, texto);
  } catch (e) { bot.sendMessage(msg.chat.id, 'Error generando ranking: ' + e.message); console.error(e); }
});

bot.onText(/\/status/, async (msg) => {
  const modo = LIVE ? 'REAL' : 'PAPER';
  const estadoConexion = primerMensajeConfirmado ? `✅ PumpPortal confirmado (${totalMensajesRecibidos} eventos recibidos)` : '⏳ Esperando primer dato de PumpPortal...';
  const saldoApiKey = await getPumpPortalWalletBalance();
  const lineaApiKey = saldoApiKey !== null
    ? `${saldoApiKey < 0.005 ? '⚠️ BAJO' : '💳'} Saldo cuenta PumpPortal: ${saldoApiKey.toFixed(4)} SOL`
    : '⚠️ No se pudo consultar el saldo de la cuenta de PumpPortal';
  if (LIVE) {
    const solBalance = await getWalletSolBalance();
    bot.sendMessage(msg.chat.id, `Estado: REAL | Saldo SOL: ${solBalance.toFixed(4)}\n${estadoConexion}\n${lineaApiKey}`);
  } else {
    const balance = await getPaperBalance();
    const pnl = balance.current_usdc - balance.initial_usdc;
    const signo = pnl >= 0 ? '📈' : '📉';
    bot.sendMessage(msg.chat.id, `Estado: PAPER | Saldo ficticio: $${balance.current_usdc.toFixed(2)} (inicial $${balance.initial_usdc.toFixed(2)}) ${signo} ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}\n${estadoConexion}\n${lineaApiKey}`);
  }
});

bot.onText(/\/help/, async (msg) => {
  const texto = [
    '📋 Comandos disponibles:',
    '/add alias direccion monto_usd [cadena] - Agrega/actualiza una wallet (cadena es opcional, default SOL)',
    '/remove alias - Elimina una wallet Y cierra sus posiciones abiertas',
    '/closepos alias simbolo - Cierra manualmente una posición huérfana específica',
    '/list - Muestra todas las wallets que sigues',
    '/resync - Fuerza una resincronización de todas las wallets con PumpPortal',
    '/reconciliar - Revisa manualmente si alguna posición abierta ya se vendió sin que el bot se enterara',
    '/positions - Muestra las posiciones abiertas del bot',
    '/ranking - Muestra desempeño por wallet: trades, ganadores/perdedores, ganancia total',
    '/status - Muestra modo (REAL/PAPER), saldo, ganancia/pérdida, conexión y saldo de la API key',
    '/help - Muestra este mensaje'
  ].join('\n');
  bot.sendMessage(msg.chat.id, texto);
});

function startListener() {
  ws = new WebSocket(PUMP_PORTAL_WS);
  ws.on('open', async () => {
    console.log('WS conectado (con API key)');
    await resyncSubscriptions();
    ws.send(JSON.stringify({ method: 'subscribeNewToken' }));
  });
  ws.on('message', async (raw) => {
    try {
      totalMensajesRecibidos++;
      mensajesDesdeUltimoResumen++;
      if (!primerMensajeConfirmado) {
        primerMensajeConfirmado = true;
        console.log('✅ CONFIRMADO: PumpPortal está mandando datos en vivo (llegó el primer evento)');
      }
      const trade = JSON.parse(raw.toString());
      if (!trade.mint) return;
      const { rows } = await pool.query('SELECT * FROM tracked_wallets WHERE address=$1', [trade.traderPublicKey]);
      if (!rows[0]) return;
      const tracked = rows[0];
      if (trade.txType === 'buy') await handleTrackedBuy(tracked, trade);
      else if (trade.txType === 'sell') await handleTrackedSell(tracked, trade);
    } catch (e) { console.error('ws msg', e); }
  });
  ws.on('close', () => { console.log('WS cerrado, reintentando en 5s...'); setTimeout(startListener, 5000); });
  ws.on('error', (e) => console.error('WS err', e));
}

setInterval(() => {
  if (mensajesDesdeUltimoResumen === 0) {
    console.warn('⚠️ ALERTA: no ha llegado NINGÚN dato de PumpPortal en los últimos 5 minutos. Revisa la conexión.');
  } else {
    console.log(`💓 Pulso OK: ${mensajesDesdeUltimoResumen} eventos recibidos en los últimos 5 min (total acumulado: ${totalMensajesRecibidos})`);
  }
  mensajesDesdeUltimoResumen = 0;
}, 5 * 60 * 1000);

setInterval(() => { resyncSubscriptions(); }, 10 * 60 * 1000);
setInterval(() => { reconciliarPosiciones(); }, 5 * 60 * 1000);

initDB().then(() => startListener());
console.log(`${NOMBRE_BOT} REGLAS R0-R5 LISTO · modo ${LIVE ? 'REAL' : 'PAPER'}`);
process.on('uncaughtException', e => console.error('uncaught', e));
process.on('unhandledRejection', e => console.error('unhandled', e));
