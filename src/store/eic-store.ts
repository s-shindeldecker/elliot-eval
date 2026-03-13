import type { Action, EICFields } from '../types.js';

export interface UpsertResult {
  created: boolean;
  updated: boolean;
}

export interface EicStore {
  get(eicId: string): EICFields | undefined;
  upsert(action: Action, eic: EICFields): UpsertResult;
  all(): EICFields[];
  size(): number;
}
