import { io } from 'socket.io-client';

const WS_URL = process.env.WS_URL || 'https://lrt-ws-production.up.railway.app';
const pubkey = process.env.PUBKEY || `bot_${Math.random().toString(16).slice(2, 10)}`;
const paymentHash = process.env.PAYMENT_HASH || 'bot';

const socket = io(WS_URL, { transports: ['websocket'] });

socket.on('connect', () => {
  console.log('[BOT] connected', socket.id);
  socket.emit('joinRoom', { pubkey, paymentHash });
});

socket.on('roomUpdated', (m) => console.log('[BOT] roomUpdated', m.status, 'players=', m.players?.length, 'countdown=', m.countdown));
socket.on('gameStart', (m) => console.log('[BOT] gameStart', m));
socket.on('showWait', (m) => console.log('[BOT] showWait', m));

socket.on('showGreen', (m) => {
  console.log('[BOT] showGreen', m);
  const delay = 220;
  setTimeout(() => {
    const ts = Date.now();
    console.log('[BOT] tap', ts);
    socket.emit('tap', { timestamp: ts });
  }, delay);
});

socket.on('payoutRequested', (m) => {
  console.log('[BOT] payoutRequested (ignoring; phone should claim)', m);
});

socket.on('gameEnd', (m) => {
  console.log('[BOT] gameEnd', m);
  setTimeout(() => socket.disconnect(), 1500);
});

socket.on('error', (e) => console.log('[BOT] error', e));
socket.on('disconnect', (r) => console.log('[BOT] disconnected', r));
