/**
 * Run ONE codeact eval case against a real provider and dump every action's
 * code, the bridged tool calls it made, and the final result — the eval
 * report gives pass/fail and counts, which is right for a scoreboard and
 * useless for tuning the action-contract prompt.
 *
 *   IS_SANDBOX=1 npx tsx packages/agents/scripts/dump-codeact-run.ts \
 *     api-interactive-escalation claude_agent_sdk sonnet [maxIterations]
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ProcessingContext } from "@nodetool-ai/runtime";
// The CLI's provider factory: registry-backed, same path `nodetool eval` uses.
import { createProviderStrict } from "../../cli/src/providers.js";
import type { StepResult, ToolCallUpdate } from "@nodetool-ai/protocol";
import {
  CodeActExecutor,
  EXECUTE_CODE_TOOL_NAME
} from "../src/codeact/codeact-executor.js";
import type { Step, Task } from "../src/types.js";
import {
  CODEACT_EVAL_CASES,
  createCodeActRecorder,
  createCodeActTools
} from "../src/evals/codeact-cases.js";
import { CODEACT_API_EVAL_CASES } from "../src/evals/codeact-api-cases.js";
import {
  CODEACT_SANDBOX_PACK_EVAL_CASES,
  shippedHostPackCatalog
} from "../src/evals/codeact-sandbox-pack-cases.js";
import { checkCodeActExpectations } from "../src/evals/codeact-eval.js";

const [caseId, providerId = "claude_agent_sdk", model = "sonnet", iterations] =
  process.argv.slice(2);

const evalCase = [
  ...CODEACT_EVAL_CASES,
  ...CODEACT_API_EVAL_CASES,
  ...CODEACT_SANDBOX_PACK_EVAL_CASES
].find((c) => c.id === caseId);
if (!evalCase) {
  console.error(`Unknown case "${caseId}".`);
  process.exit(1);
}

const provider = await createProviderStrict(providerId);
const recorder = createCodeActRecorder();
const tools = (evalCase.createTools ?? createCodeActTools)(recorder);
const sandboxPackages = evalCase.sandboxPackages ?? [];
const context = new ProcessingContext({
  jobId: `codeact-dump-${randomUUID()}`,
  userId: "eval-user",
  ...(sandboxPackages.length > 0
    ? { sandboxModuleCatalog: shippedHostPackCatalog() }
    : {})
});
const step: Step = {
  id: randomUUID(),
  instructions: evalCase.objective,
  completed: false,
  dependsOn: [],
  logs: [],
  outputSchema: evalCase.outputSchema
    ? JSON.stringify(evalCase.outputSchema)
    : undefined
};
const task: Task = { id: randomUUID(), title: evalCase.description, steps: [step] };

const executor = new CodeActExecutor({
  task,
  step,
  context,
  provider,
  model,
  tools,
  maxIterations: iterations ? Number(iterations) : 40,
  sandboxPackages
});

const lines: string[] = [
  `# codeact dump — ${evalCase.id} (${providerId}/${model})`,
  ``,
  `Objective: ${evalCase.objective}`,
  ``
];
let actions = 0;
let bridgedBefore = 0;
let result: unknown = null;
let error: string | undefined;

for await (const item of executor.execute()) {
  if (item.type === "tool_call_update") {
    const tc = item as ToolCallUpdate;
    if (tc.name === EXECUTE_CODE_TOOL_NAME) {
      actions++;
      const args = (tc.args ?? {}) as { title?: string; code?: string };
      const bridged = recorder.invocations.slice(bridgedBefore);
      bridgedBefore = recorder.invocations.length;
      if (bridged.length > 0) {
        lines.push(
          `   bridged: ${bridged.map((b) => b.name).join(", ")}`,
          ``
        );
      }
      lines.push(
        `## Action ${actions}: ${args.title ?? "(untitled)"}`,
        "```js",
        (args.code ?? "").trim(),
        "```",
        ``
      );
    }
  }
  if (item.type === "step_result") {
    const sr = item as StepResult;
    if (sr.error) error = sr.error;
    else result = sr.result;
  }
}
const tail = recorder.invocations.slice(bridgedBefore);
if (tail.length > 0) {
  lines.push(`   bridged: ${tail.map((b) => b.name).join(", ")}`, ``);
}

const checks = checkCodeActExpectations(
  {
    toolsInvoked: new Set(recorder.invocations.map((i) => i.name)),
    actions,
    toolCalls: recorder.invocations.length,
    result
  },
  evalCase.expect
);
lines.push(
  `## Outcome`,
  `- actions: ${actions}, bridged tool calls: ${recorder.invocations.length}`,
  `- error: ${error ?? "none"}`,
  `- result: ${JSON.stringify(result)?.slice(0, 500)}`,
  ...checks.map(
    (c) =>
      `- ${c.pass ? "pass" : "FAIL"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`
  )
);

const outDir = path.resolve("nodetool-debug");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `codeact-${evalCase.id}.md`);
writeFileSync(outFile, lines.join("\n"));
console.log(lines.join("\n"));
console.log(`\nwritten: ${outFile}`);
process.exit(error ? 1 : 0);
