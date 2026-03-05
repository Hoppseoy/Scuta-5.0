# 🛡️ Scuta - Secure Encrypted Chat

> ⚠️ **WORK IN PROGRESS (WIP) - READ THOROUGHLY**
> 
> **Do not skip any part of this README.** Please read everything thoroughly before trying out this application. 
> Scuta is currently in active development. I am actively working on adding:
> - Individual encryption keys for each member
> - The ability to revoke keys and manage access
> - Secure image and file sharing
> - Many other features to enhance security and usability in the future.

Scuta is a modern, sleek, end-to-end open-source direct messaging platform that uses Military-Grade Encryption, assuring absolute privacy. Messages are encrypted on your device and can only be decrypted by people in the same room with the exact same passphrase.

---

## 🎯 Mission & Goals

In the modern digital age, our data is constantly monitored, harvested, and monetized. We are witnessing an emergent mass surveillance push disguised as "online safety acts," mandatory ID checks, and privacy-busting legislation. Traditional messaging apps store your conversations on their servers, scan them with algorithms, and can hand them over to third parties. 

**Scuta** was built as a direct response to this surveillance capitalism and the erosion of digital rights. 

My mission is to provide a sanctuary for private conversations where you—and only you—control the keys to your data. I believe privacy is a fundamental human right, not a luxury. By utilizing zero-knowledge architecture, Scuta ensures no tracking, no data mining, and no backdoor access. Just pure, secure, and untraceable communication. 

---

## ✨ Features

- **End-to-End Encryption (AES-GCM):** All messages are encrypted locally on your device before they ever leave your browser. The server only sees encrypted gibberish.
- **Zero-Knowledge Architecture:** Keys are derived locally using PBKDF2 and never transmitted to the server.
- **Sector Fingerprint:** A unique 4-word NATO phonetic fingerprint is generated from the room's encryption key. Users can verify this fingerprint over a secondary channel to ensure absolute security and prevent Man-in-the-Middle attacks.
- **Burn-on-Read (TTL):** Set a Time-To-Live (TTL) for messages (e.g., 10s, 1m). Messages automatically self-destruct from all clients and the server after the timer expires.
- **Inactivity Lock:** If you are inactive for 17 minutes, the screen blurs and locks, requiring your decryption key to view the sector again.
- **Anti-Shoulder Surfing (Decoy Mode):** Instantly swap the UI to look like a realistic financial spreadsheet to hide the chat from physical onlookers.
- **Tactical Typing Indicators:** See when other personnel are transmitting data with a tactical `[ SIGNAL DETECTED ]` indicator.
- **Tactical Sound Notifications:** Optional, minimally tactical sound alerts for incoming messages.
- **Read-Only Broadcast Mode:** Sector Admins can set the room to "Broadcast Only," meaning only they can send messages. Great for secure announcements.
- **Burn Sector on Exit:** Sector Admins can configure the room to automatically trigger a Global Purge and destroy the room instantly when they leave.
- **Persistent Encrypted Payloads:** Messages remain in the room for active participants, securely stored as encrypted blobs on the server.
- **Local Purge Button:** Instantly delete all messages from your local device with a single click.
- **Admin Global Panic Button (Server-Side Purge):** The creator of a room gets an exclusive "Admin" panel with a "Global Purge" button. This irreversibly deletes all messages in the sector directly from the server, wiping the chat for everyone instantly.
- **Active Personnel Tracking:** See exactly who is currently connected to your sector.
- **Unique Callsigns:** Enforces unique usernames within a room to prevent impersonation.
- **Strict Input Validation:** Alphanumeric-only usernames and room IDs to prevent injection attacks and ensure compatibility.
- **Modern AAA-Style UI:** A sleek, dark-themed, immersive interface designed for ease of use and a premium feel.

---

## ⌨️ Controls & Hotkeys

- **`ESC` (Double Tap):** Instantly toggle **Decoy Mode**. This replaces the chat interface with a fake "System Diagnostics" terminal to hide your screen from onlookers. Double tap `ESC` again to return to the chat.
- **`Enter`:** Send message.
- **`Shift + Enter`:** Add a new line to your message.

## 🔒 How It Works

