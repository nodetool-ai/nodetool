/**
 * Every editor surface's `ui_*` tools as a chat turn receives them: built from
 * the same headless bridges the eval and training harnesses register as the
 * browser manifest, converted with `zodToJsonSchema` the way
 * `chat-jtbd.ts` converts them. Tests that pin what the turn block says about
 * a tool read these, never a hand-written copy of a schema.
 */
import { zodToJsonSchema } from "@nodetool-ai/runtime";
import { sandboxCapabilitySpecifier } from "@nodetool-ai/protocol";
import type { z } from "zod";
import { createAppToolBridge } from "../../src/app-build/bridge.js";
import { createTimelineToolBridge } from "../../src/capabilities/timeline-bridge.js";
import { createAudioToolBridge } from "../../src/evals/surfaces/audio.js";
import { createJsScriptToolBridge } from "../../src/evals/surfaces/js-script.js";
import { createModel3DToolBridge } from "../../src/evals/surfaces/model3d.js";
import { createScriptToolBridge } from "../../src/evals/surfaces/script.js";
import { createSketchToolBridge } from "../../src/evals/surfaces/sketch.js";
import { createStoryboardToolBridge } from "../../src/evals/surfaces/storyboard.js";
import { createSvgToolBridge } from "../../src/evals/surfaces/svg.js";
import type { ToolSignatureSource } from "../../src/codeact/tool-api.js";

export const FOCUSED_SURFACES = [
  "svg",
  "audio",
  "jsscript",
  "script",
  "app",
  "storyboard",
  "sketch",
  "model3d",
  "timeline"
] as const;

export type FocusedSurface = (typeof FOCUSED_SURFACES)[number];

interface BridgeTool {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
}

async function bridgeTools(surface: FocusedSurface): Promise<BridgeTool[]> {
  switch (surface) {
    case "svg":
      return createSvgToolBridge({ markup: "<svg/>" }).tools;
    case "audio":
      return createAudioToolBridge({ segments: [{ seconds: 1, level: 0.5 }] }).tools;
    case "jsscript":
      return createJsScriptToolBridge().tools;
    case "script":
      return createScriptToolBridge().tools;
    case "app":
      return createAppToolBridge().tools;
    case "storyboard":
      return createStoryboardToolBridge().tools;
    case "sketch":
      return (await createSketchToolBridge()).tools;
    case "model3d":
      return createModel3DToolBridge().tools;
    case "timeline":
      return createTimelineToolBridge().tools;
  }
}

/** One surface's tools as `ToolSignatureSource`s, in the bridge's order. */
export async function focusedSurfaceTools(
  surface: FocusedSurface
): Promise<ToolSignatureSource[]> {
  return (await bridgeTools(surface)).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.parameters)
  }));
}

/** The specifier chat grafts every `ui_*` tool onto. */
export function uiGraft(tools: readonly ToolSignatureSource[]): Map<string, string> {
  const specifier = sandboxCapabilitySpecifier("ui");
  return new Map(tools.map((tool) => [tool.name, specifier]));
}
