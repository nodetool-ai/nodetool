import React from "react";
import Image from "next/image";
import type { RecipeSample } from "@/data/recipes";

const MODEL_NAMES: Record<string, string> = {
  "replicate:bria/remove-background": "Bria Background Removal",
  "fal_ai:fal-ai/bria/background/remove": "Bria Background Removal",
  "atlascloud:google/nano-banana-pro/edit": "Nano Banana Pro",
  "atlascloud:google/nano-banana-pro/text-to-image": "Nano Banana Pro",
  "fal_ai:fal-ai/flux/dev": "FLUX.1 Dev",
  "fal_ai:fal-ai/flux/schnell": "FLUX.1 Schnell",
  "replicate:qwen-edit-apps/qwen-image-edit-plus-lora-relight": "Qwen Image Relight",
  "fal_ai:fal-ai/image-apps-v2/relighting": "FAL Relighting",
  "kie:kling-2.6/image-to-video": "Kling 2.6",
  "fal_ai:fal-ai/ltx-2.3/image-to-video/fast": "LTX-2.3",
  "replicate:recraft-ai/recraft-crisp-upscale": "Recraft Crisp Upscale",
  "fal_ai:fal-ai/clarity-upscaler": "Clarity Upscaler",
  "openrouter:openai/gpt-5-mini": "GPT-5 Mini",
  "openai:gpt-5-mini": "GPT-5 Mini",
  "openai:tts-1": "OpenAI TTS-1",
  "replicate:inworld/realtime-tts-1.5-max": "Inworld TTS 1.5 Max",
  "fal_ai:fal-ai/sync-lipsync/v2/pro": "Sync Lip-Sync 2",
  "replicate:sync/lipsync-2": "Sync Lip-Sync 2",
  "gemini:gemini-3.1-pro-preview": "Gemini 3.1 Pro",
  "openrouter:google/gemini-3.1-pro-preview": "Gemini 3.1 Pro",
  "kie:gpt-image-2-text-to-image": "GPT Image 2",
  "gemini:veo-3.1-generate-preview": "Veo 3.1",
  "atlascloud:google/veo3.1/image-to-video": "Veo 3.1",
  "fal_ai:fal-ai/stable-audio-25/text-to-audio": "Stable Audio 2.5",
  "kie:generate-music": "Kie Music",
};

interface RecipeSampleFigureProps {
  sample: RecipeSample;
  /** Recipe name, for alt text. */
  name: string;
}

/**
 * The recipe run against live models.
 *
 * A silent clip loops muted and plays itself; one that carries sound gets
 * controls and never autoplays, because a page that starts talking on load is
 * a page people close. Both cases keep `preload="none"` — the sample sits
 * below the fold and must not compete with the page's own LCP.
 */
export default function RecipeSampleFigure({
  sample,
  name,
}: RecipeSampleFigureProps) {
  return (
    <figure className="m-0">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 shadow-xl">
          <Image
            src={sample.image}
            alt={`Output from running the ${name} recipe`}
            width={1280}
            height={720}
            className="w-full"
          />
        </div>
        {sample.video && (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 shadow-xl lg:w-[280px]">
            <video
              className="w-full"
              poster={sample.poster ?? undefined}
              preload="none"
              playsInline
              controls={sample.hasAudio}
              autoPlay={!sample.hasAudio}
              muted={!sample.hasAudio}
              loop={!sample.hasAudio}
            >
              {sample.webm && <source src={sample.webm} type="video/webm" />}
              <source src={sample.video} type="video/mp4" />
            </video>
          </div>
        )}
      </div>
      <figcaption className="mt-5 max-w-3xl text-sm leading-relaxed text-slate-400">
        {sample.caption}
      </figcaption>
      <details className="mt-5 max-w-3xl rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-300">
          Models used in this example
        </summary>
        <p className="mt-4 text-sm text-slate-400">
          Compare the models behind this example with the recipe defaults.
          You can change models in Studio.
        </p>
        <table className="mt-4 w-full table-fixed text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th scope="col" className="pb-3 pr-4 font-medium">In this example</th>
              <th scope="col" className="pb-3 font-medium">In the recipe</th>
            </tr>
          </thead>
          <tbody>
            {sample.producedBy.map((model) => (
              <tr key={model.shipped} className="border-b border-white/5 last:border-0">
                <td className="break-words py-3 pr-4 text-white">
                  {MODEL_NAMES[model.ran] ?? model.ran}
                </td>
                <td className="break-words py-3 text-slate-400">
                  {model.grade === "exact"
                    ? "Same model"
                    : MODEL_NAMES[model.shipped] ?? model.shipped}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
