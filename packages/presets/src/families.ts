import { WAN2GP_WAN_MODEL_TYPES } from "./wan2gp-models.js";

export const MODEL_LINE_PATTERNS = {
  nanoBanana: /nano-banana-pro|gemini-3-pro-image/,
  gptImage: /gpt-image-2(?![.\d]|-5-)/,
  flux: /flux-2[/-]klein/,
  seedance: /seedance-2(?!\d)|dreamina_seedance_(?:40|45)(?!\d)/,
  veo: /veo-?3(?!\d)/,
  // Hosted routes spell it `minimax/h3` or `minimax-h3`; Wan2GP's local
  // checkpoints are `minimax_h3_<variant>`.
  minimax: /minimax[/_-]h3(?![a-z0-9.])/,
  wan: /wan-?2[.-]6(?!\/(?:text-to-image|image-edit))/,
  kling: /kling(?:-video)?[-/]v?(?:2[.-][56]|3(?:\.0)?|o[13])(?![.\d])/,
  hailuo: /hailuo|minimax\/video-01|^[ist]2v-01(?![\d])/,
  seedream: /seedream[/-]v?[45](?![\d])/,
  qwen: /qwen-image/,
  elevenlabs: /elevenlabs\/(?:tts\/(?!eleven-v4)|music(?!\/v2)|sound-effects|text-to-speech|text-to-dialogue|v3|v2-multilingual|turbo|flash)|^eleven_(?:v3|multilingual_v2|turbo_v2|flash_v2)/,
  stableAudio: /stable-audio-(?:25|2\.5|3)(?![\d.])/,
} as const;

export const MODEL_FAMILIES = ["kling", "seedance", "veo", "wan", "sora", "minimax", "ltx", "local-wan", "default"] as const;
export type ModelFamily = (typeof MODEL_FAMILIES)[number];

const FAMILY_PATTERNS: ReadonlyArray<readonly [ModelFamily, RegExp]> = [
  ["local-wan", /^local-wan(?:[/:]|$)/],
  ["kling", MODEL_LINE_PATTERNS.kling],
  ["seedance", MODEL_LINE_PATTERNS.seedance],
  ["veo", MODEL_LINE_PATTERNS.veo],
  ["wan", MODEL_LINE_PATTERNS.wan],
  ["sora", /(?:^|[/_-])sora(?:[-/]?2)?(?![a-z0-9.])/],
  ["minimax", MODEL_LINE_PATTERNS.minimax],
  ["minimax", MODEL_LINE_PATTERNS.hailuo],
  ["ltx", /(?:^|[/_-])ltx(?:[-/]?video|[-/]?2(?:[.-][0-9]+)?)(?![a-z0-9.])/],
  ["default", /^default$/]
];

const LOCAL_WAN_MODEL_TYPES: ReadonlySet<string> = new Set(WAN2GP_WAN_MODEL_TYPES.map((id) => id.toLowerCase()));

/** Return the known video family, or null for an unsupported model. */
export function modelFamily(modelId: string): ModelFamily | null {
  const id = modelId.toLowerCase();
  if (id.includes("trainer")) { return null; }
  if (LOCAL_WAN_MODEL_TYPES.has(id)) { return "local-wan"; }
  return FAMILY_PATTERNS.find(([, pattern]) => pattern.test(id))?.[0] ?? null;
}
