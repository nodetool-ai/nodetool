/**
 * The `--interact` script engine shared by `timeline debug`, `sketch debug`,
 * and `jsscript debug`. A step names one tool (as the bridge/browser knows
 * it, or without its `ui_<domain>_` prefix) and the input to call it with —
 * see each domain's `interactions.ts` for a worked example.
 */
import { isNonBlankString, isRecord } from "./predicates.js";

export interface InteractionStep {
  tool: string;
  input: Record<string, unknown>;
}

export interface InteractionScript<Step extends InteractionStep> {
  /** `add_track`, `ui_timeline_add_track`, and `ui_add_track` all normalize alike. */
  normalizeToolName(name: string): string;
  /** Parse a `--interact` argument, naming the offending step on bad input. */
  parseInteractionScript(json: string): Step[];
}

/**
 * @param prefix      the domain's canonical tool prefix, e.g. `"ui_timeline_"`.
 * @param exampleStep one `{"tool":...,"input":...}` step embedded in the
 *                    "must be a JSON array" error message.
 */
export function createInteractionScript<
  Step extends InteractionStep = InteractionStep
>(prefix: string, exampleStep: string): InteractionScript<Step> {
  function normalizeToolName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.startsWith(prefix)) return trimmed;
    const bare = trimmed.startsWith("ui_")
      ? trimmed.slice("ui_".length)
      : trimmed;
    return `${prefix}${bare}`;
  }

  function parseInteractionScript(json: string): Step[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      throw new Error(`--interact is not valid JSON: ${(e as Error).message}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(
        `--interact must be a JSON array of steps, e.g. '[${exampleStep}]'`
      );
    }
    return parsed.map((step, index) => {
      if (!isRecord(step) || !isNonBlankString(step.tool)) {
        throw new Error(`--interact step ${index + 1} has no \`tool\` name.`);
      }
      const input = step.input ?? {};
      if (!isRecord(input)) {
        throw new Error(
          `--interact step ${index + 1}: \`input\` must be an object.`
        );
      }
      return {
        tool: normalizeToolName(step.tool),
        input: { ...input }
      } as Step;
    });
  }

  return { normalizeToolName, parseInteractionScript };
}

export interface InteractionTool {
  name: string;
  /**
   * HOLDOUT (anti-slop/no-unknown-returns): a bridge tool answers in the open
   * tool-result domain.
   */
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface InteractionRecord {
  tool: string;
  input: unknown;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Replay parsed steps against a bridge's tools. A failing or unknown tool is
 * recorded and the session continues with the next step.
 *
 * @param noun how the domain names its tools in the unknown-tool error,
 *             e.g. `"sketch"` gives `No sketch tool named "…"`.
 */
export async function runInteractionSteps(
  steps: readonly InteractionStep[],
  tools: readonly InteractionTool[],
  noun: string,
  onLog?: (line: string) => void
): Promise<InteractionRecord[]> {
  const byName = new Map(tools.map((t) => [t.name, t]));
  const interactions: InteractionRecord[] = [];
  for (const step of steps) {
    const tool = byName.get(step.tool);
    if (!tool) {
      const known = [...byName.keys()].sort().join(", ");
      interactions.push({
        tool: step.tool,
        input: step.input,
        ok: false,
        error: `No ${noun} tool named "${step.tool}". Available: ${known}.`
      });
      onLog?.(`✗ ${step.tool}: unknown tool`);
      continue;
    }
    try {
      const result = await tool.execute(step.input);
      interactions.push({
        tool: step.tool,
        input: step.input,
        ok: true,
        result
      });
      onLog?.(`✓ ${step.tool}`);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      interactions.push({
        tool: step.tool,
        input: step.input,
        ok: false,
        error
      });
      onLog?.(`✗ ${step.tool}: ${error}`);
    }
  }
  return interactions;
}
