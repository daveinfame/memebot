// ========= ⚡️M3M3B0T⚡️ REAL TRADING - AHORA TAMBIÉN COPIA COMPRAS/VENTAS EN RAYDIUM (via Helius Webhooks) =========
require('dotenv').config();
const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const { Pool } = require('pg');
const { Connection, Keypair, PublicKey, VersionedTransaction, Transaction, TransactionInstruction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
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
const HELIUS_WEBHOOK_URL = process.env.HELIUS_WEBHOOK_URL || 'https://memebot-production-054e.up.railway.app/helius-hook';
const HELIUS_WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET || 'memebot-raydium-secret';

const LIVE = process.env.LIVE_TRADING === 'true';
const MODO_ACTUAL = LIVE ? 'real' : 'paper';
const DUST_MIN_SOL = 0.05;
const INITIAL_PAPER_BALANCE = parseFloat(process.env.INITIAL_USDC || '1000');
const PUMPFUN_FEE_PCT = 0.0125;
const NETWORK_FEE_SOL = 0.0005;
const RENT_CUENTA_NUEVA_SOL = 0.00204;
const OVERHEAD_RED_SOL = NETWORK_FEE_SOL + RENT_CUENTA_NUEVA_SOL;
const CONFIRMACIONES_NECESARIAS = 2;
const ESPERA_LECTURA_SALDO_MS = 1500;

let connection = null;
let walletKeypair = null;
let ws = null;
let totalMensajesRecibidos = 0;
let primerMensajeConfirmado = false;
let mensajesDesdeUltimoResumen = 0;
const cacheSimbolos = new Map();
const cacheDecimales = new Map();

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

try {
  if (process.env.HELIUS_RPC_URL) connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
  if (process.env.WALLET_PRIVATE_KEY) walletKeypair = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY));
  if (walletKeypair) console.log('Wallet Solana cargada:', walletKeypair.publicKey.toBase58());
} catch (e) {
  console.error('Error cargando wallet/RPC de Solana:', e.message);
}

function getHeliusApiKey() {
  try {
    const url = new URL(process.env.HELIUS_RPC_URL);
    return url.searchParams.get('api-key');
  } catch { return null; }
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

function describirErrorOnChain(errValue) {
  try {
    if (errValue && errValue.InstructionError) {
      const [idx, detalle] = errValue.InstructionError;
      if (detalle && typeof detalle === 'object' && 'Custom' in detalle) {
        const codigoDecimal = detalle.Custom;
        const codigoHex = '0x' + codigoDecimal.toString(16);
        return { texto: `Instrucción #${idx} falló con código ${codigoHex} (${codigoDecimal})`, codigoHex };
      }
      return { texto: `Instrucción #${idx} falló: ${JSON.stringify(detalle)}`, codigoHex: null };
    }
    return { texto: JSON.stringify(errValue), codigoHex: null };
  } catch (e) {
    return { texto: String(errValue), codigoHex: null };
  }
}

async function confirmarYVerificarTx(sig) {
  const confirmacion = await connection.confirmTransaction(sig, 'confirmed');
  if (confirmacion.value.err) {
    const info = describirErrorOnChain(confirmacion.value.err);
    throw new Error(`ON_CHAIN_FAIL ${info.codigoHex || ''}: ${info.texto} (tx: ${sig})`);
  }
}

function mensajeAmigableError(e) {
  const msgOriginal = (e && e.message) || '';
  const msg = msgOriginal.toLowerCase();

  if (/0x1786\b/.test(msgOriginal) || msg.includes('sellzeroamount')) {
    return '⚠️ Tu wallet no tiene nada de este token para vender (probablemente una compra anterior nunca se llegó a ejecutar de verdad).';
  }
  if (/0x1775\b/.test(msgOriginal) || msg.includes('bondingcurvecomplete')) {
    return '⚠️ Este token ya no está en la curva de pump.fun (se movió a otro exchange) y no se pudo enrutar automáticamente.';
  }
  if (/0x17af\b/.test(msgOriginal) || msg.includes('unsupportedquotemint')) {
    return '⚠️ Este token usa un pool con una moneda base distinta a SOL — no se pudo operar automáticamente.';
  }
  if (/0x1774\b/.test(msgOriginal) || msg.includes('exceededslippage')) {
    return '⚠️ El precio se movió más de lo permitido (slippage) y la operación no se completó.';
  }
  if (msg.includes('insufficient') || msg.includes('debit an account')) {
    return '⚠️ No había suficiente SOL en la wallet para completar esta operación.';
  }
  if (msg.includes('slippage')) {
    return '⚠️ El precio se movió demasiado rápido (slippage) y la operación no se pudo completar.';
  }
  const codigoMatch = msgOriginal.match(/0x[0-9a-f]{2,6}\b/i);
  const codigo = codigoMatch ? codigoMatch[0] : null;
  return codigo
    ? `⚠️ No se pudo completar la operación (código: ${codigo}). Detalle completo en los logs de Railway.`
    : '⚠️ No se pudo completar la operación. Detalle completo en los logs de Railway.';
}

function esSellZeroAmount(e) {
  const msgOriginal = (e && e.message) || '';
  return /0x1786\b/.test(msgOriginal) || msgOriginal.toLowerCase().includes('sellzeroamount');
}

function linkTx(sig) { return `https://solscan.io/tx/${sig}`; }

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

function usdToSolNeto(usd, solPrice) {
  const solBruto = usd / solPrice;
  const solMenosFeePump = solBruto / (1 + PUMPFUN_FEE_PCT);
  return Math.max(solMenosFeePump - OVERHEAD_RED_SOL, 0);
}

async function cerrarCuentaDelToken(mint) {
  if (!connection || !walletKeypair) return null;
  try {
    const mintKey = new PublicKey(mint);
    const cuentas = await connection.getParsedTokenAccountsByOwner(walletKeypair.publicKey, { mint: mintKey });
    let recuperadoSol = 0;
    for (const c of cuentas.value) {
      const balance = parseFloat(c.account.data.parsed.info.tokenAmount.uiAmount || 0);
      if (balance > 0) continue;
      const antesSol = await getWalletSolBalance();
      const closeIx = new TransactionInstruction({
        programId: c.account.owner,
        keys: [
          { pubkey: c.pubkey, isSigner: false, isWritable: true },
          { pubkey: walletKeypair.publicKey, isSigner: false, isWritable: true },
          { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: false }
        ],
        data: Buffer.from([9])
      });
      const tx = new Transaction().add(closeIx);
      tx.feePayer = walletKeypair.publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.sign(walletKeypair);
      const sig = await connection.sendRawTransaction(tx.serialize());
      await confirmarYVerificarTx(sig);
      await sleep(ESPERA_LECTURA_SALDO_MS);
      const despuesSol = await getWalletSolBalance();
      recuperadoSol += Math.max(despuesSol - antesSol, 0);
      console.log(`♻️ Cuenta de token cerrada (${mint.slice(0, 6)}...), recuperado: ${(despuesSol - antesSol).toFixed(5)} SOL`);
    }
    return recuperadoSol > 0 ? recuperadoSol : null;
  } catch (e) {
    console.log('No se pudo cerrar la cuenta del token (no crítico):', e.message);
    return null;
  }
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
    console.log(`🔁 [${new Date().toISOString()}] Resincronizado (PumpPortal): escuchando ${rows.length} wallets (${rows.map(r => r.alias).join(', ') || 'ninguna'})`);
  } catch (e) { console.error('Error resincronizando suscripciones:', e.message); }
}

