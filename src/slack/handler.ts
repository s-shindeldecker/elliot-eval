/**
 * Slack event handler — bridges Slack events to the ElliotAgent.
 *
 * Extracts the user message from Slack events, runs the agent,
 * and posts the formatted response back to the thread.
 */

import type { ElliotAgent } from '../agent/elliot-agent.js';
import type { AgentRequest } from '../agent/types.js';
import { formatAgentResponse, formatErrorResponse } from './format.js';

interface SlackSay {
  (message: {
    text: string;
    blocks?: unknown[];
    thread_ts?: string;
  }): Promise<unknown>;
}

interface SlackEvent {
  text: string;
  user?: string;
  channel: string;
  ts: string;
  thread_ts?: string;
}

export function createMessageHandler(agent: ElliotAgent) {
  return async (event: SlackEvent, say: SlackSay): Promise<void> => {
    let userMessage = event.text;

    // Strip the bot mention from the message (e.g., "<@U12345> what's up with Vantaca")
    userMessage = userMessage.replace(/<@[A-Z0-9]+>/g, '').trim();

    if (!userMessage) {
      await say({
        text: "I didn't catch a question. Try something like: what's up with Jackbox Games?",
        thread_ts: event.thread_ts ?? event.ts,
      });
      return;
    }

    const request: AgentRequest = {
      message: userMessage,
      userId: event.user ?? 'unknown',
      channel: event.channel,
      threadId: event.thread_ts ?? event.ts,
    };

    try {
      const result = await agent.run(request);
      const blocks = formatAgentResponse(result);

      await say({
        text: result.response,
        blocks,
        thread_ts: event.thread_ts ?? event.ts,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const blocks = formatErrorResponse(errorMsg);

      await say({
        text: `Error: ${errorMsg}`,
        blocks,
        thread_ts: event.thread_ts ?? event.ts,
      });
    }
  };
}
