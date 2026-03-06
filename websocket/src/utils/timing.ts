export function getServerTimestamp(): number {
  return Date.now();
}

export function calculateReactionTime(tapTime: number, greenTime: number): number {
  return tapTime - greenTime;
}
