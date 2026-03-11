import { Server } from 'socket.io';
import axios from 'axios';
import { Room } from '../rooms/Room';
import { AntiCheat } from './AntiCheat';

export class GameEngine {
  private io: Server;
  private rooms: Map<string, Room>;
  private antiCheat: AntiCheat;
  private readonly BACKEND_API = process.env.BACKEND_API_URL || 'http://localhost:4000';
  // Note: backend API calls (verify-payment, payout, refund) are handled by RoomManager.

  constructor(io: Server, rooms: Map<string, Room>) {
    this.io = io;
    this.rooms = rooms;
    this.antiCheat = new AntiCheat();
  }

  startGame(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.getPlayerCount() < 2) return;

    room.status = 'starting';
    room.startTime = Date.now();

    this.io.to(roomId).emit('gameStart', { countdown: 3 });

    let countdown = 3;
    const countdownInterval = setInterval(() => {
      // If the game already ended (e.g. opponent left during countdown), stop.
      if (room.status === 'finished') {
        clearInterval(countdownInterval);
        return;
      }
      countdown--;
      if (countdown > 0) {
        this.io.to(roomId).emit('roomUpdated', {
          roomId,
          players: Array.from(room.players.values()),
          status: 'countdown',
          countdown,
        });
      } else {
        clearInterval(countdownInterval);
        room.status = 'countdown';
        this.showWait(roomId);
      }
    }, 1000);
  }

  showWait(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.status === 'finished') return;

    room.status = 'wait';
    this.io.to(roomId).emit('showWait', { message: 'WAIT...' });

    const randomDelay = Math.floor(Math.random() * 6000) + 2000; // 2-8 seconds
    setTimeout(() => {
      // If the room was already finished (e.g. opponent forfeited during wait),
      // don't overwrite the status back to green.
      if (!room || room.status !== 'wait') return;

      const greenTime = Date.now();
      room.status = 'green';
      room.setGreenTimestamp(greenTime);
      this.io.to(roomId).emit('showGreen', { timestamp: greenTime });
    }, randomDelay);
  }

  handleTap(roomId: string, socketId: string, clientTimestamp: number) {
    const room = this.rooms.get(roomId);
    if (!room || (room.status !== 'wait' && room.status !== 'green')) return;

    // Disqualify players who tap during the WAIT (red) phase
    if (room.status === 'wait') {
      room.disqualifyPlayer(socketId);
      this.io.to(socketId).emit('disqualified', { message: 'You tapped too early! You are disqualified from this round.' });
      return;
    }

    const serverTimestamp = Date.now();
    const player = room.players.get(socketId);
    if (!player || player.disqualified) return;

    if (room.greenTimestamp && this.antiCheat.isUnrealistic(serverTimestamp - room.greenTimestamp)) {
      console.log(
        `Suspicious reaction time for ${player.pubkey}: ${serverTimestamp - (room.greenTimestamp ?? 0)}ms`
      );
    }

    room.recordTap(socketId, serverTimestamp);
    this.endGame(roomId, socketId);
  }

  async endGame(roomId: string, winnerSocketId: string | null) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Don't re-run endGame on an already finished room
    if (room.status === 'finished') return;

    room.status = 'finished';
    const winner = winnerSocketId ? room.players.get(winnerSocketId) : room.getWinner();

    const results = Array.from(room.players.values()).map((player) => ({
      pubkey: player.pubkey,
      tapTime: player.tapTime,
      reactionTime: player.reactionTime,
    }));

    // Track winner for payout handshake
    room.winnerSocketId = winnerSocketId;
    room.winnerPubkey = winner?.pubkey || null;
    room.payoutStatus = winner ? 'requested' : 'none';

    this.io.to(roomId).emit('gameEnd', {
      roomId,
      winner: winner?.pubkey || null,
      reactionTime: winner?.reactionTime || 0,
      prizePool: room.prizePool,
      results,
    });

    // Update player stats in the backend
    try {
      const statsPayload = Array.from(room.players.values()).map((player) => ({
        pubkey: player.pubkey,
        won: player.pubkey === winner?.pubkey,
        reactionTime: player.reactionTime ?? null,
      }));
      await axios.post(`${this.BACKEND_API}/api/rooms/update-stats`, { players: statsPayload });
      console.log(`[GameEngine] Updated stats for ${statsPayload.length} players in room ${roomId}`);
    } catch (e: any) {
      console.error('[GameEngine] Failed to update stats:', e?.message);
    }

    // Request a BOLT11 invoice from the winner client; RoomManager will complete payout.
    // For local testing, you can cap payout via TEST_PAYOUT_SATS.
    if (winnerSocketId && winner) {
      const cap = Number(process.env.TEST_PAYOUT_SATS || 0);
      const amountSats = cap > 0 ? Math.min(room.prizePool, cap) : room.prizePool;
      console.log(
        `Requesting payout invoice from winner (socket ${winnerSocketId}) for ${amountSats} sats (pool=${room.prizePool}) in room ${roomId}`
      );
      this.io.to(winnerSocketId).emit('payoutRequested', { roomId, amountSats });
    }

    // Safety fallback: clean up room if still hanging after 15 min.
    // The 10-min payout timeout in RoomManager should fire first in normal cases;
    // this catches edge cases where the payout timeout was never started.
    setTimeout(() => {
      if (this.rooms.has(roomId)) {
        console.log(`[GameEngine] Safety cleanup: deleting stale room ${roomId}`);
        this.rooms.delete(roomId);
      }
    }, 15 * 60 * 1000);
  }
}
