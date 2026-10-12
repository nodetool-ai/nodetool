/**
 * The permission gate for client (`ui_*`) tools that spend money.
 *
 * Server capabilities pass the gate inside `CapabilityRun.invoke`. A client
 * tool is a round trip to the browser through the ToolBridge, so it never
 * reached that ladder, and the browser's chat path asks for no consent
 * either: `ui_storyboard_generate_clip` rendered paid video in plan mode and
 * without an approval in default mode. These names now take the same
 * decide/ask/block ladder as their server counterparts
 * (`render_storyboard_clips`, `generate_speech`, `generate_image`), which
 * are category `write`.
 */

import {
  createCapabilityRun,
  type CapabilityRun
} from "@nodetool-ai/agents";

/** Client tools that start paid media generation. */
export const SPENDING_CLIENT_TOOL_NAMES: ReadonlySet<string> = new Set([
  "ui_storyboard_generate_keyframe",
  "ui_storyboard_generate_clip",
  "ui_storyboard_revise_shot",
  "ui_script_voice_line",
  "ui_script_voice_all",
  "ui_sketch_generate"
]);

/**
 * Run `dispatch` (the browser round trip) behind the turn's permission gate
 * when `name` spends money; any other client tool dispatches directly.
 * Blocked or declined calls return the gate's structured error and never
 * reach the browser.
 */
export async function dispatchClientTool(
  run: CapabilityRun | null,
  name: string,
  args: Record<string, unknown>,
  dispatch: () => Promise<unknown>
): Promise<unknown> {
  if (!SPENDING_CLIENT_TOOL_NAMES.has(name)) {
    return dispatch();
  }
  if (!run) {
    return {
      error: "permission_unavailable",
      message: `\`${name}\` spends money and this turn has no permission gate to ask.`
    };
  }
  const gated = createCapabilityRun({
    context: run.context,
    signal: run.signal,
    gate: run.gate,
    availableSecrets: run.availableSecrets,
    capabilities: [
      {
        spec: {
          name,
          description: `Client tool ${name}; starts paid media generation.`,
          inputSchema: { type: "object" },
          category: "write",
          userMessage: () => `Generating media with ${name}`
        },
        impl: () => dispatch()
      }
    ]
  });
  return gated.invoke(name, args);
}
