// The four launch recipes, as editorial content only.
//
// A recipe is a named outcome plus the ordered shipped example workflows that
// reach it. Everything mechanical — the models each step calls, the API keys
// the chain needs, the node counts, the card art — is derived from those
// workflows by generate-recipes.mjs, so this file cannot claim a model or a
// key that the graph does not actually use.
//
// `template` is a slug in marketing/src/data/templateEntries.generated.ts.
// The generator throws when one stops resolving, which is what keeps a renamed
// example from silently shipping a broken recipe page and an empty bundle.

/**
 * @typedef {object} RecipeStepSpec
 * @property {string} template  Template slug (must resolve).
 * @property {string} role      What this step is for, in the recipe's terms.
 * @property {string} handoff   What goes in and what comes back out.
 */

/**
 * @typedef {object} RecipeSample
 * @property {string} image      Contact sheet in public/recipes/samples/.
 * @property {string} [video]    Optional clip (mp4 + webm siblings assumed).
 * @property {string} [poster]   Poster for the clip.
 * @property {boolean} [hasAudio] The clip carries sound, so it needs controls.
 * @property {string} caption    What the reader is looking at.
 * @property {string[]} producedBy  provider:model, in the order the chain ran.
 * @property {string} [substitutions] Why the run differs from the shipped graph.
 */

/**
 * @typedef {object} RecipeSpec
 * @property {string} slug
 * @property {string} name
 * @property {string} outcome    One sentence: what you end up holding.
 * @property {string} audience   Who runs this.
 * @property {string[]} summary  Intro paragraphs for the page.
 * @property {string} heroStep   Template slug whose card art heads the page.
 * @property {RecipeStepSpec[]} steps
 * @property {RecipeSample} [sample]  Real output, produced by running the chain.
 * @property {string[]} caveats  What this does not do, stated plainly.
 */

