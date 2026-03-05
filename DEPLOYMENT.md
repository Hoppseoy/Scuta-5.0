# Deployment Guide

I cannot directly deploy to your cloud account from this environment because it has no access to your Render/Railway credentials.

## Render (recommended)
1. Push this branch to your Git provider.
2. In Render, create a **Web Service** from this repo.
3. Render auto-detects `render.yaml`, or set manually:
   - Build: `npm ci && npm run build`
   - Start: `npm run start`
4. Set env vars:
   - `NODE_ENV=production`
   - `SCUTA_ALLOWED_ORIGINS=https://<your-render-domain>`
5. Deploy and open the generated URL.

## Railway
Use the same build/start commands and env vars above.

## Quick verification after deploy
- Open `/api/health` and verify `{"status":"ok"}`.
- Open app and join same room from two browser sessions.
- Confirm messages send/receive.


## Free-tier lightweight optimizations included
- Production runs compiled Node output (`dist-server/server.js`) instead of `tsx`.
- Vite is loaded only in development (dynamic import), not in production runtime.
- Unused packages were removed to reduce install size and cold-start overhead.
- Render build uses `npm ci --omit=optional` and sets `NODE_OPTIONS=--max-old-space-size=256`.
