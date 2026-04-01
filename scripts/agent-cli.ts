#!/usr/bin/env tsx
/**
 * CLI harness for testing the ElliotAgent without Slack.
 *
 * Usage:
 *   npm run agent:cli -- "What's up with Jackbox Games?"
 *   npm run agent:cli                      # enters interactive mode
 *
 * Required env:
 *   LD_SDK_KEY, OPENAI_API_KEY
 *
 * Optional env:
 *   WISDOM_SERVER_URL, WISDOM_AUTH_TOKEN    — enables Wisdom tools
 *   ELLIOT_AI_CONFIG_KEY                    — defaults to "elliot-agent"
 *   ELLIOT_JUDGE_AI_CONFIG_KEY              — defaults to "elliot-judge" (set to "" to skip Judge)
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as readline from 'readline';
import { ElliotAgent } from '../src/agent/elliot-agent.js';
import { WisdomToolRegistry, createWisdomClient, type WisdomClient } from '../src/tools/wisdom/index.js';
import { SalesforceToolRegistry } from '../src/tools/salesforce/index.js';
import { closeLDClient } from '../src/adapter/ld-client.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const judgeKey = process.env.ELLIOT_JUDGE_AI_CONFIG_KEY ?? 'elliot-candidate-a';

const agent = new ElliotAgent({
  aiConfigKey: process.env.ELLIOT_AI_CONFIG_KEY ?? 'elliot-agent',
  judgeAiConfigKey: judgeKey || undefined,
  contextKind: 'user',
  contextKey: 'cli-user',
});

let wisdomClient: WisdomClient | undefined;

if (process.env.WISDOM_SERVER_URL) {
  wisdomClient = createWisdomClient({
    serverUrl: process.env.WISDOM_SERVER_URL,
    authToken: process.env.WISDOM_AUTH_TOKEN,
  });
  agent.registerTools(new WisdomToolRegistry(wisdomClient));
  console.log('✓ Wisdom tools registered');
} else {
  console.log('⊘ Wisdom tools disabled (set WISDOM_SERVER_URL to enable)');
}

if (process.env.SALESFORCE_INSTANCE_URL) {
  agent.registerTools(new SalesforceToolRegistry(null));
  console.log('✓ Salesforce tools registered');
} else {
  console.log('⊘ Salesforce tools disabled (set SALESFORCE_INSTANCE_URL to enable)');
}

if (judgeKey) {
  console.log(`✓ Judge enabled (${judgeKey})`);
} else {
  console.log('⊘ Judge disabled (set ELLIOT_JUDGE_AI_CONFIG_KEY to enable)');
}
console.log();

// ---------------------------------------------------------------------------
// Run a single query
// ---------------------------------------------------------------------------

async function runQuery(message: string): Promise<void> {
  console.log(`─── Query ───────────────────────────────────`);
  console.log(message);
  console.log(`─────────────────────────────────────────────`);
  console.log();

  const result = await agent.run({ message, userId: 'cli-user' });

  console.log(`─── Response ────────────────────────────────`);
  console.log(result.response);
  console.log();

  if (result.metadata.toolCalls.length > 0) {
    console.log(`─── Tool Calls (${result.metadata.toolCalls.length}) ──────────────────`);
    for (const tc of result.metadata.toolCalls) {
      console.log(`  → ${tc.name}(${JSON.stringify(tc.args)})`);
    }
    console.log();
  }

  if (result.scoring) {
    console.log(`─── Scoring ─────────────────────────────────`);
    console.log(`  Action:     ${result.scoring.action}`);
    if (result.scoring.confidence != null) {
      console.log(`  Confidence: ${result.scoring.confidence}`);
    }
    if (result.scoring.summary?.length) {
      console.log(`  Summary:`);
      for (const s of result.scoring.summary) {
        console.log(`    - ${s}`);
      }
    }
    console.log();
  }

  // Save Curator packet for replay testing
  if (result.curatorPacket) {
    const slug = message.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50).replace(/-$/, '');
    const packetPath = `packets/${slug}.txt`;
    fs.mkdirSync('packets', { recursive: true });
    fs.writeFileSync(packetPath, result.curatorPacket, 'utf-8');
    console.log(`─── Packet Saved ────────────────────────────`);
    console.log(`  ${packetPath}`);
    console.log(`  Replay: npm run judge:test -- --packet ${packetPath}`);
    console.log();
  }

  console.log(`─── Metadata ────────────────────────────────`);
  console.log(`  Model:      ${result.metadata.model ?? 'unknown'}`);
  console.log(`  Latency:    ${(result.metadata.latencyMs / 1000).toFixed(1)}s`);
  console.log(`  Iterations: ${result.metadata.iterations}`);
  if (result.metadata.tokens) {
    console.log(`  Tokens:     ${result.metadata.tokens.input} in / ${result.metadata.tokens.output} out / ${result.metadata.tokens.total} total`);
  }
  if (result.metadata.error) {
    console.log(`  Error:      ${result.metadata.error}`);
  }
  console.log(`─────────────────────────────────────────────`);
  console.log();
}

// ---------------------------------------------------------------------------
// Interactive mode
// ---------------------------------------------------------------------------

async function interactive(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('ELLIOT Agent CLI — Interactive Mode');
  console.log('Type a message and press Enter. Type "exit" or Ctrl+C to quit.');
  console.log();

  const prompt = (): Promise<string> =>
    new Promise(resolve => {
      rl.question('elliot> ', answer => resolve(answer));
    });

  let running = true;
  rl.on('close', () => { running = false; });

  while (running) {
    const input = await prompt();
    if (!input || input.toLowerCase() === 'exit') break;
    await runQuery(input);
  }

  rl.close();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function cleanup(): Promise<void> {
  if (wisdomClient) await wisdomClient.close().catch(() => {});
  await closeLDClient().catch(() => {});
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    const message = args.join(' ');
    await runQuery(message);
  } else {
    await interactive();
  }

  await cleanup();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
