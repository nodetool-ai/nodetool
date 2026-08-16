/**
 * The `style` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `style.ts`, so nothing the
 * implementations pull in reaches the entry graph. `style.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";
import { isString } from "../utils/type-guards.js";

export const RECORD_STYLE_PREFERENCE_SCHEMA: JsonSchema = {
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

export const GET_STYLE_PROFILE_SCHEMA: JsonSchema = {
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

export const recordStylePreferenceSpec: CapabilitySpec = {
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
    const t = isString(params["takeaway"]) ? params["takeaway"] : "";
    return t
      ? `Remembering preference: ${t.slice(0, 60)}`
      : "Recording style preference";
  }
};

export const getStyleProfileSpec: CapabilitySpec = {
  name: "get_style_profile",
  description:
    "Retrieve the user's accumulated aesthetic preferences as a style profile " +
    "block. Inject it into generation prompts and pass it as `taste_profile` " +
    "to critique_image / compare_images so judging reflects the user's taste, " +
    "not generic preference.",
  inputSchema: GET_STYLE_PROFILE_SCHEMA,
  category: "external",
  userMessage: () => "Loading the user's style profile"
};

/** Every spec this module declares, in declaration order. */
export const styleSpecs: readonly CapabilitySpec[] = [
  recordStylePreferenceSpec,
  getStyleProfileSpec
];
