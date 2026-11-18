import type { QaPair } from "../lib/jsonld";

/**
 * The `/apps/catalog-motion` page: the Catalog Motion and Catalog Motion with
 * References mini apps. Every sample below is a real render of the sample
 * catalog that ships with the apps
 * (`packages/base-nodes/nodetool/assets/nodetool-base/recipe-inputs/catalog/`),
 * made with the look's prompt template from
 * `scripts/example-apps/catalog-motion.mjs`. Media lives in
 * `public/apps/catalog-motion/`.
 */

export const CATALOG_MOTION_ROUTE = "/apps/catalog-motion";
const MEDIA = "/apps/catalog-motion";

/** The model and settings every sample clip was rendered with. */
export const SAMPLE_RENDER = {
  model: "Gemini Omni Flash",
  referenceModel: "Seedance 2.0",
  provider: "fal",
  seconds: 5,
  resolution: "720p",
  /** The clips came back 16:9; the page shows a centred square crop. */
  aspect: "16:9",
} as const;

export type CatalogLook = {
  id: string;
  title: string;
  /** What the camera and the light do, as the app's card says it. */
  description: string;
};

/** The four looks the start-frame app offers, in the app's order. */
export const CATALOG_LOOKS: readonly CatalogLook[] = [
  {
    id: "studio-orbit",
    title: "Studio orbit",
    description:
      "A slow quarter orbit while a soft key light slides across the product.",
  },
  {
    id: "detail-push-in",
    title: "Detail push-in",
    description: "The camera moves in to a close-up of the material and finish.",
  },
  {
    id: "light-sweep",
    title: "Light sweep",
    description:
      "The camera holds still while one band of light passes over the product.",
  },
  {
    id: "turntable",
    title: "Turntable",
    description:
      "The product turns on a hidden turntable while the camera stays fixed.",
  },
];

export type CatalogSample = {
  row: number;
  sku: string;
  title: string;
  color: string;
  description: string;
  material: string;
  price: string;
  /** The catalog's own product photo: the clip's first frame. */
  photo: string;
  clip: string;
  poster: string;
  look: CatalogLook["id"];
};

/** The sample catalog, one row per product, with the clip each row became. */
export const CATALOG_SAMPLES: readonly CatalogSample[] = [
  {
    row: 1,
    sku: "TT-OLV-500",
    title: "Trail Tumbler",
    color: "olive green",
    description:
      "insulated tumbler with a flip lid that keeps coffee hot for six hours",
    material: "powder-coated steel",
    price: "34.00",
    photo: `${MEDIA}/trail-tumbler.webp`,
    clip: `${MEDIA}/trail-tumbler.mp4`,
    poster: `${MEDIA}/trail-tumbler-poster.webp`,
    look: "studio-orbit",
  },
  {
    row: 2,
    sku: "MW-STL-42",
    title: "Meridian Watch",
    color: "steel and graphite",
    description: "smartwatch with a 42 mm brushed case and a soft sport band",
    material: "aluminium and silicone",
    price: "249.00",
    photo: `${MEDIA}/meridian-watch.webp`,
    clip: `${MEDIA}/meridian-watch.mp4`,
    poster: `${MEDIA}/meridian-watch-poster.webp`,
    look: "detail-push-in",
  },
  {
    row: 3,
    sku: "TC-OLV-350",
    title: "Olive Travel Cup",
    color: "muted olive",
    description: "matte travel cup with a charcoal lid for the morning commute",
    material: "recycled polypropylene",
    price: "18.00",
    photo: `${MEDIA}/olive-travel-cup.webp`,
    clip: `${MEDIA}/olive-travel-cup.mp4`,
    poster: `${MEDIA}/olive-travel-cup-poster.webp`,
    look: "turntable",
  },
  {
    row: 4,
    sku: "MB-CLR-250",
    title: "Message Bottle",
    color: "clear",
    description:
      "clear glass bottle with a cork stopper and a folded paper note inside",
    material: "glass and cork",
    price: "12.00",
    photo: `${MEDIA}/message-bottle.webp`,
    clip: `${MEDIA}/message-bottle.mp4`,
    poster: `${MEDIA}/message-bottle-poster.webp`,
    look: "light-sweep",
  },
];

/** The start of the Studio orbit template, as the app's prompt field shows it. */
export const PROMPT_TEMPLATE_PREVIEW =
  "{{title}} in {{color}}, {{description}}. The camera makes one slow, steady quarter orbit around the product, which stays still at the centre of the frame on a seamless studio sweep.";

export type ReferenceSample = {
  title: string;
  look: string;
  product: string;
  background: string;
  decoration: string;
  clip: string;
  poster: string;
};

/** Catalog Motion with References: one background and one prop image for the whole catalog. */
export const REFERENCE_SAMPLES: readonly ReferenceSample[] = [
  {
    title: "Olive Travel Cup",
    look: "Styled tabletop",
    product: `${MEDIA}/olive-travel-cup.webp`,
    background: `${MEDIA}/ref-background.webp`,
    decoration: `${MEDIA}/ref-decoration.webp`,
    clip: `${MEDIA}/ref-olive-travel-cup.mp4`,
    poster: `${MEDIA}/ref-olive-travel-cup-poster.webp`,
  },
];

export const CATALOG_MOTION_STEPS = [
  {
    title: "Load the catalog",
    body: "Upload the CSV your store already exports. The app finds the image and name columns, and reads comma, semicolon or tab files.",
  },
  {
    title: "Pick a look",
    body: "Start from one of the looks, then edit it. {{column}} placeholders fill from each product's own row.",
  },
  {
    title: "Test one product",
    body: "Render a single row with the exact settings the batch will use, and check the clip before you pay for the rest.",
  },
  {
    title: "Render the range",
    body: "Animate a run of rows. Clips stream in as they finish and each one is saved to your assets with the prompt that made it.",
  },
] as const;

export const CATALOG_MOTION_FAQ: QaPair[] = [
  {
    question: "What does the CSV need?",
    answer:
      "A header row and one product per row, with a column that holds a link to each product's photo. A Shopify or WooCommerce export works as it is: leave the column fields blank and the app finds Image Src and Title. Rows without a usable image link are skipped and listed in the summary.",
  },
  {
    question: "Does the product stay the same in the video?",
    answer:
      "The product photo is the first frame, and every look ends with an instruction to keep the shape, colour, material and markings unchanged. Video models still drift on small print and fine logos, which is why the app renders one test row before the batch.",
  },
  {
    question: "Which video models can I use?",
    answer:
      "Any image-to-video model you have a key for, such as Gemini Omni Flash, Seedance, Kling or Wan. The references app takes a reference-to-video model. One model and one setting render the whole range.",
  },
  {
    question: "What does a batch cost?",
    answer:
      "Video is billed per second by the provider, at its own list price, on your key. The summary shows how many clips and seconds a row range adds up to before you start it.",
  },
  {
    question: "What does the references app add?",
    answer:
      "You upload one background and one decoration image for the whole catalog. Each product's photo stays image 1, and the model builds a new shot of the product in your scene with your props.",
  },
];
