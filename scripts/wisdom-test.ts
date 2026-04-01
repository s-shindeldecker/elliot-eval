#!/usr/bin/env tsx
/**
 * Quick diagnostic to test all Wisdom tools through our client.
 */

import 'dotenv/config';
import { createWisdomClient } from '../src/tools/wisdom/index.js';
import {
  searchAccount,
  getRecentCalls,
  getCallDetails,
  getSupportTickets,
  getAccountFeedback,
  getSlackMentions,
} from '../src/tools/wisdom/tools.js';

const serverUrl = process.env.WISDOM_SERVER_URL;
const authToken = process.env.WISDOM_AUTH_TOKEN;

if (!serverUrl) {
  console.error('WISDOM_SERVER_URL is not set in .env');
  process.exit(1);
}

console.log(`Connecting to: ${serverUrl}`);
console.log();

const client = createWisdomClient({ serverUrl, authToken });

async function main() {
  console.log('--- 1. searchAccount ---');
  const accounts = await searchAccount(client, { query: 'Jackbox Games' });
  console.log(`Found: ${accounts.length}`);
  console.log(JSON.stringify(accounts, null, 2));
  console.log();

  console.log('--- 2. getRecentCalls ---');
  const calls = await getRecentCalls(client, { account_name: 'Jackbox Games', days: 30 });
  console.log(`Found: ${calls.length}`);
  for (const c of calls) {
    console.log(`  ${c.date} | ${c.title} | ${c.participants.join(', ')}`);
  }
  console.log();

  if (calls.length > 0) {
    console.log('--- 3. getCallDetails (first call) ---');
    const detail = await getCallDetails(client, { call_id: calls[0].call_id });
    if (detail) {
      console.log(`  Title: ${detail.title}`);
      console.log(`  Date: ${detail.date}`);
      console.log(`  Participants: ${detail.participants.join(', ')}`);
      console.log(`  Account: ${detail.account_name}`);
      console.log(`  Content length: ${detail.content.length} chars`);
    } else {
      console.log('  (no detail returned)');
    }
    console.log();
  }

  console.log('--- 4. getSupportTickets ---');
  const tickets = await getSupportTickets(client, { account_name: 'Jackbox Games', days: 180 });
  console.log(`Found: ${tickets.length}`);
  for (const t of tickets) {
    console.log(`  ${t.date} | ${t.status} | ${t.content?.slice(0, 80)}...`);
  }
  console.log();

  console.log('--- 5. getAccountFeedback ---');
  const feedback = await getAccountFeedback(client, { account_name: 'Jackbox Games', days: 180 });
  console.log(`Themes: ${feedback.themes.length}`);
  for (const t of feedback.themes) {
    console.log(`  [${t.category}] ${t.theme}: ${t.total}`);
  }
  console.log(`Sources: ${feedback.source_breakdown.length}`);
  for (const s of feedback.source_breakdown) {
    console.log(`  ${s.source}: ${s.total}`);
  }
  console.log();

  console.log('--- 6. getSlackMentions ---');
  const slack = await getSlackMentions(client, { account_name: 'Jackbox', days: 90 });
  console.log(`Found: ${slack.length}`);
  for (const s of slack) {
    console.log(`  ${s.date} | ${s.content?.slice(0, 80)}...`);
  }

  await client.close().catch(() => {});
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
