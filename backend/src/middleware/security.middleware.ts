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

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}
