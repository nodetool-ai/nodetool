/**
 * The Comfy Router catalog by output kind, as published at
 * https://docs.comfy.org/development/comfy-router/models on 2026-11-03.
 *
 * The live `/v2/models` listing carries no modality, so this table says what
 * each id produces and which NodeTool task it serves. At runtime the provider
 * intersects it with the live listing, so a retired model drops out without a
 * release; a model added upstream appears once it is added here.
 *
 * Tasks come from the model's name: `i2v`/`t2v`/`r2v` and edit or upscale
 * endpoints keep only the task they do. The model's own input schema still
 * decides at call time; a request it cannot take fails with the Router's 422.
 */

export type RouterTask =
  | "text_to_image"
  | "image_to_image"
  | "text_to_video"
  | "image_to_video"
  | "reference_to_video"
  | "video_to_video"
  | "text_to_speech"
  | "chat";

const VIDEO = [
  "beeble/switchx", "bfl/flux-3-video", "bfl/video-upscale-v1", "bfl/video-edit-v1",
  "bria/video-edit-erase", "bria/video-edit-green-screen", "bria/video-edit-remove-background",
  "bria/video-edit-replace-background", "byteplus/dreamina-seedance-2-0-260128",
  "byteplus/dreamina-seedance-2-0-fast-260128", "byteplus/dreamina-seedance-2-0-mini",
  "byteplus/dreamina-seedance-2-5-260628", "byteplus/seedance-1-0-pro-250528",
  "byteplus/seedance-1-0-pro-fast-251015", "byteplus/seedance-1-5-pro-251215",
  "fal/crystal-video-upscaler", "fal/flux-3-max", "fal/h3-max-turbo", "fal/h3-max",
  "higgsfield/higgsfield-genjutsu-motion-transfer-v1.0", "higgsfield/higgsfield-kling-3-4k",
  "higgsfield/higgsfield-kling-3-pro", "kling/kling-3.0-turbo", "kling/kling-v2-5-turbo",
  "kling/kling-v2-6", "kling/kling-v3-omni", "kling/kling-v3", "kling/kling-video-o1",
  "kling/videos-avatar-image2video", "kling/videos-lip-sync", "kling/videos-video-extend",
  "ltx/ltx-2-5-fast", "ltx/ltx-2-5-pro", "luma_2/ray-3.2", "luma/ray-2", "luma/ray-flash-2",
  "minimax/minimax-h3", "moonvalley/image-to-video", "moonvalley/text-to-video",
  "moonvalley/video-to-video", "pika/pika-2.5-image-to-video", "pika/pika-2.5-text-to-video",
  "pruna/p-video-2", "runway/aleph2", "runway/gen4_turbo", "synclabs/sync-3",
  "veed/clean-audio-video", "veed/fabric-1.0", "veed/lipsync-2.0",
  "veed/video-background-removal-fast", "veed/video-background-removal-green-screen",
  "veed/video-background-removal", "veo/veo-3.1-fast-generate-001", "veo/veo-3.1-generate-001",
  "veo/veo-3.1-lite-generate-001", "wan/happyhorse-1.0-i2v", "wan/happyhorse-1.0-r2v",
  "wan/happyhorse-1.0-t2v", "wan/happyhorse-1.0-video-edit", "wan/happyhorse-1.1-i2v",
  "wan/happyhorse-1.1-r2v", "wan/happyhorse-1.1-t2v", "wan/wan2.5-i2v-preview",
  "wan/wan2.5-t2v-preview", "wan/wan2.6-i2v", "wan/wan2.6-r2v", "wan/wan2.6-t2v",
  "wan/wan2.7-i2v", "wan/wan2.7-r2v", "wan/wan2.7-t2v", "wan/wan2.7-videoedit",
  "wan/wan3.0-video-prime", "wan/wan3.0-video", "wavespeed/flashvsr",
  "xai/grok-imagine-video-1.5-lite", "xai/grok-imagine-video-1.5-preview",
  "xai/grok-imagine-video-1.5", "xai/grok-imagine-video"
] as const;

