<p align="center">SECURE OPERATIONS RELAY</p>
<h1 align="center">🛡️ SCUTA</h1>
<p align="center"><strong>Impenetrable Messaging.</strong><br/>Coordinate high-trust comms with zero-knowledge encryption, volatile identity, and room-level operational control.</p>

# 🛡️ Scuta — Secure, Zero‑Knowledge Sector Chat

> ⚠️ **Work in Progress (WIP)**
> Scuta is actively evolving. Features and security controls may change as the project is hardened and refined. Treat this as security software under active development, review updates carefully, and test before production use.

Scuta is an open-source, room-based encrypted messaging platform built for high-trust communication. Encryption and key derivation happen on the client, while the server relays and stores encrypted payloads.

---

## 🎯 Mission & Goals

In the modern digital age, our data is constantly monitored, harvested, and monetized. We are witnessing an emergent mass surveillance push disguised as "online safety acts," mandatory ID checks, and privacy-busting legislation. Traditional messaging apps store your conversations on their servers, scan them with algorithms, and can hand them over to third parties.

**Scuta** was built as a direct response to this surveillance capitalism and the erosion of digital rights.

My mission is to provide a sanctuary for private conversations where you—and only you—control the keys to your data. I believe privacy is a fundamental human right, not a luxury. By utilizing zero-knowledge architecture, Scuta ensures no tracking, no data mining, and no backdoor access. Just pure, secure, and untraceable communication.

---

## ✨ What Scuta currently includes

### Core cryptography and privacy
- **Client-side AES-256-GCM encryption** for message payloads.
- **PBKDF2 key derivation (100,000 iterations)** from room ID + passphrase inputs.
- **Zero-knowledge key handling**: decryption keys never leave the client.
- **Sector Fingerprint**: a deterministic 4-word NATO fingerprint derived from the room key for out-of-band verification.

### Room and identity model
- **Create or Join sectors** with alphanumeric room IDs.
- **Room-scoped callsigns** with uniqueness enforcement.
- **Device identity enrollment** (ECDSA P-256 keypair generated client-side and persisted locally).
- **Signed join proofs** verified by the server to authenticate room joins.
- **Replay protection** on join via nonce + timestamp window checks.

### Messaging operations
- **Real-time messaging over Socket.IO**.
- **Encrypted message history persistence** in SQLite.
- **Envelope encryption at rest** for persisted ciphertext blobs.
- **TTL / burn-on-read timers** (10s, 30s, 1m, 5m, or off).
- **Typing signals** (`[ SIGNAL DETECTED ]`).
- **Optional tactical notification beep** for inbound messages.
- **Local message cache** per session for continuity.

### Admin and sector control plane
Room owner (admin) capabilities include:
- **Broadcast-only mode** (only admin can transmit).
- **Kick user** from sector.
- **Global Panic**: delete room messages server-side and broadcast room panic.
- **Re-key sector flow**: clear room history and force peers to rejoin with a new passphrase.
- **Burn on Exit**: auto-panic room when owner disconnects.

### Safety, UX, and operational controls
- **Inactivity lock** after 17 minutes (requires passphrase to unlock).
- **Decoy mode** (double-tap `Esc`) to instantly swap to a spreadsheet-like interface.
- **Strict input validation** for room and username fields.
- **Connection and room telemetry** (active users, owner crown, status indicators).
- **Modern tactical UI** built with React + Tailwind + Motion.

### Runtime security hardening
- **Server-authoritative checks** for privileged socket events.
- **Per-socket event rate limiting**.
- **Production HTTPS enforcement** (`x-forwarded-proto`/secure checks).
- **Configurable origin allowlist** via `SCUTA_ALLOWED_ORIGINS`.
- **Security headers** including CSP, HSTS, frame denial, no-referrer, and restrictive permissions policy.

---

## 🧠 Architecture at a glance

1. User derives a room key locally from passphrase + room ID (PBKDF2).
2. User joins a room with a signed identity proof (ECDSA).
3. Message plaintext is encrypted in-browser (AES-GCM).
4. Server receives ciphertext, wraps it for storage, and relays it.
5. Recipients decrypt locally with the same derived key.
6. Admin controls (panic/rekey/broadcast/burn) are enforced server-side.

---

## ⌨️ Hotkeys and input behavior

- **Double `Esc`** → Toggle Decoy Mode on/off.
- **`Enter`** → Send message.
- **`Shift + Enter`** → Insert newline.

---

## 🚀 Run locally

### Requirements
- Node.js 20+

### Development
```bash
npm install
npm run dev
```
Then open: `http://localhost:3000`

### Production mode (local)
```bash
npm run build
npm run start
```

---

## 🌐 Deployment

Scuta requires a platform that supports **long-running Node.js processes**, **persistent filesystem storage** (for SQLite), and **WebSocket connections**. Not all cloud platforms meet these requirements.

### Platform compatibility

| Platform | Supported | Notes |
|----------|-----------|-------|
| **Render** | ✅ Yes | Recommended. Free tier available. `render.yaml` included. |
| **Railway** | ✅ Yes | Easy setup. Free tier has memory limits — prune dev deps after build. |
| **VPS / Docker** | ✅ Yes | Full control. Any Ubuntu/Debian VPS works. |
| **Fly.io** | ✅ Yes | Supports persistent volumes and WebSockets. |
| **Vercel** | ❌ No | Serverless only — no persistent filesystem, no long-running process, no WebSocket support. |
| **Netlify** | ❌ No | Same limitations as Vercel. |
| **GitHub Pages** | ❌ No | Static hosting only. |

