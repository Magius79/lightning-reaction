import { Server } from 'socket.io';
import axios from 'axios';
import { Room, isBot, BOT_PUBKEY } from '../rooms/Room';
import { AntiCheat } from './AntiCheat';

export class GameEngine {
  private io: Server;
  private rooms: Map<string, Room>;
  private antiCheat: AntiCheat;
  private onPayoutRequested?: (roomId: string) => void;
  private onSafetyCleanup?: (roomId: string) => void;
  private readonly BACKEND_API = process.env.BACKEND_API_URL || 'http://localhost:4000';
  // Note: backend API calls (verify-payment, payout, refund) are handled by RoomManager.

  constructor(io: Server, rooms: Map<string, Room>, antiCheat: AntiCheat) {
    this.io = io;
    this.rooms = rooms;
    this.antiCheat = antiCheat;
  }

  /** Register a callback fired when a payout is requested (used to start payout timeout). */
  setPayoutRequestedCallback(cb: (roomId: string) => void) {
    this.onPayoutRequested = cb;
  }

  /** Register a callback for the 15-min safety cleanup (used to clean socketRooms/timers). */
  setSafetyCleanupCallback(cb: (roomId: string) => void) {
    this.onSafetyCleanup = cb;
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
          : this.calcAdaptiveBotDelay(room);
        setTimeout(() => {
          if (room.status !== 'green') return; // game already ended
          const tapTime = Date.now();
          room.recordTap(socketId, tapTime);
          console.log(`[GameEngine] Bot tapped in room ${roomId} with ${tapTime - (room.greenTimestamp ?? 0)}ms reaction time (target delay ${botDelay}ms)`);
          // Only end game if no human has tapped yet (first tap wins)
          if (room.status === 'green') {
            this.endGame(roomId, socketId);
          }
        }, botDelay);
      }
    }
  }

  /**
   * Calculate adaptive bot delay for paid games based on the human opponent's
   * rolling average reaction time.
   *
   * Formula: floor = max(playerAvg - 40, 180), range = 150ms
   * Bot reacts in [floor, floor + 150] ms.
   * Falls back to 300-450ms if no player history available.
   */
  private calcAdaptiveBotDelay(room: Room): number {
    // Find the human opponent's pubkey
    let humanPubkey: string | null = null;
    for (const [sid, p] of room.players) {
      if (!isBot(sid)) {
        humanPubkey = p.pubkey;
        break;
      }
    }

    const BOT_RANGE = 150;
    const HARD_MIN = 180;

    if (humanPubkey) {
      const playerAvg = this.antiCheat.getPlayerAvgReaction(humanPubkey);
      if (playerAvg !== null) {
        const floor = Math.max(Math.round(playerAvg - 40), HARD_MIN);
        const delay = floor + Math.floor(Math.random() * BOT_RANGE);
        console.log(`[GameEngine] Adaptive bot: playerAvg=${Math.round(playerAvg)}ms → bot range [${floor}, ${floor + BOT_RANGE}]ms → delay=${delay}ms`);
        return delay;
      }
    }

    // Fallback: no history yet, use moderate difficulty
    return Math.floor(Math.random() * BOT_RANGE) + 300;
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

    // Reject duplicate taps — a player can only tap once per game
    if (player.tapTime !== null) return;

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
      const statsPayload = Array.from(room.players.values())
        .filter((player) => player.pubkey !== BOT_PUBKEY)
        .map((player) => ({
          pubkey: player.pubkey,
          won: player.pubkey === winner?.pubkey,
          reactionTime: player.reactionTime ?? null,
          satsWon: player.pubkey === winner?.pubkey ? room.prizePool : 0,
        }));
      if (statsPayload.length > 0) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await axios.post(`${this.BACKEND_API}/api/rooms/update-stats`, { players: statsPayload });
            console.log(`[GameEngine] Updated stats for ${statsPayload.length} players in room ${roomId}`);
            break;
          } catch (e: any) {
            console.error(`[GameEngine] Stats update attempt ${attempt}/3 failed for room ${roomId}:`, e?.message);
            if (attempt < 3) {
              await new Promise(r => setTimeout(r, 1000 * attempt));
            }
          }
        }
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
      this.onPayoutRequested?.(roomId);
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
        this.onSafetyCleanup?.(roomId);
        // Fallback if no callback registered
        if (!this.onSafetyCleanup) {
          this.rooms.delete(roomId);
        }
      }
    }, 15 * 60 * 1000);
  }
}
