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

async function resolveMemory(
  run: CapabilityRun
): Promise<LongTermMemory | null> {
  if (run.memory) return run.memory;
  const { getLongTermMemory } = await import("../long-term-memory.js");
  return getLongTermMemory(run.context.userId);
}

// ---------------------------------------------------------------------------
// record_style_preference
// ---------------------------------------------------------------------------

const RECORD_STYLE_PREFERENCE_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    takeaway: {
      type: "string" as const,
      description:
        'One self-contained sentence stating the preference (e.g. "User ' +
        "prefers muted, desaturated palettes over vivid colors for poster " +
        'work.").'
    },
    chosen: {
      type: "string" as const,
      description: "Optional short description of what the user picked."
    },
    rejected: {
      type: "string" as const,
      description: "Optional short description of what they passed over."
    },
    brief: {
      type: "string" as const,
      description: "Optional context: the brief or task the choice was made in."
    },
    importance: {
      type: "number" as const,
      minimum: 0,
      maximum: 1,
      description:
        "How broadly this preference applies (1 = always, 0.3 = niche). Default 0.6."
    }
  },
  required: ["takeaway"]
};

const recordStylePreference: CapabilityExport = {
  spec: {
    name: "record_style_preference",
    description:
      "Persist one aesthetic preference learned from the user — which variant " +
      "they chose, what they rejected, or a stated taste — as a durable memory. " +
      "Call it whenever the user picks between candidates, corrects a style, or " +
      "expresses what they like. These accumulate into the profile returned by " +
      "get_style_profile.",
    inputSchema: RECORD_STYLE_PREFERENCE_SCHEMA,
    // Unlisted in `TOOL_PERMISSION_CATEGORIES`, so the gate classes it
    // `external` today. Carried over unchanged: a reclassification belongs in
    // its own diff, not in a port.
    category: "external",
    userMessage: (params) => {
      const t =
        typeof params["takeaway"] === "string" ? params["takeaway"] : "";
      return t
        ? `Remembering preference: ${t.slice(0, 60)}`
        : "Recording style preference";
    }
  },
  impl: async (run, params) => {
    const memory = await resolveMemory(run);
    if (!memory) {
      return { stored: false, note: "Long-term memory is not configured." };
    }
    const takeaway =
      typeof params["takeaway"] === "string" ? params["takeaway"].trim() : "";
    if (!takeaway) return { stored: false, note: "takeaway is required" };

    const details: string[] = [];
    if (typeof params["chosen"] === "string" && params["chosen"].trim())
      details.push(`chose: ${params["chosen"].trim()}`);
    if (typeof params["rejected"] === "string" && params["rejected"].trim())
      details.push(`over: ${params["rejected"].trim()}`);
    if (typeof params["brief"] === "string" && params["brief"].trim())
      details.push(`brief: ${params["brief"].trim()}`);
    const text = details.length
      ? `${takeaway} (${details.join("; ")})`
      : takeaway;

    const stored = await memory.remember(text, {
      kind: "preference",
      importance:
        typeof params["importance"] === "number" ? params["importance"] : 0.6,
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

// ---------------------------------------------------------------------------
// get_style_profile
// ---------------------------------------------------------------------------

const GET_STYLE_PROFILE_SCHEMA: JsonSchema = {
  type: "object" as const,
  properties: {
    query: {
      type: "string" as const,
      description:
        'Optional focus (e.g. "typography", "color palettes for posters"). ' +
        "Defaults to a broad visual-style query."
    },
    k: {
      type: "number" as const,
      minimum: 1,
      maximum: 20,
      description: "Maximum preferences to include (default 10)."
    }
  },
  required: []
};

const getStyleProfile: CapabilityExport = {
  spec: {
    name: "get_style_profile",
    description:
      "Retrieve the user's accumulated aesthetic preferences as a style profile " +
      "block. Inject it into generation prompts and pass it as `taste_profile` " +
      "to critique_image / compare_images so judging reflects the user's taste, " +
      "not generic preference.",
    inputSchema: GET_STYLE_PROFILE_SCHEMA,
    category: "external",
    userMessage: () => "Loading the user's style profile"
  },
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
      typeof params["query"] === "string" && params["query"].trim()
        ? params["query"].trim()
        : "visual style aesthetic preference taste";
    const k =
      typeof params["k"] === "number" && Number.isFinite(params["k"])
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
