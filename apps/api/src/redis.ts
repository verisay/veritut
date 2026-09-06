import { Redis } from 'ioredis';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
redis.on('error', (err) => logger.error({ err }, 'redis bağlantı hatası'));

/** BullMQ için ayrı bağlantı — `maxRetriesPerRequest: null` zorunlu (Klasman tuzağı #1). */
export const queueConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

/** Pub/sub abonesi (WS yayını) — abone bağlantı başka komut çalıştıramaz, ayrı tutulur. */
export const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export async function checkRedisConnection(): Promise<boolean> {
  try {
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}
