import type { CapabilitySpec } from "./types.js";
const kind = {
  type: "string",
  enum: ["camera", "look", "effect", "studio"]
} as const;
const mode = {
  type: "string",
  enum: ["video", "image_to_video", "reference_to_video", "image", "image_edit", "video_edit"]
} as const;
export const presetsSpecs: readonly CapabilitySpec[] = [
  {
    name: "list_presets",
    description:
      "List generation presets and studios, optionally filtered by kind, mode and model family. A studio (kind studio) names the surface it opens and the preset ids it opens with; mode and family filters list no studios.",
    category: "read",
    userMessage: () => "Listing presets",
    inputSchema: {
      type: "object",
      properties: {
        kind,
        mode,
        family: {
          type: "string",
          enum: [
            "kling",
            "seedance",
            "veo",
            "wan",
            "sora",
            "minimax",
            "ltx",
            "local-wan",
            "default"
          ]
        }
      },
      required: []
    }
  },
  {
    name: "get_preset",
    description: "Read a generation preset or a studio by id.",
    category: "read",
    userMessage: () => "Reading preset",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"]
    }
  },
  {
    name: "compile_presets",
    description: "Compile up to three generation presets for a model and mode. Studios do not compile.",
    category: "read",
    userMessage: () => "Compiling presets",
    inputSchema: {
      type: "object",
      properties: {
        preset_ids: { type: "array", items: { type: "string" }, maxItems: 3 },
        model: { type: "string" },
        provider: { type: "string" },
        mode,
        prompt: { type: "string" }
      },
      required: ["preset_ids", "model", "mode"]
    }
  }
];