const IMAGE = [
  "beeble/switchx", "bfl/erase-v1", "bfl/flux-pro-1.1-ultra", "bfl/flux-kontext-pro",
  "bfl/flux-2-max", "bfl/flux-2-pro", "bfl/flux-3-image", "bfl/flux-pro-1.0-expand",
  "bfl/flux-pro-1.0-fill", "bfl/vto-v1", "bria/fibo", "bria/image-edit-add-object-by-text",
  "bria/image-edit-erase-by-text", "bria/image-edit-erase-foreground", "bria/image-edit-erase",
  "bria/image-edit-expand", "bria/image-edit-gen-fill", "bria/image-edit-increase-resolution",
  "bria/image-edit-product-holding", "bria/image-edit-product-virtual-tryon",
  "bria/image-edit-relight", "bria/image-edit-remove-background-guided",
  "bria/image-edit-remove-background", "bria/image-edit-replace-background",
  "bria/image-edit-replace-object-by-text", "bria/image-edit-reseason", "bria/image-edit-restore",
  "bria/image", "byteplus/seedream-4-0-250828", "byteplus/seedream-4-5-251128",
  "byteplus/seedream-5-0-260128", "byteplus/seedream-5-0-flash-260915",
  "byteplus/seedream-5-0-pro-260628", "fal/crystal-upscaler", "fal/patina",
  "freepik/ai-image-upscaler-precision-v2", "freepik/ai-skin-enhancer-creative",
  "freepik/ai-skin-enhancer-faithful", "freepik/ai-skin-enhancer-flexible",
  "gemini-interactions/gemini-omni-1.1-flash", "gemini-interactions/gemini-omni-flash-preview",
  "vertexai/gemini-2.5-flash-image", "vertexai/gemini-nano-banana-2.1",
  "vertexai/gemini-3.1-flash-lite-image", "vertexai/gemini-3.1-flash-image",
  "vertexai/gemini-3-pro-image", "ideogram/ideogram-4-5", "ideogram/ideogram-v3",
  "ideogram/ideogram-v4", "ideogram/p-image-ideogram", "kling/kling-image-o1",
  "krea/krea-2-large", "krea/krea-2-medium-turbo", "krea/krea-2-medium", "krea/krea-2",
  "krea/krea-3", "luma_2/uni-1-max", "luma_2/uni-1", "luma/photon-1", "luma/photon-flash-1",
  "openai/gpt-image-1.5", "openai/gpt-image-1", "openai/gpt-image-2.5-flare",
  "openai/gpt-image-2.5-sunburst", "openai/gpt-image-2", "qwen/qwen-image-3.0-pro",
  "qwen/qwen-image-3.0", "recraft/recraftv2", "recraft/recraftv3",
  "recraft/recraftv4_1_pro_vector", "recraft/recraftv4_1_pro",
  "recraft/recraftv4_1_utility_pro_vector", "recraft/recraftv4_1_utility_pro",
  "recraft/recraftv4_1_utility_vector", "recraft/recraftv4_1_utility",
  "recraft/recraftv4_1_vector", "recraft/recraftv4_1", "recraft/recraftv4_pro",
  "recraft/recraftv4_styles_pro_vector", "recraft/recraftv4_styles_pro",
  "recraft/recraftv4_styles_vector", "recraft/recraftv4_styles", "recraft/recraftv4",
  "runway/gen4_image", "wan/wan2.5-i2i-preview", "wan/wan2.5-t2i-preview", "wavespeed/seedvr2",
  "wavespeed/ultimate-image-upscaler", "xai/grok-imagine-image-2.0", "xai/grok-imagine-image-pro",
  "xai/grok-imagine-image-quality", "xai/grok-imagine-image"
] as const;

/** Speech models; the other audio-producing ids are video models with sound. */
const SPEECH = [
  "byteplus/seed-audio-1.0-multilingual", "byteplus/seed-audio-1.0",
  "elevenlabs/eleven_multilingual_v2", "elevenlabs/eleven_v3", "elevenlabs/eleven_v4_turbo",
  "elevenlabs/eleven_v4"
] as const;

