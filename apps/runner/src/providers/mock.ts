import type { InventoryItem, ProviderCapabilities } from '@veritut/types';
import type { IProviderDriver } from './types.js';

/** Mock driver — dev/test: deterministik envanter (kimlik bilgisi `seed` ile çeşitlenir). */
export const mockDriver: IProviderDriver = {
  code: 'mock',
  async capabilities(): Promise<ProviderCapabilities> {
    return { code: 'mock', regions: [{ code: 'tr-ist', residency: 'TR', name: 'İstanbul (mock)' }, { code: 'eu-fra', residency: 'EU', name: 'Frankfurt (mock)' }], sizes: ['S', 'M', 'L'] };
  },
  async healthcheck() {
    return true;
  },
  async listInventory(creds): Promise<InventoryItem[]> {
    const seed = creds['seed'] ?? 'a';
    const items: InventoryItem[] = [
      { externalId: `server:${seed}-1`, kind: 'server', name: `${seed}-nextcloud`, region: 'tr-ist', residency: 'TR', status: 'running', specs: { serverType: 'M', cores: 4, memoryGb: 8 }, tags: { app: 'nextcloud' }, monthlyCostEstimate: 24.5, currency: 'EUR' },
      { externalId: `server:${seed}-2`, kind: 'server', name: `${seed}-n8n`, region: 'eu-fra', residency: 'EU', status: 'running', specs: { serverType: 'S', cores: 2, memoryGb: 4 }, tags: { app: 'n8n' }, monthlyCostEstimate: 9.9, currency: 'EUR' },
      { externalId: `volume:${seed}-v1`, kind: 'volume', name: `${seed}-nextcloud-data`, region: 'tr-ist', residency: 'TR', status: 'available', specs: { sizeGb: 100 }, tags: {}, monthlyCostEstimate: 5.2, currency: 'EUR' },
      { externalId: `ip:${seed}-ip9`, kind: 'ip', name: `${seed}-eski-ip (203.0.113.9)`, region: 'eu-fra', residency: 'EU', status: 'unassigned', specs: { type: 'ipv4' }, tags: {}, monthlyCostEstimate: 0.6, currency: 'EUR' },
    ];
    return items;
  },
};
