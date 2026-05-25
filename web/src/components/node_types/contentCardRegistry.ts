/**
 * Content-Card Registry
 *
 * Predicate that decides whether a node renders as a `ContentCardBody` (a
 * content-forward image/video/audio/3D/text body) instead of the generic
 * input/output layout.
 *
 * Three matching strategies, in order:
 *
 *   1. Explicit allow-set — hand-picked entries for provider/base nodes that
 *      should always render as content cards, regardless of namespace.
 *   2. Generator-pattern match — node_type names that follow the conventional
 *      `*.TextToImage`, `*.ImageToImage`, `*.TextToVideo`, ... shapes used by
 *      first-party generators.
 *   3. Provider-namespace + output match — any node under a generator-
 *      aggregator namespace (`fal.`, `replicate.`, `kie.`) whose primary
 *      output is a media type (image/video/audio/3D).
 *
 * Utility nodes (`If`, `Loop`, `Map`, constants, control-flow) never match
 * any of the three strategies and stay on the generic body forever.
 */

import type { NodeMetadata, OutputSlot } from "../../stores/ApiTypes";

/**
 * Hand-curated entries — provider/base nodes that should always render as a
 * content card. Anything outside the predicate's namespace/pattern reach.
 */
export const CONTENT_CARD_REGISTRY: ReadonlySet<string> = new Set([
  // First-party generators (base-nodes)
  "nodetool.image.TextToImage",
  "nodetool.image.ImageToImage",
  "nodetool.image.Upscale",
  "nodetool.image.RemoveBackground",
  "nodetool.image.Relight",
  "nodetool.image.Vectorize",
  "nodetool.video.TextToVideo",
  "nodetool.video.ImageToVideo",
  "nodetool.video.VideoToVideo",
  "nodetool.video.LipSync",
  "nodetool.audio.TextToSpeech",
  "nodetool.audio.AudioMixer",
  "nodetool.audio.Concat",
  "nodetool.video.Concat",
  "nodetool.text.AutomaticSpeechRecognition",

  // Provider image/video/audio nodes
  "openai.image.CreateImage",
  "openai.image.EditImage",
  "openai.audio.TextToSpeech",
  "openai.audio.Transcribe",
  "openai.audio.Translate",
  "gemini.image.ImageGeneration",
  "gemini.video.TextToVideo",
  "gemini.video.ImageToVideo",
  "gemini.audio.TextToSpeech",
  "gemini.audio.Transcribe",

  // ElevenLabs
  "elevenlabs.TextToSpeech",
  "elevenlabs.SpeechToText",
  "elevenlabs.RealtimeTextToSpeech",
  "elevenlabs.RealtimeSpeechToText",

  // Text-content nodes (LLM-style, prompt templating)
  "nodetool.agents.Agent",
  "nodetool.agents.Summarizer",
  "nodetool.agents.Extractor",
  "nodetool.agents.Classifier",
  "nodetool.text.Concat",
  "nodetool.data.Describe",
  "anthropic.agents.ClaudeAgent",
  "openai.agents.RealtimeAgent",
  "mistral.text.ChatComplete"
]);

/**
 * Namespace prefixes whose nodes are wholesale content cards when their
 * primary output is a media type. These are auto-generated aggregator
 * packages (fal, replicate, kie) where hand-listing every entry would be
 * untenable and rot every time the manifest regenerates.
 */
const PROVIDER_NAMESPACE_PREFIXES = ["fal.", "replicate.", "kie."] as const;

/**
 * Conventional generator-shaped class names. Matches any namespace.
 * Tail-anchored: `\b` boundary prevents accidental matches against
 * "TextToImagePromptBuilder" or similar.
 */
const GENERATOR_NAME_PATTERNS: readonly RegExp[] = [
  /\.(TextTo|ImageTo)(Image|Video|Audio|Speech|3D|Model3D)\b/,
  /\.(CreateImage|EditImage|ImageGeneration)\b/
];

const MEDIA_VARIANTS: ReadonlySet<ContentCardVariant> = new Set([
  "image",
  "image_mask",
  "video",
  "audio",
  "model_3d"
]);

/**
 * Decide whether a node should render as a content card.
 *
 * The full metadata is needed because the namespace-prefix branch consults
 * the primary output's variant. Pass the metadata you already have — every
 * caller in the app has it.
 */
export const isContentCardNode = (
  metadata: NodeMetadata | undefined
): boolean => {
  if (!metadata) {
    return false;
  }
  const t = metadata.node_type;
  if (!t) {
    return false;
  }
  if (CONTENT_CARD_REGISTRY.has(t)) {
    return true;
  }
  if (GENERATOR_NAME_PATTERNS.some((re) => re.test(t))) {
    return true;
  }
  if (PROVIDER_NAMESPACE_PREFIXES.some((p) => t.startsWith(p))) {
    const variant = getContentCardVariant(getPrimaryOutput(metadata));
    if (MEDIA_VARIANTS.has(variant)) {
      return true;
    }
  }
  return false;
};

