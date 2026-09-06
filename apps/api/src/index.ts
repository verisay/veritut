import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { closeDb } from './db/db.js';
import { redis, queueConnection, subscriber } from './redis.js';
import { closeQueues } from './queues.js';
import { initWebSocket } from './ws/server.js';
import { startScheduler } from './cron/scheduler.js';

const app = createApp();
const server = http.createServer(app);
initWebSocket(server);

server.listen(env.API_PORT, '0.0.0.0', () => {
  logger.info(`API hazır → http://0.0.0.0:${env.API_PORT} (${env.NODE_ENV})`);
  startScheduler();
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} alındı — kapanıyor`);
  server.close();
  await Promise.allSettled([closeQueues(), closeDb(), redis.quit(), queueConnection.quit(), subscriber.quit()]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
