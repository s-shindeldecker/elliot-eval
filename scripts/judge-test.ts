#!/usr/bin/env tsx
/**
 * Judge-only replay harness: sends a saved Curator packet through the Judge
 * AI Config without running Scout. Useful for A/B testing prompt variations.
 *
 * Usage:
 *   npm run judge:test -- --packet packets/jackbox.txt
 *   npm run judge:test -- --packet packets/jackbox.txt --config elliot-candidate-b
 *   echo "paste packet" | npm run judge:test
 *
 * The script also saves the Curator packet from the last full agent:cli run
 * when called with --save-packet, enabling a capture-then-replay workflow.
 *
 * Required env: LD_SDK_KEY, OPENAI_API_KEY
 */

import 'dotenv/config';
import * as fs from 'fs';
import { invokeLDAIConfig, closeLDClient } from '../src/adapter/ld-client.js';

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const packetPath = getArg('--packet');
const configKey = getArg('--config') ?? process.env.ELLIOT_JUDGE_AI_CONFIG_KEY ?? 'elliot-candidate-a';

async function loadPacket(): Promise<string> {
  if (packetPath) {
    if (!fs.existsSync(packetPath)) {
      console.error(`Packet file not found: ${packetPath}`);
      process.exit(1);
    }
    return fs.readFileSync(packetPath, 'utf-8');
  }

  // Read from stdin
  if (process.stdin.isTTY) {
    console.error('No --packet provided and stdin is a TTY.');
    console.error('Usage: npm run judge:test -- --packet <file> [--config <ai-config-key>]');
    process.exit(1);
  }

  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

async function main() {
  const inputText = await loadPacket();

  if (!inputText.trim()) {
    console.error('Empty packet — nothing to judge.');
    process.exit(1);
  }

  console.log(`─── Judge Test ──────────────────────────────`);
  console.log(`  Config:  ${configKey}`);
  console.log(`  Packet:  ${packetPath ?? '(stdin)'} (${inputText.length} chars)`);
  console.log(`─────────────────────────────────────────────\n`);

  const result = await invokeLDAIConfig({
    aiConfigKey: configKey,
    contextKind: 'user',
    contextKey: 'judge-test',
    variables: { input_text: inputText },
  });

  if (result.error) {
    console.error(`Judge error: ${result.error}`);
    process.exit(1);
  }

  // Parse the Judge output
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(result.rawText);
  } catch {
    console.log('─── Raw Output (unparseable JSON) ──────────');
    console.log(result.rawText);
  }

  if (parsed) {
    const action = (parsed.json as Record<string, unknown>)?.action ?? parsed.action ?? 'UNKNOWN';
    const eic = (parsed.json as Record<string, unknown>)?.eic as Record<string, unknown> | null;
    const confidence = eic?.confidence ?? 'N/A';
    const summaries = Array.isArray(parsed.human_summary) ? parsed.human_summary : [];

    console.log(`─── Scoring ─────────────────────────────────`);
    console.log(`  Action:     ${action}`);
    console.log(`  Confidence: ${confidence}`);
    if (summaries.length) {
      console.log(`  Summary:`);
      for (const s of summaries) {
        console.log(`    - ${s}`);
      }
    }

    if (eic) {
      console.log(`\n─── EIC Detail ──────────────────────────────`);
      const fields = [
        'stage', 'stage_bucket', 'motion', 'ae_owner',
        'experimentation_team_engaged', 'ai_configs_adjacent',
        'competitive_mention', 'influence_strength', 'impact_priority',
        'impact_classification', 'primary_influence_tag',
        'summary_why_it_matters', 'status',
      ];
      for (const f of fields) {
        if (eic[f] != null) {
          console.log(`  ${f}: ${eic[f]}`);
        }
      }
    }

    console.log(`\n─── Full JSON ───────────────────────────────`);
    console.log(JSON.stringify(parsed, null, 2));
  }

  console.log(`\n─── Metadata ────────────────────────────────`);
  console.log(`  Model:   ${result.model ?? 'unknown'}`);
  console.log(`  Latency: ${(result.latencyMs / 1000).toFixed(1)}s`);
  if (result.tokens) {
    console.log(`  Tokens:  ${result.tokens.input} in / ${result.tokens.output} out / ${result.tokens.total} total`);
  }
  console.log(`─────────────────────────────────────────────`);

  await closeLDClient();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
