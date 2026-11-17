// Catalog Motion: a product catalog CSV in, one product video per row out.
//
// The templates come from scripts/example-apps/catalog-motion-templates.mjs.
// "Read a Product Catalog" fills the prompt for every row without rendering,
// and "Animate a Product Catalog" renders a row range. The test and the batch
// are two operations on the same workflow: the test reads one row number into
// both ends of the range.
//
// `catalogMotionApp` builds two apps from one definition. "start_frame"
// animates each product photo as the first frame with Image To Video.
// "references" gives the photo plus an optional background and decoration
// image to Reference To Video, numbered image 1, image 2 and image 3.

export const CATALOG_SAMPLE = "package://nodetool-base/recipe-inputs/catalog/products.csv";

// Every look ends with the same lock on the product, so a clip moves the camera
// and the light but never redesigns what the shopper is buying.
const PRODUCT_LOCK =
  "The product's shape, colour, material and markings stay exactly as in the photo. No text, no hands, no other objects.";
const REFERENCE_LOCK =
  "The product's shape, colour, material and markings stay exactly as in {{product_image}}. No text, no hands.";

// Ready prompt templates for the start-frame app. The product photo is the
// first frame, so each look directs one camera or light move and nothing that
// would need a new setting.
export const CATALOG_LOOKS = [
  {
    value: `{{title}} in {{color}}, {{description}}. The camera makes one slow, steady quarter orbit around the product, which stays still at the centre of the frame on a seamless studio sweep. A soft key light from the upper left glides across its surface as the camera moves, and a faint reflection stays under it on the floor. ${PRODUCT_LOCK}`,
    title: "Studio orbit",
    description: "A slow quarter orbit while a soft key light slides across the product. Fits most packshots."
  },
  {
    value: `{{title}} in {{color}}, {{description}}. The camera glides straight in from the full product to a close-up of its surface, so the texture of its material and the edges of the finish fill the frame by the end. The light stays soft and even, and focus stays on the product the whole way. ${PRODUCT_LOCK}`,
    title: "Detail push-in",
    description: "The camera moves in to a close-up of the material and finish."
  },
  {
    value: `{{title}} in {{color}}, {{description}}. The camera stays locked. A narrow band of white light sweeps once from left to right across the product, bringing up its highlights and edges as it passes, then the scene settles back to soft studio light. ${PRODUCT_LOCK}`,
    title: "Light sweep",
    description: "The camera holds still while one band of light passes over the product."
  },
  {
    value: `{{title}} in {{color}}, {{description}}. The product turns one half rotation on a hidden turntable, at an even, slow speed, and stops facing the camera again. The camera and the soft studio light stay fixed, and the product stays centred and upright. ${PRODUCT_LOCK}`,
    title: "Turntable",
    description: "The product turns on a hidden turntable while the camera stays fixed."
  }
];
export const CATALOG_PROMPT_TEMPLATE = CATALOG_LOOKS[0].value;
export const CATALOG_NEGATIVE_PROMPT =
  "text, captions, changing logos, warped or melting product, morphing shape, flicker, extra objects, hands";
// The role placeholders of the references app. The reader keeps them in the
// prompt, and "Animate a Product Catalog with References" turns each one into
// "image N" by the image's place in the reference list.
export const CATALOG_REFERENCE_ROLES = ["product_image", "background_image", "decoration_image"];
// Looks for the references app. The model builds a new shot from the images,
// so these may place the product in the background reference's scene.
export const CATALOG_REFERENCE_LOOKS = [
  {
    value: `The product from {{product_image}}: {{title}} in {{color}}, {{description}}. Set it in the scene from {{background_image}} with the props from {{decoration_image}} around it. The camera makes one slow quarter orbit around the product while soft light from the scene falls across it. ${REFERENCE_LOCK}`,
    title: "Product in your scene",
    description: "The product stands in your background with your props, and the camera orbits it."
  },
  {
    value: `The product from {{product_image}}: {{title}} in {{color}}, {{description}}. It stands on a tabletop in the setting from {{background_image}}, with the props from {{decoration_image}} arranged loosely behind it and slightly out of focus. The camera pushes in slowly until the product fills the centre of the frame. ${REFERENCE_LOCK}`,
    title: "Styled tabletop",
    description: "Props sit soft behind the product and the camera pushes in."
  },
  {
    value: `The product from {{product_image}}: {{title}} in {{color}}, {{description}}. It stands alone at the centre of the scene from {{background_image}}. The camera stays locked while one band of warm light sweeps across the product from left to right, then the scene settles. ${REFERENCE_LOCK}`,
    title: "Hero light sweep",
    description: "The product alone in your scene, with one sweep of light across it."
  }
];
export const CATALOG_REFERENCE_PROMPT_TEMPLATE = CATALOG_REFERENCE_LOOKS[0].value;