### 👨‍💻 For Cybersecurity Professionals (Technical Architecture)
Scuta utilizes a zero-knowledge architecture. When a user joins a "Sector" (room), their passphrase and the room ID are used as inputs to a PBKDF2 key derivation function (via the Web Crypto API) to generate a secure AES-GCM key. 

All messages are encrypted client-side using this AES-GCM key before being transmitted over WebSockets to the Node.js/Express server. The server stores the encrypted payloads in a SQLite database to provide persistence, but the server **never** sees the plaintext messages or the encryption keys. When a client receives an encrypted payload, it decrypts it locally using the derived key. If the keys don't match, the decryption fails, ensuring that unauthorized users cannot read the chat even if they intercept the database.

### 📱 For Everyone Else (In Plain English)
Imagine you and your friend have identical, magical lockboxes. Before you send a message, you put it in your lockbox and lock it with a special key that only you and your friend have. You then hand the locked box to a delivery person (the server). 

The delivery person carries the box to your friend, but because they don't have the key, they can't see what's inside. Even if the delivery person keeps a copy of the locked box in their warehouse, it's useless to them. When your friend gets the box, they use their matching key to open it and read the message. That's exactly how Scuta works!

---

## 🚀 Deployment

Since this application uses **WebSockets** (Socket.io) for real-time messaging, deploying it requires a platform that supports long-running servers. 

### Recommended Deployment: Render or Railway (Free & Easy)

To get this running perfectly, deploy to **Render.com** or **Railway.app**. They fully support WebSockets.

#### Option 1 (Highly Recommended): Deploy to Render (My Personal Choice)
1. Push this entire code repository to a new repository on your GitHub.
2. Go to [Render.com](https://render.com) and sign up with GitHub.
3. Click **New +** and select **Web Service**.
4. Connect your GitHub repository.
5. Configure the service:
   - **Name**: `scuta-chat` (or whatever you like)
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
6. Click **Create Web Service**. Render will build and deploy your app.

#### Option 2: Deploy to Railway
1. Push this code to GitHub.
2. Go to [Railway.app](https://railway.app) and sign in with GitHub.
3. Click **New Project** -> **Deploy from GitHub repo**.
4. Select your repository.
5. Railway will automatically detect it's a Node.js app, build it, and deploy it.
6. Go to the "Settings" tab of your deployment in Railway and click **Generate Domain** to get a public URL.

---

## 💻 Local Development

If you want to run it on your own computer to test:

1. Make sure you have Node.js installed.
2. Open a terminal in this folder.
3. Run `npm install` to install dependencies.
4. Run `npm run dev` to start the development server.
5. Open `http://localhost:3000` in your browser.

---

## ⚖️ Legal Disclaimer

**This software is provided for educational and lawful communication purposes only.** 

The creator of Scuta is not responsible for any misuse of this application. By using this software, you agree that you will not use it to facilitate, plan, or engage in any illegal activities. The encryption provided by this tool is designed to protect user privacy from unwarranted surveillance and data harvesting, not to shield unlawful behavior. The user assumes all liability and responsibility for the content they transmit using this platform.

## 🔐 Security Hardening (Kickoff)

Recent baseline hardening work introduces:
- **Server-authoritative socket authorization** for privileged events.
- **Production HTTPS enforcement** (requests are rejected unless HTTPS/forwarded HTTPS is detected).
- **Configurable socket origin allowlist** via `SCUTA_ALLOWED_ORIGINS` (comma-separated list).

Example:

```bash
SCUTA_ALLOWED_ORIGINS="https://scuta.example,https://ops-terminal.example" npm run dev
```

In production, avoid wildcard origins and ensure TLS termination correctly sets `X-Forwarded-Proto: https`.


### Advanced Security Controls
- Device identity enrollment with signed join proofs (ECDSA P-256).
- Replay protection for join events (nonce + timestamp window).
- Envelope encryption of persisted ciphertext with key destruction on panic/rekey/burn.
- Strict runtime headers (CSP, HSTS, frame denial, no-referrer).

Security docs:
- `docs/security/THREAT-MODEL.md`
- `docs/security/HARDENED-ENDPOINT-PROFILE.md`
- `docs/security/ASSURANCE-PROGRAM.md`
