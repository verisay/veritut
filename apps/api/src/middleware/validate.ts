import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

/** Body'yi Zod ile doğrular; hata ZodError olarak errorHandler'a düşer (422). */
export function validate<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    req.body = parsed.data;
    next();
  };
}
