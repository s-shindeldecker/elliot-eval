/**
 * Retrieval abstraction for Salesforce opportunity records.
 *
 * Currently loads from a local JSON fixture.
 * Future: replace or augment with live Salesforce API retrieval.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertValidRecord, type SalesforceOpportunityRecord } from './types.js';

export async function fetchOpportunityFromFixture(
  path: string,
): Promise<SalesforceOpportunityRecord> {
  const abs = resolve(path);
  let raw: string;
  try {
    raw = readFileSync(abs, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read Salesforce fixture at ${abs}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in Salesforce fixture at ${abs}`);
  }

  assertValidRecord(parsed);
  return parsed;
}
