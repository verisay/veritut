import { pino } from 'pino';
import { env } from './env.js';

/** pino — sır alanları redakte (plan §7.2). */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['*.password', '*.token', '*.secret', '*.refresh_token', '*.id_token', '*_sealed', 'req.headers.cookie', 'req.headers.authorization'],
    censor: '[redakte]',
  },
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }
    : {}),
});
