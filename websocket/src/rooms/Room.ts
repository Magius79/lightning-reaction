import { Socket } from 'socket.io';

export const BOT_PUBKEY = 'bot_lightning_reaction';
export const BOT_SOCKET_PREFIX = 'bot_';

export function isBot(socketId: string): boolean {
  return socketId.startsWith(BOT_SOCKET_PREFIX);
}

interface PlayerState {
  socketId: string;
  pubkey: string;
  paid: boolean;
  tapTime: number | null;
  reactionTime: number | null;
  disqualified: boolean;
}

export class Room {
  id: string;
  status: 'waiting' | 'starting' | 'countdown' | 'wait' | 'green' | 'finished';
  winnerSocketId: string | null;
  winnerPubkey: string | null;
  payoutStatus: 'none' | 'requested' | 'paid' | 'failed';
  players: Map<string, PlayerState>;
  entryFee: number;
  houseEdge: number;
  prizePool: number;
  greenTimestamp: number | null;
  startTime: number;
  isFreeplay: boolean;

  constructor(id: string, freeplay = false) {
    this.id = id;
    this.status = 'waiting';
    this.winnerSocketId = null;
    this.winnerPubkey = null;
    this.payoutStatus = 'none';
    this.players = new Map();
    this.entryFee = 100; // sats
    this.houseEdge = Number(process.env.HOUSE_EDGE ?? 0.1); // must match backend env
    this.prizePool = 0;
    this.greenTimestamp = null;
    this.startTime = 0;
    this.isFreeplay = freeplay;
  }

  addPlayer(socket: Socket, pubkey: string) {
    // Don't overwrite an existing entry (prevents paid flag reset on duplicate joins)
    if (this.players.has(socket.id)) return;

    // If this pubkey already has an entry under a different socket (reconnect),
    // just remap the socket reference — don't create a new entry.
    for (const [oldSocketId, player] of this.players) {
      if (player.pubkey === pubkey) {
        if (oldSocketId !== socket.id) {
          this.players.set(socket.id, player);
          player.socketId = socket.id;
          this.players.delete(oldSocketId);
        }
        return;
      }
    }

    this.players.set(socket.id, {
      socketId: socket.id,
      pubkey,
      paid: false,
      tapTime: null,
      reactionTime: null,
      disqualified: false,
    });
  }

  addBotPlayer(roomId: string) {
    const botSocketId = `${BOT_SOCKET_PREFIX}${roomId}`;
    if (this.players.has(botSocketId)) return botSocketId;

    this.players.set(botSocketId, {
      socketId: botSocketId,
      pubkey: BOT_PUBKEY,
      paid: true, // house-funded
      tapTime: null,
      reactionTime: null,
      disqualified: false,
    });
    // House stakes the bot's entry
    this.prizePool += Math.floor(this.entryFee * (1 - this.houseEdge));
    return botSocketId;
  }

  removePlayer(socketId: string) {
    const player = this.players.get(socketId);
    if (player?.paid) {
      this.prizePool = Math.max(0, this.prizePool - Math.floor(this.entryFee * (1 - this.houseEdge)));
    }
    this.players.delete(socketId);
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  setPlayerPaid(socketId: string, isCredit = false) {
    const player = this.players.get(socketId);
    if (player && !player.paid) {
      player.paid = true;
      // Credits represent a previously-paid entry (room timed out), so they
      // contribute to the prize pool the same as a direct payment.
      this.prizePool += Math.floor(this.entryFee * (1 - this.houseEdge));
    }
  }

  disqualifyPlayer(socketId: string) {
    const player = this.players.get(socketId);
    if (player) {
      player.disqualified = true;
    }
  }

  recordTap(socketId: string, timestamp: number) {
    const player = this.players.get(socketId);
    if (player && !player.disqualified && this.greenTimestamp) {
      player.tapTime = timestamp;
      player.reactionTime = timestamp - this.greenTimestamp;
    }
  }

  setGreenTimestamp(timestamp: number) {
    this.greenTimestamp = timestamp;
  }

  getWinner(): PlayerState | null {
    let winner: PlayerState | null = null;
    let fastestTime = Infinity;

    for (const player of this.players.values()) {
      if (!player.disqualified && player.reactionTime && player.reactionTime < fastestTime) {
        fastestTime = player.reactionTime;
        winner = player;
      }
    }

    return winner;
  }
}