// ===== NUEVO: registra/actualiza el webhook de Helius para detectar swaps en RAYDIUM =====
async function crearOActualizarWebhookHelius() {
  const apiKey = getHeliusApiKey();
  if (!apiKey) { console.error('⚠️ No se pudo extraer el api-key de HELIUS_RPC_URL — el webhook de Raydium no se puede configurar'); return; }
  try {
    const { rows: walletRows } = await pool.query('SELECT address FROM tracked_wallets');
    const direcciones = walletRows.map(r => r.address);
    const { rows } = await pool.query('SELECT helius_webhook_id FROM global_balance WHERE id=1');
    const webhookIdExistente = rows[0]?.helius_webhook_id;

    const payload = {
      webhookURL: HELIUS_WEBHOOK_URL,
      transactionTypes: ['SWAP'],
      accountAddresses: direcciones,
      webhookType: 'enhanced',
      authHeader: HELIUS_WEBHOOK_SECRET
    };

    if (webhookIdExistente) {
      const res = await fetch(`https://api.helius.xyz/v0/webhooks/${webhookIdExistente}?api-key=${apiKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) { console.error('Error actualizando webhook de Helius:', await res.text()); return; }
      console.log(`🌊 Webhook de Raydium (Helius) actualizado: ${direcciones.length} wallets`);
    } else {
      const res = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) { console.error('Error creando webhook de Helius:', await res.text()); return; }
      const data = await res.json();
      await pool.query('UPDATE global_balance SET helius_webhook_id=$1 WHERE id=1', [data.webhookID]);
      console.log(`🌊 Webhook de Raydium (Helius) creado: ${direcciones.length} wallets, id=${data.webhookID}`);
    }
  } catch (e) { console.error('Error configurando webhook de Helius:', e.message); }
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
      ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS ceros_seguidos INT DEFAULT 0;
      ALTER TABLE bot_positions ADD COLUMN IF NOT EXISTS modo TEXT DEFAULT 'paper';
      CREATE TABLE IF NOT EXISTS global_balance (id INT PRIMARY KEY, initial_usdc REAL, current_usdc REAL);
      ALTER TABLE global_balance ADD COLUMN IF NOT EXISTS real_initial_sol REAL;
      ALTER TABLE global_balance ADD COLUMN IF NOT EXISTS helius_webhook_id TEXT;
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
      ALTER TABLE trade_history ADD COLUMN IF NOT EXISTS modo TEXT DEFAULT 'paper';
    `);
    console.log('DB OK');
  } catch (e) { console.error('DB Error', e); }

  try {
    await pool.query(`DELETE FROM bot_positions WHERE wallet_alias IS NULL;`);
    await pool.query(`UPDATE bot_positions SET modo='paper' WHERE modo IS NULL;`);
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
    console.log(`Migración de posiciones OK — modo actual: ${MODO_ACTUAL.toUpperCase()}`);
  } catch (e) { console.error('Error migrando bot_positions:', e.message); }
}

async function initBaselineReal() {
  if (!LIVE || !connection || !walletKeypair) return;
  try {
    const { rows } = await pool.query('SELECT real_initial_sol FROM global_balance WHERE id=1');
    if (!rows[0] || rows[0].real_initial_sol === null) {
      const saldoInicial = await getWalletSolBalance();
      await pool.query('UPDATE global_balance SET real_initial_sol=$1 WHERE id=1', [saldoInicial]);
      console.log(`📌 Baseline REAL establecido: ${saldoInicial.toFixed(4)} SOL`);
    }
  } catch (e) { console.error('Error estableciendo baseline real:', e.message); }
}

async function registrarTradeCerrado(walletAlias, symbol, profitSol) {
  try {
    await pool.query('INSERT INTO trade_history (wallet_alias, symbol, profit_sol, modo) VALUES ($1,$2,$3,$4)', [walletAlias, symbol, profitSol, MODO_ACTUAL]);
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

async function pumpPortalTrade({ action, mint, amount, denominatedInSol, slippage = 10, priorityFee = 0.0005, pool = 'auto' }) {
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
  await confirmarYVerificarTx(sig);
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
    await confirmarYVerificarTx(sig);
    return sig;
  } catch (e) { console.error('Error swap a USDC:', e.message); return null; }
}

async function reconciliarPosiciones(forzado = false) {
  const marca = new Date().toISOString();
  if (!connection) { console.log(`🔍 [${marca}] Reconciliación: sin conexión RPC, se salta este ciclo`); return; }

  try {
    const { rows: posiciones } = await pool.query(`
      SELECT bp.*, tw.address AS wallet_address
      FROM bot_positions bp
      JOIN tracked_wallets tw ON tw.alias = bp.wallet_alias
      WHERE bp.modo = $1
    `, [MODO_ACTUAL]);

    if (posiciones.length === 0) {
      console.log(`🔍 [${marca}] Reconciliación${forzado ? ' (manual)' : ''}: 0 posiciones abiertas en modo ${MODO_ACTUAL.toUpperCase()}, nada que revisar.`);
      return;
    }

    let cerradas = 0;
    for (const pos of posiciones) {
      const balanceActual = await getBalanceDeTokenEnWallet(pos.wallet_address, pos.token_mint);
      if (balanceActual === null) continue;

      if (balanceActual > 0) {
        if (pos.ceros_seguidos > 0) {
          await pool.query('UPDATE bot_positions SET ceros_seguidos=0 WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]);
        }
        continue;
      }

      if (!forzado) {
        const nuevosCeros = (pos.ceros_seguidos || 0) + 1;
        if (nuevosCeros < CONFIRMACIONES_NECESARIAS) {
          await pool.query('UPDATE bot_positions SET ceros_seguidos=$1 WHERE token_mint=$2 AND wallet_alias=$3 AND modo=$4', [nuevosCeros, pos.token_mint, pos.wallet_alias, MODO_ACTUAL]);
          console.log(`🔍 ${pos.wallet_alias} ${pos.symbol}: balance en 0 (confirmación ${nuevosCeros}/${CONFIRMACIONES_NECESARIAS}), esperando siguiente ciclo antes de cerrar`);
          continue;
        }
      } else {
        console.log(`🔍 ${pos.wallet_alias} ${pos.symbol}: balance en 0, cerrando de inmediato (reconciliación manual forzada)`);
      }

      cerradas++;
      console.log(`🔄 Reconciliación [${MODO_ACTUAL.toUpperCase()}]: ${pos.wallet_alias} ya no tiene ${pos.symbol} - cerrando posición`);

      if (LIVE && pos.chain === 'solana' && walletKeypair && connection) {
        try {
          const before = await getWalletSolBalance();
          const sig = await pumpPortalTrade({ action: 'sell', mint: pos.token_mint, amount: '100%', denominatedInSol: false });
          await sleep(ESPERA_LECTURA_SALDO_MS);
          const after = await getWalletSolBalance();
          const proceedsSol = after - before;
          const solPrice = await getSolPriceUSD();
          const r = calcularResultado(pos.cost_basis_sol, proceedsSol, solPrice, false);
          await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]);
          await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
          let msg = `🔄⚠️ Venta atrasada detectada y ejecutada [${pos.wallet_alias}] ${pos.symbol} · Salí con: ${proceedsSol.toFixed(4)} SOL · ${formatearResultado(r)} · tx: ${linkTx(sig)}`;
          if (r.profitSol > 0) {
            const usdcSig = await swapProfitToUsdc(r.profitSol);
            msg += usdcSig ? `\n💵 Ganancia convertida a USDC · tx: ${linkTx(usdcSig)}` : `\n⚠️ No se pudo convertir la ganancia a USDC`;
          }
          const rentRecuperado = await cerrarCuentaDelToken(pos.token_mint);
          if (rentRecuperado) msg += `\n♻️ Cuenta cerrada, recuperado: ${rentRecuperado.toFixed(5)} SOL de rent`;
          const saldoFinal = await getWalletSolBalance();
          msg += `\n💰 Saldo total: ${saldoFinal.toFixed(4)} SOL`;
          if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);
        } catch (e) {
          console.error('Error en venta real de reconciliación:', e.message);
          if (esSellZeroAmount(e)) {
            await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]);
            if (CHAT_ID) bot.sendMessage(CHAT_ID, `🧹 [${pos.wallet_alias}] ${pos.symbol}: posición fantasma eliminada — la compra original nunca se ejecutó de verdad. No se cuenta como pérdida.`);
          } else {
            if (CHAT_ID) bot.sendMessage(CHAT_ID, `⚠️🔄 [${pos.wallet_alias}] ${pos.symbol}: ${mensajeAmigableError(e)} Se reintentará en el próximo ciclo, la posición sigue abierta.`);
          }
        }
      } else {
        const proceedsSol = 0;
        const solPrice = await getSolPriceUSD();
        const r = calcularResultado(pos.cost_basis_sol, proceedsSol, solPrice, false);
        await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [pos.token_mint, pos.wallet_alias, MODO_ACTUAL]);
        await registrarTradeCerrado(pos.wallet_alias, pos.symbol, r.profitSol);
        const nuevoSaldo = await adjustPaperBalance(0);
        if (CHAT_ID) bot.sendMessage(CHAT_ID, `🔄⚠️ PAPER: Venta atrasada NO detectada a tiempo [${pos.wallet_alias}] ${pos.symbol} · Se asume pérdida total · ${formatearResultado(r)} · Saldo ficticio: $${nuevoSaldo.toFixed(2)}`);
      }
    }
    console.log(`🔍 [${marca}] Reconciliación completa [${MODO_ACTUAL.toUpperCase()}]${forzado ? ' (manual)' : ''}: ${posiciones.length} posiciones revisadas, ${cerradas} cerradas por venta atrasada.`);
  } catch (e) { console.error('Error en reconciliación de posiciones:', e.message); }
}

