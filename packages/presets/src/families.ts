export const MODEL_LINE_PATTERNS = {
  // Wan2GP defaults stems from v19.02 (616e605), plus fun_camera from 362c3467.
  // Keep bare ids exact: the provider is not an input.
  localWan: /^(?:alpha|alpha2|alpha2_sf|alpha_sf|animate|animate2|animate2_distilled|bernini|bernini_1\.3b|chrono_edit|chrono_edit_distill|fantasy|flf2v_720p|fun_inp|fun_inp_1\.3b|i2v|i2v_2_2|i2v_2_2_enhanced_lightning_v2|i2v_2_2_enhanced_lightning_v2_svi2pro|i2v_2_2_multitalk|i2v_2_2_svi2pro|i2v_720p|i2v_fusionix|i2v_nvfp4|infinitetalk|infinitetalk_multi|kiwi_edit|kiwi_edit_instruct_only|kiwi_edit_reference_only|lucy_edit|lucy_edit_1_1|lucy_edit_fastwan|lucy_edit_fastwan_1_1|lynx|mocha|moviigen|multitalk|multitalk_720p|ovi|ovi_1_1|ovi_1_1_10s|ovi_1_1_10s_fastwan|ovi_1_1_fastwan|ovi_fastwan|phantom_1\.3b|phantom_14b|recam_1\.3b|scail|scail2_14b|shotplan_t2v|shotplan_t2v_2_2|sky_df_1\.3b|sky_df_14b|sky_df_720p_14b|standin|steadydancer|t2v|t2v_1\.3b|t2v_1\.3b_nvfp4|t2v_2_2|t2v_fusionix|t2v_nexus_1\.3b|t2v_sf|ti2v_2_2|ti2v_2_2_fastwan|vace_1\.3b|vace_14b|vace_14b_2_2|vace_14b_cocktail|vace_14b_cocktail_2_2|vace_14b_fusionix|vace_14b_lightning_3p_2_2|vace_14b_sf|vace_ditto_14b|vace_fun_14b_2_2|vace_fun_14b_cocktail_2_2|vace_lynx_14b|vace_multitalk_14b|vace_standin_14b|vista4d|vista4d_720p|wanmove|fun_camera|fun_camera_1\.3b|prism|uni3c)$/,
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
  ["local-wan", MODEL_LINE_PATTERNS.localWan],
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

/** Return the known video family, or null for an unsupported model. */
export function modelFamily(modelId: string): ModelFamily | null {
  const id = modelId.toLowerCase();
  if (id.includes("trainer")) { return null; }
  return FAMILY_PATTERNS.find(([, pattern]) => pattern.test(id))?.[0] ?? null;
}
