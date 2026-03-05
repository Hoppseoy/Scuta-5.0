import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const encoder = new TextEncoder();

// Setup SQLite
const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}
const db = new Database(path.join(dbDir, 'chat.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    roomId TEXT NOT NULL,
    sender TEXT NOT NULL,
    encryptedText TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
`);

for (const migration of [
  `ALTER TABLE messages ADD COLUMN type TEXT DEFAULT 'text'`,
  `ALTER TABLE messages ADD COLUMN ttl INTEGER DEFAULT 0`,
]) {
  try {
    db.exec(migration);
  } catch {
    // Ignore if column already exists
  }
}

const insertMessage = db.prepare('INSERT INTO messages (id, roomId, sender, encryptedText, timestamp, type, ttl) VALUES (?, ?, ?, ?, ?, ?, ?)');
const getMessagesByRoom = db.prepare('SELECT * FROM messages WHERE roomId = ? ORDER BY timestamp ASC');
const deleteMessage = db.prepare('DELETE FROM messages WHERE id = ?');

const ROOM_ID_REGEX = /^[a-zA-Z0-9]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9]+$/;
const NONCE_WINDOW_MS = 90_000;

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Content-Security-Policy': "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

type RoomSettings = {
  isBroadcastOnly: boolean;
  burnOnExit: boolean;
};

type SocketUser = {
  roomId: string;
  username: string;
};

type IdentityPayload = {
  deviceId: string;
  publicKeyJwk: JsonWebKey;
  proof: string;
  timestamp: number;
  nonce: string;
};

type EnrollmentRecord = {
  deviceId: string;
  publicKeyJwk: JsonWebKey;
  enrolledAt: number;
};

type CanonicalMessage = {
  id: string;
  roomId: string;
  sender: string;
  encryptedText: string;
  timestamp: number;
  type?: string;
  ttl?: number;
};

function obfuscate(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function parseAllowedOrigins(): string[] {
  const configured = process.env.SCUTA_ALLOWED_ORIGINS?.trim();
  if (!configured) {
    return process.env.NODE_ENV === 'production' ? [] : ['*'];
  }

  return configured.split(',').map((origin) => origin.trim()).filter(Boolean);
}

function isValidIdentityPayload(payload: IdentityPayload): boolean {
  return Boolean(
    payload
    && typeof payload.deviceId === 'string'
    && payload.deviceId.length >= 12
    && payload.deviceId.length <= 128
    && typeof payload.proof === 'string'
    && payload.proof.length > 20
    && Number.isFinite(payload.timestamp)
    && typeof payload.nonce === 'string'
    && payload.nonce.length >= 8
    && payload.publicKeyJwk
  );
}

async function verifyJoinProof(roomId: string, username: string, identity: IdentityPayload): Promise<boolean> {
  const now = Date.now();
  if (Math.abs(now - identity.timestamp) > NONCE_WINDOW_MS) {
    return false;
  }

  const material = `${roomId}|${username}|${identity.deviceId}|${identity.timestamp}|${identity.nonce}`;

  try {
    const publicKey = await crypto.webcrypto.subtle.importKey(
      'jwk',
      identity.publicKeyJwk,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      false,
      ['verify']
    );

    const signature = Buffer.from(identity.proof, 'base64');
    return crypto.webcrypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signature,
      encoder.encode(material)
    );
  } catch {
    return false;
  }
}

function wrapForStorage(input: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(input, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    v: 2,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: ciphertext.toString('base64'),
  });
}

function unwrapFromStorage(stored: string, key?: Buffer): string | null {
  let parsed: { v: number; iv: string; tag: string; data: string } | null = null;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return stored; // legacy row compatibility
  }

  if (!parsed || parsed.v !== 2 || !key) {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    const clear = Buffer.concat([decipher.update(Buffer.from(parsed.data, 'base64')), decipher.final()]);
    return clear.toString('utf8');
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = createServer(app);
  const allowedOrigins = parseAllowedOrigins();

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins.length === 1 && allowedOrigins[0] === '*' ? '*' : allowedOrigins,
    },
  });

  const socketUsers = new Map<string, SocketUser>();
  const roomUsers = new Map<string, string[]>();
  const roomOwners = new Map<string, string>();
  const roomSettings = new Map<string, RoomSettings>();
  const roomStorageKeys = new Map<string, Buffer>();
  const roomEnrollments = new Map<string, Map<string, EnrollmentRecord>>();
  const usedNonces = new Map<string, number>();
  const eventCounters = new Map<string, { count: number; windowStart: number }>();

  const getRoomStorageKey = (roomId: string): Buffer => {
    const existing = roomStorageKeys.get(roomId);
    if (existing) return existing;
    const next = crypto.randomBytes(32);
    roomStorageKeys.set(roomId, next);
    return next;
  };

  const destroyRoomStorageKey = (roomId: string) => {
    roomStorageKeys.delete(roomId);
  };

  const getActor = (socketId: string): SocketUser | null => socketUsers.get(socketId) || null;

  const auditDenied = (event: string, actor: SocketUser | null, reason: string) => {
    console.warn('[AUDIT][DENY]', {
      event,
      actor: actor ? obfuscate(actor.username) : 'unknown',
      room: actor ? obfuscate(actor.roomId) : 'unknown',
      reason,
      timestamp: Date.now(),
    });
  };

  const pruneNonces = () => {
    const now = Date.now();
    for (const [nonce, seenAt] of usedNonces.entries()) {
      if (now - seenAt > NONCE_WINDOW_MS) usedNonces.delete(nonce);
    }
  };

  const consumeNonce = (nonce: string): boolean => {
    pruneNonces();
    if (usedNonces.has(nonce)) return false;
    usedNonces.set(nonce, Date.now());
    return true;
  };

  const rateLimitSocketEvent = (socketId: string): boolean => {
    const key = socketId;
    const now = Date.now();
    const windowMs = 10_000;
    const limit = 120;
    const current = eventCounters.get(key);

    if (!current || now - current.windowStart > windowMs) {
      eventCounters.set(key, { count: 1, windowStart: now });
      return true;
    }

    current.count += 1;
    if (current.count > limit) {
      return false;
    }
    return true;
  };

  const emitSystemLog = (roomId: string, content: string) => {
    const systemMessage: CanonicalMessage = {
      id: `system-${crypto.randomUUID()}`,
      roomId,
      sender: 'SYSTEM',
      encryptedText: content,
      timestamp: Date.now(),
      type: 'system',
      ttl: 0,
    };

    try {
      insertMessage.run(
        systemMessage.id,
        systemMessage.roomId,
        systemMessage.sender,
        systemMessage.encryptedText,
        systemMessage.timestamp,
        systemMessage.type,
        0
      );
    } catch (err) {
      console.error('Failed to save system log:', err);
    }

    io.to(roomId).emit('receive_message', systemMessage);
  };

  app.set('trust proxy', true);

  app.use((req, res, next) => {
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(header, value);
    }
    next();
  });

  app.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'production') {
      next();
      return;
    }

    const forwardedProtocol = req.header('x-forwarded-proto')?.split(',')[0]?.trim();
    if (req.secure || forwardedProtocol === 'https') {
      next();
      return;
    }

    res.status(400).json({ error: 'HTTPS is required in production.' });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.use(([eventName], next) => {
      if (!rateLimitSocketEvent(socket.id)) {
        auditDenied(eventName, getActor(socket.id), 'rate limit exceeded');
        next(new Error('Rate limit exceeded.'));
        return;
      }
      next();
    });

    socket.on('join_room', async (data, callback) => {
      const { roomId, username, action, identity } = data as {
        roomId: string;
        username: string;
        action: 'create' | 'join';
        identity: IdentityPayload;
      };

      if (!ROOM_ID_REGEX.test(roomId) || !USERNAME_REGEX.test(username)) {
        if (callback) callback({ success: false, error: 'Invalid room or username format.' });
        return;
      }

      if (!isValidIdentityPayload(identity)) {
        if (callback) callback({ success: false, error: 'Invalid device identity payload.' });
        return;
      }

      if (!consumeNonce(identity.nonce)) {
        if (callback) callback({ success: false, error: 'Replay detected. Retry join.' });
        return;
      }

      const proofOk = await verifyJoinProof(roomId, username, identity);
      if (!proofOk) {
        if (callback) callback({ success: false, error: 'Identity proof verification failed.' });
        return;
      }

      const roomExists = roomOwners.has(roomId);
      if (action === 'create' && roomExists) {
        if (callback) callback({ success: false, error: 'Sector already exists. Please join it or choose a different Sector ID.' });
        return;
      }

      if (action === 'join' && !roomExists) {
        if (callback) callback({ success: false, error: 'Sector does not exist. Please create it first.' });
        return;
      }

      let enrollments = roomEnrollments.get(roomId);
      if (!enrollments) {
        enrollments = new Map();
        roomEnrollments.set(roomId, enrollments);
      }

      const enrolled = enrollments.get(username);
      if (!enrolled) {
        enrollments.set(username, {
          deviceId: identity.deviceId,
          publicKeyJwk: identity.publicKeyJwk,
          enrolledAt: Date.now(),
        });
      } else if (
        enrolled.deviceId !== identity.deviceId
        || JSON.stringify(enrolled.publicKeyJwk) !== JSON.stringify(identity.publicKeyJwk)
      ) {
        if (callback) callback({ success: false, error: 'Enrollment mismatch for callsign. Admin must rotate identity enrollment.' });
        return;
      }

      let usersInRoom = roomUsers.get(roomId) || [];
      if (usersInRoom.includes(username)) {
        if (callback) callback({ success: false, error: 'Callsign already taken in this sector. Please choose a different one.' });
        return;
      }

      socket.join(roomId);
      socketUsers.set(socket.id, { roomId, username });
      usersInRoom.push(username);
      roomUsers.set(roomId, usersInRoom);

      let isOwner = false;
      if (!roomOwners.has(roomId)) {
        roomOwners.set(roomId, username);
        roomSettings.set(roomId, { isBroadcastOnly: false, burnOnExit: false });
        getRoomStorageKey(roomId);
        isOwner = true;
      }

      console.log(`User ${username} (${socket.id}) joined room ${roomId}. Owner: ${isOwner}`);

      io.to(roomId).emit('active_users', usersInRoom);
      socket.emit('settings_updated', roomSettings.get(roomId));

      const roomKey = roomStorageKeys.get(roomId);
      const history = getMessagesByRoom
        .all(roomId)
        .map((msg: any) => ({ ...msg, encryptedText: unwrapFromStorage(msg.encryptedText, roomKey) }))
        .filter((msg: any) => Boolean(msg.encryptedText));
      socket.emit('message_history', history);

      emitSystemLog(roomId, `[${username}] HAS ENTERED THE SECTOR`);

      if (callback) callback({ success: true, isOwner, pseudonym: obfuscate(username) });
    });

    socket.on('send_message', (data) => {
      const actor = getActor(socket.id);
      if (!actor) {
        auditDenied('send_message', null, 'unknown socket user');
        return;
      }
      if (data.roomId !== actor.roomId) {
        auditDenied('send_message', actor, 'room mismatch');
        return;
      }

      const settings = roomSettings.get(actor.roomId);
      const owner = roomOwners.get(actor.roomId);
      if (settings?.isBroadcastOnly && actor.username !== owner) {
        auditDenied('send_message', actor, 'broadcast-only restriction');
        return;
      }

      const canonicalMessage = {
        ...data,
        roomId: actor.roomId,
        sender: actor.username,
      };

      try {
        const roomKey = getRoomStorageKey(actor.roomId);
        const wrappedEncryptedText = wrapForStorage(canonicalMessage.encryptedText, roomKey);
        insertMessage.run(
          canonicalMessage.id,
          canonicalMessage.roomId,
          canonicalMessage.sender,
          wrappedEncryptedText,
          canonicalMessage.timestamp,
          canonicalMessage.type || 'text',
          canonicalMessage.ttl || 0
        );
      } catch (err) {
        console.error('Failed to save message:', err);
      }

      io.to(actor.roomId).emit('receive_message', canonicalMessage);

      if (canonicalMessage.ttl && canonicalMessage.ttl > 0) {
        setTimeout(() => {
          try {
            deleteMessage.run(canonicalMessage.id);
            io.to(actor.roomId).emit('message_expired', canonicalMessage.id);
          } catch (err) {
            console.error('Failed to delete expired message:', err);
          }
        }, canonicalMessage.ttl * 1000);
      }
    });

    socket.on('typing', (data) => {
      const actor = getActor(socket.id);
      if (!actor) {
        auditDenied('typing', null, 'unknown socket user');
        return;
      }
      if (data.roomId !== actor.roomId) {
        auditDenied('typing', actor, 'room mismatch');
        return;
      }
      socket.to(actor.roomId).emit('user_typing', { username: actor.username, pseudonym: obfuscate(actor.username), isTyping: Boolean(data.isTyping) });
    });

    socket.on('update_settings', (data) => {
      const actor = getActor(socket.id);
      if (!actor) {
        auditDenied('update_settings', null, 'unknown socket user');
        return;
      }
      if (data.roomId !== actor.roomId) {
        auditDenied('update_settings', actor, 'room mismatch');
        return;
      }
      if (roomOwners.get(actor.roomId) === actor.username) {
        roomSettings.set(actor.roomId, data.settings);
        io.to(actor.roomId).emit('settings_updated', data.settings);
      } else {
        auditDenied('update_settings', actor, 'owner required');
      }
    });

    socket.on('panic_room', (data) => {
      const actor = getActor(socket.id);
      if (!actor) {
        auditDenied('panic_room', null, 'unknown socket user');
        return;
      }
      if (data.roomId !== actor.roomId) {
        auditDenied('panic_room', actor, 'room mismatch');
        return;
      }
      if (roomOwners.get(actor.roomId) === actor.username) {
        try {
          db.prepare('DELETE FROM messages WHERE roomId = ?').run(actor.roomId);
          destroyRoomStorageKey(actor.roomId);
          io.to(actor.roomId).emit('room_panicked');
        } catch (err) {
          console.error('Failed to panic room:', err);
        }
      } else {
        auditDenied('panic_room', actor, 'owner required');
      }
    });

    socket.on('kick_user', (data) => {
      const actor = getActor(socket.id);
      if (!actor) {
        auditDenied('kick_user', null, 'unknown socket user');
        return;
      }
      if (data.roomId !== actor.roomId) {
        auditDenied('kick_user', actor, 'room mismatch');
        return;
      }
      if (roomOwners.get(actor.roomId) === actor.username) {
        for (const [sid, user] of socketUsers.entries()) {
          if (user.roomId === actor.roomId && user.username === data.targetUser) {
            io.to(sid).emit('kicked_from_room');
            io.sockets.sockets.get(sid)?.disconnect();
            break;
          }
        }
      } else {
        auditDenied('kick_user', actor, 'owner required');
      }
    });

    socket.on('rekey_room', (data) => {
      const actor = getActor(socket.id);
      if (!actor) {
        auditDenied('rekey_room', null, 'unknown socket user');
        return;
      }
      if (data.roomId !== actor.roomId) {
        auditDenied('rekey_room', actor, 'room mismatch');
        return;
      }
      if (roomOwners.get(actor.roomId) === actor.username) {
        try {
          db.prepare('DELETE FROM messages WHERE roomId = ?').run(actor.roomId);
          destroyRoomStorageKey(actor.roomId);
          getRoomStorageKey(actor.roomId);
        } catch (err) {
          console.error('Failed to clear messages on rekey:', err);
        }
        socket.to(actor.roomId).emit('rekey_required');
      } else {
        auditDenied('rekey_room', actor, 'owner required');
      }
    });

    socket.on('disconnect', () => {
      const user = socketUsers.get(socket.id);
      if (!user) return;

      const { roomId, username } = user;
      const owner = roomOwners.get(roomId);
      const settings = roomSettings.get(roomId);

      if (owner === username && settings?.burnOnExit) {
        try {
          db.prepare('DELETE FROM messages WHERE roomId = ?').run(roomId);
          destroyRoomStorageKey(roomId);
          io.to(roomId).emit('room_panicked');
          roomUsers.delete(roomId);
          roomOwners.delete(roomId);
          roomSettings.delete(roomId);
          roomEnrollments.delete(roomId);
        } catch (err) {
          console.error('Failed to burn room on exit:', err);
        }
      } else {
        let usersInRoom = roomUsers.get(roomId);
        if (usersInRoom) {
          usersInRoom = usersInRoom.filter((u) => u !== username);
          if (usersInRoom.length === 0) {
            roomUsers.delete(roomId);
            roomOwners.delete(roomId);
            roomSettings.delete(roomId);
            roomEnrollments.delete(roomId);
            destroyRoomStorageKey(roomId);
          } else {
            roomUsers.set(roomId, usersInRoom);
            if (owner === username) {
              roomOwners.set(roomId, usersInRoom[0]);
              io.to(roomId).emit('owner_changed', usersInRoom[0]);
            }
          }
          io.to(roomId).emit('active_users', usersInRoom);
          emitSystemLog(roomId, `[${username}] HAS EXITED THE SECTOR`);
        }
      }

      socketUsers.delete(socket.id);
      eventCounters.delete(socket.id);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