// origen: 'PumpPortal' o 'Raydium' — solo para que el mensaje de Telegram diga de dónde vino la señal
async function handleTrackedBuy(tracked, trade, origen = 'PumpPortal') {
  const solPaid = trade.solAmount || 0;
  if (solPaid < DUST_MIN_SOL) { console.log(`Dust ignorado ${tracked.alias} (${solPaid} SOL) [${origen}]`); return; }

  const symbol = await getTokenSymbol(trade.mint);
  const link = `https://pump.fun/coin/${trade.mint}`;
  const etiquetaOrigen = origen === 'Raydium' ? ' 🌊' : '';

  if (CHAT_ID) bot.sendMessage(CHAT_ID, `👀 [${getLabel(tracked.chain)}${etiquetaOrigen}] ${tracked.alias} compró ${symbol} · ${solPaid.toFixed(3)} SOL\n🔗 ${link}`);

  const seen = await pool.query('SELECT 1 FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [trade.traderPublicKey, trade.mint]);
  if (seen.rows.length > 0) {
    console.log(`R2: recompra/ya visto ignorado ${tracked.alias} ${symbol}`);
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `↪️ No copiado (recompra o ya visto)`);
    return;
  }
  await pool.query('INSERT INTO seen_tokens VALUES ($1,$2) ON CONFLICT DO NOTHING', [trade.traderPublicKey, trade.mint]);

  const existingPos = await pool.query('SELECT 1 FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [trade.mint, tracked.alias, MODO_ACTUAL]);
  if (existingPos.rows.length > 0) {
    console.log('R2: posición ya abierta con esta wallet en modo actual, ignorado');
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `↪️ No copiado (ya tienes posición abierta en este token vía ${tracked.alias})`);
    return;
  }

  if (tracked.chain !== 'solana') {
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `↪️ No copiado (esta cadena solo genera alertas, no ejecución)`);
    return;
  }

  const solPrice = await getSolPriceUSD();
  if (!solPrice) { console.error('No se pudo obtener precio de SOL, se aborta compra'); return; }

  const amountSol = usdToSolNeto(tracked.amount, solPrice);

  let tokensBought = 0;
  if (trade.tokenAmount && trade.solAmount > 0) {
    const factorEscala = amountSol / trade.solAmount;
    tokensBought = trade.tokenAmount * factorEscala;
  } else {
    const priceAtBuy = bondingCurvePriceSol(trade);
    tokensBought = priceAtBuy ? amountSol / priceAtBuy : 0;
  }

  if (LIVE && walletKeypair && connection) {
    const saldoActual = await getWalletSolBalance();
    const totalNecesario = amountSol + OVERHEAD_RED_SOL;
    if (saldoActual < totalNecesario) {
      console.log(`Fondos insuficientes para copiar a ${tracked.alias}: saldo ${saldoActual.toFixed(4)} SOL, se necesitan ${totalNecesario.toFixed(4)} SOL`);
      if (CHAT_ID) bot.sendMessage(CHAT_ID, `⚠️ No copiado (${tracked.alias} → ${symbol}): saldo insuficiente. Tienes ${saldoActual.toFixed(4)} SOL, se necesitan ${totalNecesario.toFixed(4)} SOL (fee + red incluidos).`);
      return;
    }
    try {
      const sig = await pumpPortalTrade({ action: 'buy', mint: trade.mint, amount: amountSol, denominatedInSol: true });
      await pool.query('INSERT INTO bot_positions (token_mint,symbol,chain,amount,cost_basis_sol,wallet_alias,modo) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [trade.mint, symbol, tracked.chain, tokensBought, amountSol, tracked.alias, MODO_ACTUAL]);
      const saldoFinal = await getWalletSolBalance();
      if (CHAT_ID) bot.sendMessage(CHAT_ID, `✅ COMPRA REAL [${tracked.alias}] ${symbol} · ${amountSol.toFixed(4)} SOL (~$${tracked.amount} todo incluido) · tx: ${linkTx(sig)}\n💰 Saldo total: ${saldoFinal.toFixed(4)} SOL`);
    } catch (e) {
      console.error('Error comprando real:', e.message);
      if (CHAT_ID) bot.sendMessage(CHAT_ID, `❌ No copiado (${tracked.alias} → ${symbol}): ${mensajeAmigableError(e)}`);
    }
  } else {
    await pool.query('INSERT INTO bot_positions (token_mint,symbol,chain,amount,cost_basis_sol,wallet_alias,modo) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [trade.mint, symbol, tracked.chain, tokensBought, amountSol, tracked.alias, MODO_ACTUAL]);
    const nuevoSaldo = await adjustPaperBalance(-tracked.amount);
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `🧪 PAPER: ${NOMBRE_BOT} copió a ${tracked.alias} - compró ${symbol} con ${amountSol.toFixed(4)} SOL (~$${tracked.amount} todo incluido) · Saldo ficticio: $${nuevoSaldo.toFixed(2)}`);
  }
}

