import { NextFunction, Request, Response } from 'express';
import { createError } from './error.middleware';

interface Bucket { count: number; resetAt: number; }
const buckets = new Map<string, Bucket>();

/** Small in-process limit for one API instance. Use Redis/API-gateway rate limiting when scaled. */
export function rateLimit(windowMs: number, max: number, keyPrefix = 'api') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${keyPrefix}:${req.ip}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) return next(createError(429, 'Too many requests. Please try again later.'));
    next();
  };
}

/**
 * Brute-force guard for the login endpoints. Only failed logins count, so
 * successful sign-ins (and many staff behind one hospital IP) are never blocked.
 * Failures are tracked per IP+account (guessing one account) and per IP overall
 * (spraying many accounts). A successful login clears that account's counter.
 */
export function loginFailureLimit(windowMs: number, maxPerAccount: number, maxPerIp: number) {
  const failures = new Map<string, Bucket>();
  const current = (key: string, now: number) => {
    const bucket = failures.get(key);
    return bucket && bucket.resetAt > now ? bucket : undefined;
  };
  const record = (key: string, now: number) => {
    const bucket = current(key, now);
    if (bucket) bucket.count += 1;
    else failures.set(key, { count: 1, resetAt: now + windowMs });
  };
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (failures.size > 5_000) {
      for (const [key, bucket] of failures) if (bucket.resetAt <= now) failures.delete(key);
    }
    const body = req.body || {};
    const identifier = String(body.employee_id ?? body.username ?? '').trim().toLowerCase().slice(0, 100);
    const accountKey = `${req.ip}:${identifier}`;
    const ipKey = `${req.ip}:*`;
    if ((current(accountKey, now)?.count ?? 0) >= maxPerAccount || (current(ipKey, now)?.count ?? 0) >= maxPerIp) {
      return next(createError(429, 'Too many failed login attempts. Please try again later.'));
    }
    res.on('finish', () => {
      const finishedAt = Date.now();
      if (res.statusCode === 401) { record(accountKey, finishedAt); record(ipKey, finishedAt); }
      else if (res.statusCode < 400) failures.delete(accountKey);
    });
    next();
  };
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}
