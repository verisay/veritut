import type { InventoryItem, ProviderCapabilities } from '@veritut/types';

/**
 * IProviderDriver (D9): provizyonun kendisi OpenTofu'da; driver yalnız envanter / maliyet / yetenek.
 * Kimlik bilgisi runner'da açılır ve yalnız çağrı süresince bellekte tutulur.
 */
export interface IProviderDriver {
  readonly code: string;
  capabilities(): Promise<ProviderCapabilities>;
  listInventory(creds: Record<string, string>): Promise<InventoryItem[]>;
  healthcheck(creds: Record<string, string>): Promise<boolean>;
}