async function handleTrackedSell(tracked, trade, origen = 'PumpPortal') {
  await pool.query('DELETE FROM seen_tokens WHERE wallet_address=$1 AND token_mint=$2', [trade.traderPublicKey, trade.mint]);

  const symbol = await getTokenSymbol(trade.mint);
  const etiquetaOrigen = origen === 'Raydium' ? ' 🌊' : '';
  const posRes = await pool.query('SELECT * FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [trade.mint, tracked.alias, MODO_ACTUAL]);
  if (posRes.rows.length === 0) {
    if (CHAT_ID) bot.sendMessage(CHAT_ID, `👀 [${getLabel(tracked.chain)}${etiquetaOrigen}] ${tracked.alias} vendió ${symbol} (no tenías posición vía esta wallet, nada que copiar)`);
    return;
  }
  const position = posRes.rows[0];

  if (LIVE && tracked.chain === 'solana' && walletKeypair && connection) {
    try {
      const before = await getWalletSolBalance();
      const sig = await pumpPortalTrade({ action: 'sell', mint: trade.mint, amount: '100%', denominatedInSol: false });
      await sleep(ESPERA_LECTURA_SALDO_MS);
      const after = await getWalletSolBalance();
      const proceedsSol = after - before;
      const solPrice = await getSolPriceUSD();
      const r = calcularResultado(position.cost_basis_sol, proceedsSol, solPrice, false);
      await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [trade.mint, tracked.alias, MODO_ACTUAL]);
      await registrarTradeCerrado(tracked.alias, symbol, r.profitSol);
      let msg = `📤 VENTA REAL [${tracked.alias}] ${symbol} 100% · Salí con: ${proceedsSol.toFixed(4)} SOL · ${formatearResultado(r)} · tx: ${linkTx(sig)}`;
      if (r.profitSol > 0) {
        const usdcSig = await swapProfitToUsdc(r.profitSol);
        msg += usdcSig ? `\n💵 Ganancia convertida a USDC · tx: ${linkTx(usdcSig)}` : `\n⚠️ No se pudo convertir la ganancia a USDC`;
      }
      const rentRecuperado = await cerrarCuentaDelToken(trade.mint);
      if (rentRecuperado) msg += `\n♻️ Cuenta cerrada, recuperado: ${rentRecuperado.toFixed(5)} SOL de rent`;
      const saldoFinal = await getWalletSolBalance();
      msg += `\n💰 Saldo total: ${saldoFinal.toFixed(4)} SOL`;
      if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);
    } catch (e) {
      console.error('Error vendiendo real:', e.message);
      if (esSellZeroAmount(e)) {
        await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [trade.mint, tracked.alias, MODO_ACTUAL]);
        if (CHAT_ID) bot.sendMessage(CHAT_ID, `🧹 [${tracked.alias}] ${symbol}: posición fantasma eliminada — la compra original nunca se ejecutó de verdad. No se cuenta como pérdida.`);
      } else {
        if (CHAT_ID) bot.sendMessage(CHAT_ID, `❌ Error al vender ${symbol}: ${mensajeAmigableError(e)}\n(la posición sigue abierta, se reintentará con la próxima reconciliación)`);
      }
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
    const r = calcularResultado(position.cost_basis_sol, proceedsSol, solPrice, true);
    const proceedsUsd = solPrice ? r.proceedsNetoSol * solPrice : tracked.amount;
    await pool.query('DELETE FROM bot_positions WHERE token_mint=$1 AND wallet_alias=$2 AND modo=$3', [trade.mint, tracked.alias, MODO_ACTUAL]);
    await registrarTradeCerrado(tracked.alias, symbol, r.profitSol);
    const nuevoSaldo = await adjustPaperBalance(proceedsUsd);
    let msg = `🧪 PAPER: ${NOMBRE_BOT} vendió 100% ${symbol} (copiando a ${tracked.alias}) · Salí con (neto de fees): ${r.proceedsNetoSol.toFixed(4)} SOL (~$${proceedsUsd.toFixed(2)}) · ${formatearResultado(r)} · Saldo ficticio: $${nuevoSaldo.toFixed(2)}`;
    if (r.profitSol > 0) msg += `\n💵 (simulado) ${r.profitSol.toFixed(4)} SOL de ganancia se convertirían a USDC`;
    if (CHAT_ID) bot.sendMessage(CHAT_ID, msg);
  }
}

