/**
 * The `style` capability module — the taste half of the creative loop.
 *
 * Two capabilities that used to be two `Tool` subclasses in
 * `../tools/creative-critique-tools.ts`. They persist and retrieve the user's
 * aesthetic preferences through {@link LongTermMemory}, so a brief or a judge
 * rubric can carry a durable style profile across sessions.
 *
 * The bound memory was a constructor argument and is now `run.memory`. A run
 * that carries none falls back to the per-user registry, keyed on
 * `context.userId` — the same two-way resolution the classes did.
 *
 * The long-term-memory cone reaches `@nodetool-ai/vectorstore`, so it is
 * imported inside each implementation: loading this module costs nothing.
 *
 * Design: docs/tool-class-retirement-design.md § Migration.
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import type { LongTermMemory } from "../long-term-memory.js";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  recordStylePreferenceSpec,
  getStyleProfileSpec,
  RECORD_STYLE_PREFERENCE_SCHEMA,
  GET_STYLE_PROFILE_SCHEMA
} from "./style.specs.js";
import {
  isFiniteNumber,
  isNumber,
  isString
} from "../utils/type-guards.js";

export {
  RECORD_STYLE_PREFERENCE_SCHEMA,
  GET_STYLE_PROFILE_SCHEMA
} from "./style.specs.js";

async function resolveMemory(
  run: CapabilityRun
): Promise<LongTermMemory | null> {
  if (run.memory) return run.memory;
  const { getLongTermMemory } = await import("../long-term-memory.js");
  return getLongTermMemory(run.context.userId);
}

const recordStylePreference: CapabilityExport = {
  spec: recordStylePreferenceSpec,
  impl: async (run, params) => {
    const memory = await resolveMemory(run);
    if (!memory) {
      return { stored: false, note: "Long-term memory is not configured." };
    }
    const takeaway =
      isString(params["takeaway"]) ? params["takeaway"].trim() : "";
    if (!takeaway) return { stored: false, note: "takeaway is required" };

    const details: string[] = [];
    if (isString(params["chosen"]) && params["chosen"].trim())
      details.push(`chose: ${params["chosen"].trim()}`);
    if (isString(params["rejected"]) && params["rejected"].trim())
      details.push(`over: ${params["rejected"].trim()}`);
    if (isString(params["brief"]) && params["brief"].trim())
      details.push(`brief: ${params["brief"].trim()}`);
    const text = details.length
      ? `${takeaway} (${details.join("; ")})`
      : takeaway;

    const stored = await memory.remember(text, {
      kind: "preference",
      importance:
        isNumber(params["importance"]) ? params["importance"] : 0.6,
      source: "style_preference"
    });
    if (!stored) {
      return {
        stored: false,
        note: "Skipped as duplicate of existing preference."
      };
    }
    return { stored: true, id: stored.id, text };
  }
};

const getStyleProfile: CapabilityExport = {
  spec: getStyleProfileSpec,
  impl: async (run, params) => {
    const memory = await resolveMemory(run);
    if (!memory) {
      return {
        profile: "",
        items: [],
        note: "Long-term memory is not configured."
      };
    }
    const query =
      isString(params["query"]) && params["query"].trim()
        ? params["query"].trim()
        : "visual style aesthetic preference taste";
    const k =
      isFiniteNumber(params["k"])
        ? Math.max(1, Math.min(20, Math.trunc(params["k"])))
        : 10;

    const items = (await memory.recall(query, { k })).filter(
      (item) => item.kind === "preference"
    );
    return {
      profile: items.map((item) => `- ${item.text}`).join("\n"),
      items: items.map((item) => ({
        id: item.id,
        text: item.text,
        importance: item.importance
      }))
    };
  }
};

/** Every style capability. */
export const STYLE_CAPABILITIES: readonly CapabilityExport[] = [
  recordStylePreference,
  getStyleProfile
];

export const module: CapabilityModule = {
  module: "style",
  exports: STYLE_CAPABILITIES
};

export { recordStylePreference, getStyleProfile };
