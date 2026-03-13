import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SignalBundle } from '../src/types/signal-bundle.js';
import { validateBundle } from '../src/curator/validate-bundle.js';
import { renderPacket } from '../src/curator/render-packet.js';

const args = process.argv.slice(2);

function getArg(flag: string, fallback?: string): string {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  if (fallback !== undefined) return fallback;
  console.error(`Missing required argument: ${flag}`);
  process.exit(1);
}

const inPath = resolve(getArg('--in'));
const outPath = resolve(getArg('--out'));
const tag = getArg('--tag', 'gold');

const EXPECT_TRUE = 'EXPECT_CREATE_EIC=true';
const EXPECT_FALSE = 'EXPECT_CREATE_EIC=false';

const raw = readFileSync(inPath, 'utf-8');
const lines = raw.split('\n').filter(l => l.trim().length > 0);

const outputLines: string[] = [];
let warnCount = 0;

for (let i = 0; i < lines.length; i++) {
  let bundle: SignalBundle;
  try {
    bundle = JSON.parse(lines[i]) as SignalBundle;
  } catch (err) {
    console.error(`[build-dataset] Line ${i + 1}: JSON parse error — skipping`);
    continue;
  }

  const validation = validateBundle(bundle);
  if (!validation.ok) {
    warnCount++;
    console.error(`[build-dataset] WARN bundle "${bundle.id}":`);
    for (const e of validation.errors) console.error(`  error: ${e}`);
    for (const w of validation.warnings) console.error(`  warning: ${w}`);
  }

  const inputText = renderPacket(bundle);

  let createEic = false;
  if (bundle.notes?.includes(EXPECT_TRUE)) {
    createEic = true;
  } else if (bundle.notes?.includes(EXPECT_FALSE)) {
    createEic = false;
  }

  const row = {
    id: bundle.id,
    input_text: inputText,
    expected: { create_eic: createEic },
    tags: [tag],
  };

  outputLines.push(JSON.stringify(row));
}

writeFileSync(outPath, outputLines.join('\n') + '\n');

console.error(`[build-dataset] Wrote ${outputLines.length} rows to ${outPath}`);
if (warnCount > 0) {
  console.error(`[build-dataset] ${warnCount} bundle(s) had validation warnings/errors`);
}