const TEXT = [
  "anthropic/claude-fable-5-1", "anthropic/claude-fable-5", "anthropic/claude-haiku-4-5-20251001",
  "anthropic/claude-opus-4-6", "anthropic/claude-opus-4-7", "anthropic/claude-opus-4-8",
  "anthropic/claude-opus-5-5", "anthropic/claude-opus-5", "anthropic/claude-sonnet-4-5-20250929",
  "anthropic/claude-sonnet-4-6", "anthropic/claude-sonnet-5-5", "anthropic/claude-sonnet-5",
  "byteplus/seed-2-0-lite-260228", "byteplus/seed-2-0-mini-260215", "byteplus/seed-2-0-pro-260328",
  "vertexai/gemini-3.1-flash-lite", "vertexai/gemini-3.7-flash", "vertexai/gemini-3.8-flash",
  "vertexai/gemini-3.1-pro-preview", "openai/gpt-4.1-mini", "openai/gpt-4.1-nano",
  "openai/gpt-4.1", "openai/gpt-4o", "openai/gpt-5.5-pro", "openai/gpt-5.5",
  "openai/gpt-5.6-luna", "openai/gpt-5.6-sol", "openai/gpt-5.6-terra", "openai/gpt-5-mini",
  "openai/gpt-5-nano", "openai/gpt-5", "openai/gpt-6-astra", "openai/gpt-6-luna",
  "openai/gpt-6-sol", "openai/o1-pro", "openai/o1", "openai/o3", "openai/o4-mini"
] as const;

const EDIT_ONLY =
  /erase|remove-background|replace-background|green-screen|expand|fill|relight|reseason|restore|add-object|replace-object|product-holding|tryon|vto|upscal|seedvr|flashvsr|skin-enhancer|crystal|increase-resolution|i2i|kontext|patina|switchx/;
const VIDEO_TO_VIDEO = /video-edit|videoedit|video-to-video|aleph|upscale|flashvsr|crystal-video|background-removal|clean-audio|lip-?sync|sync-3|video-extend|motion-transfer|switchx/;

function imageTasks(id: string): RouterTask[] {
  return EDIT_ONLY.test(id) ? ["image_to_image"] : ["text_to_image", "image_to_image"];
}

function videoTasks(id: string): RouterTask[] {
  if (VIDEO_TO_VIDEO.test(id)) return ["video_to_video"];
  if (/(?:^|[-/])r2v(?:$|-)/.test(id)) return ["reference_to_video"];
  if (/(?:^|[-/.])i2v(?:$|-)|image-to-video|image2video|avatar/.test(id)) return ["image_to_video"];
  if (/(?:^|[-/.])t2v(?:$|-)|text-to-video/.test(id)) return ["text_to_video"];
  return ["text_to_video", "image_to_video"];
}

export interface RouterCatalogEntry {
  id: string;
  kind: "image" | "video" | "speech" | "text";
  tasks: RouterTask[];
}

/** Display name for a Router id: the model slug, tidied. */
export function routerModelName(id: string): string {
  const [provider, ...rest] = id.split("/");
  const slug = rest.join("/").replace(/[-_]/g, " ").replace(/\b([a-z])/g, (c) => c.toUpperCase());
  return `${slug} (${provider})`;
}

export const COMFY_ROUTER_CATALOG: readonly RouterCatalogEntry[] = [
  ...IMAGE.map((id) => ({ id, kind: "image" as const, tasks: imageTasks(id) })),
  ...VIDEO.map((id) => ({ id, kind: "video" as const, tasks: videoTasks(id) })),
  ...SPEECH.map((id) => ({ id, kind: "speech" as const, tasks: ["text_to_speech" as const] })),
  ...TEXT.map((id) => ({ id, kind: "text" as const, tasks: ["chat" as const] }))
];
