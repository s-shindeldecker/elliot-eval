import type { SignalBundle } from '../types/signal-bundle.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateBundle(bundle: SignalBundle): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!bundle.id || bundle.id.trim().length === 0) {
    errors.push('id is empty');
  }
  if (!bundle.title || bundle.title.trim().length === 0) {
    errors.push('title is empty');
  }
  if (!bundle.snapshot.account || bundle.snapshot.account.trim().length === 0) {
    errors.push('snapshot.account is empty');
  }
  if (!bundle.snapshot.opportunity || bundle.snapshot.opportunity.trim().length === 0) {
    errors.push('snapshot.opportunity is empty');
  }

  const seenLinks = new Set<string>();
  for (let i = 0; i < bundle.evidence.length; i++) {
    const ev = bundle.evidence[i];
    const prefix = `evidence[${i}]`;

    if (!ev.source_type || ev.source_type.trim().length === 0) {
      errors.push(`${prefix}.source_type is empty`);
    }
    if (!ev.source_link || ev.source_link.trim().length === 0) {
      errors.push(`${prefix}.source_link is empty`);
    } else if (seenLinks.has(ev.source_link)) {
      errors.push(`${prefix}.source_link is duplicate: "${ev.source_link}"`);
    } else {
      seenLinks.add(ev.source_link);
    }
    if (!ev.snippet || ev.snippet.trim().length === 0) {
      errors.push(`${prefix}.snippet is empty`);
    }
  }

  if (bundle.evidence.length === 0) {
    warnings.push('evidence array is empty');
  }
  if (bundle.snapshot.stage_bucket == null) {
    warnings.push('snapshot.stage_bucket is missing');
  }
  if (bundle.snapshot.motion == null) {
    warnings.push('snapshot.motion is missing');
  }
  if (
    bundle.snapshot.next_checkpoint != null &&
    bundle.snapshot.next_checkpoint.length > 0 &&
    !ISO_DATE.test(bundle.snapshot.next_checkpoint)
  ) {
    warnings.push(`snapshot.next_checkpoint "${bundle.snapshot.next_checkpoint}" does not match YYYY-MM-DD`);
  }

  return { ok: errors.length === 0, errors, warnings };
}
