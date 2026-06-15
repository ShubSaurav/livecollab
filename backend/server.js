const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');

const User = require('./models/User');
const Room = require('./models/Room');
const Session = require('./models/Session');

const app = express();
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
  : true;
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/connect' });

// Connect to MongoDB
if (!process.env.MONGO_URI) {
  console.warn('MONGO_URI is missing. Database-backed features will fail until configured.');
} else {
  mongoose.set('bufferCommands', false);
  mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 3000
  })
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));
}

const googleAudiences = (process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

if (googleAudiences.length === 0) {
  console.warn('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_IDS is missing. Google login will fail until configured.');
}

const googleClient = new OAuth2Client();

function decodeJwtPayload(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

// Google Auth Endpoint
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ success: false, error: 'Missing Google credential' });
    }
    if (googleAudiences.length === 0) {
      return res.status(500).json({ success: false, error: 'Server Google config missing' });
    }

    const decoded = decodeJwtPayload(credential);
    if (decoded?.aud && !googleAudiences.includes(decoded.aud)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid Google token',
        details: `Audience mismatch. token aud=${decoded.aud}, expected one of configured client IDs.`
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: googleAudiences
    });
    const payload = ticket.getPayload();
    
    // Upsert User
    let user = null;
    if (mongoose.connection.readyState === 1) {
      user = await User.findOne({ googleId: payload.sub });
      if (!user) {
        user = new User({
          googleId: payload.sub,
          email: payload.email,
          name: payload.name,
          picture: payload.picture
        });
        await user.save();
      }
    } else {
      console.log('MongoDB offline. Simulating in-memory user for Google Login.');
      user = {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        _id: `temp_${payload.sub}`
      };
    }
    
    res.json({ success: true, user });
  } catch (error) {
    console.error('Auth error', error?.message || error);
    res.status(401).json({
      success: false,
      error: 'Invalid Google token',
      details: error?.message || 'Unknown auth error'
    });
  }
});

app.get('/api/health', (req, res) => {
  const mongoReadyState = mongoose.connection.readyState;
  const mongoConnected = mongoReadyState === 1;
  res.json({
    success: true,
    status: 'ok',
    wsPath: '/connect',
    mongoConnected,
    googleConfigured: googleAudiences.length > 0,
    corsOrigin: allowedOrigins
  });
});

// Since the websocket logic is complex and relies on active clients (which can't be purely DB driven right away), I will keep `rooms` Map for active websocket clients, but push to MongoDB `Session` when room closes.
const roomsMap = new Map();

const generateRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

async function createUniqueRoomCode(maxAttempts = 8) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const roomCode = generateRoomCode();
    if (roomsMap.has(roomCode)) {
      continue;
    }

    // If DB is connected, ensure we avoid existing room IDs there too.
    if (mongoose.connection.readyState === 1) {
      const exists = await Room.exists({ roomId: roomCode });
      if (exists) {
        continue;
      }
    }

    return roomCode;
  }

  throw new Error('Failed to generate a unique room code');
}

// Room Creation
async function handleCreateRoom(req, res) {
  try {
    const roomId = await createUniqueRoomCode();
    const incomingTitle = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const roomTitle = incomingTitle || `Room ${roomId}`;

    roomsMap.set(roomId, {
      title: roomTitle,
      clients: new Set(),
      history: [],
      drawActions: [],
      stickyNotes: [],
      peakParticipants: 0
    });

    // Persist to DB when available; if DB write fails, keep the in-memory room alive.
    if (mongoose.connection.readyState === 1) {
      const newRoom = new Room({ roomId, title: roomTitle });
      await newRoom.save();
    }

    console.log(`Room created: ${roomId}`);
    return res.json({ success: true, roomId, title: roomTitle });
  } catch (error) {
    console.error('Create room error', error?.message || error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create room',
      details: error?.message || 'Unknown create-room error'
    });
  }
}

app.post('/room', handleCreateRoom);
app.post('/api/room', handleCreateRoom);

