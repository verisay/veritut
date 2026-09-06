import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import type { BlueprintManifest } from '@veritut/types';
import { blueprintManifestSchema } from '@veritut/validators';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Blueprint kataloğu (D10): `infra/blueprints/<slug>/<semver>/blueprint.yaml` repo'dan yüklenir.
 * DB yalnız `slug@version` tutar. Hatalı manifest katalogda görünmez (startup uyarısı).
 */
const ROOT = process.env['BLUEPRINTS_DIR'] || path.resolve(process.cwd(), '../../infra/blueprints');
let cache: Map<string, BlueprintManifest> | null = null;

function key(slug: string, version: string): string {
  return `${slug}@${version}`;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function loadBlueprints(force = false): Promise<Map<string, BlueprintManifest>> {
  if (cache && !force) return cache;
  const out = new Map<string, BlueprintManifest>();
  const slugs = await readdir(ROOT).catch(() => [] as string[]);
  for (const slug of slugs) {
    const versions = await readdir(path.join(ROOT, slug)).catch(() => [] as string[]);
    for (const version of versions) {
      const dir = path.join(ROOT, slug, version);
      const file = path.join(dir, 'blueprint.yaml');
      if (!(await exists(file))) continue;
      try {
        const raw = parse(await readFile(file, 'utf8')) as Record<string, unknown>;
        const m = blueprintManifestSchema.parse({ ...raw, slug: raw['slug'] ?? slug, version: raw['version'] ?? version });
        if (m.slug !== slug || m.version !== version) throw new Error(`manifest slug/version dizinle uyuşmuyor (${slug}/${version})`);
        m.has_tofu = await exists(path.join(dir, 'tofu', 'main.tf'));
        m.has_ansible = await exists(path.join(dir, 'ansible', m.playbook ?? 'site.yml'));
        out.set(key(slug, version), m);
      } catch (err) {
        logger.error({ err, file }, 'blueprint manifesti geçersiz — katalog dışı');
      }
    }
  }
  cache = out;
  logger.info({ n: out.size, root: ROOT }, 'blueprint kataloğu yüklendi');
  return out;
}

export async function listBlueprints(): Promise<BlueprintManifest[]> {
  return [...(await loadBlueprints()).values()].sort((a, b) => a.slug.localeCompare(b.slug) || b.version.localeCompare(a.version));
}

export async function getBlueprint(slug: string, version: string): Promise<BlueprintManifest> {
  const m = (await loadBlueprints()).get(key(slug, version));
  if (!m) throw ApiError.notFound(`Blueprint bulunamadı: ${slug}@${version}`);
  return m;
}

export function blueprintsRoot(): string {
  return ROOT;
}
