/**
 * Slack Bolt app for ELLIOT.
 *
 * Thin transport layer: receives Slack messages, hands them to the
 * ElliotAgent, and posts formatted responses back.
 *
 * Supports Socket Mode (no public URL needed) for development.
 *
 * Required environment variables:
 *   SLACK_BOT_TOKEN   — xoxb-* bot token
 *   SLACK_APP_TOKEN   — xapp-* token (for Socket Mode)
 *   LD_SDK_KEY        — LaunchDarkly SDK key
 *   OPENAI_API_KEY    — OpenAI API key
 *
 * Optional:
 *   WISDOM_SERVER_URL — Enterpret KG MCP server URL
 *   WISDOM_AUTH_TOKEN — Bearer token for Wisdom MCP
 *   ELLIOT_AI_CONFIG_KEY — LD AI Config key (default "elliot-agent")
 */

import 'dotenv/config';
import { App } from '@slack/bolt';
import { ElliotAgent } from '../agent/elliot-agent.js';
import { WisdomToolRegistry, createWisdomClient } from '../tools/wisdom/index.js';
import { SalesforceToolRegistry } from '../tools/salesforce/index.js';
import { createMessageHandler } from './handler.js';
import { closeLDClient } from '../adapter/ld-client.js';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const botToken = process.env.SLACK_BOT_TOKEN;
const appToken = process.env.SLACK_APP_TOKEN;

if (!botToken) {
  console.error('SLACK_BOT_TOKEN is required');
  process.exit(1);
}
if (!appToken) {
  console.error('SLACK_APP_TOKEN is required (Socket Mode)');
  process.exit(1);
}

const app = new App({
  token: botToken,
  appToken,
  socketMode: true,
});

// ---------------------------------------------------------------------------
// Agent setup
// ---------------------------------------------------------------------------

const judgeKey = process.env.ELLIOT_JUDGE_AI_CONFIG_KEY ?? 'elliot-candidate-a';

const agent = new ElliotAgent({
  aiConfigKey: process.env.ELLIOT_AI_CONFIG_KEY ?? 'elliot-agent',
  judgeAiConfigKey: judgeKey || undefined,
  contextKind: 'user',
  contextKey: 'elliot-slack',
});

if (process.env.WISDOM_SERVER_URL) {
  const wisdomClient = createWisdomClient({
    serverUrl: process.env.WISDOM_SERVER_URL,
    authToken: process.env.WISDOM_AUTH_TOKEN,
  });
  agent.registerTools(new WisdomToolRegistry(wisdomClient));
}

if (process.env.SALESFORCE_INSTANCE_URL) {
  agent.registerTools(new SalesforceToolRegistry(null));
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

const handleMessage = createMessageHandler(agent);

app.event('app_mention', async ({ event, say }) => {
  await handleMessage(event, say);
});

app.event('message', async ({ event, say }) => {
  const msgEvent = event as unknown as { text: string; user: string; channel: string; ts: string; thread_ts?: string; channel_type?: string; bot_id?: string };
  if (msgEvent.bot_id) return;
  if (msgEvent.channel_type !== 'im') return;

  await handleMessage(msgEvent, say);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

(async () => {
  await app.start();
  console.log('ELLIOT Slack bot is running (Socket Mode)');
})();

const shutdown = async () => {
  console.log('Shutting down...');
  await app.stop();
  await closeLDClient();
  process.exit(0);
};

process.once('SIGINT', () => { shutdown(); });
process.once('SIGTERM', () => { shutdown(); });
