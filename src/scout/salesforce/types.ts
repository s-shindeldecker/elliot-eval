/**
 * Raw Salesforce opportunity record shape.
 *
 * This mirrors the subset of SFDC fields relevant to Elliot's
 * experimentation-impact analysis. Field names use Salesforce's
 * camelCase convention rather than the internal SignalBundle shape.
 */

export interface SalesforceOpportunityRecord {
  id: string;
  accountName: string;
  opportunityName: string;
  opportunityUrl: string;
  stageName: string;
  ownerName?: string | null;
  closeDate?: string | null;
  nextStep?: string | null;
  description?: string | null;
  competitor?: string | null;
  execSponsor?: string | null;
  notes?: string[] | null;
  customFields?: Record<string, unknown> | null;
}

const REQUIRED_FIELDS: (keyof SalesforceOpportunityRecord)[] = [
  'id', 'accountName', 'opportunityName', 'opportunityUrl', 'stageName',
];

export function assertValidRecord(obj: unknown): asserts obj is SalesforceOpportunityRecord {
  if (obj == null || typeof obj !== 'object') {
    throw new Error('SalesforceOpportunityRecord: input must be a non-null object');
  }
  const rec = obj as Record<string, unknown>;
  for (const field of REQUIRED_FIELDS) {
    if (typeof rec[field] !== 'string' || (rec[field] as string).trim().length === 0) {
      throw new Error(`SalesforceOpportunityRecord: missing or empty required field "${field}"`);
    }
  }
}