const VIDEO = { $demo: "video" };
// The run's two real steps. Left unset, the list would also show the model
// input node, which never runs.
const CATALOG_STEPS = [
  { nodeId: "read", title: "Read the catalog rows" },
  { nodeId: "animate", title: "Animate each product" }
];
const DEMO_SUMMARY =
  "**4 products** in the catalog. Images come from **image_url**, names from **title**.\n\nPlaceholders for the prompt: {{sku}} {{title}} {{description}} {{color}} {{material}} {{price}} {{image_url}}\n\nAll 4 rows: 4 clips, 20 seconds of video.";
const DEMO_FIELDS = ["sku", "title", "description", "color", "material", "price", "image_url"];
const demoProducts = (template) =>
  [
    ["Trail Tumbler", "olive green", "insulated tumbler with a flip lid that keeps coffee hot for six hours", "trail-tumbler"],
    ["Meridian Watch", "steel and graphite", "smartwatch with a 42 mm brushed case and a soft sport band", "meridian-watch"],
    ["Olive Travel Cup", "muted olive", "matte travel cup with a charcoal lid for the morning commute", "olive-travel-cup"],
    ["Message Bottle", "clear", "clear glass bottle with a cork stopper and a folded paper note inside", "message-bottle"]
  ].map(([title, color, description, file], i) => ({
    Row: i + 1,
    Product: title,
    Prompt: template
      .replaceAll("{{title}}", title)
      .replaceAll("{{color}}", color)
      .replaceAll("{{description}}", description),
    Image: `${file}.jpg`
  }));

// Every setting the test and the batch share, read from one variable each so
// the test clip is exactly what the batch will render.
const SHARED_INPUTS = {
  catalog: { from: "variable", variableId: "catalog" },
  prompt_template: { from: "variable", variableId: "promptTemplate" },
  image_column: { from: "variable", variableId: "imageColumn" },
  name_column: { from: "variable", variableId: "nameColumn" },
  video_model: { from: "variable", variableId: "videoModel" },
  aspect_ratio: { from: "variable", variableId: "aspectRatio" },
  resolution: { from: "variable", variableId: "resolution" },
  duration: { from: "variable", variableId: "duration" },
  negative_prompt: { from: "variable", variableId: "negativePrompt" }
};
const REFERENCE_INPUTS = {
  background_image: { from: "variable", variableId: "backgroundImage" },
  decoration_image: { from: "variable", variableId: "decorationImage" }
};

