import { createServer } from 'http';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager';
import { authMiddleware } from './middleware/auth';

// Load environment variables
import * as dotenv from 'dotenv';
dotenv.config();

const httpServer = createServer((req, res) => {
  // Health check endpoint for Railway
  if (req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, timestamp: Date.now() }));
    return;
  }
  
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const roomManager = new RoomManager(io);

// Validate pubkey on every connection
io.use(authMiddleware);

io.on('connection', (socket) => {
  const ip = socket.handshake.headers['x-forwarded-for']?.toString().split(',')[0].trim()
    || socket.handshake.address;

  if (roomManager.checkConnection(ip)) {
    console.log(`[AntiCheat] Blocked connection from ${ip} — too many concurrent connections`);
    socket.emit('error', { message: 'Too many connections from your IP' });
    socket.disconnect(true);
    return;
  }

  console.log('New connection:', socket.id, `(ip: ${ip})`);

  // Wrap async handlers to prevent unhandled promise rejections
  const safe = (fn: (...args: any[]) => any) => (...args: any[]) => {
    try {
      const result = fn(...args);
      if (result && typeof result.catch === 'function') {
        result.catch((e: any) => console.error('[WS] Unhandled error in event handler:', e));
      }
    } catch (e) {
      console.error('[WS] Sync error in event handler:', e);
    }
  };

  socket.on('joinRoom', safe((data: any) => roomManager.handleJoinRoom(socket, data)));
  socket.on('joinFreeplay', safe((data: any) => roomManager.handleJoinFreeplay(socket, data)));
  socket.on('rejoinRoom', safe((data: any) => roomManager.handleRejoinRoom(socket, data)));
  socket.on('tap', safe((data: any) => roomManager.handleTap(socket, data)));
  socket.on('leaveRoom', safe(() => roomManager.handleLeaveRoom(socket, true)));
  socket.on('cancelWaiting', safe(() => roomManager.handleCancelWaiting(socket)));
  socket.on('submitPayoutInvoice', safe((data: any) => roomManager.handleSubmitPayoutInvoice(socket, data)));
  socket.on('disconnect', safe(() => {
    roomManager.handleDisconnect(socket);
    roomManager.releaseConnection(ip);
  }));
});

const PORT = process.env.PORT || 3001;
const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:4000';

httpServer.listen(PORT, () => {
  console.log(`⚡ WebSocket server listening on port ${PORT}`);
  console.log(`🔗 Backend API: ${BACKEND_URL}`);
});
