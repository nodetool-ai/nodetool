// Page order and recorded examples. Guided instructions live beside this file.
import { recipeGuides } from "./recipe-guides.mjs";
const commercialRoot = "/recipes/runs/2026-09-14-photographic-commercial";
const runRoot = "/recipes/runs/2026-09-10-marketing-recipes-01";
const ugcRoot = "/recipes/runs/2026-09-14-emotional-support-cup";

export const recipePresentation = [
  {
    slug: "directed-campaign-kit",
    heroThumbnail: "/apps/directed-campaign-kit.png"
  },
  {
    slug: "ugc-product-video",
    heroThumbnail: "/apps/ugc-product-video.png",
    productionRun: {
      runId: "2026-09-14-emotional-support-cup",
      status: "accepted",
      statusLabel: "15-second emotional-support UGC story",
      proofTitle: "Turns out I needed the green one.",
      summary:
        "A self-aware purchase becomes a small source of reassurance as the same cup follows one chaotic day.",
      provider:
        "Finished UGC video supplied by the user. Transcript and media measurements verified locally.",
      hero: {
        src: `${ugcRoot}/hero.jpg`,
        alt: "Creator speaking to camera in her kitchen while holding an olive travel cup.",
        width: 1440,
        height: 2560
      },
      card: {
        src: `${ugcRoot}/poster.jpg`,
        alt: "Creator smiling in warm evening light while holding the olive cup.",
        width: 1440,
        height: 2560
      },
      ogImage: `${ugcRoot}/poster.jpg`,
      proof: {
        src: `${ugcRoot}/story-strip.jpg`,
        alt: "Five frames follow the creator and olive cup from morning at home through work to evening.",
        caption:
          "The cup moves through the day before the creator returns to the opening thought.",
        width: 1600,
        height: 900
      },
      video: {
        mp4: `${ugcRoot}/final.mp4`,
        webm: null,
        poster: `${ugcRoot}/poster.jpg`,
        hasAudio: true,
        caption:
          "A 15.017-second vertical UGC story with continuous first-person narration and natural location sound."
      },
      supportedClaims: [
        "The creator says she bought the cup because it was green even though she already owned six cups.",
        "The picture follows the same creator and cup from home through travel, work, an outdoor pause, and an evening close.",
        "The supplied MP4 is 1440×2560, runs for 15.017 seconds, and contains H.264 video with AAC stereo audio."
      ],
      essentialLimitation:
        "Generated product details, lip-sync, factual claims, and caption words still need review before publishing.",
      limitations: [
        "The Olive Travel Cup is a fictional demonstration product.",
        "The supplied MP4 does not include provider, model, or editable project metadata."
      ]
    }
  },
  {
    slug: "viral-video-ad-engine",
    productionRun: {
      runId: "2026-09-14-photographic-commercial",
      status: "accepted",
      statusLabel: "13-second photographic commercial",
      proofTitle: "A moment before the day.",
      summary:
        "Fresh coffee pours, she takes a quiet moment, then heads out with her cup. Three shots follow one morning ritual.",
      provider:
        "Opening and exit supplied from Dreamina. Middle shot generated with Seedance 2.0 via Fal. Edited in NodeTool, then enhanced to 2K with AtlasCloud.",
      hero: {
        src: `${commercialRoot}/card.jpg`,
        alt: "Woman holding an olive travel cup in a softly lit kitchen.",
        width: 2400,
        height: 1260
      },
      card: {
        src: `${commercialRoot}/card.jpg`,
        alt: "Woman holding an olive travel cup in a softly lit kitchen.",
        width: 2400,
        height: 1260
      },
      ogImage: `${commercialRoot}/card.jpg`,
      proof: null,
      video: {
        mp4: `${commercialRoot}/commercial.mp4`,
        webm: null,
        poster: `${commercialRoot}/poster.webp`,
        hasAudio: true,
        caption:
          "A moment before the day. A 13-second commercial for the fictional Olive Travel Cup, with location sound."
      },
      supportedClaims: [
        "The opening shows coffee filling the cup. The closing shot follows the woman out through her front door.",
        "The approved four-second middle shot is preserved between the two new shots in an editable NodeTool timeline.",
        "The final MP4 was enhanced to 2560×1440 with AtlasCloud, runs for 13 seconds at 24 fps, and includes balanced stereo location sound."
      ],
      essentialLimitation:
        "Generated product geometry and human motion need review before use in a brand campaign.",
      limitations: [
        "The Olive Travel Cup is a fictional, unbranded demonstration product.",
        "The master was encoded locally from the saved edit. Frame inspection and media checks do not establish parity with a filmed commercial."
      ]
    }
  },
  {
    slug: "multilingual-video-dubber",
    productionRun: {
      runId: "2026-09-10-marketing-recipes-01",
      status: "partial",
      statusLabel: "English and Spanish example",
      proofTitle: "Review the words. Revise one voice line.",
      summary:
        "An English presenter, revoiced in Spanish. Edit the translation and revise individual voice lines.",
      provider: "Media generated with FAL and Replicate through NodeTool",
      hero: {
        src: `${runRoot}/multilingual-video-dubber/recipe-card.webp`,
        alt: "Synthetic presenter with English and Spanish versions of the same short script."
      },
      card: {
        src: `${runRoot}/multilingual-video-dubber/translation-review.webp`,
        alt: "English source lines beside their Spanish translation and back-translation review.",
        caption:
          "Synthetic presenter example with a recorded translation review."
      },
      ogImage: `${runRoot}/multilingual-video-dubber/recipe-card.jpg`,
      proof: {
        src: `${runRoot}/multilingual-video-dubber/translation-review.webp`,
        alt: "English source lines beside their Spanish translation and back-translation review.",
        caption:
          "The reviewed Spanish wording is imported into the Script guide before choosing a voice."
      },
      video: {
        mp4: `${runRoot}/multilingual-video-dubber/language-comparison.mp4`,
        webm: `${runRoot}/multilingual-video-dubber/language-comparison.webm`,
        poster: `${runRoot}/multilingual-video-dubber/language-comparison-poster.webp`,
        hasAudio: true,
        caption:
          "Synthetic presenter with English, Spanish voiceover, and lip-sync versions."
      },
      supportedClaims: [
        "The captured Script flow preserved three approved Spanish lines through setup.",
        "Inworld Realtime TTS 2 with the female Ashley voice produced the Spanish track used in the comparison video.",
        "Line 2 was redirected and revoiced before three clips were sent to an editable 16.3-second timeline."
      ],
      essentialLimitation:
        "The native timeline preview failed, and human audition and lip-sync acceptance remain pending.",
      limitations: [
        "Five required app captures, the walkthrough, persistent document IDs, and lossless capture originals are missing."
      ]
    }
  },
  {
    slug: "ecommerce-sku-visual-factory",
    productionRun: {
      runId: "2026-09-10-marketing-recipes-01",
      status: "partial",
      statusLabel: "Three views and a motion clip",
      proofTitle: "Build a catalogue set from one product reference.",
      summary:
        "Turn one product photo into a cutout, studio shots, and seasonal scenes.",
      provider: "Media generated with FAL through NodeTool",
      hero: {
        src: `${runRoot}/ecommerce-sku-visual-factory/recipe-card.webp`,
        alt: "Olive Travel Cup shown as a cutout, studio product image, winter scene, and motion frame."
      },
      card: {
        src: `${runRoot}/ecommerce-sku-visual-factory/source-to-set.webp`,
        alt: "Accepted Olive Travel Cup reference beside its transparent cutout and catalogue treatments.",
        caption:
          "One accepted reference carried through a coordinated catalogue set."
      },
      ogImage: `${runRoot}/ecommerce-sku-visual-factory/recipe-card.jpg`,
      proof: {
        src: `${runRoot}/ecommerce-sku-visual-factory/source-to-set.webp`,
        alt: "Accepted Olive Travel Cup reference beside its transparent cutout and catalogue treatments.",
        caption:
          "The same accepted reference moves from source to cutout, studio treatment, seasonal treatment, and delivery assets."
      },
      video: {
        mp4: `${runRoot}/ecommerce-sku-visual-factory/product-motion.mp4`,
        webm: `${runRoot}/ecommerce-sku-visual-factory/product-motion.webm`,
        poster: `${runRoot}/ecommerce-sku-visual-factory/product-motion-poster.webp`,
        hasAudio: false,
        caption:
          "A selected product view becomes a silent six-second camera-arc clip."
      },
      supportedClaims: [
        "One accepted product reference produced a three-shot catalogue.",
        "The run produced a transparent cutout, studio and seasonal stills, a short motion clip, a 4096px derivative, and factual listing copy.",
        "The recorded Commercial flow shows the real setup and finishing sequence."
      ],
      essentialLimitation:
        "The scene treatments are generative and do not preserve source pixels unchanged.",
      limitations: [
        "The motion clip is a short camera arc, not a full 360-degree reconstruction.",
        "Project naming and exact take linkage are unverified. The capture files and walkthrough need format and frame-rate recapture before acceptance."
      ]
    }
  },
  {
    slug: "storyboard-to-trailer",
    productionRun: {
      runId: "2026-09-10-marketing-recipes-01",
      status: "partial",
      statusLabel: "Storyboard example",
      proofTitle: "A mystery told in six frames.",
      summary:
        "The Next Tide: a six-shot storyboard with a shared cast, locations, and props.",
      provider:
        "Reference images and voice takes generated with FAL through NodeTool",
      hero: {
        src: `${runRoot}/storyboard-to-trailer/recipe-card.webp`,
        alt: "NodeTool Storyboard view showing the six-shot board for The Next Tide."
      },
      card: {
        src: `${runRoot}/storyboard-to-trailer/storyboard-board.jpg`,
        alt: "The complete six-shot storyboard for The Next Tide.",
        caption: "The reviewed board is the end of this recorded example."
      },
      ogImage: `${runRoot}/storyboard-to-trailer/recipe-card.jpg`,
      proof: {
        src: `${runRoot}/storyboard-to-trailer/entity-references.webp`,
        alt: "Reference images for Elin, the lighthouse, the keeper's room, and the message bottle.",
        caption:
          "Reusable character, location, and prop references anchor the six-shot board. Select the Stills step above to see the editable storyboard."
      },
      video: null,
      supportedClaims: [
        "The Storyboard flow created a six-shot mystery board with reusable character, location, and prop references."
      ],
      essentialLimitation: "No finished trailer exists.",
      limitations: [
        "Motion clips, score, editable timeline, masters, previews, and finishing captures are missing.",
        "The selected keyframes and accepted voice takes remain server-side and are not presented here as exported deliverables."
      ]
    }
  },
  {
    slug: "impossible-product-worlds",
    productionRun: {
      runId: "2026-09-14-impossible-product-worlds-dreamina",
      status: "accepted",
      statusLabel: "15-second Dreamina product world",
      proofTitle: "Small object. Big escape.",
      summary:
        "A desert flight reveals a pool in a giant cup. A woman jumps in, then drinks from the same product at human scale.",
      provider: "Finished video supplied from Dreamina",
      hero: {
        src: "/recipes/runs/2026-09-14-impossible-product-worlds-dreamina/poster.webp",
        alt: "A woman jumping into a turquoise pool inside the lid of a giant olive travel cup.",
        width: 720,
        height: 1280
      },
      card: {
        src: "/recipes/runs/2026-09-14-impossible-product-worlds-dreamina/poster.webp",
        alt: "A woman jumping into a turquoise pool inside the lid of a giant olive travel cup.",
        width: 720,
        height: 1280
      },
      ogImage: "/recipes/runs/2026-09-14-impossible-product-worlds-dreamina/poster.jpg",
      proof: {
        src: "/recipes/runs/2026-09-14-impossible-product-worlds-dreamina/story-strip.jpg",
        alt: "Five frames show the giant cup, lid pool, running jump, underwater splash, and final drink.",
        caption:
          "The accepted Dreamina render moves from monumental scale to a familiar product action.",
        width: 1600,
        height: 900
      },
      video: {
        mp4: "/recipes/runs/2026-09-14-impossible-product-worlds-dreamina/final.mp4",
        webm: null,
        poster: "/recipes/runs/2026-09-14-impossible-product-worlds-dreamina/poster.webp",
        hasAudio: true,
        caption:
          "A 15.072-second Dreamina product film at 720×1280 with stereo sound."
      },
      supportedClaims: [
        "The video shows a desert approach, a pool reveal, a jump and underwater transition, then a woman drinking from the cup.",
        "The published MP4 is 720×1280, contains 361 H.264 video frames, and carries AAC stereo audio."
      ],
      essentialLimitation: "The Dreamina source is a flattened 720×1280 video.",
      limitations: [
        "The cup's lid and body proportions differ from the clean product reference in some frames.",
        "The woman's hair is tied back before the jump and worn down in the closing drink, so the character continuity is not exact."
      ]
    }
  }
].map((recipe) => ({ ...recipe, ...recipeGuides[recipe.slug] }));
