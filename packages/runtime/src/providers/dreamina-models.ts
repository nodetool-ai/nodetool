/**
 * Dreamina's model catalog, captured from the site's `get_common_config`
 * (image) and `video_generate/get_common_config` (video) responses. Listing
 * models must not depend on a live browser tab, so the provider serves this
 * list. Generation still reads the live config, which holds the pixel sizes
 * and option keys a draft needs.
 */
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import type { ImageModel, VideoModel } from "./types.js";

const IMAGE_RATIOS = ["1:1", "3:4", "16:9", "4:3", "9:16", "2:3", "3:2", "21:9"];
const VIDEO_RATIOS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];

/** [model_req_key, name, takes source images (`byte_edit`), resolutions] */
const IMAGE: Array<[string, string, boolean, string[]]> = [
  ["high_aes_general_v50p_large", "Seedream 5.0 Pro", true, ["1.5k", "2k", "4k"]],
  ["dreamina_gpt_image_2_5_flare", "GPT Image 2.5 Flare", true, ["1k", "2k", "4k"]],
  ["dreamina_gpt_image_2_5_sunburst", "GPT Image 2.5 Sunburst", true, ["1k", "2k", "4k"]],
  ["gpt_image_2", "GPT Image 2", true, ["1k", "2k", "4k"]],
  ["gemini_3_image_pro", "Nano Banana Pro", true, ["1k", "2k", "4k"]],
  ["high_aes_general_v50", "Seedream 5.0 Lite", true, ["2k", "4k"]],
  ["high_aes_general_v43", "Seedream 4.7", true, ["2k", "4k"]],
  ["high_aes_general_v42", "Seedream 4.6", true, ["2k", "4k"]],
  ["high_aes_general_v40l", "Seedream 4.5", true, ["2k", "4k"]],
  ["high_aes_general_v41", "Seedream 4.1", true, ["2k", "4k"]],
  ["high_aes_general_v40", "Seedream 4.0", true, ["2k", "4k"]],
  ["external_model_gemini_flash_image_v25", "Nano Banana", true, ["1k"]],
  ["high_aes_general_v30l_art:general_v3.0_18b", "Seedream 3.1", false, ["1k", "2k"]],
  ["high_aes_general_v30l:general_v3.0_18b", "Seedream 3.0", true, ["1k", "2k"]]
];

/** [model_req_key, name, takes reference media (Seedance 2.x), shortest and longest clip in seconds, resolutions] */
const VIDEO: Array<[string, string, boolean, [number, number], string[]]> = [
  ["dreamina_seedance_45_pro_draft", "Dreamina Seedance 2.5 (for preview)", true, [4, 30], ["480p"]],
  ["dreamina_seedance_45_pro", "Dreamina Seedance 2.5", true, [4, 30], ["480p", "720p", "1080p"]],
  ["dreamina_seedance_40_mini", "Dreamina Seedance 2.0 Mini", true, [4, 15], ["720p", "1080p", "2K", "4k"]],
  ["dreamina_seedance_40", "Dreamina Seedance 2.0 Fast", true, [4, 15], ["720p", "1080p", "2K", "4k"]],
  ["dreamina_seedance_40_pro", "Dreamina Seedance 2.0", true, [4, 15], ["720p", "1080p", "4k"]],
  ["dreamina_ic_generate_video_model_vgfm_3.5_pro", "Dreamina Seedance 1.5 Pro", false, [5, 12], ["720p", "1080p"]],
  ["dreamina_ic_generate_video_model_vgfm_3.0_pro", "Dreamina Seedance 1.0", false, [5, 10], ["1080p"]],
  ["dreamina_ic_generate_video_model_vgfm_3.0_fast", "Dreamina Seedance 1.0 Fast", false, [5, 10], ["720p", "1080p"]]
];

export const DREAMINA_IMAGE_MODELS: readonly ImageModel[] = IMAGE.map(([id, name, edits, resolutions]) => ({
  id,
  name,
  provider: PROVIDER_IDS.DREAMINA,
  supportedTasks: edits ? ["text_to_image", "image_to_image"] : ["text_to_image"],
  aspectRatios: IMAGE_RATIOS,
  resolutions
}));

/** Every Dreamina video model takes a first frame image. */
export const DREAMINA_VIDEO_MODELS: readonly VideoModel[] = VIDEO.map(([id, name, references, [shortest, longest], resolutions]) => ({
  id,
  name,
  provider: PROVIDER_IDS.DREAMINA,
  supportedTasks: references ? ["text_to_video", "image_to_video", "reference_to_video"] : ["text_to_video", "image_to_video"],
  durations: Array.from({ length: longest - shortest + 1 }, (_, i) => shortest + i),
  resolutions,
  aspectRatios: VIDEO_RATIOS
}));
