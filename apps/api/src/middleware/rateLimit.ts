import type { NextFunction, Request, Response } from 'express';
import { redis } from '../redis.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Rate limiter (plan §8.1): Redis INCR + EXPIRE (atomik multi).
 * Redis düşükken: genel istekler FAIL-OPEN, kritik uçlar (sipariş, API anahtarı, kimlik) FAIL-CLOSED.
 */
export interface RateLimitOptions {
  windowSec: number;
  max: number;
  /** Redis erişilemezse isteği reddet (kritik uçlar). */
  failClosed?: boolean;
  keyPrefix: string;
  /** Kimlik: oturum kullanıcısı → kiracı → API anahtarı → IP */
  keyOf?: (req: Request) => string;
}

export function rateLimit(o: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = o.keyOf?.(req) ?? req.ctx?.tenantId ?? req.user?.id ?? req.staff?.id ?? req.ip ?? 'anon';
    const key = `rl:${o.keyPrefix}:${id}`;
    try {
      const results = (await redis.multi().incr(key).expire(key, o.windowSec, 'NX').exec()) as Array<[Error | null, unknown]> | null;
      const incr = results?.[0];
      if (!incr || incr[0]) throw incr?.[0] ?? new Error('rate limiter yanıtsız');
      const n = Number(incr[1]);
      res.setHeader('X-RateLimit-Limit', String(o.max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, o.max - n)));
      if (n > o.max) {
        res.setHeader('Retry-After', String(o.windowSec));
        return next(new ApiError(429, 'Çok fazla istek gönderdiniz, lütfen biraz sonra tekrar deneyin', 'RATE_LIMITED'));
      }
      next();
    } catch (err) {
      if (o.failClosed) {
        logger.error({ err, key }, 'rate limiter erişilemez — kritik uç FAIL-CLOSED');
        return next(new ApiError(503, 'Servis geçici olarak kullanılamıyor', 'RATE_LIMITER_UNAVAILABLE'));
      }
      logger.warn({ err, key }, 'rate limiter erişilemez — fail-open');
      next();
    }
  };
}

/** Kritik uçlar: sipariş, API anahtarı üretimi, ticket açma (fail-closed). */
export const orderLimiter = rateLimit({ keyPrefix: 'order', windowSec: 3600, max: 20, failClosed: true });
export const apiKeyLimiter = rateLimit({ keyPrefix: 'apikey', windowSec: 3600, max: 10, failClosed: true });
export const ticketLimiter = rateLimit({ keyPrefix: 'ticket', windowSec: 3600, max: 30, failClosed: true });
/** Public API: anahtar başına dakikada 120 istek (fail-open). */
export const publicApiLimiter = rateLimit({ keyPrefix: 'papi', windowSec: 60, max: 120 });
