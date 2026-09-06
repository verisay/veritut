import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { InvalidTransitionError } from '@veritut/types';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ code: 'NOT_FOUND', message: 'Uç bulunamadı' });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    res.status(422).json({ code: 'VALIDATION_ERROR', message: 'Doğrulama hatası', details: err.flatten().fieldErrors });
    return;
  }
  if (err instanceof InvalidTransitionError) {
    res.status(409).json({ code: 'INVALID_TRANSITION', message: err.message });
    return;
  }
  logger.error({ err }, 'beklenmeyen hata');
  res.status(500).json({ code: 'INTERNAL', message: env.NODE_ENV === 'production' ? 'Beklenmeyen bir hata oluştu' : String(err) });
}