// ===== NUEVO: extrae los datos de un swap de Raydium desde el evento "enhanced" de Helius =====
function extraerSwapDeHelius(tx, walletAddress) {
  try {
    let tokenMint = null, tokenAmount = 0, direction = null;
    for (const t of (tx.tokenTransfers || [])) {
      if (t.mint === SOL_MINT) continue;
      if (t.toUserAccount === walletAddress) { tokenMint = t.mint; tokenAmount = t.tokenAmount; direction = 'buy'; }
      else if (t.fromUserAccount === walletAddress) { tokenMint = t.mint; tokenAmount = t.tokenAmount; direction = 'sell'; }
    }
    if (!tokenMint) return null;

    let solAmount = 0;
    for (const n of (tx.nativeTransfers || [])) {
      if (n.fromUserAccount === walletAddress || n.toUserAccount === walletAddress) solAmount += n.amount / LAMPORTS_PER_SOL;
    }
    if (solAmount === 0) {
      for (const t of (tx.tokenTransfers || [])) {
        if (t.mint === SOL_MINT && (t.fromUserAccount === walletAddress || t.toUserAccount === walletAddress)) {
          solAmount += t.tokenAmount;
        }
      }
    }
    solAmount = Math.abs(solAmount);
    if (solAmount <= 0) return null;
    return { mint: tokenMint, tokenAmount, solAmount, direction };
  } catch (e) { console.error('Error extrayendo swap de Helius:', e.message); return null; }
}