---

### Environment variables

Set these on whichever platform you deploy to:

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Set to `production`. Enables HTTPS enforcement, disables dev middleware. |
| `SCUTA_ALLOWED_ORIGINS` | Yes (production) | Comma-separated list of allowed origins for CORS and Socket.IO. Example: `https://scuta.example.com`. If unset in production, all WebSocket connections will be rejected. |
| `PORT` | No | Port to listen on. Defaults to `3000`. Most platforms set this automatically. |

**Example:**
```bash
NODE_ENV=production
SCUTA_ALLOWED_ORIGINS=https://your-app.onrender.com
```

> ⚠️ Never use a wildcard origin (`*`) in production. Always set `SCUTA_ALLOWED_ORIGINS` to your exact deployment URL.

---

### Render (recommended)

Render is the recommended platform. A `render.yaml` is included in the repo — Render will detect it automatically.

**One-click via render.yaml:**
1. Push this repo to GitHub.
2. Go to [render.com](https://render.com) → **New** → **Web Service** → connect your repo.
3. Render auto-detects `render.yaml`. Review the settings and click **Deploy**.
4. After the first deploy, go to **Environment** and set `SCUTA_ALLOWED_ORIGINS` to your Render URL (e.g. `https://scuta-chat.onrender.com`).

**Manual setup (if not using render.yaml):**
- **Environment:** Node
- **Build command:** `npm ci && npm run build && npm prune --omit=dev`
- **Start command:** `npm run start`
- **Environment variables:** `NODE_ENV=production`, `SCUTA_ALLOWED_ORIGINS=https://<your-service>.onrender.com`

> **Note on free tier:** Render free web services spin down after 15 minutes of inactivity and take ~30 seconds to cold-start. For always-on availability, upgrade to a paid instance.

---

### Railway

1. Push this repo to GitHub.
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Select your repo. Railway will detect Node.js automatically.
4. In **Settings**, set:
   - **Build command:** `npm ci && npm run build && npm prune --omit=dev`
   - **Start command:** `npm run start`
5. In **Variables**, add:
   - `NODE_ENV` = `production`
   - `SCUTA_ALLOWED_ORIGINS` = `https://<your-app>.railway.app`
6. Go to **Settings → Networking** and generate a public domain.

> **Note on free tier:** Railway's free tier has a monthly usage cap. Pruning dev dependencies after build (`npm prune --omit=dev`) significantly reduces runtime memory usage.

---

### Fly.io

1. Install the [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) and log in: `fly auth login`
2. From the repo root, run: `fly launch` — Fly will detect Node.js and generate a `fly.toml`.
3. When prompted, choose a region close to your users and **do not** set up a Postgres database (Scuta uses SQLite).
4. Add a persistent volume for the SQLite data directory:
   ```bash
   fly volumes create scuta_data --size 1
   ```
5. Edit the generated `fly.toml` to mount the volume:
   ```toml
   [mounts]
     source = "scuta_data"
     destination = "/app/data"
   ```
6. Set environment variables:
   ```bash
   fly secrets set NODE_ENV=production
   fly secrets set SCUTA_ALLOWED_ORIGINS=https://<your-app>.fly.dev
   ```
7. Deploy: `fly deploy`

---

### VPS / Docker (self-hosted)

For maximum control and privacy, run Scuta on your own server.

**Direct Node.js (Ubuntu/Debian):**
```bash
# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Clone and build
git clone https://github.com/your-username/Scuta-5.0.git
cd Scuta-5.0
npm ci && npm run build && npm prune --omit=dev

# Run
NODE_ENV=production SCUTA_ALLOWED_ORIGINS=https://yourdomain.com npm run start
```

Use a process manager like [PM2](https://pm2.keymetrics.io/) to keep it running:
```bash
npm install -g pm2
NODE_ENV=production SCUTA_ALLOWED_ORIGINS=https://yourdomain.com pm2 start "npm run start" --name scuta
pm2 save && pm2 startup
```

**With a reverse proxy (nginx):** Terminate TLS at nginx and proxy to `localhost:3000`. Ensure `proxy_set_header X-Forwarded-Proto https;` is set so Scuta's HTTPS enforcement works correctly.

---

### Post-deploy checklist

After deploying to any platform:

- [ ] Open `/api/health` — should return `{"status":"ok"}`.
- [ ] Open the app in two separate browser sessions, join the same room, and confirm messages send and receive.
- [ ] Verify the URL in the browser starts with `https://` (not `http://`).
- [ ] Confirm `SCUTA_ALLOWED_ORIGINS` is set to your exact deployment URL (no trailing slash).

---

### Example origin allowlist
```bash
SCUTA_ALLOWED_ORIGINS="https://scuta.example.com,https://ops.example.com" npm run start
```

For production, always use explicit origins (never wildcard) and ensure your reverse proxy or platform forwards `X-Forwarded-Proto: https`.

---

## 📚 Security documentation

- `docs/security/THREAT-MODEL.md`
- `docs/security/HARDENED-ENDPOINT-PROFILE.md`
- `docs/security/ASSURANCE-PROGRAM.md`
- `docs/security/SECURITY-ROADMAP.md`

---

## ⚖️ Legal disclaimer

This software is provided for educational and lawful communication purposes only.

The creator(s) of Scuta are not responsible for misuse. By using Scuta, you agree not to use it for unlawful activity. Encryption in this project is intended to protect privacy and confidentiality, not to facilitate illegal behavior.
