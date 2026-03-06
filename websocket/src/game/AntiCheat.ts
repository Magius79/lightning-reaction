export class AntiCheat {
  private readonly MIN_REACTION_TIME = 50; // ms
  private connectionCountByIp: Map<string, number>;
  private readonly MAX_CONNECTIONS_PER_IP = 2;

  constructor() {
    this.connectionCountByIp = new Map();
  }

  isUnrealistic(reactionTime: number): boolean {
    return reactionTime < this.MIN_REACTION_TIME;
  }

  checkMultipleConnections(ip: string): boolean {
    const count = this.connectionCountByIp.get(ip) || 0;
    if (count >= this.MAX_CONNECTIONS_PER_IP) {
      return true;
    }
    this.connectionCountByIp.set(ip, count + 1);
    return false;
  }

  removeConnection(ip: string) {
    const count = this.connectionCountByIp.get(ip) || 0;
    if (count > 1) {
      this.connectionCountByIp.set(ip, count - 1);
    } else {
      this.connectionCountByIp.delete(ip);
    }
  }
}