/** @type {RecipeSpec[]} */
export const recipes = [
  {
    slug: "viral-video-ad-engine",
    name: "Viral Video Ad Engine",
    outcome:
      "A vertical product ad, plus the hook lines and thumbnails to test it against.",
    audience: "Performance and social teams shipping several ad variants a week.",
    summary: [
      "Four workflows, ordered cheapest first. The copy and the hook set are text and fast images, so you can throw most of them away; only the last two steps touch a video model, and by then you have already chosen the line and the frame.",
      "That order is the whole point. Deciding register and hook after paying for footage is how an ad budget disappears into renders nobody posts.",
    ],
    heroStep: "hook-and-thumbnail-factory",
    steps: [
      {
        template: "ad-copy-in-three-registers",
        role: "Settle the register before anything renders",
        handoff:
          "In: the offer in a sentence. Out: the same offer written plain, playful and premium. One text call, so the argument about tone costs cents instead of a render queue.",
      },
      {
        template: "hook-and-thumbnail-factory",
        role: "Fan the winning line into a test set",
        handoff:
          "In: the video topic. Out: a stream of hook lines, each with its own color-graded thumbnail. The fan-out is the useful part — one hook stream drives the whole gallery in a single run.",
      },
      {
        template: "ad-loop-from-a-product-photo",
        role: "Put the product in motion",
        handoff:
          "In: the product photo. Out: a short hero loop. A prompt node writes the motion brief, the image-to-video model animates the still, and a speed pass slows it. This is the step that costs real money.",
      },
      {
        template: "cut-a-landscape-clip-for-vertical",
        role: "Cut it to the frame the channel wants",
        handoff:
          "In: the 16:9 loop. Out: a 1080×1920 file. Runs through ffmpeg on your own machine — no key, no per-run charge.",
      },
    ],
    sample: {
      image: "viral-video-ad-engine.jpg",
      video: "viral-video-ad-engine.mp4",
      poster: "viral-video-ad-engine-poster.webp",
      caption:
        "One product photo and one line of copy, run through the whole chain: four hook lines with a thumbnail each, then the hero loop cut to 1080x1920. The fourth thumbnail went off-brief and is shown as it came back.",
      producedBy: [
        "openrouter:openai/gpt-5.4-mini",
        "kie:google/nano-banana",
        "kie:kling-2.6/image-to-video",
        "ffmpeg (local)",
      ],
    },
    caveats: [
      "The vertical step rescales rather than crops, so frame the loop with room to lose or add a crop node ahead of it.",
      "Nothing here measures performance. The recipe produces variants to test; the testing happens in your ad platform.",
    ],
  },
  {
    slug: "multilingual-video-dubber",
    name: "Multilingual Video Dubber",
    outcome:
      "One presenter clip, spoken in a second language, with a lip-synced cut, subtitles, and a back-translation to check it.",
    audience: "Anyone re-releasing a recorded talk, demo, or ad into another market.",
    summary: [
      "The spine is transcribe, translate, revoice. What makes it usable outside the languages your team reads is the third step: a back-translation printed next to the localised line, so the person approving the cut can see what was actually said.",
      "The last two steps are a fork, not a sequence. A voice-over cut ends at the revoiced audio; an on-camera cut carries on into lip-sync so the presenter's mouth matches the new delivery.",
    ],
    heroStep: "ai-spokesperson",
    steps: [
      {
        template: "transcribe-a-clip",
        role: "Get the script back out of the footage",
        handoff:
          "In: the source clip. Out: the spoken words as text. The audio is extracted on your machine and only the audio is sent to a speech-to-text model.",
      },
      {
        template: "localise-a-script-and-revoice-it",
        role: "Translate and voice in one pass",
        handoff:
          "In: the transcript and a target language. Out: audio in that language. A translated document still leaves the recording to do, which is why this step ends in sound rather than text.",
      },
      {
        template: "one-tagline-six-markets",
        role: "Read back what you just shipped",
        handoff:
          "In: the lines that carry the message — the claim, the offer, the call to action. Out: each one in six languages with a back-translation beside it. This is the review gate for a language nobody in the room speaks.",
      },
      {
        template: "ai-spokesperson",
        role: "Make the mouth match, for an on-camera cut",
        handoff:
          "In: the presenter clip and the translated script — the script, not the audio from step two, because this workflow voices the line itself before it redrives the mouth. Out: a take that looks recorded in the new language.",
      },
      {
        template: "subtitle-text-from-a-recording",
        role: "Ship the version people read",
        handoff:
          "In: the localised audio. Out: transcript broken into subtitle-length lines. The line-length rule is what separates a subtitle file from a wall of text.",
      },
    ],
    sample: {
      image: "multilingual-video-dubber.jpg",
      video: "multilingual-video-dubber.mp4",
      poster: "multilingual-video-dubber-poster.webp",
      hasAudio: true,
      caption:
        "The same take, before and after the lip-sync step, with the Spanish the translator produced. The presenter is generated too — the recipe assumes you bring your own footage, and this render had none to bring.",
      producedBy: [
        "kie:nano-banana-pro",
        "kie:kling-2.6/image-to-video",
        "openrouter:openai/gpt-5.4-mini",
        "replicate:inworld/realtime-tts-1.5-max",
        "replicate:sync/lipsync-2",
      ],
    },
    caveats: [
      "Lip-sync redrives the mouth. It does not change gesture, gaze, or anything a presenter does with their hands, so a take with heavy pointing at on-screen text will still read as dubbed.",
      "Timing is not stretched to match the original. A language that runs longer than the source will run longer in the cut.",
      "The back-translation is a check on meaning, not on register. A native reviewer is still the last word before a paid campaign.",
    ],
  },
  {
    slug: "ecommerce-sku-visual-factory",
    name: "E-commerce SKU Visual Factory",
    outcome:
      "One packshot per SKU becomes the whole channel set: cutout, studio scene, seasonal relight, turntable clip, print master, and the listing copy.",
    audience: "Catalogue and marketplace teams with more SKUs than shoot days.",
    summary: [
      "Every step after the first one starts from the cutout, so the product itself is never regenerated. That is the constraint that matters in a catalogue: the customer is buying the object in the photograph, and a model that redraws it has sold them something else.",
      "Run the chain once per SKU. The upscale sits at the end on purpose — one call for the asset you actually print, rather than paying print resolution on every draft.",
    ],
    heroStep: "put-a-product-on-a-studio-backdrop",
    steps: [
      {
        template: "cut-a-product-out-of-its-background",
        role: "Isolate the product once",
        handoff:
          "In: the packshot. Out: the product on a real alpha channel rather than a white matte, so the edge survives compositing onto anything later.",
      },
      {
        template: "put-a-product-on-a-studio-backdrop",
        role: "Place it in a described setting",
        handoff:
          "In: the cutout and a scene description. Out: the product in that scene. Generating around an existing product, rather than prompting for the whole frame, is what keeps the product unchanged.",
      },
      {
        template: "relight-a-product-for-a-seasonal-campaign",
        role: "Change the season without a reshoot",
        handoff:
          "In: the placed shot. Out: the same geometry and materials under different light. Relighting moves where the light comes from and nothing else.",
      },
      {
        template: "spin-a-packshot-into-a-turntable-clip",
        role: "Give the product page motion",
        handoff:
          "In: the still. Out: a short clip with a camera move. Image-to-video keeps the product identical, which a text-to-video model would not.",
      },
      {
        template: "take-a-product-shot-to-print-resolution",
        role: "Upscale only the keeper",
        handoff:
          "In: the approved web asset. Out: a print-resolution master. One call at the end of the pipeline instead of print resolution on every draft.",
      },
      {
        template: "write-a-listing-from-the-product-photo",
        role: "Write the copy from the photograph",
        handoff:
          "In: the image itself, not a description of it. Out: marketplace copy that catches finish, proportion, and what the thing sits next to — details a spec sheet leaves out.",
      },
    ],
    sample: {
      image: "ecommerce-sku-visual-factory.jpg",
      video: "ecommerce-sku-visual-factory.mp4",
      poster: "ecommerce-sku-visual-factory-poster.webp",
      caption:
        "One generated packshot carried through the whole chain: cutout on a real alpha channel, placed on a concrete plinth, relit for winter sun, spun into a turntable clip, and mastered at 4096px. The product is the same object in all six.",
      producedBy: [
        "kie:nano-banana-pro",
        "replicate:bria/remove-background",
        "kie:google/nano-banana-edit",
        "replicate:qwen-edit-apps/qwen-image-edit-plus-lora-relight",
        "kie:kling-2.6/image-to-video",
        "replicate:recraft-ai/recraft-crisp-upscale",
        "openrouter:openai/gpt-5.4-mini",
      ],
    },
    caveats: [
      "Background removal is a model, not a matte artist. Hair, mesh, glassware, and anything transparent need a look before they go live.",
      "Relighting changes light, not colour management. A brand colour that has to match a printed swatch still needs a proofing step.",
      "The listing copy is written from one photograph. It does not know your stock, sizing, or compliance wording.",
    ],
  },
  {
    slug: "storyboard-to-trailer",
    name: "Storyboard to Trailer",
    outcome:
      "A logline becomes a beat sheet, a numbered shot list, a cut teaser, and a score under it.",
    audience: "Directors, agencies, and anyone pitching a film that does not exist yet.",
    summary: [
      "The two text steps come first because they are the ones you will rewrite. A beat sheet and a shot list are cheap to redo and expensive to skip — prose cannot be iterated over by a generation pipeline, numbered shots can.",
      "Only the third step spends. It runs each shot through a video model metered per second, which is why the two documents in front of it are worth arguing over first.",
    ],
    heroStep: "movie-trailer-generator",
    steps: [
      {
        template: "trailer-beats-from-a-premise",
        role: "Write the structure before buying footage",
        handoff:
          "In: the premise. Out: hook, escalation, turn, title card. The shape a trailer needs, settled while it still costs one text call to change.",
      },
      {
        template: "shot-list-from-a-synopsis",
        role: "Turn prose into something a pipeline can walk",
        handoff:
          "In: the synopsis. Out: numbered shots with framing and duration. This is the document the next step iterates over.",
      },
      {
        template: "movie-trailer-generator",
        role: "Film it and cut it",
        handoff:
          "In: the logline. Out: a cut teaser. A Director node writes the storyboard and one style bible, each shot becomes an image prompt, and the frames are rendered, animated, and assembled. The per-second video model is the expensive step.",
      },
      {
        template: "score-a-silent-clip",
        role: "Put music under it",
        handoff:
          "In: the cut and a mood. Out: a bed written to the clip's own length, mixed under the original audio. One audio generation per run.",
      },
    ],
    sample: {
      image: "storyboard-to-trailer.jpg",
      video: "storyboard-to-trailer.mp4",
      poster: "storyboard-to-trailer-poster.webp",
      hasAudio: true,
      caption:
        "One logline — a lighthouse keeper finds a message in a bottle dated forty years from now — through steps three and four: five shots directed, rendered, animated, cut, and scored. The first two steps produce documents, so they are not in the picture; the style bible holding these five together is written in step three.",
      producedBy: [
        "openrouter:openai/gpt-5.4-mini",
        "kie:gpt-image-2-text-to-image",
        "kie:kling-2.6/image-to-video",
        "kie:generate-music",
      ],
    },
    caveats: [
      "Steps three and four both hold their own storyboard. Rewriting the beat sheet does not reach back into a teaser you already rendered — re-run the chain.",
      "Continuity across shots comes from a shared style bible, not from a persistent character model. Faces drift over a long cut.",
      "For a rough cut you can keep editing rather than a finished teaser, swap step three for Directed Film to Timeline, which ends in an editable sequence.",
    ],
  },
];
