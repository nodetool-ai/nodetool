// Page order and recorded examples. Guided instructions live beside this file.
import { recipeGuides } from "./recipe-guides.mjs";
const tinyCrewRoot = "/recipes/runs/2026-09-12-tiny-film-crew";
const runRoot = "/recipes/runs/2026-09-10-marketing-recipes-01";

export const recipePresentation = [
  {
    slug: "viral-video-ad-engine",
    productionRun: {
      runId: "2026-09-12-tiny-film-crew",
      status: "partial",
      statusLabel: "15-second product commercial",
      proofTitle: "Big production. Everyday coffee.",
      summary:
        "A tiny film crew sets up the perfect coffee shot. Then a human hand steals the star of the show.",
      provider: "MiniMax H3 via AtlasCloud. Edited in NodeTool.",
      hero: {
        src: `${tinyCrewRoot}/card.jpg`,
        alt: "Miniature film crew directing a commercial around an oversized olive travel cup.",
        width: 1200,
        height: 630
      },
      card: {
        src: `${tinyCrewRoot}/card.jpg`,
        alt: "Miniature film crew directing a commercial around an oversized olive travel cup.",
        width: 1200,
        height: 630
      },
      ogImage: `${tinyCrewRoot}/card.jpg`,
      proof: null,
      video: {
        mp4: `${tinyCrewRoot}/tiny-film-crew.mp4`,
        webm: null,
        poster: `${tinyCrewRoot}/poster.webp`,
        hasAudio: true,
        caption: "Tiny Film Crew. A 15-second ad for the fictional Olive Travel Cup, with dialogue and a closing title."
      },
      supportedClaims: [
        "MiniMax H3 generated the five-beat scene from the product reference through NodeTool.",
        "The editable timeline adds the closing title and adjusts audio level.",
        "The exported 1080×1920 ad is 15 seconds long with dialogue and music."
      ],
      essentialLimitation:
        "The guide below demonstrates a separate four-shot commercial, not the Tiny Film Crew render.",
      limitations: [
        "Verification used local frame inspection, transcription, and media checks."
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
      runId: "2026-09-11-impossible-product-worlds",
      status: "partial",
      statusLabel: "15-second drone reveal",
      summary:
        "A continuous drone flight rises above a giant desert cup and reveals a luxury pool inside its fitted lid, followed by a tabletop shot and closing hero.",
      provider: "GPT Image 2 stills and Kling v3 Turbo clips generated with AtlasCloud through NodeTool",
      hero: {
        src: "/recipes/runs/2026-09-11-impossible-product-worlds/pool-poster.webp",
        alt: "A giant olive travel cup in the desert with a turquoise pool and loungers inside its lid."
      },
      ogImage: "/recipes/runs/2026-09-11-impossible-product-worlds/pool-poster.jpg",
      proof: null,
      video: {
        mp4: "/recipes/runs/2026-09-11-impossible-product-worlds/drone-reveal-final.mp4",
        webm: null,
        poster: "/recipes/runs/2026-09-11-impossible-product-worlds/pool-poster.webp",
        hasAudio: false,
        caption: "A silent 15-second concept film at 1080×1920. The first eight seconds are one continuous generated drone shot."
      },
      supportedClaims: [
        "The opening camera move keeps the cup in view while revealing a pool inside its fitted lid.",
        "The final MP4 contains 450 frames at 30 fps and was visually reviewed."
      ],
      limitations: [
        "The fictional product changes proportions between generated shots. The result demonstrates a creative direction, not exact product reproduction.",
        "Final playback was assembled locally after the timeline renderer omitted the revised opening clip. No recorded UI walkthrough or soundtrack is included."
      ]
    }
  }
].map((recipe) => ({ ...recipe, ...recipeGuides[recipe.slug] }));
