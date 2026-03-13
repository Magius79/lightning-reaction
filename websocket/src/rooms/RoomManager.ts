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
  private readonly PAYOUT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes to claim winnings

  // roomId -> winnerPubkey -> resolved
  private payoutInFlight: Set<string> = new Set();
  private roomTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private payoutTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
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

      // If this pubkey is already in any active (non-finished) room, don't create a second entry.
      // This prevents duplicate sockets from creating phantom rooms that generate false credits.
      for (const [, existingRoom] of this.rooms) {
        if (existingRoom.status === 'finished') continue;
        for (const [, player] of existingRoom.players) {
          if (player.pubkey === pubkey) {
            console.log(`[joinRoom] Pubkey ${pubkey} already in active room ${existingRoom.id} — ignoring duplicate join`);
            return;
          }
        }
      }

      const roomId = process.env.FORCE_ROOM_ID || this.matchmaker.findAvailableRoom();
      console.log('[joinRoom] roomId=', roomId, 'FORCE_ROOM_ID=', process.env.FORCE_ROOM_ID);

      let room: Room | undefined = this.rooms.get(roomId);
      // Bug fix: don't reuse a finished/in-progress room (e.g. when FORCE_ROOM_ID is set).
      // Reusing a finished room causes prize-pool carry-over (270 instead of 180 for 2 players).
      if (room && room.status !== 'waiting') {
        console.log(`[joinRoom] Room ${roomId} is '${room.status}' — resetting to a fresh room`);
        room = undefined;
      }
      if (!room) {
        room = new Room(roomId);
        this.rooms.set(roomId, room);
        this.startRoomTimeout(roomId);
      }

      // Clean up any stale socketRooms entries for this pubkey in this room
      // (happens when a player reconnects with a new socket before the old one times out)
      for (const [sid, rid] of this.socketRooms) {
        if (rid === roomId && sid !== socket.id) {
          const existingPlayer = room.players.get(sid);
          if (existingPlayer?.pubkey === pubkey) {
            this.socketRooms.delete(sid);
          }
        }
      }

      room.addPlayer(socket, pubkey);
      socket.join(roomId);
      room.setPlayerPaid(socket.id, paymentHash.startsWith('credit_'));
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

  handleRejoinRoom(socket: Socket, data: { pubkey: string; roomId: string }) {
    const { pubkey, roomId } = data || ({} as any);
    if (!pubkey || !roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) {
      // Room not found during rejoin — transient reconnect race, not a user-facing error
      console.warn(`[rejoinRoom] Room ${roomId} not found for pubkey ${pubkey} — ignoring (reconnect race?)`);
      return;
    }

    // Find the player by pubkey in the room
    let found = false;
    for (const [oldSocketId, player] of room.players) {
      if (player.pubkey === pubkey) {
        // Re-map the socket
        this.socketRooms.set(socket.id, roomId);
        socket.join(roomId);

        // Update the player's socket reference if the room supports it
        if (oldSocketId !== socket.id) {
          room.players.set(socket.id, player);
          room.players.delete(oldSocketId);
          this.socketRooms.delete(oldSocketId);
        }

        console.log(`[RoomManager] Player ${pubkey} rejoined room ${roomId} with new socket ${socket.id}`);

        // Re-sync client with current game state
        socket.emit('roomUpdated', {
          roomId,
          players: Array.from(room.players.values()),
          status: room.status,
          countdown: 0,
        });

        // If game is finished and this player is the winner awaiting payout, re-request invoice
        if (room.status === 'finished' && room.winnerPubkey === pubkey && room.payoutStatus === 'requested') {
          const cap = Number(process.env.TEST_PAYOUT_SATS || 0);
          const amountSats = cap > 0 ? Math.min(room.prizePool, cap) : room.prizePool;
          socket.emit('payoutRequested', { roomId, amountSats });
          this.startPayoutTimeout(roomId);
          console.log(`[RoomManager] Re-sent payoutRequested to rejoined winner ${pubkey}`);
        }

        found = true;
        break;
      }
    }

    if (!found) {
      socket.emit('error', { message: 'Player not found in room' });
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
      // Room no longer exists — payout timed out or server restarted.
      console.warn(`[submitPayoutInvoice] Room ${roomId} not found for pubkey ${pubkey} — payout expired`);
      socket.emit('payoutExpired', {
        roomId,
        message: 'Payout expired — the room no longer exists.',
      });
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
      this.clearPayoutTimeout(roomId);
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

    // Credit each player via the backend and notify them directly
    for (const [socketId, player] of room.players) {
      try {
        await axios.post(`${this.BACKEND_API}/api/rooms/credit`, { pubkey: player.pubkey });
        console.log(`[RoomManager] Credited player ${player.pubkey}`);
      } catch (e: any) {
        console.error(`[RoomManager] Failed to credit player ${player.pubkey}:`, e?.message);
      }

      // Find the socket — might be the original or a reconnected one
      const sock = this.io.sockets.sockets.get(socketId);
      if (sock) {
        sock.emit('roomTimeout', {
          roomId,
          message: 'Room timed out — no opponents joined. You have a free credit for your next game.',
        });
        sock.leave(roomId);
      }
      this.socketRooms.delete(socketId);
    }

    // Also emit to the room channel in case any sockets are still joined
    this.io.to(roomId).emit('roomTimeout', {
      roomId,
      message: 'Room timed out — no opponents joined. You have a free credit for your next game.',
    });

    // Find any sockets still mapped to this room (reconnected sockets)
    for (const [sid, rid] of this.socketRooms) {
      if (rid === roomId) {
        const sock = this.io.sockets.sockets.get(sid);
        if (sock) {
          sock.emit('roomTimeout', {
            roomId,
            message: 'Room timed out — no opponents joined. You have a free credit for your next game.',
          });
        }
        this.socketRooms.delete(sid);
      }
    }

    // Clean up the room
    this.rooms.delete(roomId);
  }

  // ── Payout claim timeout (10 min) ──

  startPayoutTimeout(roomId: string) {
    if (this.payoutTimeouts.has(roomId)) return; // already ticking
    const timer = setTimeout(() => this.handlePayoutTimeout(roomId), this.PAYOUT_TIMEOUT_MS);
    this.payoutTimeouts.set(roomId, timer);
    console.log(`[RoomManager] Started ${this.PAYOUT_TIMEOUT_MS / 1000}s payout timeout for room ${roomId}`);
  }

  private clearPayoutTimeout(roomId: string) {
    const timer = this.payoutTimeouts.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.payoutTimeouts.delete(roomId);
    }
  }

  private handlePayoutTimeout(roomId: string) {
    this.payoutTimeouts.delete(roomId);
    const room = this.rooms.get(roomId);
    if (!room) return;

    // If already paid, nothing to do
    if (room.payoutStatus === 'paid') return;

    console.log(`[RoomManager] Payout timeout for room ${roomId} — winner did not claim within ${this.PAYOUT_TIMEOUT_MS / 1000}s`);

    // Notify any connected sockets in this room
    this.io.to(roomId).emit('payoutExpired', {
      roomId,
      message: 'Payout expired — you did not claim your winnings in time.',
    });

    // Clean up socket mappings for this room
    for (const [sid, rid] of this.socketRooms) {
      if (rid === roomId) {
        const sock = this.io.sockets.sockets.get(sid);
        if (sock) sock.leave(roomId);
        this.socketRooms.delete(sid);
      }
    }

    // Remove the room
    this.rooms.delete(roomId);
  }

  async handleLeaveRoom(socket: Socket, explicit = false) {
    const roomId = this.socketRooms.get(socket.id);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) {
      this.socketRooms.delete(socket.id);
      return;
    }

    const player = room.players.get(socket.id);

    // Non-explicit disconnect while waiting: credit the player immediately
    // (they paid but the game never started), then remove from the room so
    // their entry doesn't ghost-count toward the player total.
    // If they reconnect they'll go through joinRoom again (credit or re-pay).
    if (!explicit && room.status === 'waiting') {
      console.log(`[RoomManager] Socket ${socket.id} disconnected in waiting room ${roomId} — crediting and removing player`);

      if (player?.paid) {
        try {
          await axios.post(`${this.BACKEND_API}/api/rooms/credit`, { pubkey: player.pubkey });
          console.log(`[RoomManager] Credited disconnected player ${player.pubkey}`);
        } catch (e: any) {
          console.error(`[RoomManager] Failed to credit disconnected player ${player.pubkey}:`, e?.message);
        }
      }

      room.removePlayer(socket.id);
      this.socketRooms.delete(socket.id);
      socket.leave(roomId);

      // If room is now empty, clean it up immediately
      if (room.getPlayerCount() === 0) {
        console.log(`[RoomManager] Room ${roomId} empty after disconnect — cleaning up`);
        this.clearRoomTimeout(roomId);
        this.rooms.delete(roomId);
        return;
      }

      // Notify remaining players of updated count
      this.io.to(roomId).emit('roomUpdated', {
        roomId,
        players: Array.from(room.players.values()),
        status: room.status,
        countdown: 0,
      });
      return;
    }

    // Non-explicit disconnect on finished game with pending payout: keep room alive.
    // IMPORTANT: do NOT delete socketRooms here so payout can be retried on the same socket.
    if (!explicit && room.status === 'finished' && room.payoutStatus !== 'paid') {
      console.log(`[RoomManager] Socket ${socket.id} disconnected (reconnect?) — keeping finished room ${roomId} alive for payout`);
      this.startPayoutTimeout(roomId);
      return;
    }

    // Safe to remove the mapping now — we're proceeding with cleanup
    this.socketRooms.delete(socket.id);

    // Explicit leave while waiting: credit the player and clean up
    if (explicit && player && room.status === 'waiting') {
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
      // Don't delete rooms with pending payouts
      if (room.status === 'finished' && room.payoutStatus && room.payoutStatus !== 'paid' && room.payoutStatus !== 'none') {
        console.log(`[RoomManager] Room ${roomId} empty but payout pending — keeping alive`);
        this.startPayoutTimeout(roomId);
      } else {
        this.clearRoomTimeout(roomId);
        this.rooms.delete(roomId);
      }
    } else if (room.status !== 'waiting' && room.status !== 'finished' && room.getPlayerCount() < 2) {
      // Last player standing wins the pot — unless they're disqualified
      const remainingPlayer = room.players.values().next().value;
      if (remainingPlayer && !remainingPlayer.disqualified) {
        console.log(`[RoomManager] Opponent left room ${roomId} mid-game — awarding win to remaining player ${remainingPlayer.pubkey}`);
        this.gameEngine.endGame(roomId, remainingPlayer.socketId);
      } else {
        console.log(`[RoomManager] Opponent left room ${roomId} mid-game — remaining player is disqualified, no winner`);
        this.gameEngine.endGame(roomId, null);
      }
    }
  }

  handleDisconnect(socket: Socket) {
    // Don't credit on disconnect — could be a reconnection
    this.handleLeaveRoom(socket, false);
  }
}
