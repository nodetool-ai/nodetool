/**
 * Catalog of the first-party node packs that ship with NodeTool.
 *
 * Shared between the server (which registers the packs at bootstrap) and the
 * Electron package manager (which lets users enable/disable them), so both
 * sides agree on the stable pack ids. Only packs marked `defaultEnabled` (or
 * `required`) load on a fresh install; the rest are opt-in. User overrides
 * are persisted in the packs config file (`~/.config/nodetool/packs.json`,
 * keys `enabledBuiltins` / `disabledBuiltins`) and honored on the next
 * server start.
 */

export interface BuiltinNodePack {
  /** Stable id used in the enabled/disabled lists. Never rename. */
  id: string;
  /** Display name shown in the package manager. */
  name: string;
  /** Short user-facing description of what the pack provides. */
  description: string;
  /** Required packs cannot be disabled (core nodes the editor depends on). */
  required?: boolean;
  /**
   * Enabled on a fresh install. All other packs are opt-in via the package
   * manager, keeping the node namespace small by default.
   */
  defaultEnabled?: boolean;
}

/**
 * Effective enabled state for a built-in pack: required packs are always on;
 * otherwise an explicit user override wins, falling back to the install
 * default.
 */
export function resolveBuiltinPackEnabled(
  pack: BuiltinNodePack,
  override?: boolean
): boolean {
  if (pack.required) return true;
  return override ?? pack.defaultEnabled ?? false;
}

export const BUILTIN_NODE_PACKS: readonly BuiltinNodePack[] = [
  {
    id: "base",
    name: "Base Nodes",
    description:
      "Core nodes for text, data, documents, images, audio, video, agents, and LLM chat.",
    required: true
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    description: "Text-to-speech and voice generation via ElevenLabs."
  },
  {
    id: "minimax",
    name: "MiniMax",
    description: "MiniMax image, video, and audio generation."
  },
  {
    id: "transformers-js",
    name: "Transformers.js",
    description:
      "Run Hugging Face NLP, vision, and audio models locally via ONNX Runtime."
  },
  {
    id: "fal",
    name: "FAL",
    description: "Hosted image, video, and audio models on fal.ai.",
    defaultEnabled: true
  },
  {
    id: "kie",
    name: "Kie.ai",
    description: "Image and video generation models on Kie.ai."
  },
  {
    id: "topaz",
    name: "Topaz Labs",
    description: "Image and video upscaling and enhancement via Topaz Labs."
  },
  {
    id: "reve",
    name: "Reve",
    description: "Reve image generation, editing, and remix."
  },
  {
    id: "atlascloud",
    name: "AtlasCloud",
    description:
      "Seedance video and GPT Image / Nano Banana image generation on AtlasCloud."
  },
  {
    id: "together",
    name: "Together AI",
    description:
      "Serverless image, video, text-to-speech, and transcription models on Together AI."
  },
  {
    id: "replicate",
    name: "Replicate",
    description: "Community AI models hosted on Replicate.",
    defaultEnabled: true
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    description:
      "Hugging Face Inference Providers nodes across all task modalities.",
    defaultEnabled: true
  }
];
