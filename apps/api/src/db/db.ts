import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

/**
 * TEK veri erişim yolu: Drizzle (D3). `pool` DIŞARI export edilmez —
 * servislerin raw `pool.query` çağırması yasak. Ham SQL: `db.execute(sql\`...\`)`.
 */
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

export const db = drizzle(pool, { schema });
export type Db = typeof db;

export async function checkDbConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
