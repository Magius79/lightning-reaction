export interface AntiCheatResult {
  allowed: boolean;
  reason?: string;
}

export class AntiCheat {
  private readonly MIN_REACTION_TIME = 150; // ms — human floor
  private connectionCountByIp: Map<string, number>;
  private readonly MAX_CONNECTIONS_PER_IP = 2;

  // Track recent reaction times per pubkey for variance analysis
  private reactionHistory: Map<string, number[]> = new Map();
  private readonly HISTORY_SIZE = 10;
  private readonly MIN_VARIANCE_THRESHOLD = 15; // ms — suspiciously consistent

  constructor() {
    this.connectionCountByIp = new Map();
  }

  /**
   * Validate a reaction time. Returns { allowed: false } if the tap should
   * be rejected (player disqualified).
   */
  validateTap(pubkey: string, reactionTime: number): AntiCheatResult {
    if (reactionTime < this.MIN_REACTION_TIME) {
      console.log(`[AntiCheat] BLOCKED ${pubkey}: ${reactionTime}ms < ${this.MIN_REACTION_TIME}ms minimum`);
      return { allowed: false, reason: `Reaction time ${reactionTime}ms is below the ${this.MIN_REACTION_TIME}ms minimum` };
    }

    // Record and check variance
    this.recordReaction(pubkey, reactionTime);
    if (this.hasLowVariance(pubkey)) {
      console.log(`[AntiCheat] FLAGGED ${pubkey}: suspiciously low variance in recent reaction times`);
      // Flag but don't block — low variance alone isn't proof of cheating
    }

    return { allowed: true };
  }

  private recordReaction(pubkey: string, reactionTime: number) {
    let history = this.reactionHistory.get(pubkey);
    if (!history) {
      history = [];
      this.reactionHistory.set(pubkey, history);
    }
    history.push(reactionTime);
    if (history.length > this.HISTORY_SIZE) {
      history.shift();
    }
  }

  /**
   * Returns true if the player's recent reaction times have suspiciously
   * low standard deviation (< 15ms over 5+ games), which suggests automation.
   */
  hasLowVariance(pubkey: string): boolean {
    const history = this.reactionHistory.get(pubkey);
    if (!history || history.length < 5) return false;

    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    const variance = history.reduce((sum, t) => sum + (t - mean) ** 2, 0) / history.length;
    const stdDev = Math.sqrt(variance);

    return stdDev < this.MIN_VARIANCE_THRESHOLD;
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
