import { Command } from 'commander';
import { resolveConfig, type CliOpts } from './config.js';
import { runEval } from './runner.js';

const program = new Command()
  .name('elliot-eval')
  .description('Elliot Evaluation Harness — Experimentation Line-of-sight & Impact Observation Tracker')
  .version('0.1.0')
  .option('--config <path>', 'Path to JSON config file')
  .option('--dataset <path>', 'Path to JSONL dataset file')
  .option('--stage <stage>', 'Stage to run: screening | gold')
  .option('--reportDir <path>', 'Output directory for results')
  .option('--maxConcurrency <n>', 'Max parallel adapter invocations')
  .option('--threshold <n>', 'Pass-rate threshold (0..1)')
  .option('--seed <n>', 'Deterministic seed')
  .option('--failFast', 'Abort on first screening failure')
  .option('--agents <names>', 'Comma-separated agent name filter')
  .option('--timeoutMs <n>', 'Per-invocation timeout in milliseconds')
  .parse();

const opts = program.opts<CliOpts>();

try {
  const config = resolveConfig(opts);
  console.error(`[elliot-eval] stage=${config.stage} agents=${config.agents.map(a => a.name).join(',')} dataset=${config.dataset}`);
  console.error(`[elliot-eval] reportDir=${config.reportDir} maxConcurrency=${config.maxConcurrency} timeoutMs=${config.timeoutMs} failFast=${config.failFast}`);

  const { exitCode } = await runEval(config);
  process.exit(exitCode);
} catch (err) {
  console.error('[elliot-eval] Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
}
