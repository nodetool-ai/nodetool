/**
 * What each Gemini text model accepts, keyed by model id.
 *
 * The web composer reads the thinking levels to build its reasoning select,
 * the chat turn reads them to decide which level it forwards, and the Gemini
 * adapter reads the whole record to shape `thinkingConfig` and the tool list.
 * Model discovery is optional and callers may name a model before it is
 * listed, so an id with no entry falls back to its family.
 *
 * Sources:
 * https://ai.google.dev/gemini-api/docs/generate-content/thinking
 * https://ai.google.dev/gemini-api/docs/generate-content/tool-combination
 * https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/4-hydrogen
 */

/** A `thinkingLevel` value NodeTool can send. `minimal` is never sent. */
export type GeminiThinkingLevel = "low" | "medium" | "high" | "xhigh";

export type GeminiThinking =
  /** Gemini 3 and later: `thinkingConfig.thinkingLevel`. */
  | {
      kind: "level";
      levels: readonly GeminiThinkingLevel[];
      /** The level Google applies when the request names none. */
      defaultLevel: GeminiThinkingLevel | "minimal";
    }
  /** Gemini 2.5: `thinkingConfig.thinkingBudget` in tokens. */
  | { kind: "budget" };

export interface GeminiModelCapabilities {
  /** Null for a model that takes no thinking setting. */
  thinking: GeminiThinking | null;
  /**
   * Built-in tools (Google Search, code execution) may share a request with
   * custom function declarations.
   */
  combinesBuiltInAndFunctionTools: boolean;
}

const LOW_MEDIUM_HIGH = ["low", "medium", "high"] as const;

/**
 * Models whose levels differ from their family default. Matched on the bare
 * id or on the id followed by a `-` suffix (`-preview`, a date stamp).
 */
const GEMINI_MODEL_THINKING: ReadonlyArray<[string, GeminiThinking]> = [
  [
    "gemini-4-hydrogen",
    {
      kind: "level",
      levels: ["low", "medium", "high", "xhigh"],
      defaultLevel: "high"
    }
  ],
  [
    "gemini-4-argon",
    { kind: "level", levels: LOW_MEDIUM_HIGH, defaultLevel: "medium" }
  ],
  [
    "gemini-3.8-flash",
    { kind: "level", levels: LOW_MEDIUM_HIGH, defaultLevel: "medium" }
  ],
  [
    "gemini-3.6-flash",
    { kind: "level", levels: LOW_MEDIUM_HIGH, defaultLevel: "medium" }
  ],
  [
    "gemini-3.5-flash-lite",
    { kind: "level", levels: LOW_MEDIUM_HIGH, defaultLevel: "minimal" }
  ],
  [
    "gemini-3.1-flash-lite",
    { kind: "level", levels: LOW_MEDIUM_HIGH, defaultLevel: "minimal" }
  ],
  [
    "gemini-3-flash",
    { kind: "level", levels: LOW_MEDIUM_HIGH, defaultLevel: "high" }
  ]
];

/** Gemini 4 rejects or remaps `thinkingBudget`, so every Gemini 4 id takes a level. */
const GEMINI_4_THINKING: GeminiThinking = {
  kind: "level",
  levels: LOW_MEDIUM_HIGH,
  defaultLevel: "medium"
};

/** The levels every Gemini 3 model accepts. */
const GEMINI_3_THINKING: GeminiThinking = {
  kind: "level",
  levels: ["low", "high"],
  defaultLevel: "high"
};

function bareModelId(model: string): string {
  return (model.split("/").pop() ?? model).toLowerCase();
}

function matchesModel(id: string, base: string): boolean {
  return id === base || id.startsWith(`${base}-`);
}

function familyOf(id: string): "2.5" | "3" | "4" | null {
  const match = /^gemini-(2\.5|\d+)(?:[.-]|$)/.exec(id);
  if (!match) return null;
  if (match[1] === "2.5") return "2.5";
  const major = Number(match[1]);
  if (major === 3) return "3";
  if (major === 4) return "4";
  return null;
}

export function geminiModelCapabilities(
  model: string
): GeminiModelCapabilities {
  const id = bareModelId(model);
  const family = familyOf(id);
  const combinesBuiltInAndFunctionTools = family === "3" || family === "4";
  if (/image|tts|audio|live|transcribe|embedding/.test(id) || family === null) {
    return { thinking: null, combinesBuiltInAndFunctionTools };
  }
  const known = GEMINI_MODEL_THINKING.find(([base]) => matchesModel(id, base));
  let thinking: GeminiThinking;
  if (known) thinking = known[1];
  else if (family === "4") thinking = GEMINI_4_THINKING;
  else if (family === "3") thinking = GEMINI_3_THINKING;
  else thinking = { kind: "budget" };
  return { thinking, combinesBuiltInAndFunctionTools };
}
