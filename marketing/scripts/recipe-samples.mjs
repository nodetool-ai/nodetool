// How each recipe's sample was rendered: the routing table, the per-recipe
// step list, and the composition of the contact sheets.
//
// The samples are real runs of the shipped example workflows. What this file
// records is the one place they differ from an untouched run: the render
// machine has no key for OpenAI, and its fal, Gemini and Anthropic accounts
// are dead (403 / 429 credits depleted / 401), so every model those graphs
// name is reached by another route.
//
// Each ROUTES entry is graded, and the grade is what the page shows:
//
//   "exact"      — the same model, reached through a different provider.
//                  A run through this route is the shipped run.
//   "upgrade"    — a deliberately better model than the workflow names. The
//                  chain is unchanged; the picture is not the shipped one.
//   "substitute" — a different model, with the reason. The sample shows what
//                  the chain does, not what that model would have produced.
//
// Nothing here is inferred. A route with no grade fails the render rather than
// quietly shipping an unlabelled claim.

/**
 * `provider:model` as the shipped graph names it → how this render reached it.
 * @type {Record<string, {provider: string, id: string, name: string, grade: "exact"|"upgrade"|"substitute", why: string, extra?: object}>}
 */
export const ROUTES = {
  "openai:gpt-5-mini": {
    provider: "openrouter",
    id: "openai/gpt-5-mini",
    name: "GPT-5 mini",
    grade: "exact",
    why: "the same OpenAI model, billed through OpenRouter",
  },
  "gemini:gemini-3.1-pro-preview": {
    provider: "openrouter",
    id: "google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    grade: "exact",
    why: "the same Google model, billed through OpenRouter",
  },
  "fal_ai:fal-ai/flux/schnell": {
    provider: "atlascloud",
    id: "google/nano-banana-pro/text-to-image",
    name: "Nano Banana Pro",
    grade: "upgrade",
    why: "the best text-to-image model reachable from this render. The workflow names FLUX.1 Schnell for speed and cost, which is the right default for a fan-out of throwaway thumbnails and not the right choice for one picture that has to stand on a page",
  },
  "fal_ai:fal-ai/flux/dev": {
    provider: "atlascloud",
    id: "google/nano-banana-pro/edit",
    name: "Nano Banana Pro Edit",
    grade: "upgrade",
    why: "the best image editor reachable from this render. The exact model was tried first and redrew the product: FLUX.1 Dev at the strength 0.45 the workflow sets, against a prompt describing only the scene, returned a different bottle — the one thing this step must not do",
  },
  "kie:gpt-image-2-text-to-image": {
    provider: "atlascloud",
    id: "google/nano-banana-pro/text-to-image",
    name: "Nano Banana Pro",
    grade: "upgrade",
    why: "the best text-to-image model reachable from this render, used for the keyframes every shot is animated from",
  },
  "fal_ai:fal-ai/bria/background/remove": {
    provider: "replicate",
    id: "bria/remove-background",
    name: "Bria Remove Background",
    grade: "exact",
    why: "Bria's own background remover, hosted on Replicate",
  },
  "gemini:veo-3.1-generate-preview": {
    provider: "atlascloud",
    id: "google/veo3.1/image-to-video",
    name: "Veo 3.1",
    grade: "exact",
    why: "the same Veo 3.1, served by AtlasCloud",
  },
  "fal_ai:fal-ai/sync-lipsync/v2/pro": {
    provider: "replicate",
    id: "sync/lipsync-2",
    name: "Sync Lipsync 2",
    grade: "exact",
    why: "Sync's own lipsync-2, hosted on Replicate",
  },
  "fal_ai:fal-ai/clarity-upscaler": {
    provider: "replicate",
    id: "recraft-ai/recraft-crisp-upscale",
    name: "Recraft Crisp Upscale",
    grade: "substitute",
    why: "Clarity Upscaler on Replicate is a community model that needs a pinned version hash and 404s without one",
  },
  "fal_ai:fal-ai/image-apps-v2/relighting": {
    provider: "replicate",
    id: "qwen-edit-apps/qwen-image-edit-plus-lora-relight",
    name: "Qwen Image Edit Relight",
    grade: "substitute",
    why: "fal's relighting app has no equivalent on the providers this render could reach",
  },
  "fal_ai:fal-ai/ltx-2.3/image-to-video/fast": {
    provider: "kie",
    id: "kling-2.6/image-to-video",
    name: "Kling 2.6 Image to Video",
    grade: "substitute",
    why: "no provider reachable from this render serves LTX-2.3",
  },
  "fal_ai:fal-ai/stable-audio-25/text-to-audio": {
    provider: "kie",
    id: "generate-music",
    name: "Kie Generate Music",
    grade: "substitute",
    why: "Stable Audio 2.5 is fal-only here, and MusicGen — tried next because it honours a requested duration — is a versioned community model on Replicate that 404s without a pinned hash. Kie's generator ignores the duration and returns a full song, so the bed is trimmed to the cut",
  },
  "openai:tts-1": {
    provider: "replicate",
    id: "inworld/realtime-tts-1.5-max",
    name: "Inworld Realtime TTS 1.5 Max",
    grade: "substitute",
    why: "no OpenAI key on this machine, and neither OpenRouter nor AtlasCloud serves TTS",
    extra: { selected_voice: "Diana", voices: ["Diana"] },
  },
  "fal_ai:fal-ai/elevenlabs/tts/multilingual-v2": {
    provider: "replicate",
    id: "inworld/realtime-tts-1.5-max",
    name: "Inworld Realtime TTS 1.5 Max",
    grade: "substitute",
    why: "the ElevenLabs account on this machine is on a free plan, which blocks library voices over the API",
    extra: { selected_voice: "Ashley", voices: ["Ashley"] },
  },
};