// ===== NUEVO: servidor web que recibe los avisos de Helius sobre swaps en Raydium =====
function iniciarServidorWebhook() {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok'); // respondemos rápido, procesamos después
      procesarWebhookHelius(body).catch(e => console.error('Error procesando webhook de Helius:', e.message));
    });
  });
  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log(`🌐 Servidor de webhooks (Raydium/Helius) escuchando en el puerto ${port}`));
}

async function procesarWebhookHelius(rawBody) {
  const eventos = JSON.parse(rawBody);
  for (const tx of eventos) {
    if (tx.type !== 'SWAP' || (tx.source || '').toUpperCase() !== 'RAYDIUM') continue;
    const walletAddress = tx.feePayer;
    const { rows } = await pool.query('SELECT * FROM tracked_wallets WHERE address=$1', [walletAddress]);
    if (!rows[0]) continue;
    const tracked = rows[0];
    const swap = extraerSwapDeHelius(tx, walletAddress);
    if (!swap) { console.log('🌊 Swap de Raydium detectado pero no se pudo interpretar (revisar formato)'); continue; }
    console.log(`🌊 RAYDIUM detectado: ${tracked.alias} ${swap.direction} ${swap.mint.slice(0, 6)}... · ${swap.solAmount.toFixed(4)} SOL`);
    const tradeCompatible = {
      mint: swap.mint,
      solAmount: swap.solAmount,
      tokenAmount: swap.tokenAmount,
      traderPublicKey: walletAddress,
      txType: swap.direction
    };
    if (swap.direction === 'buy') await handleTrackedBuy(tracked, tradeCompatible, 'Raydium');
    else await handleTrackedSell(tracked, tradeCompatible, 'Raydium');
  }
}

bot.onText(/\/add (.+)/, async (msg, match) => {
  try {
    const args = match[1].trim().split(/\s+/);
    const [alias, address, amountStr, chainRaw] = args;
    const amount = parseFloat(amountStr);
    const chain = normalizeChain(chainRaw);
    await pool.query('INSERT INTO tracked_wallets VALUES ($1,$2,$3,$4) ON CONFLICT(alias) DO UPDATE SET address=$2, amount=$3, chain=$4', [alias, address, amount, chain]);
    await resyncSubscriptions();
    await crearOActualizarWebhookHelius();
    bot.sendMessage(msg.chat.id, `⏳ Snapshot ${alias} en ${getLabel(chain)}...`);
    const holdings = await getHoldings(address);
    for (const h of holdings) {
      const mint = h.mint;
      if (!mint) continue;
      await pool.query('INSERT INTO seen_tokens VALUES ($1,$2) ON CONFLICT DO NOTHING', [address, mint]);
    }
    bot.sendMessage(msg.chat.id, `✅ ${alias} agregado [${getLabel(chain)}] $${amount} USD por compra (fees y red incluidos). Snapshot real: ${holdings.length} tokens vistos. Escuchando pump.fun ✅ y Raydium ✅`);
  } catch (e) { bot.sendMessage(msg.chat.id, 'Error: ' + e.message); console.error(e); }
});

