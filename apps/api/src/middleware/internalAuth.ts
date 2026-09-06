import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/** Worker/runner → API iç uçları: `X-Internal-Token` sabit-zamanlı karşılaştırma. */
export function internalAuth(req: Request, _res: Response, next: NextFunction): void {
  const got = String(req.header('x-internal-token') ?? '');
  const want = env.INTERNAL_TOKEN;
  const ok = got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
  if (!ok) return next(ApiError.forbidden());
  next();
}
