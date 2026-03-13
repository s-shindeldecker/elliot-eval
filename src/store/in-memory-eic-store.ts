import type { Action, EICFields } from '../types.js';
import type { EicStore, UpsertResult } from './eic-store.js';

export class InMemoryEicStore implements EicStore {
  private readonly records = new Map<string, EICFields>();

  get(eicId: string): EICFields | undefined {
    return this.records.get(eicId);
  }

  upsert(action: Action, eic: EICFields): UpsertResult {
    switch (action) {
      case 'CREATE': {
        if (this.records.has(eic.eic_id)) {
          throw new Error(`CREATE failed: EIC "${eic.eic_id}" already exists`);
        }
        this.records.set(eic.eic_id, eic);
        return { created: true, updated: false };
      }
      case 'UPDATE': {
        if (!this.records.has(eic.eic_id)) {
          throw new Error(`UPDATE failed: EIC "${eic.eic_id}" does not exist`);
        }
        this.records.set(eic.eic_id, eic);
        return { created: false, updated: true };
      }
      case 'NO_ACTION':
        return { created: false, updated: false };
    }
  }

  all(): EICFields[] {
    return [...this.records.values()];
  }

  size(): number {
    return this.records.size;
  }
}
