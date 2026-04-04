export interface AntiCheatResult {
  allowed: boolean;
  reason?: string;
}

export class AntiCheat {
  private readonly MIN_REACTION_TIME = 150; // ms — human floor
  private connectionCountByIp: Map<string, number>;
  private readonly MAX_CONNECTIONS_PER_IP = 2;

  // Track recent reaction times per pubkey for variance analysis
  private reactionHistory: Map<string, { times: number[]; lastSeen: number }> = new Map();
  private readonly HISTORY_SIZE = 10;
  private readonly MIN_VARIANCE_THRESHOLD = 15; // ms — suspiciously consistent
  private readonly HISTORY_TTL_MS = 60 * 60 * 1000; // Evict after 1 hour of inactivity

  constructor() {
    this.connectionCountByIp = new Map();

    // Periodically evict stale reactionHistory entries to prevent unbounded growth
    setInterval(() => this.evictStaleHistory(), 10 * 60 * 1000); // Every 10 min
  }

  private evictStaleHistory() {
    const now = Date.now();
    let evicted = 0;
    for (const [pubkey, entry] of this.reactionHistory) {
      if (now - entry.lastSeen > this.HISTORY_TTL_MS) {
        this.reactionHistory.delete(pubkey);
        evicted++;
      }
    }
    if (evicted > 0) {
      console.log(`[AntiCheat] Evicted ${evicted} stale reactionHistory entries`);
    }
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
    let entry = this.reactionHistory.get(pubkey);
    if (!entry) {
      entry = { times: [], lastSeen: Date.now() };
      this.reactionHistory.set(pubkey, entry);
    }
    entry.lastSeen = Date.now();
    entry.times.push(reactionTime);
    if (entry.times.length > this.HISTORY_SIZE) {
      entry.times.shift();
    }
  }

  /**
   * Returns true if the player's recent reaction times have suspiciously
   * low standard deviation (< 15ms over 5+ games), which suggests automation.
   */
  hasLowVariance(pubkey: string): boolean {
    const entry = this.reactionHistory.get(pubkey);
    if (!entry || entry.times.length < 5) return false;

    const times = entry.times;
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((sum, t) => sum + (t - mean) ** 2, 0) / times.length;
    const stdDev = Math.sqrt(variance);

    return stdDev < this.MIN_VARIANCE_THRESHOLD;
  }

  /**
   * Get a player's rolling average reaction time from recent history.
   * Returns null if fewer than 3 data points (not enough to be meaningful).
   */
  getPlayerAvgReaction(pubkey: string): number | null {
    const entry = this.reactionHistory.get(pubkey);
    if (!entry || entry.times.length < 3) return null;
    return entry.times.reduce((a, b) => a + b, 0) / entry.times.length;
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
