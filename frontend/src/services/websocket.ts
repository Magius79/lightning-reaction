import { io, Socket } from 'socket.io-client';
import { WS_URL } from '../constants/theme';

class WebSocketService {
  private socket: Socket | null = null;

  connect() {
    this.socket = io(WS_URL, {
      reconnection: true,
      // Let socket.io choose best transport; forcing websocket-only can fail on some networks.
      transports: ['polling', 'websocket'],
    });

    this.socket.on('connect', () => console.log('WS connected', this.socket?.id));
    this.socket.on('disconnect', (r) => console.log('WS disconnected', r));
    this.socket.on('connect_error', (e) => console.log('WS connect_error', e?.message || e));

    return this.socket;
  }

  joinRoom(pubkey: string, paymentHash: string) {
    this.socket?.emit('joinRoom', { pubkey, paymentHash });
  }

  sendTap(timestamp: number) {
    this.socket?.emit('tap', { timestamp });
  }

  leaveRoom() {
    this.socket?.emit('leaveRoom');
  }

  // Winner submits a BOLT11 invoice for payout.
  // Include pubkey so payout survives reconnects (socket.id may change).
  submitPayoutInvoice(roomId: string, bolt11: string, pubkey: string) {
    this.socket?.emit('submitPayoutInvoice', { roomId, bolt11, pubkey });
  }

  on(event: string, callback: (data: any) => void) {
    this.socket?.on(event, callback);
  }

  off(event: string) {
    this.socket?.off(event);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const wsService = new WebSocketService();