/**
 * The render plan, one entry per produced artifact.
 *
 * `workflow` is the shipped example by name; `seeds` names the input nodes and
 * where their values come from (a prior step's output, or a literal).
 * @type {Array<{recipe: string, steps: Array<object>}>}
 */
export const PLAN = [
  {
    recipe: "ecommerce-sku-visual-factory",
    steps: [
      {
        id: "packshot",
        generate: {
          provider: "atlascloud",
          model: "google/nano-banana-pro/text-to-image",
          aspect: "1:1",
          prompt:
            "Studio packshot: a matte-charcoal stainless steel insulated water bottle with a brushed copper lid, standing upright, centred, seamless soft-grey backdrop, single large softbox from top-left, clean contact shadow, commercial product photography, tack sharp, no text",
        },
        note: "The input the recipe assumes you already have.",
      },
      {
        id: "cutout",
        workflow: "Cut a Product Out of Its Background",
        seeds: { photo: { from: "packshot" } },
      },
      {
        id: "backdrop",
        workflow: "Put a Product on a Studio Backdrop",
        seeds: { photo: { from: "packshot" } },
      },
      {
        id: "relight",
        workflow: "Relight a Product for a Seasonal Campaign",
        seeds: { photo: { from: "backdrop" } },
      },
      {
        id: "turntable",
        workflow: "Spin a Packshot into a Turntable Clip",
        seeds: { photo: { from: "backdrop" } },
      },
      {
        id: "print",
        workflow: "Take a Product Shot to Print Resolution",
        seeds: { photo: { from: "backdrop" } },
      },
      {
        id: "listing",
        workflow: "Write a Listing from the Product Photo",
        seeds: { photo: { from: "backdrop" } },
      },
    ],
  },
  {
    recipe: "viral-video-ad-engine",
    steps: [
      {
        id: "copy",
        workflow: "Ad Copy in Three Registers",
        seeds: {
          offer: {
            value:
              "A matte-charcoal insulated steel water bottle with a brushed copper lid. Keeps drinks cold 24 hours. 750ml. Free shipping this week.",
          },
        },
      },
      {
        id: "hooks",
        workflow: "Hook & Thumbnail Factory",
        bypass: ["punch"],
        bypassWhy:
          "lib.image.color.BrightnessContrast returns a raw RGBA pixel array, and the CLI's --json stringify of several 1024x1024 images overflows a JS string (RangeError: Invalid string length)",
        seeds: {
          "Video Topic": {
            value: "Why a vacuum-insulated bottle keeps ice for 24 hours",
          },
          "Target Audience": {
            value: "People who buy one good thing instead of five cheap ones",
          },
          "Number of Hooks": { value: 3 },
        },
      },
      {
        id: "loop",
        workflow: "Ad Loop from a Product Photo",
        seeds: {
          product_photo: { from: "ecommerce-sku-visual-factory:packshot" },
          motion: {
            value:
              "Slow orbit around the bottle as a soft highlight travels across the matte surface and the copper lid catches the light",
          },
        },
      },
      {
        id: "vertical",
        workflow: "Cut a Landscape Clip for Vertical",
        seeds: { clip: { from: "loop" } },
      },
    ],
  },
  {
    recipe: "multilingual-video-dubber",
    steps: [
      {
        id: "presenter-still",
        generate: {
          provider: "atlascloud",
          model: "google/nano-banana-pro/text-to-image",
          aspect: "16:9",
          prompt:
            "Photorealistic medium close-up of a woman in her thirties presenting to camera in a bright modern studio, soft key light, shallow depth of field, neutral grey backdrop, natural skin texture, looking directly at the lens, mouth slightly open mid-sentence",
        },
        note: "The presenter clip the recipe assumes you already have; this render had none to bring.",
      },
      {
        id: "presenter-clip",
        workflow: "Bring a Still to Life",
        seeds: {
          still: { from: "presenter-still" },
          motion: {
            value:
              "Locked-off camera. The presenter speaks to the lens with natural head movement and blinks.",
          },
        },
      },
      {
        id: "spanish-text",
        workflow: "Localise a Script and Revoice It",
        bypass: ["tts"],
        bypassWhy:
          "the next step voices the line itself, so this run needs the translated script rather than the audio",
        seeds: {
          script: {
            value:
              "Our insulated bottle keeps ice solid for a full twenty-four hours. One bottle, every day, for years.",
          },
        },
      },
      {
        id: "dubbed",
        workflow: "AI Spokesperson",
        seeds: {
          presenter_clip: { from: "presenter-clip" },
          script: { from: "spanish-text" },
        },
      },
    ],
  },
  {
    recipe: "storyboard-to-trailer",
    steps: [
      {
        id: "trailer",
        workflow: "Movie Trailer Generator",
        seeds: {
          Logline: {
            value:
              "A lighthouse keeper on a storm-battered island finds a message in a bottle dated forty years from now.",
          },
          "Visual Style": {
            value:
              "cinematic film still, anamorphic framing, cold north-Atlantic light, sea spray and rain, handheld telephoto, deep shadows, fine grain",
          },
          "Shot Count": { value: 5 },
        },
      },
      {
        id: "scored",
        workflow: "Score a Silent Clip",
        // The shipped default is a 12-second bed, which leaves the back half
        // of a five-shot cut silent.
        overrides: { score: { duration: 26 } },
        seeds: {
          clip: { from: "trailer", downscale: 960 },
          mood: {
            value:
              "Cold north-Atlantic strings under a slow low drone, distant foghorn, tension building, no drums",
          },
        },
      },
    ],
  },
];
