/**
 * V1→V2 payload normalization.
 *
 * Converts legacy agent response shapes into the v2 contract so that the
 * schema validator and scorer only need to understand one format.
 *
 * Normalization runs on the raw parsed object BEFORE AJV schema validation.
 * It is intentionally permissive — structural errors are caught by AJV.
 *
 * All silent meaning changes are avoided. Where data cannot be mapped
 * losslessly the normalizer emits a warning code instead of guessing.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;

export interface NormalizeResult {
  normalized: unknown;
  warnings: string[];
}

export function normalizeAgentResponse(raw: unknown): NormalizeResult {
  const warnings: string[] = [];

  if (raw == null || typeof raw !== 'object') return { normalized: raw, warnings };
  const obj = raw as Obj;

  normalizeAction(obj, warnings);
  normalizeEicFields(obj, warnings);
  normalizeStatusAlias(obj);
  normalizeLegacyStatus(obj, warnings);

  return { normalized: obj, warnings };
}

// ---------------------------------------------------------------------------
// create_eic boolean → action enum
// ---------------------------------------------------------------------------

const EIC_ID_PREFIX = /^EIC-/;

function normalizeAction(obj: Obj, warnings: string[]): void {
  const json = obj['json'];
  if (json == null || typeof json !== 'object') return;

  if (json['action'] == null && typeof json['create_eic'] === 'boolean') {
    if (json['create_eic'] === true) {
      const eic = json['eic'];
      const eicId = eic != null && typeof eic === 'object' ? eic['eic_id'] : undefined;
      if (typeof eicId === 'string' && EIC_ID_PREFIX.test(eicId)) {
        json['action'] = 'UPDATE';
        warnings.push('ACTION_INFERRED_UPDATE: create_eic=true with existing eic_id; inferred action=UPDATE');
      } else {
        json['action'] = 'CREATE';
      }
    } else {
      json['action'] = 'NO_ACTION';
    }
    delete json['create_eic'];
  }
}

// ---------------------------------------------------------------------------
// evidence_citation_1/2 → evidence[]
// influence_strength legacy zero handling
// impact_classification conservative default
// ---------------------------------------------------------------------------

function normalizeEicFields(obj: Obj, warnings: string[]): void {
  const eic = obj['json']?.['eic'];
  if (eic == null || typeof eic !== 'object') return;

  // --- Evidence migration ---
  if (!Array.isArray(eic['evidence'])) {
    const evidence: Obj[] = [];
    const c1 = eic['evidence_citation_1'];
    const c2 = eic['evidence_citation_2'];

    if (typeof c1 === 'string' && c1.length > 0) {
      evidence.push({
        evidence_id: 'ev-legacy-1',
        source_type: 'unknown',
        url: c1,
      });
    }
    if (typeof c2 === 'string' && c2.length > 0) {
      evidence.push({
        evidence_id: 'ev-legacy-2',
        source_type: 'unknown',
        url: c2,
      });
    }

    eic['evidence'] = evidence;
  }

  delete eic['evidence_citation_1'];
  delete eic['evidence_citation_2'];

  // --- influence_strength: do NOT silently floor 0→1 ---
  if (typeof eic['influence_strength'] === 'number' && eic['influence_strength'] === 0) {
    eic['influence_strength'] = null;
    warnings.push('LEGACY_INFLUENCE_ZERO: influence_strength was 0 in legacy payload; set to null');
  }

  // --- impact_classification: conservative default, no heuristic ---
  if (eic['impact_classification'] == null) {
    eic['impact_classification'] = 'HYPOTHESIZED';
    warnings.push('IMPACT_CLASSIFICATION_DEFAULTED: impact_classification missing; defaulted to HYPOTHESIZED');
  }
}

// ---------------------------------------------------------------------------
// intelligence_status ↔ status aliasing (status is canonical internally)
// ---------------------------------------------------------------------------

function normalizeStatusAlias(obj: Obj): void {
  const eic = obj['json']?.['eic'];
  if (eic == null || typeof eic !== 'object') return;

  if (eic['intelligence_status'] != null && eic['status'] == null) {
    eic['status'] = eic['intelligence_status'];
  }

  delete eic['intelligence_status'];
}

// ---------------------------------------------------------------------------
// Legacy status CW/CL → Active + commercial_outcome
// ---------------------------------------------------------------------------

const LEGACY_STATUS_MAP: Record<string, string> = {
  CW: 'CLOSED_WON',
  CL: 'CLOSED_LOST',
};

function normalizeLegacyStatus(obj: Obj, warnings: string[]): void {
  const eic = obj['json']?.['eic'];
  if (eic == null || typeof eic !== 'object') return;

  const status = eic['status'];
  const mapped = typeof status === 'string' ? LEGACY_STATUS_MAP[status] : undefined;
  if (mapped) {
    eic['status'] = 'Active';
    if (eic['commercial_outcome'] == null) {
      eic['commercial_outcome'] = mapped;
    }
    warnings.push(
      `LEGACY_STATUS_CW_CL_MAPPED: status="${status}" mapped to status="Active" + commercial_outcome="${mapped}"`,
    );
  }
}

// ---------------------------------------------------------------------------
// Normalize expected output (dataset rows) for back-compat
// ---------------------------------------------------------------------------

export function normalizeExpected(expected: unknown): unknown {
  if (expected == null || typeof expected !== 'object') return expected;
  const obj = expected as Obj;

  if (obj['action'] == null && typeof obj['create_eic'] === 'boolean') {
    obj['action'] = obj['create_eic'] ? 'CREATE' : 'NO_ACTION';
  }

  return obj;
}
