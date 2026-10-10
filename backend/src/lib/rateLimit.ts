import type { RequestHandler } from 'express';

/** Fixed-window per-IP limiter (in-memory, per process). */
export function rateLimit(perMinute: number): RequestHandler {
  const hits = new Map<string, number>();
  setInterval(() => hits.clear(), 60_000).unref();
  return (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const n = (hits.get(key) ?? 0) + 1;
    hits.set(key, n);
    res.setHeader('X-RateLimit-Limit', String(perMinute));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, perMinute - n)));
    if (n > perMinute) {
      res.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests' } });
      return;
    }
    next();
  };
}
