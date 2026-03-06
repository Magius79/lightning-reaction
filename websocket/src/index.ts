import { createServer } from 'http';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager';

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

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('joinRoom', (data) => roomManager.handleJoinRoom(socket, data));
  socket.on('tap', (data) => roomManager.handleTap(socket, data));
  socket.on('leaveRoom', () => roomManager.handleLeaveRoom(socket));
  socket.on('submitPayoutInvoice', (data) => roomManager.handleSubmitPayoutInvoice(socket, data));
  socket.on('disconnect', () => roomManager.handleDisconnect(socket));
});

const PORT = process.env.PORT || 3001;
const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:4000';

httpServer.listen(PORT, () => {
  console.log(`⚡ WebSocket server listening on port ${PORT}`);
  console.log(`🔗 Backend API: ${BACKEND_URL}`);
});
