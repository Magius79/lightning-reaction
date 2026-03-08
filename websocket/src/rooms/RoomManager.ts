import { Server, Socket } from 'socket.io';
import axios from 'axios';
import { Room } from './Room';
import { Matchmaker } from './Matchmaker';
import { GameEngine } from '../game/GameEngine';

export class RoomManager {
  private io: Server;
  private rooms: Map<string, Room>;
  private matchmaker: Matchmaker;
  private gameEngine: GameEngine;
  private readonly MAX_PLAYERS_PER_ROOM = 10;
  private readonly BACKEND_API = process.env.BACKEND_API_URL || 'http://localhost:4000';
  private readonly ROOM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  // roomId -> winnerPubkey -> resolved
  private payoutInFlight: Set<string> = new Set();
  private roomTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private socketRooms: Map<string, string> = new Map(); // socketId -> roomId

  constructor(io: Server) {
    this.io = io;
    this.rooms = new Map();
    this.matchmaker = new Matchmaker(this.rooms, this.MAX_PLAYERS_PER_ROOM);
    this.gameEngine = new GameEngine(io, this.rooms);
  }

  async handleJoinRoom(socket: Socket, data: { pubkey: string; paymentHash: string }) {
    const pubkey = data?.pubkey;
    const paymentHash = data?.paymentHash;

    if (!pubkey || !paymentHash) {
      socket.emit('error', { message: 'Missing pubkey or paymentHash' });
      return;
    }

    try {
      // Optional test bypass: allow bot_* clients to join without payment.
      // Enable explicitly via ALLOW_BOT_NO_PAYMENT=1.
      const allowBot = process.env.ALLOW_BOT_NO_PAYMENT === '1' && pubkey.startsWith('bot_');

      // Credit-based entries are pre-verified by the backend
      const isCredit = paymentHash.startsWith('credit_');

      if (!allowBot && !isCredit) {
        const response = await axios.post(`${this.BACKEND_API}/verify-payment`, { pubkey, paymentHash });
        if (!response.data.verified) {
          socket.emit('error', { message: 'Payment verification failed' });
          return;
        }
      }

      const roomId = process.env.FORCE_ROOM_ID || this.matchmaker.findAvailableRoom();
      console.log('[joinRoom] roomId=', roomId, 'FORCE_ROOM_ID=', process.env.FORCE_ROOM_ID);

      let room = this.rooms.get(roomId);
      if (!room) {
        room = new Room(roomId);
        this.rooms.set(roomId, room);
        this.startRoomTimeout(roomId);
      }

      room.addPlayer(socket, pubkey);
      socket.join(roomId);
      room.setPlayerPaid(socket.id);
      this.socketRooms.set(socket.id, roomId);

      this.io.to(roomId).emit('roomUpdated', {
        roomId,
        players: Array.from(room.players.values()),
        status: room.status,
        countdown: room.status === 'starting' ? 3 : 0,
      });

      if (room.getPlayerCount() >= 2 && room.status === 'waiting') {
        this.clearRoomTimeout(roomId);
        this.gameEngine.startGame(roomId);
      }
    } catch (error) {
      socket.emit('error', { message: 'Failed to join room' });
      console.error('Join room error:', error);
    }
  }

  handleTap(socket: Socket, data: { timestamp: number }) {
    const roomId = this.socketRooms.get(socket.id);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    this.gameEngine.handleTap(roomId, socket.id, data.timestamp);
  }

