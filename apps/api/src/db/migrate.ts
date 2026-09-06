import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

/**
 * Tek migration runner (D3): `migrations/NNNN_ad.sql` sırayla, `_migrations` tablosunda izlenir.
 * Her dosya BEGIN/COMMIT; hata → ROLLBACK + exit 1. Sıra atlamak yok, idempotent SQL zorunlu.
 */
const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL tanımsız');
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

  const files = (await readdir(MIGRATIONS_DIR).catch(() => [] as string[]))
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
  // Sıra atlama kontrolü: 0001, 0002, … kesintisiz olmalı.
  files.forEach((f, i) => {
    const n = Number(f.slice(0, 4));
    if (n !== i + 1) {
      console.error(`✗ migration sırası kopuk: ${f} (beklenen ${String(i + 1).padStart(4, '0')})`);
      process.exit(1);
    }
  });

  const { rows } = await client.query<{ name: string }>('SELECT name FROM _migrations');
  const applied = new Set(rows.map((r) => r.name));
  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`→ ${file}`);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      ran++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`✗ ${file} başarısız:`, err);
      await client.end();
      process.exit(1);
    }
  }
  console.log(ran === 0 ? 'Yeni migration yok — güncel.' : `${ran} migration uygulandı.`);
  await client.end();
}

main();
