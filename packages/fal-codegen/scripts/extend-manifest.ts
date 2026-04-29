#!/usr/bin/env tsx
/**
 * One-shot script to append new FAL endpoints to fal-manifest.json
 * without re-fetching every existing schema.
 *
 * Run: npx tsx scripts/extend-manifest.ts
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SchemaFetcher } from "../src/schema-fetcher.js";
import { SchemaParser } from "../src/schema-parser.js";

interface Entry {
  endpointId: string;
  moduleName: string;
  docstring: string;
  tags: string[];
  useCases: string[];
}

const STD_USE_CASES = [
  "Automated content generation",
  "Creative workflows",
  "Batch processing",
  "Professional applications",
  "Rapid prototyping"
];

const NEW_ENTRIES: Entry[] = [];

function add(
  endpointId: string,
  moduleName: string,
  docstring: string,
  tags: string[],
  useCases: string[] = STD_USE_CASES
): void {
  NEW_ENTRIES.push({ endpointId, moduleName, docstring, tags, useCases });
}

// text-to-image
add("fal-ai/ernie-image", "text_to_image", "ERNIE Image text-to-image generation by Baidu.", ["generation", "text-to-image", "txt2img", "ernie", "baidu"]);
add("fal-ai/ernie-image/lora", "text_to_image", "ERNIE Image with LoRA weights.", ["generation", "text-to-image", "txt2img", "ernie", "lora"]);
add("fal-ai/ernie-image/lora/turbo", "text_to_image", "ERNIE Image Turbo with LoRA weights.", ["generation", "text-to-image", "txt2img", "ernie", "lora", "turbo"]);
add("fal-ai/ernie-image/turbo", "text_to_image", "ERNIE Image Turbo: faster ERNIE text-to-image generation.", ["generation", "text-to-image", "txt2img", "ernie", "turbo"]);
add("fal-ai/nucleus-image", "text_to_image", "Nucleus Image text-to-image model.", ["generation", "text-to-image", "txt2img", "nucleus"]);
add("fal-ai/nano-banana-2", "text_to_image", "Nano Banana 2 text-to-image generation.", ["generation", "text-to-image", "txt2img", "nano-banana"]);
add("fal-ai/nano-banana-pro", "text_to_image", "Nano Banana Pro text-to-image generation.", ["generation", "text-to-image", "txt2img", "nano-banana", "pro"]);
add("fal-ai/flux-2-pro", "text_to_image", "FLUX.2 Pro text-to-image generation.", ["generation", "text-to-image", "txt2img", "flux", "flux-2"]);
add("openai/gpt-image-2", "text_to_image", "OpenAI GPT Image 2 text-to-image generation.", ["generation", "text-to-image", "txt2img", "openai", "gpt-image"]);
add("imagineart/imagineart-2.0-preview/text-to-image", "text_to_image", "ImagineArt 2.0 Preview text-to-image.", ["generation", "text-to-image", "txt2img", "imagineart"]);
add("fal-ai/ideogram/custom-models/generate", "text_to_image", "Generate images with a custom-trained Ideogram model.", ["generation", "text-to-image", "txt2img", "ideogram", "custom-model"]);

// image-to-image
add("fal-ai/nano-banana-2/edit", "image_to_image", "Edit images with Nano Banana 2.", ["editing", "image-to-image", "img2img", "nano-banana"]);
add("fal-ai/nano-banana-pro/edit", "image_to_image", "Edit images with Nano Banana Pro.", ["editing", "image-to-image", "img2img", "nano-banana", "pro"]);
add("fal-ai/flux-2-pro/edit", "image_to_image", "Edit images with FLUX.2 Pro.", ["editing", "image-to-image", "img2img", "flux", "flux-2"]);
add("openai/gpt-image-2/edit", "image_to_image", "Edit images with OpenAI GPT Image 2.", ["editing", "image-to-image", "img2img", "openai", "gpt-image"]);
add("fal-ai/bytedance/seedream/v5/lite/edit", "image_to_image", "Edit images with ByteDance Seedream v5 Lite.", ["editing", "image-to-image", "img2img", "seedream", "bytedance"]);

// text-to-video
add("bytedance/seedance-2.0/text-to-video", "text_to_video", "Generate videos from text using ByteDance Seedance 2.0.", ["generation", "text-to-video", "txt2vid", "seedance", "bytedance"]);
add("bytedance/seedance-2.0/fast/text-to-video", "text_to_video", "Fast text-to-video with ByteDance Seedance 2.0.", ["generation", "text-to-video", "txt2vid", "seedance", "bytedance", "fast"]);
add("alibaba/happy-horse/text-to-video", "text_to_video", "Generate videos from text with Alibaba Happy Horse.", ["generation", "text-to-video", "txt2vid", "happy-horse", "alibaba"]);
add("fal-ai/kling-video/o3/4k/text-to-video", "text_to_video", "Kling Video O3 4K text-to-video generation.", ["generation", "text-to-video", "txt2vid", "kling", "4k"]);
add("fal-ai/kling-video/v3/4k/text-to-video", "text_to_video", "Kling Video v3 4K text-to-video generation.", ["generation", "text-to-video", "txt2vid", "kling", "4k"]);
add("fal-ai/heygen/v3/video-agent", "text_to_video", "HeyGen v3 Video Agent: generate avatar videos from text.", ["generation", "text-to-video", "txt2vid", "heygen", "avatar"]);

// image-to-video
add("bytedance/seedance-2.0/image-to-video", "image_to_video", "Animate images with ByteDance Seedance 2.0.", ["generation", "image-to-video", "img2vid", "seedance", "bytedance"]);
add("bytedance/seedance-2.0/reference-to-video", "image_to_video", "Reference-image-to-video with ByteDance Seedance 2.0.", ["generation", "image-to-video", "img2vid", "seedance", "bytedance", "reference"]);
add("bytedance/seedance-2.0/fast/image-to-video", "image_to_video", "Fast image-to-video with ByteDance Seedance 2.0.", ["generation", "image-to-video", "img2vid", "seedance", "bytedance", "fast"]);
add("bytedance/seedance-2.0/fast/reference-to-video", "image_to_video", "Fast reference-image-to-video with ByteDance Seedance 2.0.", ["generation", "image-to-video", "img2vid", "seedance", "bytedance", "fast", "reference"]);
add("alibaba/happy-horse/image-to-video", "image_to_video", "Animate images with Alibaba Happy Horse.", ["generation", "image-to-video", "img2vid", "happy-horse", "alibaba"]);
add("alibaba/happy-horse/reference-to-video", "image_to_video", "Reference-image-to-video with Alibaba Happy Horse.", ["generation", "image-to-video", "img2vid", "happy-horse", "alibaba", "reference"]);
add("fal-ai/kling-video/o3/4k/image-to-video", "image_to_video", "Kling Video O3 4K image-to-video.", ["generation", "image-to-video", "img2vid", "kling", "4k"]);
add("fal-ai/kling-video/o3/4k/reference-to-video", "image_to_video", "Kling Video O3 4K reference-to-video.", ["generation", "image-to-video", "img2vid", "kling", "4k", "reference"]);
add("fal-ai/kling-video/v3/4k/image-to-video", "image_to_video", "Kling Video v3 4K image-to-video.", ["generation", "image-to-video", "img2vid", "kling", "4k"]);
add("fal-ai/kling-video/v3/pro/image-to-video", "image_to_video", "Kling Video v3 Pro image-to-video.", ["generation", "image-to-video", "img2vid", "kling", "pro"]);
add("fal-ai/lyra-2/zoom", "image_to_video", "Lyra 2 Zoom: animate images with cinematic zoom.", ["generation", "image-to-video", "img2vid", "lyra", "zoom"]);
add("fal-ai/sora-2/characters", "image_to_video", "Sora 2 Characters: image-to-video with consistent characters.", ["generation", "image-to-video", "img2vid", "sora", "characters"]);
add("fal-ai/pixverse/c1/reference-to-video", "image_to_video", "Pixverse C1 reference-to-video.", ["generation", "image-to-video", "img2vid", "pixverse", "reference"]);
add("fal-ai/pixverse/c1/transition", "image_to_video", "Pixverse C1 transition video generation.", ["generation", "image-to-video", "img2vid", "pixverse", "transition"]);
add("fal-ai/pixverse/v6/image-to-video", "image_to_video", "Pixverse v6 image-to-video.", ["generation", "image-to-video", "img2vid", "pixverse"]);

// video-to-video
add("alibaba/happy-horse/video-edit", "video_to_video", "Edit videos with Alibaba Happy Horse.", ["editing", "video-to-video", "vid2vid", "happy-horse", "alibaba"]);
add("fal-ai/heygen/v3/lipsync/speed", "video_to_video", "HeyGen v3 lipsync (speed mode).", ["editing", "video-to-video", "vid2vid", "heygen", "lipsync"]);
add("fal-ai/heygen/v3/lipsync/precision", "video_to_video", "HeyGen v3 lipsync (precision mode).", ["editing", "video-to-video", "vid2vid", "heygen", "lipsync"]);
add("fal-ai/ltx-2.3-22b/distilled/reference-video-to-video", "video_to_video", "LTX 2.3-22b distilled reference video-to-video.", ["editing", "video-to-video", "vid2vid", "ltx", "reference"]);
add("fal-ai/ltx-2.3-22b/distilled/reference-video-to-video/lora", "video_to_video", "LTX 2.3-22b distilled reference video-to-video with LoRA.", ["editing", "video-to-video", "vid2vid", "ltx", "lora"]);
add("fal-ai/ltx-2.3-22b/reference-video-to-video", "video_to_video", "LTX 2.3-22b reference video-to-video.", ["editing", "video-to-video", "vid2vid", "ltx", "reference"]);
add("fal-ai/ltx-2.3-22b/reference-video-to-video/lora", "video_to_video", "LTX 2.3-22b reference video-to-video with LoRA.", ["editing", "video-to-video", "vid2vid", "ltx", "lora"]);
add("fal-ai/void-video-inpainting", "video_to_video", "Void: video inpainting.", ["editing", "video-to-video", "vid2vid", "inpainting"]);

// text-to-speech
add("fal-ai/gemini-3.1-flash-tts", "text_to_speech", "Gemini 3.1 Flash text-to-speech.", ["audio", "tts", "text-to-speech", "gemini"]);

// text-to-audio
add("fal-ai/minimax-music/v2.5", "text_to_audio", "MiniMax Music v2.5: text-to-music generation.", ["audio", "music", "text-to-audio", "minimax"]);
add("fal-ai/minimax-music/v2.6", "text_to_audio", "MiniMax Music v2.6: text-to-music generation.", ["audio", "music", "text-to-audio", "minimax"]);

// speech-to-text
add("fal-ai/cohere-transcribe", "speech_to_text", "Cohere transcription model: speech-to-text.", ["audio", "stt", "speech-to-text", "transcription", "cohere"]);

// vision
add("nvidia/nemotron-3-nano-omni/vision", "vision", "Nvidia Nemotron 3 Nano Omni: image understanding.", ["vision", "image-to-text", "vlm", "nvidia", "nemotron"]);

// video-to-text
add("nvidia/nemotron-3-nano-omni/video", "video_to_text", "Nvidia Nemotron 3 Nano Omni: video understanding.", ["video-to-text", "vlm", "nvidia", "nemotron"]);

// audio-to-text
add("nvidia/nemotron-3-nano-omni/audio", "audio_to_text", "Nvidia Nemotron 3 Nano Omni: audio understanding.", ["audio-to-text", "nvidia", "nemotron"]);

// llm
add("nvidia/nemotron-3-nano-omni", "llm", "Nvidia Nemotron 3 Nano Omni multimodal LLM.", ["llm", "language-model", "text-generation", "nvidia", "nemotron"]);

// training
add("fal-ai/ideogram/custom-models", "training", "Train a custom Ideogram model.", ["training", "fine-tuning", "ideogram", "custom-model"]);
add("fal-ai/ernie-image-trainer", "training", "Train a LoRA for ERNIE Image.", ["training", "fine-tuning", "ernie", "lora"]);

// image-to-3d
add("fal-ai/meshy/v6/multi-image-to-3d", "image_to_3d", "Meshy v6: multi-image to 3D mesh generation.", ["3d", "generation", "image-to-3d", "meshy", "modeling"]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MANIFEST = join(ROOT, "..", "fal-nodes", "src", "fal-manifest.json");

const fetcher = new SchemaFetcher(join(ROOT, ".codegen-cache"));
const parser = new SchemaParser();

const manifestRaw = await readFile(MANIFEST, "utf-8");
const manifest = JSON.parse(manifestRaw) as Array<Record<string, unknown>>;
const existing = new Set(manifest.map((m) => m.endpointId as string));

let added = 0;
let skipped = 0;
const failures: string[] = [];

console.log(`Total new entries to process: ${NEW_ENTRIES.length}`);

for (const entry of NEW_ENTRIES) {
  if (existing.has(entry.endpointId)) {
    console.log(`  Skip (exists): ${entry.endpointId}`);
    skipped++;
    continue;
  }
  try {
    console.log(`  Fetching ${entry.endpointId}...`);
    const schema = await fetcher.fetchSchema(entry.endpointId, true);
    const spec = parser.parse(schema);
    const final = {
      ...spec,
      docstring: entry.docstring,
      tags: entry.tags,
      useCases: entry.useCases,
      moduleName: entry.moduleName
    };
    manifest.push(final);
    added++;
  } catch (e) {
    console.error(`  ERROR ${entry.endpointId}: ${(e as Error).message}`);
    failures.push(entry.endpointId);
  }
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(
  `\nAdded: ${added}, Skipped: ${skipped}, Failures: ${failures.length}`
);
if (failures.length) console.log("Failed:", failures);
