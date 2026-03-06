import { io } from 'socket.io-client';

const WS_URL = process.env.WS_URL || 'http://localhost:3001';

const players = [
  {
    name: 'P1',
    pubkey: 'npub16ye2rszcx867lr426gc8mp6lq5y6wgwpu7q59l3zwlj9xfv8y54q93uj2l',
    paymentHash: '3c7bd871dd2f59b0f3a7559f1e9158afe1182f60117ccf162e3412c2e48f1cc2'
  },
  {
    name: 'P2',
    pubkey: 'npub_SECOND_PLAYER',
    paymentHash: '187e311f7345691dea70f9009f54b43cd4db974f6a6038b48db6ccc5d6292196'
  }
];

function makeClient(p) {
  const socket = io(WS_URL, { transports: ['websocket'] });

  socket.on('connect', () => {
    console.log(`[${p.name}] connected`, socket.id);
    socket.emit('joinRoom', { pubkey: p.pubkey, paymentHash: p.paymentHash });
  });

  socket.on('roomUpdated', (msg) => {
    console.log(`[${p.name}] roomUpdated`, msg.status, `players=${msg.players?.length}`, `countdown=${msg.countdown}`);
  });

  socket.on('gameStart', (msg) => {
    console.log(`[${p.name}] gameStart`, msg);
  });

  socket.on('showWait', (msg) => {
    console.log(`[${p.name}] showWait`, msg);
  });

  socket.on('showGreen', (msg) => {
    console.log(`[${p.name}] showGreen`, msg);
    // Tap with a small deterministic offset so P1 wins.
    const delay = p.name === 'P1' ? 120 : 220;
    setTimeout(() => {
      const ts = Date.now();
      console.log(`[${p.name}] tap`, ts);
      socket.emit('tap', { timestamp: ts });
    }, delay);
  });

  socket.on('payoutRequested', async (msg) => {
    console.log(`[${p.name}] payoutRequested`, msg);
    if (p.pubkey !== players[0].pubkey) return; // only P1 wallet exists here

    const { execSync } = await import('node:child_process');
    const amount = msg.amountSats;
    console.log(`[${p.name}] generating BOLT11 invoice for ${amount} sats...`);
    const out = execSync(`npx -y @clawstr/cli@latest wallet receive bolt11 ${amount}`, { encoding: 'utf8' });
    const m = out.match(/lnbc[0-9a-z]+/i);
    if (!m) throw new Error('Could not parse bolt11 from clawstr output');
    const bolt11 = m[0];
    console.log(`[${p.name}] submitting payout invoice: ${bolt11.slice(0, 20)}...`);
    socket.emit('submitPayoutInvoice', { roomId: msg.roomId, bolt11 });
  });

  socket.on('payoutSent', (msg) => {
    console.log(`[${p.name}] payoutSent`, msg);
  });

  socket.on('payoutFailed', (msg) => {
    console.log(`[${p.name}] payoutFailed`, msg);
  });

  socket.on('gameEnd', (msg) => {
    console.log(`[${p.name}] gameEnd`, msg);
    // give payout handshake a moment
    setTimeout(() => socket.disconnect(), 5000);
  });

  socket.on('error', (err) => {
    console.log(`[${p.name}] error`, err);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[${p.name}] disconnected`, reason);
  });

  return socket;
}

console.log('Simulating two clients against', WS_URL);
makeClient(players[0]);
setTimeout(() => makeClient(players[1]), 400);
