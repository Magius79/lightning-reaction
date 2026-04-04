import { Server } from 'socket.io';
import axios from 'axios';
import { Room, isBot, BOT_PUBKEY } from '../rooms/Room';
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

      // Schedule bot tap if there's a bot in the room
      this.scheduleBotTap(roomId, room);
    }, randomDelay);
  }

  private scheduleBotTap(roomId: string, room: Room) {
    for (const [socketId, player] of room.players) {
      if (isBot(socketId) && !player.disqualified) {
        const botDelay = room.isFreeplay
          ? Math.floor(Math.random() * 400) + 500   // 500-900ms freeplay
          : Math.floor(Math.random() * 300) + 300;  // 300-600ms paid
        setTimeout(() => {
          if (room.status !== 'green') return; // game already ended
          const tapTime = Date.now();
          room.recordTap(socketId, tapTime);
          console.log(`[GameEngine] Bot tapped in room ${roomId} with ${tapTime - (room.greenTimestamp ?? 0)}ms reaction time`);
          // Only end game if no human has tapped yet (first tap wins)
          if (room.status === 'green') {
            this.endGame(roomId, socketId);
          }
        }, botDelay);
      }
    }
  }

  handleTap(roomId: string, socketId: string, clientTimestamp: number) {
    const room = this.rooms.get(roomId);
    if (!room || (room.status !== 'wait' && room.status !== 'green')) return;

    // Disqualify players who tap during the WAIT (red) phase
    if (room.status === 'wait') {
      room.disqualifyPlayer(socketId);
      this.io.to(socketId).emit('disqualified', { message: 'You tapped too early! You are disqualified from this round.' });

      // If all players are now disqualified, end the game with no winner
      const allDq = Array.from(room.players.values()).every((p) => p.disqualified);
      if (allDq) {
        console.log(`[GameEngine] All players disqualified in room ${roomId} — ending with no winner`);
        this.endGame(roomId, null);
      }
      return;
    }

    const serverTimestamp = Date.now();
    const player = room.players.get(socketId);
    if (!player || player.disqualified) return;

    if (room.greenTimestamp) {
      const reactionTime = serverTimestamp - room.greenTimestamp;
      const result = this.antiCheat.validateTap(player.pubkey, reactionTime);

      if (!result.allowed) {
        room.disqualifyPlayer(socketId);
        this.io.to(socketId).emit('disqualified', {
          message: result.reason || 'Disqualified: reaction time too fast',
        });

        // If all players are now disqualified, end with no winner
        const allDq = Array.from(room.players.values()).every((p) => p.disqualified);
        if (allDq) {
          console.log(`[GameEngine] All players disqualified in room ${roomId} — ending with no winner`);
          this.endGame(roomId, null);
        }
        return;
      }
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

    // If bot won or freeplay, no payout needed
    const botWon = winnerSocketId ? isBot(winnerSocketId) : false;
    room.payoutStatus = (winner && !botWon && !room.isFreeplay) ? 'requested' : 'none';

    this.io.to(roomId).emit('gameEnd', {
      roomId,
      winner: winner?.pubkey || null,
      reactionTime: winner?.reactionTime || 0,
      prizePool: room.isFreeplay ? 0 : room.prizePool,
      freeplay: room.isFreeplay,
      results,
    });

    // Update player stats in the backend (skip bot and freeplay)
    if (!room.isFreeplay) {
      try {
        const statsPayload = Array.from(room.players.values())
          .filter((player) => player.pubkey !== BOT_PUBKEY)
          .map((player) => ({
            pubkey: player.pubkey,
            won: player.pubkey === winner?.pubkey,
            reactionTime: player.reactionTime ?? null,
            satsWon: player.pubkey === winner?.pubkey ? room.prizePool : 0,
          }));
        if (statsPayload.length > 0) {
          await axios.post(`${this.BACKEND_API}/api/rooms/update-stats`, { players: statsPayload });
          console.log(`[GameEngine] Updated stats for ${statsPayload.length} players in room ${roomId}`);
        }
      } catch (e: any) {
        console.error('[GameEngine] Failed to update stats:', e?.message);
      }
    }

    // Request a BOLT11 invoice from the winner client; RoomManager will complete payout.
    // Skip if bot won, freeplay, or no winner.
    if (winnerSocketId && winner && !botWon && !room.isFreeplay) {
      const cap = Number(process.env.TEST_PAYOUT_SATS || 0);
      const amountSats = cap > 0 ? Math.min(room.prizePool, cap) : room.prizePool;
      console.log(
        `Requesting payout invoice from winner (socket ${winnerSocketId}) for ${amountSats} sats (pool=${room.prizePool}) in room ${roomId}`
      );
      this.io.to(winnerSocketId).emit('payoutRequested', { roomId, amountSats });
    } else if (botWon) {
      console.log(`[GameEngine] Bot won room ${roomId} — no payout, ${room.prizePool} sats stay in house`);
    } else if (room.isFreeplay) {
      console.log(`[GameEngine] Freeplay room ${roomId} finished — no payout`);
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
