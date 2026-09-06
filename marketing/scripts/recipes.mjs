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
        "One product photo and one line of copy, run through the whole chain: four hook lines with a thumbnail each, then the hero loop cut to 1080x1920. The fourth thumbnail went off-brief and is shown as it came back.",
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
        "The same take, before and after the lip-sync step, with the Spanish the translator produced. The presenter is generated too — the recipe assumes you bring your own footage, and this render had none to bring.",
    },
  },
  {
    slug: "ecommerce-sku-visual-factory",
    sample: {
      image: "ecommerce-sku-visual-factory.jpg",
      video: "ecommerce-sku-visual-factory.mp4",
      poster: "ecommerce-sku-visual-factory-poster.webp",
      caption:
        "One generated packshot carried through the whole chain: cutout on a real alpha channel, placed on a concrete plinth, relit for winter sun, spun into a turntable clip, and mastered at 4096px. The product is the same object in all six.",
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
        "One logline — a lighthouse keeper finds a message in a bottle dated forty years from now — through steps three and four: five shots directed, rendered, animated, cut, and scored. The first two steps produce documents, so they are not in the picture; the style bible holding these five together is written in step three.",
    },
  },
];
