// How the site presents each recipe: the page order, and the sample render
// that heads the page.
//
// The recipes themselves — the outcome, the prose, the ordered workflows each
// chain runs — ship with the app, one manifest per recipe in
// `packages/base-nodes/nodetool/examples/recipes/`. generate-recipes.mjs reads
// those, so a page and the chain the app offers cannot describe different
// workflows. What stays here is what only the site has: the contact sheets and
// clips in `public/recipes/samples/`, and the order the cards appear in.

/**
 * @typedef {object} RecipeSample
 * @property {string} image      Contact sheet in public/recipes/samples/.
 * @property {string} [video]    Optional clip (mp4 + webm siblings assumed).
 * @property {string} [poster]   Poster for the clip.
 * @property {boolean} [hasAudio] The clip carries sound, so it needs controls.
 * @property {string} caption    What the reader is looking at.
 */

/**
 * Recipe slugs in page order, each with its sample or null. A slug listed here
 * must have a manifest; a manifest not listed here still ships a page, after
 * these.
 * @type {{slug: string, sample: RecipeSample | null}[]}
 */
export const recipePresentation = [
  {
    slug: "viral-video-ad-engine",
    sample: {
      image: "viral-video-ad-engine.jpg",
      video: "viral-video-ad-engine.mp4",
      poster: "viral-video-ad-engine-poster.webp",
      caption:
        "One product photo becomes four hooks with thumbnails and a 1080×1920 ad loop. The fourth thumbnail missed the brief and is shown unedited.",
    },
  },
  {
    slug: "multilingual-video-dubber",
    sample: {
      image: "multilingual-video-dubber.jpg",
      video: "multilingual-video-dubber.mp4",
      poster: "multilingual-video-dubber-poster.webp",
      hasAudio: true,
      caption:
        "Before and after Spanish lip-sync. This sample uses a generated presenter. Use your own footage for the recipe.",
    },
  },
  {
    slug: "ecommerce-sku-visual-factory",
    sample: {
      image: "ecommerce-sku-visual-factory.jpg",
      video: "ecommerce-sku-visual-factory.mp4",
      poster: "ecommerce-sku-visual-factory-poster.webp",
      caption:
        "One generated packshot becomes a transparent cutout, studio scene, winter relight, turntable clip, and 4096px master.",
    },
  },
  {
    slug: "storyboard-to-trailer",
    sample: {
      image: "storyboard-to-trailer.jpg",
      video: "storyboard-to-trailer.mp4",
      poster: "storyboard-to-trailer-poster.webp",
      hasAudio: true,
      caption:
        "A lighthouse keeper finds a message dated forty years from now. Steps three and four turn that logline into this five-shot teaser with a score. Planning documents from steps one and two are not shown.",
    },
  },
];
