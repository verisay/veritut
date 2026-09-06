import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { logger } from '../config/logger.js';
import { subscriber } from '../redis.js';
import { readStaffSession } from '../services/auth.service.js';
import { readRunLog, runChannel } from '../services/run.service.js';
import { OPS_COOKIE } from '../middleware/requireStaff.js';

/**
 * WS: `/api/v1/ws/runs/:id` — canlı çalıştırma logu (plan §3.1 Realtime).
 * Kimlik: `vt_ops` çerezi (upgrade isteğiyle gelir). Yayın: Redis pub/sub `run:<id>` (gün 1).
 */
const RUN_PATH = /^\/api\/v1\/ws\/runs\/([0-9a-f-]{36})$/i;

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function initWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });
  const rooms = new Map<string, Set<WebSocket>>();

  subscriber.psubscribe('run:*', (err) => {
    if (err) logger.error({ err }, 'psubscribe başarısız');
  });
  subscriber.on('pmessage', (_pattern, channel, message) => {
    const room = rooms.get(channel);
    if (!room) return;
    for (const ws of room) if (ws.readyState === ws.OPEN) ws.send(message);
  });

  server.on('upgrade', async (req, socket, head) => {
    const m = RUN_PATH.exec(req.url ?? '');
    if (!m) {
      socket.destroy();
      return;
    }
    const token = parseCookie(req.headers.cookie, OPS_COOKIE);
    const staff = token ? await readStaffSession(token) : null;
    if (!staff) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const runId = m[1]!;
    wss.handleUpgrade(req, socket, head, async (ws) => {
      const ch = runChannel(runId);
      if (!rooms.has(ch)) rooms.set(ch, new Set());
      rooms.get(ch)!.add(ws);
      // Geçmiş satırlar (Redis stream) → sonra canlı yayın.
      for (const e of await readRunLog(runId)) ws.send(JSON.stringify({ type: 'log', ...e }));
      ws.on('close', () => {
        rooms.get(ch)?.delete(ws);
        if (rooms.get(ch)?.size === 0) rooms.delete(ch);
      });
    });
  });
  logger.info('ws hazır — /api/v1/ws/runs/:id');
}
