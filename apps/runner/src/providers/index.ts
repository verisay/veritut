import type { IProviderDriver } from './types.js';
import { hetznerDriver } from './hetzner.js';
import { mockDriver } from './mock.js';

const drivers: Record<string, IProviderDriver> = { hetzner: hetznerDriver, mock: mockDriver };

/** Factory (D9): `PROVIDER_DRIVERS` env ile etkin driver listesi (dev varsayılan: mock,hetzner). */
export function getDriver(code: string): IProviderDriver {
  const enabled = (process.env['PROVIDER_DRIVERS'] ?? 'mock,hetzner').split(',').map((s) => s.trim());
  const d = drivers[code];
  if (!d || !enabled.includes(code)) throw new Error(`driver etkin değil: ${code} (PROVIDER_DRIVERS=${enabled.join(',')})`);
  return d;
}
export type { IProviderDriver } from './types.js';
