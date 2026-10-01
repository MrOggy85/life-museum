export interface ClaudeResult {
  text: string;
  isError: boolean;
  subtype: string;
  turns: number;
  costUsd: number;
  usage: Record<string, unknown>;
  modelUsage: Record<string, unknown>;
}

export type ClaudeFn = (prompt: string) => Promise<ClaudeResult>;

export interface ClaudeOptions {
  bin: string;
  mcpConfig: string;
  cwd: string;
  maxTurns: number;
  maxBudgetUsd: number;
  model?: string;
}

/**
 * One headless `claude -p` run. Hardened: no built-in tools at all (only the catalog MCP), only the MCP config given,
 * no skills, no session kept, run from an empty directory so no project CLAUDE.md is picked up.
 */
export function claudeRunner(o: ClaudeOptions): ClaudeFn {
  return async (prompt) => {
    const args = [
      '-p',
      '--output-format',
      'json',
      '--tools',
      '',
      '--mcp-config',
      o.mcpConfig,
      '--strict-mcp-config',
      '--allowedTools',
      'mcp__catalog',
      '--permission-mode',
      'dontAsk',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--max-turns',
      String(o.maxTurns),
      '--max-budget-usd',
      String(o.maxBudgetUsd),
    ];
    if (o.model) args.push('--model', o.model);
    const child = new Deno.Command(o.bin, { args, cwd: o.cwd, stdin: 'piped', stdout: 'piped', stderr: 'piped' })
      .spawn();
    const w = child.stdin.getWriter();
    await w.write(new TextEncoder().encode(prompt));
    await w.close();
    const out = await child.output();
    const stdout = new TextDecoder().decode(out.stdout).trim();
    if (!stdout) {
      throw new Error(
        `claude produced no output (exit ${out.code}): ${new TextDecoder().decode(out.stderr).slice(-300)}`,
      );
    }
    return parseClaudeJson(stdout);
  };
}

export function parseClaudeJson(stdout: string): ClaudeResult {
  const j = JSON.parse(stdout);
  const r = Array.isArray(j) ? j.findLast((m: { type?: string }) => m.type === 'result') : j;
  if (!r) throw new Error('claude output has no result message');
  return {
    text: typeof r.result === 'string' ? r.result : '',
    isError: Boolean(r.is_error),
    subtype: String(r.subtype ?? ''),
    turns: Number(r.num_turns ?? 0),
    costUsd: Number(r.total_cost_usd ?? 0),
    usage: r.usage ?? {},
    modelUsage: r.modelUsage ?? {},
  };
}