/** @param {{ mode: "start_frame" | "references" }} options */
export function catalogMotionApp({ mode }) {
  const refs = mode === "references";
  const template = refs ? CATALOG_REFERENCE_PROMPT_TEMPLATE : CATALOG_PROMPT_TEMPLATE;
  const demoRows = demoProducts(template);
  const renderInputs = refs ? { ...SHARED_INPUTS, ...REFERENCE_INPUTS } : SHARED_INPUTS;
  return {
    slug: refs ? "catalog-motion-references" : "catalog-motion",
    steps: true,
    name: refs ? "Catalog Motion with References" : "Catalog Motion",
    emoji: "🛍️",
    showEmoji: false,
    featured: !refs,
    tagline: refs
      ? "Animate your product catalog with your own backdrop and props."
      : "Animate your product catalog, one clip per product.",
    description: refs
      ? "Upload a product catalog as CSV and every product becomes a short video made from reference images: the product's own photo, plus a background and a decoration image you add once for the whole catalog. One prompt template fills from each row's columns, and you test a single product before you pay for the batch. Every clip is saved to your assets."
      : "Upload a product catalog as CSV and every product's own photo becomes a short video. One prompt template fills from each row's columns, one video model and setting renders the whole range, and you test a single product before you pay for the batch. Every clip is saved to your assets.",
    note: "💸 Video is metered per second. Test one product before you render a range.",
    workflows: {
      read: "Read a Product Catalog",
      animate: refs ? "Animate a Product Catalog with References" : "Animate a Product Catalog"
    },
    variables: [
      {
        id: "catalog",
        name: "Product catalog",
        scope: "user",
        persist: true,
        type: "document",
        default: { type: "document", uri: CATALOG_SAMPLE }
      },
      { id: "imageColumn", name: "Image column", scope: "user", persist: true, type: "str", default: "" },
      { id: "nameColumn", name: "Name column", scope: "user", persist: true, type: "str", default: "" },
      {
        id: "promptTemplate",
        name: "Prompt template",
        scope: "user",
        persist: true,
        type: "str",
        default: template
      },
      {
        id: "negativePrompt",
        name: "Avoid in every clip",
        scope: "user",
        persist: true,
        type: "str",
        default: CATALOG_NEGATIVE_PROMPT
      },
      ...(refs
        ? [
            { id: "backgroundImage", name: "Background reference", scope: "user", persist: true, type: "image" },
            { id: "decorationImage", name: "Decoration reference", scope: "user", persist: true, type: "image" }
          ]
        : []),
      { id: "videoModel", name: "Video model", scope: "user", persist: true, type: "video_model" },
      { id: "aspectRatio", name: "Aspect ratio", scope: "user", persist: true, type: "str", default: "1:1" },
      { id: "resolution", name: "Resolution", scope: "user", persist: true, type: "str", default: "720p" },
      { id: "duration", name: "Seconds per clip", scope: "user", persist: true, type: "int", default: 5 },
      { id: "testRow", name: "Row to test", scope: "instance", type: "int", default: 1 },
      { id: "firstRow", name: "First row", scope: "instance", type: "int", default: 1 },
      { id: "lastRow", name: "Last row", scope: "instance", type: "int", default: 0 }
    ],
    operations: [
      {
        id: "preview",
        name: "Read the catalog",
        workflow: "read",
        policy: "replace",
        inputs: {
          catalog: SHARED_INPUTS.catalog,
          prompt_template: SHARED_INPUTS.prompt_template,
          image_column: SHARED_INPUTS.image_column,
          name_column: SHARED_INPUTS.name_column,
          ...(refs ? { reference_roles: { from: "constant", value: true } } : {})
        }
      },
      {
        id: "test",
        name: "Test one product",
        workflow: "animate",
        policy: "replace",
        timeoutMs: 900000,
        inputs: {
          ...renderInputs,
          first_row: { from: "variable", variableId: "testRow" },
          last_row: { from: "variable", variableId: "testRow" }
        }
      },
      {
        id: "batch",
        name: "Render the range",
        workflow: "animate",
        policy: "replace",
        timeoutMs: 3600000,
        inputs: {
          ...renderInputs,
          first_row: { from: "variable", variableId: "firstRow" },
          last_row: { from: "variable", variableId: "lastRow" }
        }
      }
    ],
    sections: [
      {
        title: "Load the catalog",
        intro: "One product per row, with a header row. Each row needs a link to the product's photo.",
        controls: [
          { document: "catalog", label: "Product catalog (CSV)" },
          {
            note: "A Shopify, WooCommerce or spreadsheet export works as it is. Leave the column fields blank and the app finds the image and name columns."
          },
          { textVar: "imageColumn", label: "Image column (blank finds it)" },
          { textVar: "nameColumn", label: "Name column (blank finds it)" },
          { run: ["preview"], label: "Read the catalog", disabledWhen: "preview" }
        ],
        results: [
          { progress: "preview", label: "Reading the catalog…" },
          { error: "preview", label: "The catalog could not be read" },
          { show: "summary", op: "preview", as: "Markdown", label: "What the app found", demo: DEMO_SUMMARY },
          { show: "products", op: "preview", as: "Table", label: "Products", demo: demoRows }
        ]
      },
      ...(refs
        ? [
            {
              title: "Add reference images",
              intro: "Both images are optional and apply to every product. Each product's own photo is always image 1.",
              controls: [
                { image: "backgroundImage", label: "Background reference" },
                { image: "decorationImage", label: "Decoration reference" },
                {
                  note: "The background is image 2. The decoration is image 3, or image 2 when you add no background."
                }
              ]
            }
          ]
        : []),
      {
        title: "Write the prompt",
        intro: "One template for the whole catalog. Each product's own values fill it in.",
        controls: [
          {
            choices: { variable: "promptTemplate" },
            label: "Start from a look",
            columns: 2,
            options: refs ? CATALOG_REFERENCE_LOOKS : CATALOG_LOOKS
          },
          {
            note: refs
              ? "Read the catalog, then click a field below the prompt to insert its placeholder. You can also type {{column}}, for example {{title}} or {{color}}. Name the images with {{product_image}}, {{background_image}} and {{decoration_image}}. The model gets them in that order: image 1 is the product, then the background, then the decoration. A reference you leave out is skipped, and its placeholder is removed from the prompt. Pick a look to start, then edit it."
              : "Read the catalog, then click a field below the prompt to insert its placeholder. You can also type {{column}}, for example {{title}} or {{color}}. Pick a look to start, then edit it. Describe one camera move and the light once for the whole catalog."
          },
          { textVar: "promptTemplate", label: "Prompt template", multiline: true, cameraPresets: true,
            placeholderFields: { op: "preview", output: "fields", demo: refs ? [...DEMO_FIELDS, ...CATALOG_REFERENCE_ROLES] : DEMO_FIELDS } },
          { textVar: "negativePrompt", label: "Avoid in every clip" },
          { run: ["preview"], label: "Fill the prompts", disabledWhen: "preview" }
        ],
        results: [
          { error: "preview", label: "The template does not fit the catalog" },
          { show: "products", op: "preview", as: "Table", label: "The prompt for each product", demo: demoRows }
        ]
      },
      {
        title: "Choose the video model",
        intro: refs
          ? "Every product is animated from its reference images with these settings."
          : "Every product is animated from its own photo with these settings.",
        controls: [
          {
            model: { variable: "videoModel" },
            op: "test",
            label: refs ? "Reference-to-video model" : "Image-to-video model",
            modelKind: "video_model",
            task: refs ? "reference_to_video" : "image_to_video"
          },
          {
            select: { variable: "aspectRatio" },
            label: "Aspect ratio",
            options: ["1:1", "3:4", "9:16", "16:9", "4:3", "21:9"]
          },
          {
            select: { variable: "resolution" },
            label: "Resolution",
            options: ["720p", "1080p", "1440p", "4K"]
          },
          { number: { variable: "duration" }, label: "Seconds per clip", min: 2, max: 15 },
          {
            note: "Not every model offers every frame, resolution and length. A model that does not support a setting uses its closest one."
          }
        ]
      },
      {
        title: "Test one product",
        intro: "Render one row with the exact settings the batch will use.",
        controls: [
          { number: { variable: "testRow" }, label: "Catalog row to test", min: 1 },
          { run: ["test"], label: "Render the test clip", disabledWhen: "test" }
        ],
        results: [
          { progress: "test", label: "Animating the product…", stepNodes: CATALOG_STEPS },
          { error: "test", label: "The test clip failed" },
          { show: "videos", op: "test", as: "Video", label: "Test clip", demo: VIDEO },
          { show: "summary", op: "test", as: "Markdown" }
        ]
      },
      {
        title: "Render the range",
        intro: "Animate a run of rows. Clips appear as they finish and are saved to your assets.",
        controls: [
          { number: { variable: "firstRow" }, label: "First row", min: 1 },
          { number: { variable: "lastRow" }, label: "Last row (0 renders to the end)", min: 0 },
          {
            note: "💸 Each row is one clip. The summary shows how many clips and seconds the range adds up to."
          },
          { run: ["batch"], label: "Render the range", disabledWhen: "batch" }
        ],
        results: [
          { progress: "batch", label: "Animating the catalog…", stepNodes: CATALOG_STEPS },
          { error: "batch", label: "The batch stopped" },
          { show: "summary", op: "batch", as: "Markdown" },
          { show: "videos", op: "batch", as: "Video", label: "Product clips", demo: VIDEO },
          {
            note: "Every clip is saved as an asset with the prompt and settings that made it, so you can find it later or make a variant."
          }
        ]
      }
    ]
  };
}

export const CATALOG_MOTION_APP = catalogMotionApp({ mode: "start_frame" });
export const CATALOG_MOTION_REFERENCES_APP = catalogMotionApp({ mode: "references" });