app.post('/api/ai', async (req, res) => {
  const { prompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'Gemini API key is not configured on the backend.' });
  }
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ]
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err?.error?.message || 'Gemini API call failed' });
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response text received from Gemini.';
    return res.json({ text });
  } catch (err) {
    console.error('Gemini API proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/ai/status', (req, res) => {
  return res.json({ hasKey: !!(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY) });
});

app.get('/api/room/:roomId', async (req, res) => {
  const roomId = (req.params.roomId || '').trim().toUpperCase();
  if (!roomId) {
    return res.status(400).json({ success: false, error: 'Room code is required' });
  }

  if (roomsMap.has(roomId)) {
    const roomData = roomsMap.get(roomId);
    return res.json({
      success: true,
      exists: true,
      room: {
        id: roomId,
        title: roomData.title,
        active: true,
        participantCount: roomData.clients.size
      }
    });
  }

  if (mongoose.connection.readyState === 1) {
    const dbRoom = await Room.findOne({ roomId }).lean();
    if (dbRoom) {
      return res.json({
        success: true,
        exists: true,
        room: {
          id: dbRoom.roomId,
          title: dbRoom.title,
          active: Boolean(dbRoom.active),
          participantCount: 0
        }
      });
    }
  }

  // Auto-create room in memory if it doesn't exist (allows joining by room code even if MongoDB is down)
  // Validate room code format (alphanumeric, 4-12 chars)
  if (/^[A-Z0-9]{4,12}$/.test(roomId)) {
    roomsMap.set(roomId, {
      title: `Room ${roomId}`,
      clients: new Set(),
      history: [],
      drawActions: [],
      stickyNotes: [],
      peakParticipants: 0
    });
    console.log(`Room auto-created on join lookup: ${roomId}`);
    return res.json({
      success: true,
      exists: true,
      room: {
        id: roomId,
        title: `Room ${roomId}`,
        active: true,
        participantCount: 0
      }
    });
  }

  return res.status(404).json({ success: false, exists: false, error: 'Room not found' });
});

// Dashboard
app.get('/api/dashboard', async (req, res) => {
  const activeRooms = Array.from(roomsMap.entries()).map(([id, data]) => ({
    id,
    title: data.title,
    participantCount: data.clients.size,
    status: 'Active now'
  }));

  // Merge DB active rooms when not currently in memory map.
  if (mongoose.connection.readyState === 1) {
    const dbRooms = await Room.find({ active: true }).sort({ createdAt: -1 }).limit(10).lean();
    dbRooms.forEach((room) => {
      if (!activeRooms.find((item) => item.id === room.roomId)) {
        activeRooms.push({
          id: room.roomId,
          title: room.title,
          participantCount: 0,
          status: 'Active'
        });
      }
    });
  }

  res.json({ recentRooms: activeRooms.slice(0, 6) });
});

// History
app.get('/api/history', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ sessions: [] });
    }
    const sessions = await Session.find().sort({ date: -1 }).limit(10).lean();
    const normalizedSessions = sessions.map((session) => ({
      id: String(session._id),
      roomId: session.roomId,
      title: session.title,
      date: session.date,
      duration: session.durationStr || 'Session ended',
      participants: session.participantsCount || 1,
      aiSummary: session.aiSummary || 'No summary generated yet.',
      recordingAvailable: Boolean(session.recordingAvailable)
    }));
    res.json({ sessions: normalizedSessions });
  } catch (error) {
    console.error('Failed to fetch history:', error);
    res.json({ sessions: [] });
  }
});

// Send a message to a specific client in a room by clientId
function sendToClient(roomId, targetClientId, message) {
  if (!roomsMap.has(roomId)) return;
  const room = roomsMap.get(roomId);
  if (!room.clientMap) return;
  const targetWs = room.clientMap.get(targetClientId);
  if (targetWs && targetWs.readyState === WebSocket.OPEN) {
    targetWs.send(JSON.stringify(message));
  }
}