/**
 * Per-variant default card dimensions applied at node creation time
 * (plan §6.3). Resolved from the node's primary output via
 * `getContentCardDefaultSize`. Single source of truth for content-card sizes.
 */
// Heights are sized for the preview area only; prompt/text inputs now render
// as left-edge handles (see classifyFields), so we no longer pad for an inline
// editor row. Users can resize further; these are just the comfortable defaults.
export const CONTENT_CARD_SIZES = {
  image: { width: 280, height: 280 },
  image_mask: { width: 280, height: 280 },
  video: { width: 320, height: 220 },
  text: { width: 320, height: 220 },
  audio: { width: 320, height: 160 },
  model_3d: { width: 280, height: 280 },
  generic: { width: 280, height: 280 }
} as const;

/**
 * Pick the "primary" output for a ContentCardBody preview.
 *
 * Resolution order (plan §13.2 OQ-3):
 *   1. If `metadata.primary_output` names an output, use it.
 *      (This is a forward-compatible optional field — backend node authors
 *       may set it; absent today.)
 *   2. Otherwise, the first entry in `metadata.outputs`.
 *
 * Returns `undefined` for nodes that declare no outputs.
 */
export const getPrimaryOutput = (
  metadata: NodeMetadata
): OutputSlot | undefined => {
  const outputs = metadata.outputs ?? [];
  if (outputs.length === 0) {
    return undefined;
  }
  const named = (metadata as { primary_output?: string }).primary_output;
  if (named) {
    const match = outputs.find((o) => o.name === named);
    if (match) {
      return match;
    }
  }
  return outputs[0];
};

/**
 * Coarse classification of a primary output's type into a body variant.
 * The variant drives which preview the body renders (image / video / text /
 * audio / 3d / mask / generic).
 */
export type ContentCardVariant =
  | "image"
  | "image_mask"
  | "video"
  | "text"
  | "audio"
  | "model_3d"
  | "generic";

export const getContentCardVariant = (
  output: OutputSlot | undefined
): ContentCardVariant => {
  if (!output) {
    return "generic";
  }
  // OutputSlot.type is a PropertyTypeMetadata; its top-level `type` string
  // names the kind (e.g. "image", "video", "str").
  const t = (output.type as { type?: string } | undefined)?.type ?? "";
  switch (t) {
    case "image":
      return "image";
    case "image_mask":
    case "mask":
      return "image_mask";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "model_3d":
    case "asset_3d":
      return "model_3d";
    case "str":
    case "text":
      return "text";
    default:
      return "generic";
  }
};

/**
 * Default `{width, height}` for a content-card node, picked by the node's
 * primary-output variant. Used by `NodeStore` when a content-card node is
 * created on the canvas (plan §6.3).
 */
export const getContentCardDefaultSize = (
  metadata: NodeMetadata
): { width: number; height: number } => {
  const variant = getContentCardVariant(getPrimaryOutput(metadata));
  return CONTENT_CARD_SIZES[variant];
};

/**
 * Prompt/template nodes that substitute `{{variables}}` — their dynamic-input
 * button reads "+ Add variable". This is the prompt-templating subset of
 * `CONTENT_CARD_REGISTRY` above; keep the two in sync.
 */
const PROMPT_TEMPLATE_NODES = new Set<string>([
  "nodetool.agents.Agent",
  "nodetool.agents.Summarizer",
  "nodetool.agents.Extractor",
  "nodetool.agents.Classifier",
  "nodetool.text.Concat",
  "nodetool.data.Describe",
  "anthropic.agents.ClaudeAgent",
  "openai.agents.RealtimeAgent",
  "mistral.text.ChatComplete"
]);

/**
 * Human label for the `DynamicInputButton` shown in a content card.
 * Picked from primary-output variant — image generators say
 * "+ Add another image input", text/prompt nodes say "+ Add variable", etc.
 *
 * Plan §6.5: "+ Add another image input" (image-multi-input generators),
 * "+ Add another text input" (text concatenators), "+ Add variable"
 * (Prompt / template nodes).
 */
export const getDynamicInputLabel = (metadata: NodeMetadata): string => {
  const t = metadata.node_type ?? "";
  // Template-style nodes use {{variable}} substitution — say "variable".
  if (PROMPT_TEMPLATE_NODES.has(t)) {
    return "variable";
  }
  const variant = getContentCardVariant(getPrimaryOutput(metadata));
  switch (variant) {
    case "image":
    case "image_mask":
      return "image input";
    case "video":
      return "video input";
    case "audio":
      return "audio input";
    case "model_3d":
      return "input";
    case "text":
      return "text input";
    default:
      return "input";
  }
};