  // Winner submits a BOLT11 invoice for payout.
  async handleSubmitPayoutInvoice(
    socket: Socket,
    data: { roomId: string; bolt11: string; pubkey: string }
  ) {
    console.log('[submitPayoutInvoice] received', {
      socketId: socket.id,
      roomId: data?.roomId,
      pubkey: data?.pubkey,
      bolt11Prefix: data?.bolt11?.slice?.(0, 12),
      bolt11Len: data?.bolt11?.length,
    });

    const { roomId, bolt11, pubkey } = data || ({} as any);

    if (!roomId || !bolt11 || !pubkey) {
      socket.emit('error', { message: 'Missing roomId, bolt11, or pubkey' });
      return;
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Authorize by winner pubkey stored at game end (reconnect-safe)
    if (!room.winnerPubkey || pubkey !== room.winnerPubkey) {
      socket.emit('error', { message: 'Only the winner can submit payout invoice' });
      return;
    }

    if (room.payoutStatus === 'paid') {
      socket.emit('payoutSent', { roomId, duplicate: true });
      return;
    }

    const key = `${roomId}:${room.winnerPubkey}`;
    if (this.payoutInFlight.has(key)) return;
    this.payoutInFlight.add(key);

    try {
      const cap = Number(process.env.TEST_PAYOUT_SATS || 0);
      const amountSats = cap > 0 ? Math.min(room.prizePool, cap) : room.prizePool;

      console.log(
        `Submitting payout for room ${roomId}: ${amountSats} sats (pool=${room.prizePool}) to bolt11 ${bolt11.slice(
          0,
          20
        )}...`
      );

      const resp = await axios.post(`${this.BACKEND_API}/payout`, { bolt11, amountSats });

      room.payoutStatus = 'paid';
      socket.emit('payoutSent', { roomId, paymentHash: resp.data?.paymentHash });
      console.log(`Payout successful for room ${roomId}: paymentHash=${resp.data?.paymentHash}`);
    } catch (e: any) {
      room.payoutStatus = 'failed';

      // Better error message propagation (shows backend {error} if present)
      let msg = e?.message || 'Unknown error';
      if (axios.isAxiosError(e)) {
        const status = e.response?.status;
        const data = e.response?.data as any;
        const serverMsg = data?.error || data?.message;
        if (serverMsg) msg = serverMsg;
        if (status) msg = `${msg} (HTTP ${status})`;
      }

      socket.emit('payoutFailed', { roomId, error: msg });
      console.error('Payout submit error:', msg, e?.response?.data || e);
    } finally {
      this.payoutInFlight.delete(key);
    }
  }

  private startRoomTimeout(roomId: string) {
    this.clearRoomTimeout(roomId);
    const timer = setTimeout(() => this.handleRoomTimeout(roomId), this.ROOM_TIMEOUT_MS);
    this.roomTimeouts.set(roomId, timer);
    console.log(`[RoomManager] Started ${this.ROOM_TIMEOUT_MS / 1000}s timeout for room ${roomId}`);
  }

  private clearRoomTimeout(roomId: string) {
    const timer = this.roomTimeouts.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.roomTimeouts.delete(roomId);
    }
  }

  private async handleRoomTimeout(roomId: string) {
    this.roomTimeouts.delete(roomId);
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'waiting') return;

    console.log(`[RoomManager] Room ${roomId} timed out — crediting ${room.getPlayerCount()} player(s)`);

    // Credit each player via the backend
    for (const [socketId, player] of room.players) {
      try {
        await axios.post(`${this.BACKEND_API}/api/rooms/credit`, { pubkey: player.pubkey });
        console.log(`[RoomManager] Credited player ${player.pubkey}`);
      } catch (e: any) {
        console.error(`[RoomManager] Failed to credit player ${player.pubkey}:`, e?.message);
      }
    }

    // Notify all clients in the room (handles reconnected sockets with new IDs)
    this.io.to(roomId).emit('roomTimeout', {
      roomId,
      message: 'Room timed out — no opponents joined. You have a free credit for your next game.',
    });

    // Clean up the room
    this.rooms.delete(roomId);
  }

  async handleLeaveRoom(socket: Socket) {
    const roomId = this.socketRooms.get(socket.id);
    if (!roomId) return;

    this.socketRooms.delete(socket.id);

    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.get(socket.id);
    if (player && room.status === 'waiting') {
      // Game hasn't started — credit the player for their next game
      try {
        await axios.post(`${this.BACKEND_API}/api/rooms/credit`, { pubkey: player.pubkey });
        console.log(`[RoomManager] Credited early-leaver ${player.pubkey}`);
      } catch (error) {
        console.error('Credit error:', error);
      }
    } else if (player && !player.paid) {
      try {
        await axios.post(`${this.BACKEND_API}/refund`, { pubkey: player.pubkey });
      } catch (error) {
        console.error('Refund error:', error);
      }
    }

    room.removePlayer(socket.id);
    socket.leave(roomId);

    this.io.to(roomId).emit('roomUpdated', {
      roomId,
      players: Array.from(room.players.values()),
      status: room.status,
      countdown: room.status === 'starting' ? 3 : 0,
    });

    if (room.getPlayerCount() === 0) {
      this.clearRoomTimeout(roomId);
      this.rooms.delete(roomId);
    } else if (room.status !== 'waiting' && room.getPlayerCount() < 2) {
      this.gameEngine.endGame(roomId, null);
    }
  }

  handleDisconnect(socket: Socket) {
    this.handleLeaveRoom(socket);
  }
}
