import { Router } from 'express';
import type { HealthDto } from '@veritut/types';
import { checkDbConnection } from '../db/db.js';
import { checkRedisConnection } from '../redis.js';
import { queueCounts } from '../queues.js';
import { auditGuardMap, guardMap } from '../middleware/guardMap.js';
import { authRouter } from './auth.routes.js';
import { tenantsRouter } from './tenants.routes.js';
import { evidenceRouter } from './evidence.routes.js';
import { opsRouter } from './ops.routes.js';
import { internalRouter } from './internal.routes.js';
import { workloadsRouter } from './workloads.routes.js';
import { meRouter } from './me.routes.js';

export const apiRouter: Router = Router();

// FAIL-CLOSED: haritasız segment 403 (D7).
apiRouter.use(guardMap);

/** Sağlık ucu — deploy smoke + status probe buraya bakar. */
apiRouter.get('/health', async (_req, res) => {
  const [db, redis, queues] = await Promise.all([checkDbConnection(), checkRedisConnection(), queueCounts()]);
  const ok = db && redis;
  const body: HealthDto = { status: ok ? 'ok' : 'degraded', db: db ? 'up' : 'down', redis: redis ? 'up' : 'down', queues, ts: new Date().toISOString() };
  res.status(ok ? 200 : 503).json(body);
});

const mounted: Array<[string, Router]> = [
  ['auth', authRouter],
  ['tenants', tenantsRouter],
  ['workloads', workloadsRouter],
  ['me', meRouter],
  ['evidence', evidenceRouter],
  ['ops', opsRouter],
  ['internal', internalRouter],
];
for (const [seg, r] of mounted) apiRouter.use(`/${seg}`, r);
// `ws` segmenti HTTP router değil, upgrade handler (ws/server.ts); `webhooks` K3'te gelir.
auditGuardMap([...mounted.map(([s]) => s), 'health', 'ws', 'webhooks']);
