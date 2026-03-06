import { Room } from './Room';

export class Matchmaker {
  private rooms: Map<string, Room>;
  private maxPlayersPerRoom: number;

  constructor(rooms: Map<string, Room>, maxPlayersPerRoom: number) {
    this.rooms = rooms;
    this.maxPlayersPerRoom = maxPlayersPerRoom;
  }

  findAvailableRoom(): string {
    for (const [roomId, room] of this.rooms) {
      if (room.status === 'waiting' && room.getPlayerCount() < this.maxPlayersPerRoom) {
        return roomId;
      }
    }
    // Create new room if no available room found
    const newRoomId = this.generateRoomId();
    return newRoomId;
  }

  private generateRoomId(): string {
    return `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  }
}
