import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Message, UserSession } from './types';
import { deriveKey, encryptMessage, decryptMessage, getFingerprint } from './utils/crypto';
import { getOrCreateIdentity, signJoinProof } from './utils/identity';
import { Lock, Send, User, Key, Hash, Shield, MessageSquare, LogOut, ShieldAlert, Trash2, AlertTriangle, ChevronRight, Users, Crown, AlertOctagon, Terminal, Clock, Camera, Mic, Settings, EyeOff, Radio, Volume2, VolumeX } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

// Connect to the same host that served the page
const socket: Socket = io();

// Alphanumeric regex for username and room
const ALPHANUMERIC_REGEX = /^[a-zA-Z0-9]+$/;
// Regex for passphrase (allows alphanumeric + common symbols)
const PASSPHRASE_REGEX = /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/;
const SESSION_STORAGE_KEY = 'scuta.session.v1';

const INITIAL_DECOY_DATA = [
  ['Category', 'Q1 Actual', 'Q2 Actual', 'Q3 Projected', 'Q4 Projected', 'YTD', 'Status'],
  ['Revenue', '$124,500', '$132,000', '$145,000', '$150,000', '$256,500', 'On Track'],
  ['COGS', '$45,000', '$48,200', '$52,000', '$54,000', '$93,200', 'Warning'],
  ['Gross Margin', '$79,500', '$83,800', '$93,000', '$96,000', '$163,300', 'Good'],
  ['', '', '', '', '', '', ''],
  ['Operating Expenses', '', '', '', '', '', ''],
  ['Marketing', '$12,000', '$15,000', '$18,000', '$20,000', '$27,000', 'Over Budget'],
  ['R&D', '$25,000', '$25,000', '$28,000', '$30,000', '$50,000', 'On Track'],
  ['G&A', '$15,000', '$15,500', '$16,000', '$16,500', '$30,500', 'On Track'],
  ['Total Opex', '$52,000', '$55,500', '$62,000', '$66,500', '$107,500', ''],
  ['', '', '', '', '', '', ''],
  ['Net Income', '$27,500', '$28,300', '$31,000', '$29,500', '$55,800', 'Good'],
  ['', '', '', '', '', '', ''],
  ['', '', '', '', '', '', ''],
  ['', '', '', '', '', '', ''],
  ['', '', '', '', '', '', ''],
  ['', '', '', '', '', '', ''],
  ['', '', '', '', '', '', ''],
  ['', '', '', '', '', '', ''],
  ['', '', '', '', '', '', ''],
];

