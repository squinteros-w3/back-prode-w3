/** Las predicciones se cierran 1 hora antes del kickoff. */
export const PREDICTION_LOCK_MS = 60 * 60 * 1000;

export interface LockInfo {
  locksAt: Date;
  locked: boolean;
}

export function getLockInfo(kickoffAt: Date, now: Date = new Date()): LockInfo {
  const locksAt = new Date(kickoffAt.getTime() - PREDICTION_LOCK_MS);
  return { locksAt, locked: now.getTime() >= locksAt.getTime() };
}
