export const COLORS = {
  background: '#1a1a1a',
  primary: '#f7931a', // Bitcoin Orange
  success: '#00ff00',
  danger: '#ff0000',
  text: '#ffffff',
  textSecondary: '#aaaaaa',
  card: '#2a2a2a',
};

// Backend API (Express)
export const API_URL = 'https://api.lrtgame.cloud';

// WebSocket Server (Socket.IO). Use https URL; the client will upgrade to WebSocket.
export const WS_URL = 'wss://amiable-victory-production-4af7.up.railway.app';

// Notes:
// - For Android Emulator: http://10.0.2.2:<port>
// - For local physical device testing on same LAN: use your computer's IP
// - For our current "fast path" dev: backend via ngrok, websocket via Railway