// WebSocket Handler
wss.on('connection', (ws, req) => {
  let currentRoom = null;
  let clientId = Math.random().toString(36).substring(2, 10);
  
  ws.on('message', (messageAsString) => {
    try {
      const data = JSON.parse(messageAsString);
      switch (data.type) {
        case 'join': {
          const targetRoomId = (data.roomId || '').trim().toUpperCase();
          if (roomsMap.has(targetRoomId)) {
            currentRoom = targetRoomId;
            const roomData = roomsMap.get(currentRoom);
            roomData.clients.add(ws);
            if (!roomData.clientMap) roomData.clientMap = new Map();
            // Send list of existing peer IDs to new client BEFORE adding them
            const existingPeerIds = Array.from(roomData.clientMap.keys());
            roomData.clientMap.set(clientId, ws);
            roomData.peakParticipants = Math.max(roomData.peakParticipants || 0, roomData.clients.size);
            
            ws.send(JSON.stringify({ 
              type: 'joined', 
              clientId, 
              roomId: currentRoom,
              history: roomData.history || [],
              drawActions: roomData.drawActions || [],
              stickyNotes: roomData.stickyNotes || [],
              existingPeers: existingPeerIds
            }));
            
            broadcast(currentRoom, {
              type: 'user_joined',
              clientId,
              message: `User ${clientId} joined the room`
            }, ws);
          } else {
            // Room not in memory - check DB, or auto-create if DB is unavailable
            const autoCreateAndJoin = () => {
              const rid = targetRoomId;
              const clientMap = new Map();
              clientMap.set(clientId, ws);
              roomsMap.set(rid, {
                title: `Room ${rid}`,
                clients: new Set([ws]),
                clientMap,
                history: [],
                drawActions: [],
                stickyNotes: [],
                peakParticipants: 1
              });
              currentRoom = rid;
              console.log(`Room auto-created on WS join: ${rid}`);
              ws.send(JSON.stringify({ 
                type: 'joined', 
                clientId, 
                roomId: currentRoom, 
                history: [],
                drawActions: [],
                stickyNotes: [],
                existingPeers: []
              }));
            };

            if (mongoose.connection.readyState === 1) {
              Room.findOne({ roomId: targetRoomId }).then(dbRoom => {
                 if(dbRoom) {
                    const clientMap = new Map();
                    clientMap.set(clientId, ws);
                    roomsMap.set(targetRoomId, {
                       title: dbRoom.title,
                       clients: new Set([ws]),
                       clientMap,
                       history: [],
                       drawActions: [],
                       stickyNotes: [],
                       peakParticipants: 1
                    });
                    currentRoom = targetRoomId;
                    ws.send(JSON.stringify({ 
                      type: 'joined', 
                      clientId, 
                      roomId: currentRoom, 
                      history: [],
                      drawActions: [],
                      stickyNotes: [],
                      existingPeers: []
                    }));
                 } else {
                    // Room not found in DB either — auto-create in memory
                    autoCreateAndJoin();
                 }
              }).catch(err => {
                 console.error('Error finding room in DB:', err);
                 // DB error — auto-create in memory as fallback
                 autoCreateAndJoin();
              });
            } else {
              // MongoDB offline — auto-create room in memory
              autoCreateAndJoin();
            }
          }
          break;
        }
          
        case 'chat':
        case 'cursor':
          if (currentRoom && roomsMap.has(currentRoom)) {
            broadcast(currentRoom, { ...data, senderId: clientId }, ws);
            if (data.type === 'chat') {
               roomsMap.get(currentRoom).history.push({...data, senderId: clientId});
            }
          }
          break;

        case 'draw':
          if (currentRoom && roomsMap.has(currentRoom)) {
            broadcast(currentRoom, { ...data, senderId: clientId }, ws);
            // Save drawings if final (not a preview)
            if (data.action && !data.isPreview) {
              const room = roomsMap.get(currentRoom);
              if (!room.drawActions) room.drawActions = [];
              room.drawActions.push(data.action);
            }
          }
          break;

        case 'draw_sync':
          if (currentRoom && roomsMap.has(currentRoom)) {
            const room = roomsMap.get(currentRoom);
            room.drawActions = data.drawActions || [];
            broadcast(currentRoom, { ...data, senderId: clientId }, ws);
          }
          break;

        case 'clear_board':
          if (currentRoom && roomsMap.has(currentRoom)) {
            const room = roomsMap.get(currentRoom);
            room.drawActions = [];
            room.stickyNotes = [];
            broadcast(currentRoom, { type: 'clear_board' }, ws);
          }
          break;

        case 'sticky_create':
          if (currentRoom && roomsMap.has(currentRoom)) {
            const room = roomsMap.get(currentRoom);
            if (!room.stickyNotes) room.stickyNotes = [];
            room.stickyNotes.push(data.note);
            broadcast(currentRoom, { ...data, senderId: clientId }, ws);
          }
          break;

        case 'sticky_update':
          if (currentRoom && roomsMap.has(currentRoom)) {
            const room = roomsMap.get(currentRoom);
            if (!room.stickyNotes) room.stickyNotes = [];
            const idx = room.stickyNotes.findIndex(n => n.id === data.noteId);
            if (idx !== -1) {
              room.stickyNotes[idx] = { ...room.stickyNotes[idx], ...data.updates };
            }
            broadcast(currentRoom, { ...data, senderId: clientId }, ws);
          }
          break;

        case 'sticky_delete':
          if (currentRoom && roomsMap.has(currentRoom)) {
            const room = roomsMap.get(currentRoom);
            if (!room.stickyNotes) room.stickyNotes = [];
            room.stickyNotes = room.stickyNotes.filter(n => n.id !== data.noteId);
            broadcast(currentRoom, { ...data, senderId: clientId }, ws);
          }
          break;

        case 'webrtc-offer':
        case 'webrtc-answer':
        case 'webrtc-ice-candidate':
          // Forward WebRTC signaling to the target peer
          if (currentRoom && data.targetId) {
            sendToClient(currentRoom, data.targetId, {
              type: data.type,
              senderId: clientId,
              offer: data.offer,
              answer: data.answer,
              candidate: data.candidate
            });
          }
          break;

        default:
          // For generic real-time events that don't need database persistence (e.g., raise_hand, media_update)
          if (currentRoom && roomsMap.has(currentRoom)) {
            broadcast(currentRoom, { ...data, senderId: clientId }, ws);
          }
          break;
      }
    } catch (e) {
      console.error('Failed to parse message', e);
    }
  });

  ws.on('close', async () => {
    if (currentRoom && roomsMap.has(currentRoom)) {
      const roomData = roomsMap.get(currentRoom);
      roomData.clients.delete(ws);
      if (roomData.clientMap) roomData.clientMap.delete(clientId);
      
      broadcast(currentRoom, { type: 'user_left', clientId });
      
      if (roomData.clients.size === 0) {
        // Save to DB
        try {
          const newSession = new Session({
            roomId: currentRoom,
            title: roomData.title,
            durationStr: 'Session ended',
            participantsCount: roomData.peakParticipants || 1,
            aiSummary: 'No summary generated yet.',
            recordingAvailable: false
          });
          await newSession.save();
          
          await Room.findOneAndUpdate({ roomId: currentRoom }, { active: false });
          
          roomsMap.delete(currentRoom);
          console.log(`Room ${currentRoom} saved to MongoDB.`);
        } catch(e) {
          console.error("DB error saving session", e);
        }
      }
    }
  });
});

function broadcast(roomId, message, excludeWs = null) {
  if (roomsMap.has(roomId)) {
    const clients = roomsMap.get(roomId).clients;
    const msgStr = JSON.stringify(message);
    clients.forEach((client) => {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(msgStr);
      }
    });
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`LiveCollab AI Server running on port ${PORT}`);
});
