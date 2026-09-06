// ========= MEMEBOT REGLAS PERMANENTES - NO BORRAR =========
// PUMP.FUN ES MULTICHAIN (verificado 2026):
// - Solana (origen)
// - ETH Mainnet, BASE (8453), BNB Chain (56)
// - ROBINHOOD CHAIN - ID 4663 - RPC https://rpc.mainnet.chain.robinhood.com - L2 Arbitrum Orbit - Lanzada 1-Jul-2026 - GAS ETH - Soportada por Pump.fun desde 8-Jul-2026
// - HyperEVM (ID 999)
// Motor único: PumpPortal WS subscribeAccountTrade + PumpPortal Trade API
// Pagas con SOL/USDC en Solana, compra en cualquier red, gas sponsoreado. Robinhood Chain es prioridad porque ahí está el volumen ahora.
//
// COMANDOS TELEGRAM (actualizados):
// /add alias address amount chain -> chain puede ser: sol, eth, base, bsc, rh, robinhood, hype, hyperliquid
// ej: /add dave 0x123... 0.05 rh -> para Robinhood Chain
// /add dave So1... 0.1 sol
// /remove alias
// /list
// /status -> muestra PAPER/REAL + saldo global USDC + chains soportadas
// /balance
// /setbalance 1000 -> setea saldo inicial global USDC (Regla 2)
// /start /help
//
// REGLA 0 - SNAPSHOT: Al agregar wallet, scan holdings actuales y marcar como vistos. No comprar.
// REGLA 1 - SOLO PRIMER BUY / SELL 100%: Monto fijo, no DCA. Si tracked promedia -> BOT NO AVISA NI HACE NADA.
// REGLA 2 - SALDO GLOBAL USDC: Configurable en Telegram, contabilizado en USDC multichain, ganancia auto a USDC.
// NOTIFICACIONES: Doble noti por evento valido (tracked + bot) con token, monto, hash. Sin spam de promediado.
// ===========================================================

//... mismo código de antes pero en getChainId():
function getChainId(chain) {
  const map = {
    'sol':'solana', 'eth':'eth', 'base':'base', 'bsc':'bnb',
    'rh':'rh', 'robinhood':'rh', 'robinhoodchain':'rh',
    'hype':'hyperliquid', 'hyperliquid':'hyperliquid', 'hyperevm':'hyperliquid'
  };
  return map[chain.toLowerCase()] || 'solana';
}

// Y en el mensaje de /add:
bot.sendMessage(msg.chat.id, `✅ ${alias} agregado en ${chain.toUpperCase()} ${chain==='rh'?'[ROBINHOOD CHAIN - ID 4663 - PRIORIDAD]':''} con ${amount}. Snapshot hecho.`);

// El WS ahora suscribe a todas las cadenas, incluyendo rh
