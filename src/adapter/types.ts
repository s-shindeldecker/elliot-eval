// ---------------------------------------------------------------------------
// Agent adapter interface — stateless per invocation (guardrail 13)
// ---------------------------------------------------------------------------

export interface AdapterInput {
  caseId: string;
  inputText: string;
}

export interface AdapterOutput {
  rawText: string;
  latencyMs: number;
  error?: string;
}

export interface AgentAdapter {
  readonly name: string;
  invoke(input: AdapterInput): Promise<AdapterOutput>;
}