bot.onText(/\/setamount (\S+) (\S+)/, async (msg, match) => {
  try {
    const alias = match[1];
    const nuevoMonto = parseFloat(match[2]);
    if (isNaN(nuevoMonto) || nuevoMonto <= 0) {
      bot.sendMessage(msg.chat.id, '⚠️ Monto inválido. Usa: /setamount alias nuevo_monto (ej. /setamount CAP 6)');
      return;
    }
    const result = await pool.query('UPDATE tracked_wallets SET amount=$1 WHERE alias=$2 RETURNING alias, amount', [nuevoMonto, alias]);
    if (result.rows.length > 0) bot.sendMessage(msg.chat.id, `✅ ${alias} ahora usa $${nuevoMonto} USD por compra (efectivo desde la próxima señal).`);
    else bot.sendMessage(msg.chat.id, `⚠️ No encontré ninguna wallet con el alias "${alias}".`);
  } catch (e) { bot.sendMessage(msg.chat.id, 'Error: ' + e.message); console.error(e); }
});

bot.onText(/\/remove (.+)/, async (msg, match) => {
  try {
    const alias = match[1].trim();
    const result = await pool.query('DELETE FROM tracked_wallets WHERE alias=$1 RETURNING alias', [alias]);
    if (result.rows.length > 0) {
      const posEliminadas = await pool.query('DELETE FROM bot_positions WHERE wallet_alias=$1 AND modo=$2 RETURNING symbol', [alias, MODO_ACTUAL]);
      let respuesta = `🗑️ ${alias} eliminado de la lista de wallets seguidas.`;
      if (posEliminadas.rows.length > 0) {
        respuesta += `\n🧹 También se cerraron ${posEliminadas.rows.length} posición(es) del modo actual: ${posEliminadas.rows.map(r => r.symbol).join(', ')}.`;
      }
      bot.sendMessage(msg.chat.id, respuesta);
      await resyncSubscriptions();
      await crearOActualizarWebhookHelius();
    }
    else bot.sendMessage(msg.chat.id, `⚠️ No encontré ninguna wallet con el alias "${alias}".`);
  } catch (e) { bot.sendMessage(msg.chat.id, 'Error: ' + e.message); console.error(e); }
});

bot.onText(/\/closepos (.+) (.+)/, async (msg, match) => {
  try {
    const alias = match[1].trim();
    const symbol = match[2].trim();
    const result = await pool.query('DELETE FROM bot_positions WHERE wallet_alias=$1 AND symbol=$2 AND modo=$3 RETURNING *', [alias, symbol, MODO_ACTUAL]);
    if (result.rows.length > 0) bot.sendMessage(msg.chat.id, `🧹 Posición cerrada manualmente: ${symbol} vía ${alias}.`);
    else bot.sendMessage(msg.chat.id, `⚠️ No encontré ninguna posición con alias "${alias}" y símbolo "${symbol}" en modo ${MODO_ACTUAL.toUpperCase()}. Revisa /positions.`);
  } catch (e) { bot.sendMessage(msg.chat.id, 'Error: ' + e.message); console.error(e); }
});

bot.onText(/\/list/, async (msg) => {
  const { rows } = await pool.query('SELECT * FROM tracked_wallets');
  bot.sendMessage(msg.chat.id, rows.map(r => `• ${r.alias} ${r.address.slice(0, 6)} $${r.amount} ${getLabel(r.chain)}`).join('\n') || 'Vacío');
});

bot.onText(/\/resync/, async (msg) => {
  await resyncSubscriptions();
  await crearOActualizarWebhookHelius();
  bot.sendMessage(msg.chat.id, '🔁 Suscripciones resincronizadas (PumpPortal + Raydium/Helius).');
});

bot.onText(/\/reconciliar/, async (msg) => {
  bot.sendMessage(msg.chat.id, '🔄 Revisando posiciones abiertas contra la blockchain (modo manual)...');
  await reconciliarPosiciones(true);
  bot.sendMessage(msg.chat.id, '✅ Reconciliación manual completada.');
});

