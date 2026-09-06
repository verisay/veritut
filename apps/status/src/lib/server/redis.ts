import { Redis } from 'ioredis';
import { env } from '$env/dynamic/private';
import type { StatusSnapshot } from '@veritut/types';

/**
 * Status app'in TEK veri kaynağı (D14): salt-okunur Redis ACL kullanıcısı, yalnız `status:*`.
 * DB, Keycloak, iç token yok — ana yığın düşse bu sayfa son snapshot'ı göstermeye devam eder.
 */
let client: Redis | null = null;
function redis(): Redis {
  if (!client) {
    client = new Redis(env.STATUS_REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000 });
    client.on('error', () => undefined);
  }
  return client;
}

export async function readSnapshot(key: string): Promise<StatusSnapshot | null> {
  try {
    const raw = await redis().get(key);
    return raw ? (JSON.parse(raw) as StatusSnapshot) : null;
  } catch {
    return null;
  }
}
