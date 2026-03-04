import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

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

try {
  db.exec(`ALTER TABLE messages ADD COLUMN type TEXT DEFAULT 'text'`);
} catch (e) {
  // Ignore if column already exists
}

try {
  db.exec(`ALTER TABLE messages ADD COLUMN ttl INTEGER DEFAULT 0`);
} catch (e) {
  // Ignore if column already exists
}

const insertMessage = db.prepare('INSERT INTO messages (id, roomId, sender, encryptedText, timestamp, type, ttl) VALUES (?, ?, ?, ?, ?, ?, ?)');
const getMessagesByRoom = db.prepare('SELECT * FROM messages WHERE roomId = ? ORDER BY timestamp ASC');
const deleteMessage = db.prepare('DELETE FROM messages WHERE id = ?');

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = createServer(app);
  
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
  });

  // Track users to prevent duplicate names
  // socket.id -> { roomId, username }
  const socketUsers = new Map<string, { roomId: string, username: string }>();
  // roomId -> array of usernames
  const roomUsers = new Map<string, string[]>();
  // roomId -> owner username
  const roomOwners = new Map<string, string>();
  // roomId -> settings
  const roomSettings = new Map<string, { isBroadcastOnly: boolean, burnOnExit: boolean }>();

  // API routes FIRST
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Socket.io logic
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_room', (data, callback) => {
      const { roomId, username, action } = data;
      
      const roomExists = roomOwners.has(roomId);

      if (action === 'create' && roomExists) {
        if (callback) callback({ success: false, error: 'Sector already exists. Please join it or choose a different Sector ID.' });
        return;
      }

      if (action === 'join' && !roomExists) {
        if (callback) callback({ success: false, error: 'Sector does not exist. Please create it first.' });
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
        isOwner = true;
      }

      console.log(`User ${username} (${socket.id}) joined room ${roomId}. Owner: ${isOwner}`);

      // Broadcast active users
      io.to(roomId).emit('active_users', usersInRoom);

      // Send settings
      socket.emit('settings_updated', roomSettings.get(roomId));

      // Send message history
      const history = getMessagesByRoom.all(roomId);
      socket.emit('message_history', history);

      if (callback) callback({ success: true, isOwner });
    });

    socket.on('send_message', (data) => {
      const settings = roomSettings.get(data.roomId);
      const owner = roomOwners.get(data.roomId);
      
      // Enforce broadcast only
      if (settings?.isBroadcastOnly && data.sender !== owner) {
        return;
      }

      // Save to db
      try {
        insertMessage.run(data.id, data.roomId, data.sender, data.encryptedText, data.timestamp, data.type || 'text', data.ttl || 0);
      } catch (err) {
        console.error('Failed to save message:', err);
      }

      // Broadcast to everyone in the room except the sender
      socket.to(data.roomId).emit('receive_message', data);

      // Handle TTL
      if (data.ttl && data.ttl > 0) {
        setTimeout(() => {
          try {
            deleteMessage.run(data.id);
            io.to(data.roomId).emit('message_expired', data.id);
          } catch (err) {
            console.error('Failed to delete expired message:', err);
          }
        }, data.ttl * 1000);
      }
    });

    socket.on('typing', (data) => {
      socket.to(data.roomId).emit('user_typing', { username: data.username, isTyping: data.isTyping });
    });

    socket.on('update_settings', (data) => {
      if (roomOwners.get(data.roomId) === data.username) {
        roomSettings.set(data.roomId, data.settings);
        io.to(data.roomId).emit('settings_updated', data.settings);
      }
    });

    socket.on('panic_room', (data) => {
      const { roomId, username } = data;
      if (roomOwners.get(roomId) === username) {
        try {
          db.prepare('DELETE FROM messages WHERE roomId = ?').run(roomId);
          io.to(roomId).emit('room_panicked');
          console.log(`Room ${roomId} panicked by ${username}. All messages deleted.`);
        } catch (err) {
          console.error('Failed to panic room:', err);
        }
      }
    });

    socket.on('kick_user', (data) => {
      const { roomId, username, targetUser } = data;
      if (roomOwners.get(roomId) === username) {
        // Find the socket id of the target user
        for (const [sid, user] of socketUsers.entries()) {
          if (user.roomId === roomId && user.username === targetUser) {
            io.to(sid).emit('kicked_from_room');
            io.sockets.sockets.get(sid)?.disconnect();
            break;
          }
        }
      }
    });

    socket.on('rekey_room', (data) => {
      const { roomId, username } = data;
      if (roomOwners.get(roomId) === username) {
        // Optional: delete all old messages since they are encrypted with the old key
        try {
          db.prepare('DELETE FROM messages WHERE roomId = ?').run(roomId);
        } catch (err) {
          console.error('Failed to clear messages on rekey:', err);
        }
        
        // Broadcast to everyone EXCEPT the owner who initiated it
        socket.to(roomId).emit('rekey_required');
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      const user = socketUsers.get(socket.id);
      if (user) {
        const { roomId, username } = user;
        const owner = roomOwners.get(roomId);
        const settings = roomSettings.get(roomId);

        if (owner === username && settings?.burnOnExit) {
          try {
            db.prepare('DELETE FROM messages WHERE roomId = ?').run(roomId);
            io.to(roomId).emit('room_panicked');
            roomUsers.delete(roomId);
            roomOwners.delete(roomId);
            roomSettings.delete(roomId);
            console.log(`Room ${roomId} burned on exit by ${username}.`);
          } catch (err) {
            console.error('Failed to burn room on exit:', err);
          }
        } else {
          let usersInRoom = roomUsers.get(roomId);
          if (usersInRoom) {
            usersInRoom = usersInRoom.filter(u => u !== username);
            if (usersInRoom.length === 0) {
              roomUsers.delete(roomId);
              roomOwners.delete(roomId);
              roomSettings.delete(roomId);
            } else {
              roomUsers.set(roomId, usersInRoom);
              // Reassign owner if the owner left
              if (owner === username) {
                roomOwners.set(roomId, usersInRoom[0]);
                io.to(roomId).emit('owner_changed', usersInRoom[0]);
              }
            }
            io.to(roomId).emit('active_users', usersInRoom);
          }
        }
        socketUsers.delete(socket.id);
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
