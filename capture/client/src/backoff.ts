export type BackoffOptions = { baseMs: number; maxMs: number };

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 2_000, maxMs: 5 * 60_000 };

/** Exponential delay with up to 25% jitter, capped at maxMs. `attempts` is the number of failures so far (>= 1). */
export function backoffDelay(attempts: number, opts: BackoffOptions = DEFAULT_BACKOFF, random = Math.random): number {
  const exp = Math.min(opts.maxMs, opts.baseMs * 2 ** Math.max(0, attempts - 1));
  return Math.min(opts.maxMs, Math.round(exp * (1 + random() * 0.25)));
}
