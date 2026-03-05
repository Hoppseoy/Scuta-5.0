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

## 🌐 Deployment notes

Scuta requires a platform that supports long-running Node processes and WebSockets.

- Good options: **Render**, **Railway**, VPS, or container platforms with WebSocket support.
- In production, terminate TLS correctly and ensure forwarded protocol headers are set.

### Render quick deploy
1. Push this repository to GitHub.
2. Create a **Web Service** on Render and connect the repo.
3. Use:
   - **Build command:** `npm ci && npm run build && npm prune --omit=dev`
   - **Start command:** `npm run start`
4. Set any required environment variables.

### Railway quick deploy
1. Push this repository to GitHub.
2. Create a Railway project from the repository.
3. Ensure the service uses `npm run start` and exposes a public domain.
4. Use a build command like `npm ci && npm run build && npm prune --omit=dev` to reduce free-tier runtime memory footprint.
5. Set environment variables in Railway project settings.

### Example origin allowlist
```bash
SCUTA_ALLOWED_ORIGINS="https://scuta.example,https://ops.example" npm run start
```

For production, prefer explicit origins (no wildcard) and ensure TLS termination forwards `X-Forwarded-Proto: https`.

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
