#!/usr/bin/env tsx
/**
 * Test whether Salesforce-linked fields exist on Gong NLI nodes.
 * Each field is tested individually to avoid the 0-row issue
 * caused by requesting non-existent properties.
 */

import 'dotenv/config';
import { createWisdomClient } from '../src/tools/wisdom/index.js';

const serverUrl = process.env.WISDOM_SERVER_URL;
const authToken = process.env.WISDOM_AUTH_TOKEN;

if (!serverUrl) {
  console.error('WISDOM_SERVER_URL is not set in .env');
  process.exit(1);
}

const client = createWisdomClient({ serverUrl, authToken });

async function query(label: string, cypher: string) {
  console.log(`\n=== ${label} ===`);
  const result = await client.executeCypher(cypher, label);
  if (!result.success) {
    console.log('FAILED:', result.error ?? 'unknown error');
    return;
  }
  console.log(`Rows: ${result.row_count}`);
  if (result.rows && result.rows.length > 0) {
    for (const row of result.rows) {
      console.log(JSON.stringify(row));
    }
  } else {
    console.log('(no rows)');
  }
}

async function main() {
  // Test each Salesforce-linked Gong field individually
  await query('opp_name only', `
    MATCH (nli:NaturalLanguageInteraction)
    WHERE nli.gong_account_account_name CONTAINS 'Jackbox'
    RETURN DISTINCT nli.gong_account_opportunity_name AS opp_name
    LIMIT 5
  `);

  await query('opp_stagename only', `
    MATCH (nli:NaturalLanguageInteraction)
    WHERE nli.gong_account_account_name CONTAINS 'Jackbox'
    RETURN DISTINCT nli.gong_account_opportunity_stagename AS opp_stage
    LIMIT 5
  `);

  await query('opp_amount only', `
    MATCH (nli:NaturalLanguageInteraction)
    WHERE nli.gong_account_account_name CONTAINS 'Jackbox'
    RETURN DISTINCT nli.gong_account_opportunity_amount AS opp_amount
    LIMIT 5
  `);

  // If individual fields work, test them combined
  await query('opp fields combined', `
    MATCH (nli:NaturalLanguageInteraction)
    WHERE nli.gong_account_account_name CONTAINS 'Jackbox'
    RETURN DISTINCT
      nli.origin_record_id AS call_id,
      nli.gong_account_opportunity_name AS opp_name,
      nli.gong_account_opportunity_stagename AS opp_stage,
      nli.gong_account_opportunity_amount AS opp_amount
    LIMIT 5
  `);

  // Test combined with existing fields we know work
  await query('opp fields + existing fields', `
    MATCH (nli:NaturalLanguageInteraction)
    WHERE nli.gong_account_account_name CONTAINS 'Jackbox'
    RETURN
      nli.origin_record_id AS call_id,
      nli.gong_metadata_title AS title,
      nli.record_timestamp AS record_ts,
      nli.gong_parties_name AS participant,
      nli.gong_account_opportunity_name AS opp_name,
      nli.gong_account_opportunity_stagename AS opp_stage
    ORDER BY nli.record_timestamp DESC
    LIMIT 10
  `);

  await client.close().catch(() => {});
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
