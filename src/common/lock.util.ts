/** Las predicciones se cierran 15 minutos antes del kickoff. */
export const PREDICTION_LOCK_MS = 15 * 60 * 1000;

export interface LockInfo {
  locksAt: Date;
  locked: boolean;
}

export function getLockInfo(kickoffAt: Date, now: Date = new Date()): LockInfo {
  const locksAt = new Date(kickoffAt.getTime() - PREDICTION_LOCK_MS);
  return { locksAt, locked: now.getTime() >= locksAt.getTime() };
}
