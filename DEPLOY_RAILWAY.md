# MEMEBOT — Deploy 24/7 en Railway + Webhook de Helius

La URL de vista previa (`*.preview.qwenlm.io`) es **temporal**: muere al cerrar
la sesión y por eso el webhook de Helius marca Failed. Con Railway obtienes una
**URL fija** que responde siempre.

---

## 1 · Subir el código a GitHub

1. Crea un repo nuevo en GitHub (ej. `memebot`).
2. En la carpeta del proyecto:

```bash
git init
git add .
git commit -m "memebot: bot + servidor de webhooks"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/memebot.git
git push -u origin main
```

> El repo incluye el `Dockerfile`, así que Railway compila la interfaz y
> arranca el servidor automáticamente.

## 2 · Deploy en Railway

1. Entra a **https://railway.app** → **New Project** → **Deploy from GitHub repo**.
2. Selecciona el repo `memebot`. Railway detecta el `Dockerfile` y despliega.
3. En tu servicio, ve a **Variables** y agrega:

| Variable         | Valor                                            |
| ---------------- | ------------------------------------------------ |
| `HELIUS_API_KEY` | tu key de dashboard.helius.dev                   |
| `WALLETS`        | `DIRECCION_1=CAP,DIRECCION_2=BALLENA`            |

4. En **Settings → Networking** pulsa **Generate Domain**.
   Railway te da una URL fija, por ejemplo:

```
https://memebot-xxxx.up.railway.app
```

Esa URL **nunca cambia**. Tu webhook será:

```
https://memebot-xxxx.up.railway.app/webhook
```

## 3 · Configurar el webhook en Helius

1. **https://dashboard.helius.dev** → **Webhooks** → **New Webhook**.
2. Completa:
   - **Webhook URL:** `https://memebot-xxxx.up.railway.app/webhook`
   - **Network:** `Mainnet`
   - **Txn Types:** `Any`
   - **Accounts:** las mismas wallets que pusiste en `WALLETS`
3. Pulsa **Create** y luego **Test**.
   - Debe salir **Success** (el servidor responde `200 OK` en milisegundos).
   - Si sale **Failed**: revisa los logs de Railway (pestaña **Deployments → Logs**).

## 4 · Verificación (lo que debes ver)

**En los logs de Railway, al arrancar:**

```
SERVER EN PORT 3000
ESCUCHANDO 2 WALLETS: [CAP (9xQe…), BALLENA (CktR…)]
RPC: Helius privado (DAS activo)
Webhook URL: https://<TU-DOMINIO-RAILWAY>/webhook
```

**Cuando CAP haga una transacción (inmediato):**

```
WEBHOOK RECIBIDO: hash=34m2ZCk9… wallet=CAP txs=1 · total=1
COMPRA VÁLIDA (R1) wallet=CAP token=$GGW7 sol=0.2585 hash=34m2ZCk9… → 1 cliente(s) SSE
```

**En la interfaz web** (abre la URL de Railway en el navegador):
- La barra superior muestra el chip **WH** en verde = webhook conectado.
- Cada compra/venta de tus wallets aparece en el monitor al instante
  (el servidor la empuja por SSE; no depende del WebSocket del navegador).

## 5 · Troubleshooting

| Síntoma | Causa / solución |
| --- | --- |
| Helius Test = Failed | El servicio no está arriba: revisa logs de Railway. Verifica que la URL termine en `/webhook` y sea `https://`. |
| `WEBHOOK RECIBIDO` pero sin `COMPRA VÁLIDA` | La tx no tocó ninguna wallet de `WALLETS`, o fue un airdrop (se clasifica `DUST/AIRDROP`). |
| Interfaz no carga | El build no generó `dist/`: revisa que el deploy use el `Dockerfile` (Build Logs). |
| Chip WH gris en la interfaz | Abriste la UI desde otro dominio (ej. vista previa). Abre la UI desde la URL de Railway: ahí el SSE conecta. |
| `ESCUCHANDO 0 WALLETS` | Falta la variable `WALLETS` en Railway → Variables. |

## 6 · Flujo completo (resumen)

```
CAP compra en pump.fun
        │
        ▼
Helius detecta la tx en mainnet
        │  POST (en vivo)
        ▼
https://memebot-xxxx.up.railway.app/webhook   ← responde 200 en <1s
        │  clasifica (R0.5: firmó y pagó SOL)
        ▼
SSE /events  →  navegador  →  monitor del bot (R1 ENTRADA)
        │
        └──► logs de Railway (WEBHOOK RECIBIDO / COMPRA VÁLIDA)
```

El servidor **nunca** toca tus llaves privadas: solo **lee** la blockchain y
reporta. La ejecución sigue siendo paper hasta que agregues un signer dedicado.
