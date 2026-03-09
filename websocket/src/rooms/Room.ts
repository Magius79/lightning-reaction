import { Socket } from 'socket.io';

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

  constructor(id: string) {
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
  }

  addPlayer(socket: Socket, pubkey: string) {
    this.players.set(socket.id, {
      socketId: socket.id,
      pubkey,
      paid: false,
      tapTime: null,
      reactionTime: null,
      disqualified: false,
    });
  }

  removePlayer(socketId: string) {
    this.players.delete(socketId);
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  setPlayerPaid(socketId: string, isCredit = false) {
    const player = this.players.get(socketId);
    if (player) {
      player.paid = true;
      // Only add to prize pool for real payments, not credits
      if (!isCredit) {
        this.prizePool += Math.floor(this.entryFee * (1 - this.houseEdge));
      }
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