export default function App() {
  const [session, setSession] = useState<UserSession | null>(null);
  
  // Login State
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [authMode, setAuthMode] = useState<'create' | 'join'>('join');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [usernameError, setUsernameError] = useState(false);
  const [roomIdError, setRoomIdError] = useState(false);
  const [passphraseError, setPassphraseError] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [showUsers, setShowUsers] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [unlockPassphrase, setUnlockPassphrase] = useState('');
  const [isDecoyMode, setIsDecoyMode] = useState(false);
  const [decoyData, setDecoyData] = useState(INITIAL_DECOY_DATA);
  const [activeCell, setActiveCell] = useState<{r: number, c: number} | null>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isTyping, setIsTyping] = useState(false);
  const [ttl, setTtl] = useState<number>(0);
  const [fingerprint, setFingerprint] = useState<string>('');
  const [roomSettings, setRoomSettings] = useState({ isBroadcastOnly: false, burnOnExit: false });
  const [showSettings, setShowSettings] = useState(false);
  const [showRekeyModal, setShowRekeyModal] = useState(false);
  const [newPassphrase, setNewPassphrase] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const playTacticalBeep = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.05);
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (e) {
      // ignore
    }
  };

  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; size: number; duration: number; delay: number }[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    actionLabel: string;
    onConfirm: () => void;
  } | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<UserSession | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };


  const getSessionStorageId = (username: string, roomId: string) => `${SESSION_STORAGE_KEY}:${username}:${roomId}`;

  const saveSessionSnapshot = (snapshot: { username: string; roomId: string; passphrase: string }) => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
  };

  const clearSessionSnapshot = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  };

  const mergeMessagesById = (left: Message[], right: Message[]) => {
    const merged = new Map<string, Message>();
    [...left, ...right].forEach((msg) => {
      merged.set(msg.id, msg);
    });
    return Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp);
  };

  const persistRoomMessages = (activeSession: UserSession, nextMessages: Message[]) => {
    const key = getSessionStorageId(activeSession.username, activeSession.roomId);
    localStorage.setItem(key, JSON.stringify(nextMessages.slice(-400)));
  };

  const appendSystemLog = (content: string) => {
    setMessages((prev) => {
      const next = [...prev, {
        id: `system-${crypto.randomUUID()}`,
        sender: 'SYSTEM',
        text: content,
        timestamp: Date.now(),
        type: 'text',
      }];
      return next;
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      });
    };

    if (showWelcome) {
      window.addEventListener('mousemove', handleMouseMove);
      
      // Initialize particles
      const newParticles = Array.from({ length: 30 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 3 + 1,
        duration: Math.random() * 20 + 10,
        delay: Math.random() * 5,
      }));
      setParticles(newParticles);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [showWelcome]);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timeout);
      if (session && !isLocked && !isDecoyMode) {
        timeout = setTimeout(() => setIsLocked(true), 17 * 60 * 1000); // 17 mins
      }
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    resetTimer();

    return () => {
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      clearTimeout(timeout);
    };
  }, [session, isLocked, isDecoyMode]);

  useEffect(() => {
    let lastEsc = 0;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const now = Date.now();
        if (now - lastEsc < 500) {
          setIsDecoyMode(prev => !prev);
        }
        lastEsc = now;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isDecoyMode) return;
    
    const handleDecoyKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return; // Handled by the other listener
      
      // If we are editing a cell, let the input handle it
      if (e.target instanceof HTMLInputElement) return;

      // Otherwise, simulate work
      setDecoyData(prev => {
        const newData = [...prev.map(row => [...row])];
        
        // Randomly decide what to do
        const action = Math.random();
        
        if (action < 0.3) {
          // Change a random number in Q1-Q4 columns (1 to 4) for a random populated row
          const populatedRows = newData.map((r, i) => ({r, i})).filter(x => x.r[0] && x.i > 0 && x.r[1]);
          if (populatedRows.length > 0) {
            const randomRow = populatedRows[Math.floor(Math.random() * populatedRows.length)];
            const randomCol = Math.floor(Math.random() * 4) + 1;
            const currentVal = parseInt(randomRow.r[randomCol].replace(/[^0-9]/g, '')) || 10000;
            const newVal = currentVal + (Math.floor(Math.random() * 2000) - 1000);
            newData[randomRow.i][randomCol] = `$${newVal.toLocaleString()}`;
          }
        } else if (action < 0.6) {
          // Add a new category in the first empty row
          const emptyRowIndex = newData.findIndex(r => !r[0]);
          if (emptyRowIndex !== -1) {
            const categories = ['Logistics', 'Contractors', 'Software', 'Hardware', 'Travel', 'Legal', 'Consulting'];
            newData[emptyRowIndex][0] = categories[Math.floor(Math.random() * categories.length)];
            newData[emptyRowIndex][1] = `$${(Math.floor(Math.random() * 50) + 10) * 1000}`;
            newData[emptyRowIndex][6] = 'Pending';
          }
        } else {
          // Update a status
          const populatedRows = newData.map((r, i) => ({r, i})).filter(x => x.r[0] && x.i > 0);
          if (populatedRows.length > 0) {
            const randomRow = populatedRows[Math.floor(Math.random() * populatedRows.length)];
            const statuses = ['On Track', 'Warning', 'Good', 'Over Budget', 'Review'];
            newData[randomRow.i][6] = statuses[Math.floor(Math.random() * statuses.length)];
          }
        }
        
        return newData;
      });
    };
    
    window.addEventListener('keydown', handleDecoyKeydown);
    return () => window.removeEventListener('keydown', handleDecoyKeydown);
  }, [isDecoyMode]);

  const handleCellChange = (r: number, c: number, value: string) => {
    setDecoyData(prev => {
      const newData = [...prev.map(row => [...row])];
      newData[r][c] = value;
      return newData;
    });
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setMessages(prev => {
        const now = Date.now();
        const filtered = prev.filter(m => !m.expiresAt || m.expiresAt > now);
        if (filtered.length !== prev.length) return filtered;
        return prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);


  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    let cancelled = false;

    const loadPersistedSession = async () => {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!stored || sessionRef.current) return;

      try {
        const parsed = JSON.parse(stored) as { username: string; roomId: string; passphrase: string };
        if (!parsed.username || !parsed.roomId || !parsed.passphrase) return;

        const key = await deriveKey(parsed.passphrase, parsed.roomId);
        if (cancelled) return;

        setUsername(parsed.username);
        setRoomId(parsed.roomId);
        setPassphrase(parsed.passphrase);
        setSession({
          username: parsed.username,
          roomId: parsed.roomId,
          passphraseKey: key,
          isOwner: false,
        });
        getFingerprint(key).then(setFingerprint);
        setShowWelcome(false);
      } catch (err) {
        console.error('Failed to restore persisted session', err);
        clearSessionSnapshot();
      }
    };

    const joinWithIdentity = async (activeSession: UserSession, action: 'join' | 'create' = 'join') => {
      const identity = await getOrCreateIdentity();
      const timestamp = Date.now();
      const nonce = crypto.randomUUID();
      const proof = await signJoinProof(identity, activeSession.roomId, activeSession.username, timestamp, nonce);

      socket.emit('join_room', {
        roomId: activeSession.roomId,
        username: activeSession.username,
        action,
        identity: {
          deviceId: identity.deviceId,
          publicKeyJwk: identity.publicKeyJwk,
          timestamp,
          nonce,
          proof,
        },
      }, (response: any) => {
        if (response && !response.success) {
          setJoinError(response.error || 'Failed to join room.');
          return;
        }

        setSession((prev) => prev ? { ...prev, isOwner: Boolean(response?.isOwner), devicePseudonym: response?.pseudonym } : prev);
      });
    };

    const handleConnect = () => {
      setIsConnected(true);
      const active = sessionRef.current;
      if (active) {
        joinWithIdentity(active, 'join').catch((err) => console.error('Rejoin failed:', err));
      }
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleReceiveMessage = async (data: any) => {
      const active = sessionRef.current;
      if (!active || data.roomId !== active.roomId) return;

      try {
        const decryptedText = await decryptMessage(data.encryptedText, active.passphraseKey);
        const incomingTtl = typeof data.ttl === 'number' && data.ttl > 0 ? data.ttl : undefined;
        const newMsg: Message = {
          id: data.id,
          sender: data.sender,
          text: decryptedText,
          timestamp: data.timestamp,
          ttl: incomingTtl,
          expiresAt: incomingTtl ? data.timestamp + incomingTtl * 1000 : undefined,
        };

        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          if (soundEnabledRef.current && data.sender !== active.username) {
            playTacticalBeep();
          }
          const next = [...prev, newMsg];
          persistRoomMessages(active, next);
          return next;
        });
      } catch (err) {
        console.error('Failed to decrypt message:', err);
      }
    };

    const handleMessageHistory = async (history: any[]) => {
      const active = sessionRef.current;
      if (!active) return;

      const decryptedMessages: Message[] = [];
      for (const data of history) {
        try {
          const decryptedText = await decryptMessage(data.encryptedText, active.passphraseKey);
          const historyTtl = typeof data.ttl === 'number' && data.ttl > 0 ? data.ttl : undefined;
          decryptedMessages.push({
            id: data.id,
            sender: data.sender,
            text: decryptedText,
            timestamp: data.timestamp,
            ttl: historyTtl,
            expiresAt: historyTtl ? data.timestamp + historyTtl * 1000 : undefined,
          });
        } catch (err) {
          console.error('Failed to decrypt history message:', err);
        }
      }

      setMessages((prev) => {
        const merged = mergeMessagesById(prev, decryptedMessages);
        persistRoomMessages(active, merged);
        return merged;
      });
    };

    const handleActiveUsers = (users: string[]) => {
      const active = sessionRef.current;
      if (!active) {
        setActiveUsers(users);
        return;
      }
      const deduped = Array.from(new Set(users));
      const sorted = deduped.sort((a, b) => {
        if (a === active.username) return -1;
        if (b === active.username) return 1;
        return a.localeCompare(b);
      });
      setActiveUsers(sorted);
    };

    const handleRoomPanicked = () => {
      setMessages([]);
      setConfirmDialog({
        isOpen: true,
        title: 'GLOBAL PURGE INITIATED',
        message: 'All messages have been irreversibly deleted from the server by the Sector Admin.',
        actionLabel: 'ACKNOWLEDGE',
        onConfirm: () => setConfirmDialog(null)
      });
    };

    const handleOwnerChanged = (newOwner: string) => {
      setSession(prev => prev ? { ...prev, isOwner: prev.username === newOwner } : null);
    };

    const handleUserTyping = (data: { pseudonym?: string, username?: string, isTyping: boolean }) => {
      const label = data.username || data.pseudonym || 'unknown';
      setTypingUsers(prev => {
        const next = new Set(prev);
        if (data.isTyping) next.add(label);
        else next.delete(label);
        return next;
      });
    };

    const handleSectorEvent = (event: { message?: string }) => {
      if (!event?.message) return;
      appendSystemLog(event.message);
    };

    const handleSettingsUpdated = (settings: any) => {
      setRoomSettings(settings);
    };

    const handleMessageExpired = (id: string) => {
      setMessages(prev => prev.filter(m => m.id !== id));
    };

    const handleKicked = () => {
      setSession(null);
      setMessages([]);
      clearSessionSnapshot();
      alert('You have been kicked from the sector by the admin.');
    };

    const handleRekeyRequired = () => {
      setSession(null);
      setMessages([]);
      clearSessionSnapshot();
      alert('The sector has been re-keyed by the admin. You must rejoin with the new passphrase.');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('receive_message', handleReceiveMessage);
    socket.on('message_history', handleMessageHistory);
    socket.on('active_users', handleActiveUsers);
    socket.on('room_panicked', handleRoomPanicked);
    socket.on('owner_changed', handleOwnerChanged);
    socket.on('user_typing', handleUserTyping);
    socket.on('sector_event', handleSectorEvent);
    socket.on('settings_updated', handleSettingsUpdated);
    socket.on('message_expired', handleMessageExpired);
    socket.on('kicked_from_room', handleKicked);
    socket.on('rekey_required', handleRekeyRequired);

    loadPersistedSession().catch((err) => console.error('Persistence bootstrap failed:', err));

    return () => {
      cancelled = true;
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('receive_message', handleReceiveMessage);
      socket.off('message_history', handleMessageHistory);
      socket.off('active_users', handleActiveUsers);
      socket.off('room_panicked', handleRoomPanicked);
      socket.off('owner_changed', handleOwnerChanged);
      socket.off('user_typing', handleUserTyping);
      socket.off('sector_event', handleSectorEvent);
      socket.off('settings_updated', handleSettingsUpdated);
      socket.off('message_expired', handleMessageExpired);
      socket.off('kicked_from_room', handleKicked);
      socket.off('rekey_required', handleRekeyRequired);
    };
  }, []);

  useEffect(() => {
    if (!session) return;

    const key = getSessionStorageId(session.username, session.roomId);
    const cached = localStorage.getItem(key);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Message[];
        setMessages((prev) => mergeMessagesById(prev, parsed));
      } catch {
        // ignore cache parse issues
      }
    }

    saveSessionSnapshot({ username: session.username, roomId: session.roomId, passphrase });
  }, [session, passphrase]);

  useEffect(() => {
    const active = sessionRef.current;
    if (!active) return;
    persistRoomMessages(active, messages);
  }, [messages]);

  const validateAlphanumeric = (str: string) => {
    return ALPHANUMERIC_REGEX.test(str);
  };

  const validatePassphrase = (str: string) => {
    return PASSPHRASE_REGEX.test(str);
  };

  const calculateStrength = (pass: string) => {
    let score = 0;
    if (!pass) return 0;
    if (pass.length >= 8) score += 1;
    if (pass.length >= 12) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return Math.min(5, score);
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || validateAlphanumeric(val)) {
      setUsername(val);
      setUsernameError(false);
    } else {
      setUsernameError(true);
      setTimeout(() => setUsernameError(false), 1500);
    }
  };

  const handleRoomIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || validateAlphanumeric(val)) {
      setRoomId(val);
      setRoomIdError(false);
    } else {
      setRoomIdError(true);
      setTimeout(() => setRoomIdError(false), 1500);
    }
  };

  const handlePassphraseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || validatePassphrase(val)) {
      setPassphrase(val);
      setPassphraseError(false);
    } else {
      setPassphraseError(true);
      setTimeout(() => setPassphraseError(false), 1500);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError('');

    if (!username.trim() || !roomId.trim() || !passphrase.trim()) {
      setJoinError('All fields are required.');
      return;
    }

    if (!validateAlphanumeric(username) || !validateAlphanumeric(roomId)) {
      setJoinError('Username and Room ID must be alphanumeric only.');
      return;
    }

    if (!validatePassphrase(passphrase)) {
      setJoinError('Passphrase contains invalid characters.');
      return;
    }

    setIsJoining(true);
    try {
      const trimmedRoom = roomId.trim();
      const trimmedUser = username.trim();
      const key = await deriveKey(passphrase, trimmedRoom);
      const identity = await getOrCreateIdentity();
      const timestamp = Date.now();
      const nonce = crypto.randomUUID();
      const proof = await signJoinProof(identity, trimmedRoom, trimmedUser, timestamp, nonce);

      socket.emit('join_room', {
        roomId: trimmedRoom,
        username: trimmedUser,
        action: authMode,
        identity: {
          deviceId: identity.deviceId,
          publicKeyJwk: identity.publicKeyJwk,
          timestamp,
          nonce,
          proof,
        },
      }, (response: any) => {
        if (response && !response.success) {
          setJoinError(response.error || 'Failed to join room.');
          setIsJoining(false);
        } else {
          setSession({
            username: trimmedUser,
            roomId: trimmedRoom,
            passphraseKey: key,
            isOwner: response.isOwner,
            devicePseudonym: response?.pseudonym,
          });
          saveSessionSnapshot({ username: trimmedUser, roomId: trimmedRoom, passphrase });
          getFingerprint(key).then(setFingerprint);
            setShowWelcome(false);
          setIsJoining(false);
        }
      });
    } catch (err) {
      console.error('Failed to derive key:', err);
      setJoinError('Failed to initialize encryption.');
      setIsJoining(false);
    }
  };

  const sendMessage = async (content: string, type: 'text' | 'image' | 'audio' = 'text') => {
    if (!session) return;

    try {
      const encryptedText = await encryptMessage(content, session.passphraseKey);
      
      const msgData = {
        id: crypto.randomUUID(),
        roomId: session.roomId,
        sender: session.username,
        encryptedText,
        timestamp: Date.now(),
        type,
        ttl: ttl > 0 ? ttl : undefined,
      };

      const localMsg: Message = {
        id: msgData.id,
        sender: session.username,
        text: content,
        timestamp: msgData.timestamp,
        type,
        ttl: ttl > 0 ? ttl : undefined,
        expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : undefined,
      };
      setMessages((prev) => [...prev, localMsg]);

      socket.emit('send_message', msgData);
    } catch (err) {
      console.error('Failed to encrypt message:', err);
      setConfirmDialog({
        isOpen: true,
        title: 'ENCRYPTION FAILURE',
        message: 'Failed to encrypt message. It was not sent.',
        actionLabel: 'ACKNOWLEDGE',
        onConfirm: () => setConfirmDialog(null)
      });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !session) return;

    const textToSend = newMessage.trim();
    setNewMessage('');
    if (isTyping) {
      setIsTyping(false);
      socket.emit('typing', { roomId: session.roomId, isTyping: false });
    }

    await sendMessage(textToSend, 'text');
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (!isTyping && session) {
      setIsTyping(true);
      socket.emit('typing', { roomId: session.roomId, isTyping: true });
      setTimeout(() => {
        setIsTyping(false);
        socket.emit('typing', { roomId: session.roomId, isTyping: false });
      }, 2000);
    }
  };

  const handleLeave = () => {
    clearSessionSnapshot();
    if (session) {
      localStorage.removeItem(getSessionStorageId(session.username, session.roomId));
    }
    setSession(null);
    setMessages([]);
    setUsername('');
    setRoomId('');
    setPassphrase('');
    setActiveUsers([]);
    setShowUsers(false);
    setShowAdmin(false);
    setIsDecoyMode(false);
    setDecoyData(INITIAL_DECOY_DATA);
    // Reconnect socket to clear server state
    socket.disconnect();
    socket.connect();
  };

  const handleEmergencyDelete = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'LOCAL PURGE',
      message: 'Are you sure you want to delete all messages from your device? This will not delete them for others.',
      actionLabel: 'PURGE LOCALLY',
      onConfirm: () => {
        setMessages([]);
        setConfirmDialog(null);
      }
    });
  };

  const handleGlobalPanic = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'GLOBAL PURGE (PANIC)',
      message: 'Are you sure you want to irreversibly delete all messages in this sector from the server? This will wipe the chat for everyone.',
      actionLabel: 'GLOBAL PURGE',
      onConfirm: () => {
        socket.emit('panic_room', { roomId: session?.roomId, username: session?.username });
        setShowAdmin(false);
        setConfirmDialog(null);
      }
    });
  };

  const handleKickUser = (targetUser: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'KICK PERSONNEL',
      message: `Are you sure you want to kick ${targetUser} from the sector?`,
      actionLabel: 'KICK',
      onConfirm: () => {
        socket.emit('kick_user', { roomId: session?.roomId, username: session?.username, targetUser });
        setConfirmDialog(null);
      }
    });
  };

  const handleRekey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !newPassphrase) return;

    try {
      const newKey = await deriveKey(newPassphrase, session.roomId);
      setSession({ ...session, passphraseKey: newKey });
      socket.emit('rekey_room', { roomId: session.roomId, username: session.username });
      setShowRekeyModal(false);
      setNewPassphrase('');
      setMessages([]); // Clear local messages as they are encrypted with the old key
      alert('Sector successfully re-keyed. All other personnel have been disconnected and must rejoin with the new passphrase.');
    } catch (err) {
      console.error('Failed to rekey:', err);
      alert('Failed to re-key sector.');
    }
  };

  if (showWelcome) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 font-sans text-zinc-100 relative overflow-hidden">
        {/* Animated Grid Background */}
        <div className="absolute inset-0 z-0 opacity-20"
             style={{
               backgroundImage: `linear-gradient(to right, #18181b 1px, transparent 1px), linear-gradient(to bottom, #18181b 1px, transparent 1px)`,
               backgroundSize: '40px 40px',
               transform: `translate(${mousePosition.x * 0.5}px, ${mousePosition.y * 0.5}px)`
             }}
        />

        {/* Floating Particles */}
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          {particles.map((particle) => (
            <motion.div
              key={particle.id}
              className="absolute bg-emerald-500/30 rounded-full"
              style={{
                left: `${particle.x}%`,
                top: `${particle.y}%`,
                width: particle.size,
                height: particle.size,
              }}
              animate={{
                y: [0, -100, 0],
                x: [0, Math.random() * 50 - 25, 0],
                opacity: [0, 0.5, 0],
              }}
              transition={{
                duration: particle.duration,
                repeat: Infinity,
                delay: particle.delay,
                ease: "linear",
              }}
            />
          ))}
        </div>

        {/* Background effects */}
        <motion.div 
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.15, 0.25, 0.15],
            x: mousePosition.x * -1,
            y: mousePosition.y * -1,
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-900/30 rounded-full blur-[120px] pointer-events-none" 
        />
        <motion.div 
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.1, 0.2, 0.1],
            x: mousePosition.x * 1.5,
            y: mousePosition.y * 1.5,
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }}
          className="absolute top-1/4 right-1/4 w-[600px] h-[600px] bg-zinc-800/40 rounded-full blur-[100px] pointer-events-none" 
        />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{
            transform: `translate(${mousePosition.x * 0.2}px, ${mousePosition.y * 0.2}px)`
          }}
          className="max-w-2xl w-full text-center z-10"
        >
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8, ease: "easeOut" }}
            className="flex justify-center mb-8"
          >
            <div className="relative group">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 bg-emerald-500 blur-2xl opacity-20 rounded-full group-hover:opacity-40 transition-opacity duration-700" 
              />
              <Shield className="w-24 h-24 text-emerald-500 relative z-10 drop-shadow-[0_0_15px_rgba(212,170,125,0.5)] group-hover:scale-110 transition-transform duration-500" strokeWidth={1.5} />
            </div>
          </motion.div>
          <h1 className="text-6xl sm:text-8xl font-bold tracking-tighter mb-6 text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-500 drop-shadow-2xl">
            SCUTA
          </h1>
          <p className="text-2xl sm:text-3xl text-zinc-200 mb-2 font-semibold tracking-wide drop-shadow-md">
            Impenetrable Messaging.
          </p>
          <p className="text-lg sm:text-xl text-zinc-400 mb-8 font-light tracking-wide">
            Comms encrypted with military-grade obfuscation.
          </p>
          
          <div className="grid sm:grid-cols-3 gap-6 mb-12 text-left">
            <motion.div 
              whileHover={{ y: -5, scale: 1.02 }}
              className="bg-zinc-900/50 border border-zinc-800/50 p-6 rounded-2xl backdrop-blur-sm shadow-xl hover:border-emerald-500/30 transition-colors"
            >
              <Lock className="w-6 h-6 text-emerald-500 mb-4" />
              <h3 className="font-semibold mb-2">Zero Knowledge</h3>
              <p className="text-sm text-zinc-500">End-to-end AES-GCM encryption. Keys never leave your device.</p>
            </motion.div>
            <motion.div 
              whileHover={{ y: -5, scale: 1.02 }}
              className="bg-zinc-900/50 border border-zinc-800/50 p-6 rounded-2xl backdrop-blur-sm shadow-xl hover:border-emerald-500/30 transition-colors"
            >
              <ShieldAlert className="w-6 h-6 text-emerald-500 mb-4" />
              <h3 className="font-semibold mb-2">Untraceable</h3>
              <p className="text-sm text-zinc-500">No personal data required. Ephemeral identities per room.</p>
            </motion.div>
            <motion.div 
              whileHover={{ y: -5, scale: 1.02 }}
              className="bg-zinc-900/50 border border-zinc-800/50 p-6 rounded-2xl backdrop-blur-sm shadow-xl hover:border-emerald-500/30 transition-colors"
            >
              <MessageSquare className="w-6 h-6 text-emerald-500 mb-4" />
              <h3 className="font-semibold mb-2">Persistent</h3>
              <p className="text-sm text-zinc-500">Encrypted payloads remain available for room members.</p>
            </motion.div>
          </div>

          <button
            onClick={() => setShowWelcome(false)}
            className="group relative inline-flex items-center justify-center px-8 py-4 text-sm font-semibold text-black bg-emerald-500 rounded-full hover:bg-emerald-400 transition-all hover:scale-105 active:scale-95 overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
            <span className="relative z-10 flex items-center">
              INITIALIZE CONNECTION
              <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </span>
          </button>
        </motion.div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-sans text-zinc-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden relative z-10"
        >
          <div className="p-8">
            <div className="flex items-center justify-center mb-6">
              <Shield className="w-10 h-10 text-emerald-500 mr-3" />
              <h1 className="text-3xl font-bold tracking-tight">SCUTA</h1>
            </div>

            <div className="flex bg-zinc-950 p-1 rounded-xl mb-6">
              <button
                type="button"
                onClick={() => { setAuthMode('join'); setJoinError(''); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${authMode === 'join' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Join Sector
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('create'); setJoinError(''); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${authMode === 'create' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                Create Sector
              </button>
            </div>

            {joinError && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start">
                <AlertTriangle className="w-5 h-5 text-red-500 mr-3 shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{joinError}</p>
              </div>
            )}

            <form onSubmit={handleJoin} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">Callsign (Username)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User className={`h-5 w-5 ${usernameError ? 'text-red-500' : 'text-zinc-600'} transition-colors`} />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={handleUsernameChange}
                    className={`block w-full pl-12 pr-4 py-3.5 bg-zinc-950/50 border rounded-xl text-zinc-100 placeholder-zinc-700 focus:outline-none focus:ring-2 transition-all ${
                      usernameError 
                        ? 'border-red-500 focus:ring-red-500/50 focus:border-red-500' 
                        : 'border-zinc-800 focus:ring-emerald-500/50 focus:border-emerald-500'
                    }`}
                    placeholder="Ghost01"
                  />
                </div>
                {usernameError && <p className="text-xs text-red-500 mt-1.5 ml-1">Alphanumeric only. No spaces or symbols.</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">Sector (Room ID)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Hash className={`h-5 w-5 ${roomIdError ? 'text-red-500' : 'text-zinc-600'} transition-colors`} />
                  </div>
                  <input
                    type="text"
                    required
                    value={roomId}
                    onChange={handleRoomIdChange}
                    className={`block w-full pl-12 pr-4 py-3.5 bg-zinc-950/50 border rounded-xl text-zinc-100 placeholder-zinc-700 focus:outline-none focus:ring-2 transition-all ${
                      roomIdError 
                        ? 'border-red-500 focus:ring-red-500/50 focus:border-red-500' 
                        : 'border-zinc-800 focus:ring-emerald-500/50 focus:border-emerald-500'
                    }`}
                    placeholder="AlphaBase"
                  />
                </div>
                {roomIdError && <p className="text-xs text-red-500 mt-1.5 ml-1">Alphanumeric only. No spaces or symbols.</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">Decryption Key</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Key className={`h-5 w-5 ${passphraseError ? 'text-red-500' : 'text-zinc-600'} transition-colors`} />
                  </div>
                  <input
                    type="password"
                    required
                    value={passphrase}
                    onChange={handlePassphraseChange}
                    className={`block w-full pl-12 pr-4 py-3.5 bg-zinc-950/50 border rounded-xl text-zinc-100 placeholder-zinc-700 focus:outline-none focus:ring-2 transition-all ${
                      passphraseError 
                        ? 'border-red-500 focus:ring-red-500/50 focus:border-red-500' 
                        : 'border-zinc-800 focus:ring-emerald-500/50 focus:border-emerald-500'
                    }`}
                    placeholder="SuperSecretKey123!@#"
                  />
                </div>
                {passphraseError && <p className="text-xs text-red-500 mt-1.5 ml-1 font-medium">Invalid character. Only alphanumeric and standard symbols (!@#$...) are allowed. No spaces or emojis.</p>}
                
                {authMode === 'create' && passphrase && (
                  <div className="mt-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Key Strength</span>
                      <span className={`text-[10px] uppercase tracking-wider font-bold ${
                        calculateStrength(passphrase) < 2 ? 'text-red-500' :
                        calculateStrength(passphrase) < 4 ? 'text-amber-500' :
                        'text-emerald-500'
                      }`}>
                        {calculateStrength(passphrase) < 2 ? 'Weak' :
                         calculateStrength(passphrase) < 4 ? 'Medium' :
                         'Strong'}
                      </span>
                    </div>
                    <div className="flex gap-1 h-1.5">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <div
                          key={level}
                          className={`flex-1 rounded-full transition-colors ${
                            calculateStrength(passphrase) >= level
                              ? calculateStrength(passphrase) < 2
                                ? 'bg-red-500'
                                : calculateStrength(passphrase) < 4
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                              : 'bg-zinc-800'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <p className="mt-3 text-xs text-zinc-500 flex items-center">
                  <Lock className="w-3.5 h-3.5 mr-1.5" />
                  Alphanumeric and standard symbols allowed. Must match peers exactly.
                </p>
              </div>

              <button
                type="submit"
                disabled={isJoining || !isConnected || (authMode === 'create' && calculateStrength(passphrase) < 2)}
                className="w-full flex items-center justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold tracking-wide text-zinc-950 bg-emerald-500 hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-8"
              >
                {isJoining ? 'ESTABLISHING SECURE LINK...' : !isConnected ? 'AWAITING NETWORK...' : authMode === 'create' ? 'INITIALIZE SECTOR' : 'CONNECT TO SECTOR'}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 font-sans text-zinc-100 relative overflow-hidden">
        <div className="absolute inset-0 backdrop-blur-3xl bg-black/90 z-0" />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="z-10 bg-zinc-900/80 border border-zinc-800 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl"
        >
          <Lock className="w-16 h-16 text-emerald-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-2 tracking-tight">SECTOR LOCKED</h2>
          <p className="text-sm text-zinc-400 mb-8">Inactivity detected. Enter decryption key to resume.</p>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            if (unlockPassphrase === passphrase) {
              setIsLocked(false);
              setUnlockPassphrase('');
            } else {
              setConfirmDialog({
                isOpen: true,
                title: 'ACCESS DENIED',
                message: 'Incorrect decryption key.',
                actionLabel: 'ACKNOWLEDGE',
                onConfirm: () => setConfirmDialog(null)
              });
            }
          }}>
            <input
              type="password"
              value={unlockPassphrase}
              onChange={(e) => setUnlockPassphrase(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 mb-4 text-center tracking-widest focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
              placeholder="DECRYPTION KEY"
              autoFocus
            />
            <button type="submit" className="w-full py-3 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400 transition-colors">
              UNLOCK
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  if (isDecoyMode) {
    return (
      <div className="min-h-screen bg-white text-gray-800 font-sans flex flex-col cursor-default select-none">
        {/* Header */}
        <div className="flex items-center px-4 py-2 border-b border-gray-200 bg-[#f9fbfd]">
          <div className="w-8 h-8 bg-green-600 rounded flex items-center justify-center text-white font-bold mr-3">
            <span className="text-sm">S</span>
          </div>
          <div>
            <h1 className="text-lg text-gray-700 leading-tight">Q3 Financial Projections</h1>
            <div className="flex space-x-3 text-sm text-gray-500 mt-0.5">
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">File</span>
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">Edit</span>
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">View</span>
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">Insert</span>
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">Format</span>
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">Data</span>
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">Tools</span>
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">Help</span>
            </div>
          </div>
        </div>
        
        {/* Toolbar */}
        <div className="flex items-center px-4 py-1.5 border-b border-gray-200 bg-[#edf2fa] space-x-4 text-gray-600">
          <div className="flex space-x-2">
            <span className="font-bold px-2 py-1 hover:bg-gray-200 rounded cursor-pointer">B</span>
            <span className="italic px-2 py-1 hover:bg-gray-200 rounded cursor-pointer">I</span>
            <span className="underline px-2 py-1 hover:bg-gray-200 rounded cursor-pointer">U</span>
          </div>
          <div className="w-px h-5 bg-gray-300"></div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-1 hover:bg-gray-200 rounded cursor-pointer">Arial</span>
            <span className="px-2 py-1 hover:bg-gray-200 rounded cursor-pointer">10</span>
          </div>
          <div className="w-px h-5 bg-gray-300"></div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-1 hover:bg-gray-200 rounded cursor-pointer">$</span>
            <span className="px-2 py-1 hover:bg-gray-200 rounded cursor-pointer">%</span>
            <span className="px-2 py-1 hover:bg-gray-200 rounded cursor-pointer">.00</span>
          </div>
        </div>

        {/* Formula Bar */}
        <div className="flex items-center px-4 py-1 border-b border-gray-200 bg-white text-sm">
          <span className="text-gray-400 font-serif italic mr-2">fx</span>
          <div className="flex-1 px-2 py-1 outline-none text-gray-700">
            =SUM(B2:B12)
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex bg-gray-50 border-b border-gray-300 text-xs text-gray-500 font-medium text-center">
            <div className="w-10 border-r border-gray-300 bg-gray-100 flex-shrink-0"></div>
            <div className="w-32 border-r border-gray-300 py-1">A</div>
            <div className="w-32 border-r border-gray-300 py-1">B</div>
            <div className="w-32 border-r border-gray-300 py-1">C</div>
            <div className="w-32 border-r border-gray-300 py-1">D</div>
            <div className="w-32 border-r border-gray-300 py-1">E</div>
            <div className="w-32 border-r border-gray-300 py-1">F</div>
            <div className="flex-1 border-r border-gray-300 py-1">G</div>
          </div>
          
          <div className="flex-1 overflow-auto bg-white">
            {decoyData.map((row, i) => (
              <div key={i} className="flex border-b border-gray-200 text-sm">
                <div className="w-10 border-r border-gray-300 bg-gray-50 text-gray-500 text-xs flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </div>
                {row.map((cell, j) => {
                  let cellColor = 'text-gray-800';
                  if (cell === 'Warning' || cell === 'Over Budget') cellColor = 'text-red-600';
                  if (cell === 'Good' || cell === 'On Track') cellColor = 'text-green-600';
                  
                  return (
                    <div 
                      key={j} 
                      className={`w-32 border-r border-gray-200 px-2 py-1 truncate ${i === 0 ? 'font-bold bg-gray-50' : ''} ${j === 0 && i !== 0 ? 'font-medium' : ''} ${cellColor} ${j === 6 ? 'flex-1' : ''} ${activeCell?.r === i && activeCell?.c === j ? 'ring-2 ring-blue-500 ring-inset bg-blue-50/30' : ''}`}
                      onClick={() => setActiveCell({r: i, c: j})}
                    >
                      {activeCell?.r === i && activeCell?.c === j ? (
                        <input 
                          autoFocus
                          className="w-full h-full outline-none bg-transparent text-gray-800"
                          value={cell}
                          onChange={(e) => handleCellChange(i, j, e.target.value)}
                          onBlur={() => setActiveCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') setActiveCell(null);
                          }}
                        />
                      ) : (
                        cell
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-auto pt-2 pb-2 px-4 border-t border-gray-300 text-xs text-gray-400 bg-gray-50">
          Press ESC twice to exit diagnostic mode.
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-zinc-950 flex flex-col font-sans text-zinc-100 overflow-hidden">
      {/* Modal */}
      <AnimatePresence>
        {showRekeyModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center text-amber-500 mb-4">
                <Key className="w-6 h-6 mr-2" />
                <h3 className="text-lg font-bold tracking-wide">RE-KEY SECTOR</h3>
              </div>
              <p className="text-zinc-300 mb-6 leading-relaxed text-sm">
                Enter a new passphrase to re-key this sector. All other personnel will be disconnected and must rejoin with the new passphrase. Current messages will be cleared.
              </p>
              <form onSubmit={handleRekey}>
                <input
                  type="password"
                  value={newPassphrase}
                  onChange={(e) => setNewPassphrase(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 mb-6 text-center tracking-widest focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all"
                  placeholder="NEW PASSPHRASE"
                  autoFocus
                  required
                />
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRekeyModal(false);
                      setNewPassphrase('');
                    }}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl text-sm font-bold bg-amber-500 text-black hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
                  >
                    RE-KEY
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {confirmDialog && confirmDialog.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-red-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center text-red-500 mb-4">
                <AlertTriangle className="w-6 h-6 mr-2" />
                <h3 className="text-lg font-bold tracking-wide">{confirmDialog.title}</h3>
              </div>
              <p className="text-zinc-300 mb-6 leading-relaxed">
                {confirmDialog.message}
              </p>
              <div className="flex justify-end space-x-3">
                {confirmDialog.actionLabel !== 'ACKNOWLEDGE' && (
                  <button
                    onClick={() => setConfirmDialog(null)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    CANCEL
                  </button>
                )}
                <button
                  onClick={confirmDialog.onConfirm}
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-400 transition-colors shadow-lg shadow-red-500/20"
                >
                  {confirmDialog.actionLabel}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
            <Shield className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight flex items-center">
              <span className="text-zinc-500 mr-1.5">Sector:</span>
              {session.roomId}
            </h2>
            <div className="flex items-center text-[10px] sm:text-xs text-zinc-400 mt-0.5 font-mono uppercase tracking-wider">
              <span className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(212,170,125,0.8)]' : 'bg-red-500'}`}></span>
              {isConnected ? 'SECURE LINK ACTIVE' : 'LINK OFFLINE'}
              {fingerprint && <span className="ml-4 text-emerald-500/70" title="Sector Fingerprint">FP: {fingerprint}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2 sm:space-x-4">
          <button
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              playTacticalBeep();
            }}
            className={`p-2 sm:px-3 sm:py-2 flex items-center rounded-xl transition-colors border ${soundEnabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 border-transparent hover:border-emerald-500/20'}`}
            title={soundEnabled ? "Mute Notifications" : "Enable Sound Notifications"}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          
          <div className="relative">
            <button
              onClick={() => setShowUsers(!showUsers)}
              className="flex items-center text-sm font-medium text-zinc-300 bg-zinc-950 px-3 py-2 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors"
            >
              <Users className="w-4 h-4 mr-2 text-zinc-500" />
              <span className="hidden sm:inline mr-1">Active:</span> {activeUsers.length}
            </button>
            
            <AnimatePresence>
              {showUsers && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50"
                >
                  <div className="p-2 border-b border-zinc-800 bg-zinc-950/50">
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Sector Personnel</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                    {activeUsers.map(user => (
                      <div key={user} className="flex items-center justify-between px-2 py-1.5 text-sm text-zinc-300 rounded-lg hover:bg-zinc-800/50 group">
                        <div className="flex items-center">
                          <User className="w-3.5 h-3.5 mr-2 text-zinc-500" />
                          {user} {user === session.username && <span className="ml-2 text-[10px] text-emerald-500 font-mono">YOU</span>}
                        </div>
                        {session.isOwner && user !== session.username && (
                          <button
                            onClick={() => handleKickUser(user)}
                            className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400 text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 transition-all"
                          >
                            Kick
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {session.isOwner && (
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 sm:px-3 sm:py-2 flex items-center rounded-xl transition-colors border ${showSettings ? 'bg-zinc-800 text-white border-zinc-700' : 'text-zinc-400 hover:text-white hover:bg-zinc-800 border-transparent hover:border-zinc-700'}`}
                title="Sector Settings"
              >
                <Settings className="w-5 h-5 sm:mr-2" />
                <span className="hidden sm:inline text-sm font-semibold">SETTINGS</span>
              </button>

              <AnimatePresence>
                {showSettings && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50"
                  >
                    <div className="p-3 border-b border-zinc-800 bg-zinc-950/50">
                      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center">
                        <Settings className="w-3.5 h-3.5 mr-1.5" /> Sector Settings
                      </p>
                    </div>
                    <div className="p-4 space-y-4">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm font-medium text-zinc-300">Broadcast Only</span>
                        <input 
                          type="checkbox" 
                          checked={roomSettings.isBroadcastOnly}
                          onChange={(e) => {
                            const newSettings = { ...roomSettings, isBroadcastOnly: e.target.checked };
                            setRoomSettings(newSettings);
                            socket.emit('update_settings', { roomId: session.roomId, username: session.username, settings: newSettings });
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 relative"></div>
                      </label>
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm font-medium text-zinc-300">Burn on Exit</span>
                        <input 
                          type="checkbox" 
                          checked={roomSettings.burnOnExit}
                          onChange={(e) => {
                            const newSettings = { ...roomSettings, burnOnExit: e.target.checked };
                            setRoomSettings(newSettings);
                            socket.emit('update_settings', { roomId: session.roomId, username: session.username, settings: newSettings });
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500 relative"></div>
                      </label>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {session.isOwner && (
            <div className="relative">
              <button
                onClick={() => setShowAdmin(!showAdmin)}
                className={`p-2 sm:px-3 sm:py-2 flex items-center rounded-xl transition-colors border ${showAdmin ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 border-transparent hover:border-amber-500/20'}`}
                title="Sector Admin"
              >
                <Crown className="w-5 h-5 sm:mr-2" />
                <span className="hidden sm:inline text-sm font-semibold">ADMIN</span>
              </button>

              <AnimatePresence>
                {showAdmin && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-64 bg-zinc-900 border border-red-900/50 rounded-xl shadow-2xl overflow-hidden z-50"
                  >
                    <div className="p-3 border-b border-zinc-800 bg-zinc-950/50">
                      <p className="text-xs font-semibold text-red-400 uppercase tracking-wider flex items-center">
                        <AlertOctagon className="w-3.5 h-3.5 mr-1.5" /> Danger Zone
                      </p>
                    </div>
                    <div className="p-2 space-y-2">
                      <button
                        onClick={() => {
                          setShowAdmin(false);
                          setShowRekeyModal(true);
                        }}
                        className="w-full flex items-center justify-center px-4 py-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 rounded-lg transition-colors text-sm font-bold tracking-wide"
                      >
                        <Key className="w-4 h-4 mr-2" />
                        RE-KEY SECTOR
                      </button>
                      <button
                        onClick={handleGlobalPanic}
                        className="w-full flex items-center justify-center px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-lg transition-colors text-sm font-bold tracking-wide"
                      >
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        GLOBAL PURGE (PANIC)
                      </button>
                      <p className="text-[10px] text-zinc-500 mt-2 text-center leading-tight">
                        Irreversibly deletes all messages from the server for everyone in this sector.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          
          <button
            onClick={handleEmergencyDelete}
            className="p-2 sm:px-3 sm:py-2 flex items-center text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors border border-transparent hover:border-red-500/20"
            title="Local Purge"
          >
            <Trash2 className="w-5 h-5 sm:mr-2" />
            <span className="hidden sm:inline text-sm font-semibold">LOCAL PURGE</span>
          </button>

          <button
            onClick={handleLeave}
            className="p-2 sm:px-3 sm:py-2 flex items-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-xl transition-colors border border-transparent hover:border-zinc-700"
            title="Disconnect"
          >
            <LogOut className="w-5 h-5 sm:mr-2" />
            <span className="hidden sm:inline text-sm font-semibold">DISCONNECT</span>
          </button>
        </div>
      </header>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4">
            <div className="w-20 h-20 bg-zinc-900/80 rounded-3xl flex items-center justify-center border border-zinc-800 shadow-2xl">
              <ShieldAlert className="w-10 h-10 text-zinc-600" />
            </div>
            <p className="font-mono text-sm uppercase tracking-widest">Secure Channel Established. Awaiting Transmissions.</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((msg, index) => {
                const isMe = msg.sender === session.username;
                const showSender = index === 0 || messages[index - 1].sender !== msg.sender;

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    {showSender && !isMe && (
                      <span className="text-xs font-bold text-zinc-500 mb-1.5 ml-1 uppercase tracking-wider">
                        {msg.sender}
                      </span>
                    )}
                    <div className={`flex items-end gap-2 max-w-[85%] sm:max-w-[70%] ${isMe ? 'flex-row' : 'flex-row'}`}>
                      {msg.expiresAt && (
                        <Clock className="w-7 h-7 text-amber-500 animate-pulse mb-2 shrink-0" />
                      )}
                      <div
                        className={`relative min-w-0 px-5 py-3.5 rounded-2xl shadow-sm ${
                          isMe
                            ? 'bg-emerald-600 text-white rounded-tr-sm'
                            : 'bg-zinc-800/90 backdrop-blur-sm text-zinc-100 rounded-tl-sm border border-zinc-700/50'
                        }`}
                      >
                        <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap">
                          {msg.text}
                        </p>
                        <div className={`text-[10px] mt-2 flex items-center justify-end font-mono ${isMe ? 'text-emerald-200' : 'text-zinc-500'}`}>
                          {msg.expiresAt && (
                            <span className={`mr-2 flex items-center font-bold ${isMe ? 'text-amber-300' : 'text-amber-400'}`}>
                              <Clock className="w-3 h-3 mr-1" />
                              {Math.max(0, Math.ceil((msg.expiresAt - Date.now()) / 1000))}s
                            </span>
                          )}
                          {format(msg.timestamp, 'HH:mm:ss')}
                          {isMe && <Lock className="w-3 h-3 ml-1.5 opacity-70" />}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {typingUsers.size > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center text-emerald-500/70 font-mono text-xs uppercase tracking-widest"
              >
                <Radio className="w-4 h-4 mr-2 animate-pulse" />
                [ SIGNAL DETECTED: {Array.from(typingUsers).join(', ')} IS TRANSMITTING ]
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Input Area */}
      <footer className="p-4 sm:p-6 bg-zinc-900/90 backdrop-blur-xl border-t border-zinc-800 shrink-0 z-20">
        <div className="max-w-5xl mx-auto mb-3 flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-xs font-mono text-zinc-500">
            <Clock className="w-4 h-4" />
            <span>TTL:</span>
            <select 
              value={ttl} 
              onChange={(e) => setTtl(Number(e.target.value))}
              className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 outline-none focus:border-emerald-500"
            >
              <option value={0}>Off</option>
              <option value={10}>10s</option>
              <option value={30}>30s</option>
              <option value={60}>1m</option>
              <option value={300}>5m</option>
            </select>
          </div>
        </div>
        <form onSubmit={handleSendMessage} className="max-w-5xl mx-auto relative flex items-end">
          <textarea
            value={newMessage}
            onChange={handleTyping}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e);
              }
            }}
            placeholder="Transmit encrypted payload..."
            className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-2xl pl-5 pr-16 py-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all resize-none min-h-[60px] max-h-[200px] shadow-inner"
            rows={1}
            style={{ height: 'auto' }}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || !isConnected}
            className="absolute right-2 bottom-2 p-3 bg-emerald-500 text-zinc-950 rounded-xl hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
        <div className="max-w-5xl mx-auto text-center mt-3">
          <p className="text-[10px] text-zinc-500 flex items-center justify-center font-mono uppercase tracking-widest">
            <Lock className="w-3 h-3 mr-1.5 text-emerald-500/70" />
            Payloads encrypted locally via AES-GCM before transmission.
          </p>
        </div>
      </footer>
    </div>
  );
}

