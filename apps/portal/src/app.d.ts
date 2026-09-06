import type { MeDto } from '@veritut/types';
declare global {
  namespace App {
    interface PageData {
      me?: MeDto;
    }
  }
}
export {};
