# MEMEBOT

Bot de copy trading de memecoins en Solana. Copia la primera compra de las wallets que configures, ignora los promedios (DCA) y vende todo cuando la wallet vende. Notifica por Telegram y Discord. Ejecución paper (ficticia).

## Reglas

| Regla | Acción |
|---|---|
| R0 · Snapshot | Ignora tokens que la wallet ya tenía al seguirla (se liberan al vender 100%) |
| R0.5 · Anti-dust | Solo es compra válida si la wallet FIRMA y PAGA SOL |
| R1 · First-in | Primera compra válida → el bot entra (una sola vez) |
| R2 · Sin promedios | Posición abierta → compras extra ignoradas |
| R3 · First-out | Primera venta → el bot vende 100% |
| R5 · Tesorería | Ganancia de cada venta → swap a USDC |

## Arranque

```bash
npm install
cp .env.example .env   # y rellena tus valores
npm start
```

Requiere Node 18+. No necesita servidor ni URL pública (Telegraf usa long-polling).

## Variables (.env)

| Variable | Descripción |
|---|---|
| WALLETS | DIRECCION=ALIAS=SOL (varias con coma) |
| TELEGRAM_BOT_TOKEN | Token de @BotFather |
| DISCORD_BOT_TOKEN / DISCORD_CHANNEL_ID | Avisos en Discord (opcional) |
| HELIUS_API_KEY | RPC privado + tickers DAS (recomendado) |
| RESERVA_SOL / TRADE_SOL | Tesorería paper |
| SNAPSHOT / ANTI_DUST / AUTO_USDC | Interruptores de reglas R0 / R0.5 / R5 |

> ⚠️ La ejecución es PAPER: no se toca dinero real. Pasar a ejecución real requiere firmar swaps con tu llave privada. NUNCA compartas tu private key.