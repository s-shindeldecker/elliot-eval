/**
 * Formats an AgentResult into Slack Block Kit blocks for rich display.
 */

import type { AgentResult } from '../agent/types.js';

interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: Array<{ type: string; text: string }>;
  fields?: Array<{ type: string; text: string }>;
}

export function formatAgentResponse(result: AgentResult): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: result.response || '_No response generated._',
    },
  });

  if (result.scoring) {
    const fields: Array<{ type: string; text: string }> = [];

    fields.push({
      type: 'mrkdwn',
      text: `*Action:* ${result.scoring.action}`,
    });

    if (result.scoring.confidence != null) {
      fields.push({
        type: 'mrkdwn',
        text: `*Confidence:* ${result.scoring.confidence}%`,
      });
    }

    blocks.push({ type: 'section', fields });

    if (result.scoring.summary?.length) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: result.scoring.summary.map(s => `> ${s}`).join('\n'),
        },
      });
    }
  }

  const meta = result.metadata;
  const metaParts: string[] = [];
  if (meta.model) metaParts.push(`Model: ${meta.model}`);
  metaParts.push(`Latency: ${(meta.latencyMs / 1000).toFixed(1)}s`);
  metaParts.push(`Tool calls: ${meta.toolCalls.length}`);
  if (meta.iterations > 0) metaParts.push(`Iterations: ${meta.iterations}`);

  blocks.push({
    type: 'context',
    elements: metaParts.map(t => ({ type: 'mrkdwn', text: t })),
  });

  if (meta.error) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:warning: *Error:* ${meta.error}`,
      },
    });
  }

  return blocks;
}

export function formatErrorResponse(error: string): SlackBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:x: Something went wrong: ${error}`,
      },
    },
  ];
}
