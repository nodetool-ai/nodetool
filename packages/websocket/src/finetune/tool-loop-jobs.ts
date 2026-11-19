/**
 * The `tool-loop` eval cases as jobs the product-chat harness can run.
 *
 * A case already has what a training task needs: a fresh headless world per
 * run, an objective in the user's voice, and checks over the calls and the
 * final state. This wraps the case's tools so the calls are recorded, and
 * grades with the case's own checker. A run counts as achieved only when no
 * critical or standard check failed; advisory checks (call counts, hygiene)
 * may miss.
 */
import {
  checkToolLoopExpectations,
  type ErasedJob,
  type HeadlessTool,
  type OutcomeResult,
  type ToolLoopCallRecord,
  type ToolLoopEvalCase
} from "@nodetool-ai/agents";

/** True when the chat path can run the case unattended. */
export function isChatRunnable<TFinal>(testCase: ToolLoopEvalCase<TFinal>): boolean {
  return (
    testCase.escalation === undefined &&
    testCase.permission === undefined &&
    testCase.needsModelProviders !== true
  );
}

/**
 * Wrap one `tool-loop` case as an {@link ErasedJob} with id `<suite>/<case>`.
 * `surface` is the editor the browser would have focused, if any.
 */
export function toolLoopCaseJob<TFinal>(
  suite: string,
  testCase: ToolLoopEvalCase<TFinal>,
  surface?: string
): ErasedJob {
  const id = `${suite}/${testCase.id}`;
  return {
    id,
    statement: testCase.description,
    surfaces: surface === undefined ? [] : [surface],
    difficulty: "standard",
    // Chat users type the request; the eval's "Objective:" label is not theirs.
    objective: (testCase.userPrompt ?? testCase.objective).replace(/^Objective:\s*/, ""),
    outcomeNames: [],
    start: async () => {
      const bridge = await testCase.createBridge();
      const calls: ToolLoopCallRecord[] = [];
      const tools: HeadlessTool[] = bridge.tools.map((tool) => ({
        ...tool,
        execute: async (args: Record<string, unknown>) => {
          const started = Date.now();
          const record: ToolLoopCallRecord = {
            name: tool.name,
            args,
            result: undefined,
            isError: false,
            index: calls.length,
            durationMs: 0
          };
          calls.push(record);
          try {
            record.result = await tool.execute(args);
            record.isError = isErrorResult(record.result);
            return record.result;
          } catch (err) {
            record.isError = true;
            record.result = { error: err instanceof Error ? err.message : String(err) };
            throw err;
          } finally {
            record.durationMs = Date.now() - started;
          }
        }
      }));
      return {
        tools,
        grade: (): OutcomeResult[] => {
          const checks = checkToolLoopExpectations(
            { toolCalls: calls, finalState: bridge.finalState() },
            testCase.expect
          );
          return checks
            .filter((check) => check.severity !== "advisory")
            .map((check) => ({
              name: check.name,
              describe: check.detail ?? check.name,
              passed: check.pass
            }));
        }
      };
    }
  };
}

/** Every case of one suite that the chat path can run, as jobs. */
export function suiteJobs<TFinal>(
  suite: string,
  cases: readonly ToolLoopEvalCase<TFinal>[],
  surface?: string
): ErasedJob[] {
  return cases.filter(isChatRunnable).map((c) => toolLoopCaseJob(suite, c, surface));
}

function isErrorResult(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    (result as { error?: unknown }).error !== undefined &&
    (result as { error?: unknown }).error !== null
  );
}