bot.onText(/\/positions/, async (msg) => {
  const { rows } = await pool.query('SELECT * FROM bot_positions WHERE modo=$1', [MODO_ACTUAL]);
  const header = `📋 Posiciones abiertas [${MODO_ACTUAL.toUpperCase()}]:`;
  const lista = rows.map(r => `• ${r.symbol} · ${r.amount?.toFixed(2)} tokens · costo ${r.cost_basis_sol?.toFixed(4)} SOL · via ${r.wallet_alias}${r.ceros_seguidos > 0 ? ` ⚠️ (${r.ceros_seguidos}/${CONFIRMACIONES_NECESARIAS} confirmaciones de venta)` : ''}`).join('\n');
  bot.sendMessage(msg.chat.id, lista ? `${header}\n${lista}` : `${header}\nSin posiciones abiertas.`);
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
      WHERE modo = $1
      GROUP BY wallet_alias
      ORDER BY ganancia_total DESC
    `, [MODO_ACTUAL]);
    const header = `🏆 Ranking por wallet [${MODO_ACTUAL.toUpperCase()}]:`;
    if (rows.length === 0) { bot.sendMessage(msg.chat.id, `${header}\nTodavía no hay trades cerrados en este modo.`); return; }
    const texto = [header, ''].concat(rows.map((r, i) =>
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
  let lineaRaydium = '⏳ Webhook de Raydium aún no configurado';
  try {
    const { rows } = await pool.query('SELECT helius_webhook_id FROM global_balance WHERE id=1');
    if (rows[0]?.helius_webhook_id) lineaRaydium = `🌊 Raydium activo (webhook id: ${rows[0].helius_webhook_id.slice(0, 8)}...)`;
  } catch (e) { /* no crítico */ }
  if (LIVE) {
    const solBalance = await getWalletSolBalance();
    let lineaBaseline = '';
    try {
      const { rows } = await pool.query('SELECT real_initial_sol FROM global_balance WHERE id=1');
      const inicialSol = rows[0]?.real_initial_sol;
      if (inicialSol !== null && inicialSol !== undefined) {
        const delta = solBalance - inicialSol;
        const pct = inicialSol > 0 ? (delta / inicialSol) * 100 : 0;
        lineaBaseline = `\n${delta >= 0 ? '📈' : '📉'} Desde que empezaste: ${delta >= 0 ? '+' : ''}${delta.toFixed(4)} SOL (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%) · inicial: ${inicialSol.toFixed(4)} SOL`;
      }
    } catch (e) { console.error('Error leyendo baseline real:', e.message); }
    bot.sendMessage(msg.chat.id, `Estado: REAL | Saldo SOL: ${solBalance.toFixed(4)}${lineaBaseline}\n${estadoConexion}\n${lineaApiKey}\n${lineaRaydium}`);
  } else {
    const balance = await getPaperBalance();
    const pnl = balance.current_usdc - balance.initial_usdc;
    const signo = pnl >= 0 ? '📈' : '📉';
    bot.sendMessage(msg.chat.id, `Estado: PAPER | Saldo ficticio: $${balance.current_usdc.toFixed(2)} (inicial $${balance.initial_usdc.toFixed(2)}) ${signo} ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}\n${estadoConexion}\n${lineaApiKey}\n${lineaRaydium}`);
  }
});

bot.onText(/\/help/, async (msg) => {
  const texto = [
    '📋 Comandos disponibles:',
    '/add alias direccion monto_usd [cadena] - Agrega/actualiza una wallet (cadena es opcional, default SOL)',
    '/setamount alias nuevo_monto - Cambia solo el monto ($) de una wallet ya agregada',
    '/remove alias - Elimina una wallet Y cierra sus posiciones del modo actual',
    '/closepos alias simbolo - Cierra manualmente una posición específica del modo actual',
    '/list - Muestra todas las wallets que sigues',
    '/resync - Fuerza una resincronización de todas las wallets (PumpPortal + Raydium)',
    '/reconciliar - Revisa AHORA MISMO si alguna posición ya se vendió sin avisar',
    '/positions - Muestra las posiciones abiertas del modo actual (REAL o PAPER)',
    '/ranking - Muestra desempeño por wallet del modo actual (REAL o PAPER, separados)',
    '/status - Muestra modo, saldo, ganancia/pérdida desde el inicio, y estado de PumpPortal + Raydium',
    '/help - Muestra este mensaje'
  ].join('\n');
  bot.sendMessage(msg.chat.id, texto);
});

function startListener() {
  ws = new WebSocket(PUMP_PORTAL_WS);
  ws.on('open', async () => {
    console.log(`WS conectado (con API key) — modo ${MODO_ACTUAL.toUpperCase()}`);
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

      if (trade.txType === 'sell') {
        const { rows: posiblesTracked } = await pool.query('SELECT alias FROM tracked_wallets WHERE address=$1', [trade.traderPublicKey]);
        if (posiblesTracked[0]) {
          console.log(`🔬 SELL_EVENT recibido: wallet=${posiblesTracked[0].alias} mint=${trade.mint} solAmount=${trade.solAmount} hora=${new Date().toISOString()}`);
        }
      }

      const { rows } = await pool.query('SELECT * FROM tracked_wallets WHERE address=$1', [trade.traderPublicKey]);
      if (!rows[0]) return;
      const tracked = rows[0];
      if (trade.txType === 'buy') await handleTrackedBuy(tracked, trade, 'PumpPortal');
      else if (trade.txType === 'sell') await handleTrackedSell(tracked, trade, 'PumpPortal');
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
setInterval(() => { reconciliarPosiciones(false); }, 5 * 60 * 1000);

initDB()
  .then(() => initBaselineReal())
  .then(() => crearOActualizarWebhookHelius())
  .then(() => {
    startListener();
    iniciarServidorWebhook();
  });
console.log(`${NOMBRE_BOT} REGLAS R0-R5 LISTO · modo ${LIVE ? 'REAL' : 'PAPER'} · pump.fun + Raydium`);
process.on('uncaughtException', e => console.error('uncaught', e));
process.on('unhandledRejection', e => console.error('unhandled', e));
