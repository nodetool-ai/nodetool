// Page order and recorded examples. Guided instructions live beside this file.
import { recipeGuides } from "./recipe-guides.mjs";
const runRoot = "/recipes/runs/2026-09-10-marketing-recipes-01";

export const recipePresentation = [
  {
    slug: "viral-video-ad-engine",
    productionRun: {
      runId: "2026-09-10-marketing-recipes-01",
      status: "partial",
      statusLabel: "Three 15-second cuts",
      summary:
        "Three editable 15-second product ads use different opening shots and share the remaining footage.",
      provider: "Media generated with FAL through NodeTool",
      hero: {
        src: `${runRoot}/viral-video-ad-engine/recipe-card.webp`,
        alt: "Three vertical Olive Travel Cup ad variants shown side by side."
      },
      ogImage: `${runRoot}/viral-video-ad-engine/recipe-card.jpg`,
      proof: {
        src: `${runRoot}/viral-video-ad-engine/hooks-contact-sheet.webp`,
        alt: "Three opening compositions for the same Olive Travel Cup ad.",
        caption:
          "Three opening compositions for the same fictional product. The remaining shots and voice lines are shared."
      },
      video: {
        mp4: `${runRoot}/viral-video-ad-engine/ad-a.mp4`,
        webm: `${runRoot}/viral-video-ad-engine/ad-a.webm`,
        poster: `${runRoot}/viral-video-ad-engine/ad-a-poster.webp`,
        hasAudio: true,
        caption:
          "Variant A is a finished 1080×1920 cut with captions and voice."
      },
      supportedClaims: [
        "Three editable 15-second product-ad variants were produced with different openings and shared remaining footage.",
        "The same accepted Olive Travel Cup reference appears across all six shots.",
        "FAL generated the stills, motion clips, and voice through NodeTool."
      ],
      limitations: [
        "The product is a fictional, unbranded demonstration object.",
        "The live app captures and guided-flow walkthrough are not complete.",
        "No speed, virality, sales, product-performance, price, or provider-cost claim is supported."
      ]
    }
  },
  {
    slug: "multilingual-video-dubber",
    productionRun: {
      runId: "2026-09-10-marketing-recipes-01",
      status: "partial",
      statusLabel: "English and Spanish example",
      summary:
        "A synthetic English presenter was translated, revoiced in Spanish, and prepared as editable line-level takes.",
      provider: "Media generated with FAL through NodeTool",
      hero: {
        src: `${runRoot}/multilingual-video-dubber/recipe-card.webp`,
        alt: "Synthetic presenter with English and Spanish versions of the same short script."
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
          "Synthetic presenter footage with separate English, Spanish voiceover, and lip-sync finishing passes. Human audio and visual acceptance is pending."
      },
      supportedClaims: [
        "The captured Script flow preserved three approved Spanish lines through setup.",
        "FAL Kokoro ef_dora produced editable line-level Spanish voice takes.",
        "Line 2 was redirected and revoiced before three clips were sent to an editable 16.3-second timeline."
      ],
      limitations: [
        "Human audition and final playback review are not recorded.",
        "The native timeline preview failed, and the lip-sync finishing pass has not been accepted by a human reviewer.",
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
      summary:
        "One accepted Olive Travel Cup reference became a cutout, three catalogue stills, a short motion clip, a 4096px derivative, and listing copy.",
      provider: "Media generated with FAL through NodeTool",
      hero: {
        src: `${runRoot}/ecommerce-sku-visual-factory/recipe-card.webp`,
        alt: "Olive Travel Cup shown as a cutout, studio product image, winter scene, and motion frame."
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
      limitations: [
        "The scene treatments are generative and do not preserve source pixels unchanged.",
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
      summary:
        "The Storyboard flow turned The Next Tide brief into a reviewed six-shot mystery board with reusable references.",
      provider:
        "Reference images and voice takes generated with FAL through NodeTool",
      hero: {
        src: `${runRoot}/storyboard-to-trailer/recipe-card.webp`,
        alt: "NodeTool Storyboard view showing the six-shot board for The Next Tide."
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
      limitations: [
        "No finished trailer exists.",
        "Motion clips, score, editable timeline, masters, previews, and finishing captures are missing.",
        "The selected keyframes and accepted voice takes remain server-side and are not presented here as exported deliverables."
      ]
    }
  }
].map((recipe) => ({ ...recipe, ...recipeGuides[recipe.slug] }));
