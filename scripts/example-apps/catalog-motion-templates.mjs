// Writes the two templates behind the Catalog Motion app.
//
//   node scripts/example-apps/catalog-motion-templates.mjs
//
// "Read a Product Catalog" parses the CSV and fills the prompt template for
// every row, so the app can show the catalog before anything is rendered.
// "Animate a Product Catalog" runs the same reader over a row range, then
// animates each product's own image with Image To Video. Both share one
// reader body, so a fix to the CSV parsing lands in both. Run
// `node scripts/build-example-apps.mjs` afterwards.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CATALOG_NEGATIVE_PROMPT,
  CATALOG_PROMPT_TEMPLATE,
  CATALOG_REFERENCE_PROMPT_TEMPLATE,
  CATALOG_SAMPLE
} from "./catalog-motion.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const EXAMPLES = join(ROOT, "packages/base-nodes/nodetool/examples/nodetool-base");
const STAMP = "2026-11-06T12:00:00.000Z";

// The reader. `inputs.first_row` and `inputs.last_row` are 1-based data rows;
// a last row of 0 means the end of the catalog. Rows are counted after blank
// lines are dropped, the same way the preview table numbers them.
const READER_CODE = String.raw`
const PREVIEW_ROWS = 500;
const catalog = inputs.catalog;
const hasCatalog = catalog && (catalog.uri || catalog.asset_id || catalog.data);
if (!hasCatalog) throw new Error("Upload your product catalog as a CSV file.");
const text = String(await media.text(catalog)).replace(/^﻿/, "");
if (!text.trim()) throw new Error("The catalog file is empty.");

// Comma, semicolon or tab: whichever the header row uses most.
const headerLine = text.split(/\r?\n/, 1)[0];
const countOf = (ch) => headerLine.split(ch).length - 1;
const delimiter = [";", "\t"].reduce((best, ch) => (countOf(ch) > countOf(best) ? ch : best), ",");

// RFC 4180: quoted fields may hold the delimiter, line breaks and "" quotes.
const records = [];
let record = [];
let field = "";
let quoted = false;
for (let i = 0; i < text.length; i++) {
  const ch = text[i];
  if (quoted) {
    if (ch === '"') {
      if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else field += ch;
  } else if (ch === '"' && field === "") quoted = true;
  else if (ch === delimiter) {
    record.push(field);
    field = "";
  } else if (ch === "\n" || ch === "\r") {
    if (ch === "\r" && text[i + 1] === "\n") i++;
    record.push(field);
    records.push(record);
    record = [];
    field = "";
  } else field += ch;
}
if (field !== "" || record.length > 0) {
  record.push(field);
  records.push(record);
}
const lines = records.filter((r) => r.some((cell) => cell.trim() !== ""));
if (lines.length < 2) throw new Error("The catalog needs a header row and at least one product row.");

const headers = lines[0].map((h) => h.trim());
const keyOf = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const byKey = new Map(headers.map((h) => [keyOf(h), h]));
const columnList = headers.map((h) => '"' + h + '"').join(", ");
const products = lines.slice(1).map((cells) => {
  const product = {};
  headers.forEach((h, i) => (product[h] = String(cells[i] ?? "").trim()));
  return product;
});

// A blank column field means "find it": the first header that looks right.
const findColumn = (asked, patterns) => {
  const wanted = String(asked ?? "").trim();
  if (wanted) {
    const hit = byKey.get(keyOf(wanted));
    if (!hit) throw new Error('The catalog has no "' + wanted + '" column. Its columns are ' + columnList + ".");
    return hit;
  }
  for (const pattern of patterns) {
    const hit = headers.find((h) => pattern.test(keyOf(h)));
    if (hit) return hit;
  }
  return null;
};
const imageColumn = findColumn(inputs.image_column, [
  /^(image|image_src|image_url|image_link|img|photo|packshot)$/,
  /image|img|photo|picture|packshot/
]);
if (!imageColumn) {
  throw new Error("No column looks like an image link. Name the column that holds each product's image URL. The columns are " + columnList + ".");
}
const nameColumn = findColumn(inputs.name_column, [/^(title|name|product|product_name)$/, /title|name/]) ?? headers[0];

const template = String(inputs.prompt_template ?? "").trim();
if (!template) throw new Error("Write the prompt template. Use {{column}} to insert a product's value.");
const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;
// With reference_roles on, the image role placeholders stay in the prompt for
// the animate graph to number.
const ROLES = inputs.reference_roles ? ["product_image", "background_image", "decoration_image"] : [];
const isRole = (name) => ROLES.includes(keyOf(name));
const missing = [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]).filter((name) => !byKey.has(keyOf(name)) && !isRole(name)))];
// Reading still succeeds, so the new catalog shows. Rendering refuses below.
const missingText = missing.length > 0
  ? "The template uses " + missing.map((name) => "{{" + name + "}}").join(", ") +
    ", which the catalog has no column for. The columns are " + columnList + "."
  : "";
const fill = (product) =>
  template.replace(PLACEHOLDER, (_, name) => (isRole(name) ? "{{" + keyOf(name) + "}}" : product[byKey.get(keyOf(name))] ?? "")).replace(/\s+/g, " ").trim();

// A Shopify export writes "//cdn.shopify.com/…"; a bare file name is not a link.
const imageOf = (product) => {
  let value = String(product[imageColumn] ?? "").trim();
  if (value.startsWith("//")) value = "https:" + value;
  if (/^(https?|package|asset|data):/i.test(value) || value.startsWith("/api/storage/")) {
    return { type: "image", uri: value };
  }
  return null;
};

const total = products.length;
const first = Math.max(1, Math.floor(Number(inputs.first_row) || 1));
const askedLast = Math.floor(Number(inputs.last_row) || 0);
const last = askedLast <= 0 ? total : Math.min(total, askedLast);
if (first > total) throw new Error("Row " + first + " is past the end. The catalog has " + total + " products.");
if (last < first) throw new Error("The last row (" + last + ") comes before the first row (" + first + ").");

const items = [];
const skipped = [];
for (let row = first; row <= last; row++) {
  const product = products[row - 1];
  const image = imageOf(product);
  if (!image) {
    skipped.push(row);
    continue;
  }
  items.push({ row, product: product[nameColumn] || "Row " + row, image, prompt: fill(product) });
}

const seconds = Math.max(0, Number(inputs.duration) || 0);
const placeholders = headers.map((h) => "{{" + keyOf(h) + "}}").join(" ");
const summary = [
  missingText ? "⚠️ " + missingText + " Those placeholders stay blank until you change the template." : "",
  "**" + total + (total === 1 ? " product" : " products") + "** in the catalog. Images come from **" + imageColumn + "**, names from **" + nameColumn + "**.",
  "Placeholders for the prompt: " + placeholders,
  first === 1 && last === total
    ? "All " + total + (total === 1 ? " row: " : " rows: ") + items.length + (items.length === 1 ? " clip" : " clips") + (seconds ? ", " + items.length * seconds + " seconds of video." : ".")
    : "Rows " + first + " to " + last + ": " + items.length + (items.length === 1 ? " clip" : " clips") + (seconds ? ", " + items.length * seconds + " seconds of video." : "."),
  skipped.length > 0
    ? "Skipped for a missing or unusable image link: " + (skipped.length === 1 ? "row " : "rows ") + skipped.join(", ") + "."
    : ""
].filter(Boolean).join("\n\n");

const table = products.slice(0, PREVIEW_ROWS).map((product, i) => ({
  Row: i + 1,
  Product: product[nameColumn],
  Prompt: fill(product),
  // The file name, not the whole link: the table has a narrow column for it.
  Image: imageOf(product) ? String(product[imageColumn]).split(/[?#]/)[0].split("/").pop() : "missing"
}));

await output("summary", summary);
await output("products", table);
await output("fields", [...new Set([...headers.map(keyOf).filter(Boolean), ...ROLES])]);
`.trim();

// The animate template also hands the rows on. A range with nothing to
// animate fails here, before For Each would fire its body with no item.
const ROWS_TAIL = String.raw`
if (missingText) throw new Error(missingText);
if (items.length === 0) throw new Error("None of rows " + first + " to " + last + " has an image link to animate.");
await output("rows", items);
`.trim();

const UNPACK_CODE = String.raw`
const item = inputs.item ?? {};
if (!item.image) throw new Error("This catalog row has no image to animate.");
await output("image", item.image);
await output("prompt", String(item.prompt ?? ""));
`.trim();

// The references variant: the product photo, then the background and the
// decoration when set. Each role placeholder becomes "image N" by its final
// place in the list. An unset role's placeholder is removed.
const REFERENCES_UNPACK_CODE = String.raw`
const item = inputs.item ?? {};
if (!item.image) throw new Error("This catalog row has no image to animate.");
const isSet = (image) => Boolean(image && (image.uri || image.asset_id || image.data));
const references = [];
const numbers = {};
for (const [role, image] of [
  ["product_image", item.image],
  ["background_image", inputs.background_image],
  ["decoration_image", inputs.decoration_image]
]) {
  if (!isSet(image)) continue;
  references.push(image);
  numbers[role] = references.length;
}
const prompt = String(item.prompt ?? "")
  .replace(/\{\{\s*(product_image|background_image|decoration_image)\s*\}\}/g, (_, role) => (numbers[role] ? "image " + numbers[role] : ""))
  .replace(/[ \t]+/g, " ")
  .replace(/ +([,.;:!?])/g, "$1")
  .trim();
await output("images", references);
await output("prompt", prompt);
`.trim();

const comment = (id, text, y = 0) => ({
  id,
  type: "nodetool.workflows.base_node.Comment",
  data: { comment: text },
  ui_properties: { position: { x: 0, y }, zIndex: 0, width: 640, selectable: true, height: 300 },
  dynamic_properties: {},
  dynamic_outputs: {}
});

const node = (id, type, data, x, y, title, extra = {}) => ({
  id,
  type,
  data,
  ui_properties: { position: { x, y }, zIndex: 0, width: 300, selectable: true, title },
  dynamic_properties: extra.dynamic_properties ?? {},
  dynamic_outputs: extra.dynamic_outputs ?? {}
});

const edge = (id, source, target, targetHandle, sourceHandle = "output") => ({
  id,
  source,
  sourceHandle,
  target,
  targetHandle
});

const readerInputs = [
  node(
    "catalog",
    "nodetool.input.DocumentInput",
    {
      name: "catalog",
      value: { type: "document", uri: CATALOG_SAMPLE, asset_id: null, data: null, metadata: null },
      description: "The product catalog as a CSV file, one product per row with a header row"
    },
    0,
    360,
    "1  Catalog CSV"
  ),
  node(
    "prompt_template",
    "nodetool.input.StringInput",
    {
      name: "prompt_template",
      value: CATALOG_PROMPT_TEMPLATE,
      description: "The video prompt. {{column}} inserts that product's value",
      line_mode: "multi_line"
    },
    0,
    560,
    "2  Prompt template"
  ),
  node(
    "image_column",
    "nodetool.input.StringInput",
    { name: "image_column", value: "", description: "The column with each product's image URL. Blank finds it" },
    0,
    760,
    "3  Image column"
  ),
  node(
    "name_column",
    "nodetool.input.StringInput",
    { name: "name_column", value: "", description: "The column with each product's name. Blank finds it" },
    0,
    900,
    "4  Name column"
  )
];

const readerNode = (emitRows, x, y, referenceRoles = false) =>
  node(
    "read",
    "nodetool.code.Code",
    {
      code: emitRows ? `${READER_CODE}\n${ROWS_TAIL}` : READER_CODE,
      timeout: 60,
      max_response_mb: 4,
      allow_local_network: false,
      allow_host_filesystem: false,
      secrets: [],
      script: {}
    },
    x,
    y,
    emitRows ? "7  Read the rows to animate" : "5  Read the catalog",
    {
      dynamic_properties: {
        catalog: null,
        prompt_template: "",
        image_column: "",
        name_column: "",
        first_row: 1,
        last_row: 0,
        duration: 0,
        ...(referenceRoles ? { reference_roles: true } : {})
      },
      dynamic_outputs: {
        summary: { type: "str", type_args: [], optional: false },
        products: { type: "list", type_args: [{ type: "any", type_args: [], optional: false }], optional: false },
        fields: { type: "list", type_args: [{ type: "str", type_args: [], optional: false }], optional: false },
        ...(emitRows
          ? { rows: { type: "list", type_args: [{ type: "any", type_args: [], optional: false }], optional: false } }
          : {})
      }
    }
  );

const readerEdges = [
  edge("e-catalog", "catalog", "read", "catalog"),
  edge("e-template", "prompt_template", "read", "prompt_template"),
  edge("e-image-column", "image_column", "read", "image_column"),
  edge("e-name-column", "name_column", "read", "name_column")
];

const output = (id, name, description, x, y, title) =>
  node(id, "nodetool.output.Output", { name, description }, x, y, title);

const workflow = (name, description, tags, nodes, edges) => ({
  id: "",
  access: "private",
  created_at: STAMP,
  updated_at: STAMP,
  name,
  tool_name: null,
  description,
  tags,
  thumbnail: `${name}.jpg`,
  thumbnail_url: null,
  graph: { nodes, edges },
  input_schema: null,
  output_schema: null,
  settings: null,
  package_name: "nodetool-base",
  path: null,
  run_mode: null
});

const read = workflow(
  "Read a Product Catalog",
  "Check a product catalog before you render it. Reads a CSV, finds the image and name columns, and fills the video prompt template for every row, so a wrong column or a missing image shows before any video is paid for.",
  ["data", "example"],
  [
    comment(
      "intro-comment",
      "# Read a Product Catalog\n\nReads a product catalog CSV and shows what each row would be animated with.\n\n**How it works:** \"Catalog CSV\" takes the file. \"Read the catalog\" detects the delimiter, finds the image and name columns when the fields are blank, and fills \"Prompt template\" for every row. Write `{{title}}` or `{{color}}` to insert that column's value. \"Products\" is the table and \"Summary\" names the columns you can use.\n\n**Try this:** Upload a Shopify product export and leave both column fields blank. It finds `Image Src` and `Title`.",
      0
    ),
    ...readerInputs,
    node(
      "reference_roles",
      "nodetool.input.BooleanInput",
      { name: "reference_roles", value: false, description: "Keep {{product_image}}, {{background_image}} and {{decoration_image}} in the prompt and offer them as fields" },
      0,
      1040,
      "5  Reference roles"
    ),
    readerNode(false, 400, 560),
    output("products", "products", "Every row with its filled prompt and image link", 800, 520, "6  Products"),
    output("summary", "summary", "Columns, placeholders and rows that will be skipped", 800, 700, "7  Summary"),
    output("fields", "fields", "Catalog column names available as prompt placeholders", 800, 880, "8  Prompt fields")
  ],
  [
    ...readerEdges,
    edge("e-reference-roles", "reference_roles", "read", "reference_roles"),
    edge("e-products", "read", "products", "value", "products"),
    edge("e-summary", "read", "summary", "value", "summary"),
    edge("e-fields", "read", "fields", "value", "fields")
  ]
);

const animate = workflow(
  "Animate a Product Catalog",
  "Turn a product catalog into product videos. Each row's own photo is animated with image-to-video, and the prompt is filled from that row's columns, so a whole range of products shares one camera move and light while every clip stays true to its product.",
  ["video", "example"],
  [
    comment(
      "intro-comment",
      "# Animate a Product Catalog\n\nAnimates a range of rows from a product catalog CSV. Every product keeps its own photo as the first frame, and its prompt is filled from its own columns.\n\n**How it works:** \"Read the rows to animate\" parses the CSV and fills \"Prompt template\" for rows \"First row\" to \"Last row\" (0 means the last product). \"For each product\" hands each row to \"Animate\", which runs the chosen video model with one aspect ratio, resolution and length for the whole batch. Every clip is saved as an asset with its prompt, and \"Videos\" streams them in as they finish.\n\n**Try this:** Set the first and last row to the same number to test one product before you render the range.",
      0
    ),
    ...readerInputs,
    node("first_row", "nodetool.input.IntegerInput", { name: "first_row", value: 1, min: 1, max: 100000, description: "The first catalog row to animate, counting from 1" }, 0, 1040, "5  First row"),
    node("last_row", "nodetool.input.IntegerInput", { name: "last_row", value: 0, min: 0, max: 100000, description: "The last catalog row to animate. 0 means the end of the catalog" }, 0, 1180, "6  Last row"),
    node(
      "video_model",
      "nodetool.input.VideoModelInput",
      {
        name: "video_model",
        value: { type: "video_model", provider: "", id: "", name: "", path: null, supported_tasks: [] },
        description: "The image-to-video model every product is animated with"
      },
      400,
      1040,
      "8  Video model"
    ),
    node("aspect_ratio", "nodetool.input.SelectInput", { name: "aspect_ratio", value: "1:1", options: ["1:1", "3:4", "9:16", "16:9", "4:3", "21:9"], enum_type_name: "", description: "The frame every clip is rendered in" }, 400, 1200, "9  Aspect ratio"),
    node("resolution", "nodetool.input.SelectInput", { name: "resolution", value: "720p", options: ["720p", "1080p", "1440p", "4K"], enum_type_name: "", description: "The resolution every clip is rendered at" }, 400, 1360, "10  Resolution"),
    node("duration", "nodetool.input.IntegerInput", { name: "duration", value: 5, min: 2, max: 15, description: "Seconds per clip" }, 400, 1520, "11  Seconds per clip"),
    node("negative_prompt", "nodetool.input.StringInput", { name: "negative_prompt", value: CATALOG_NEGATIVE_PROMPT, description: "What every clip should avoid" }, 400, 1660, "12  Avoid"),
    readerNode(true, 400, 560),
    node("each", "nodetool.control.ForEach", { input_list: [] }, 800, 560, "13  For each product"),
    node(
      "unpack",
      "nodetool.code.Code",
      { code: UNPACK_CODE, timeout: 10, max_response_mb: 1, allow_local_network: false, allow_host_filesystem: false, secrets: [], script: {} },
      1100,
      560,
      "14  Image and prompt",
      {
        dynamic_properties: { item: null },
        dynamic_outputs: {
          image: { type: "image", type_args: [], optional: false },
          prompt: { type: "str", type_args: [], optional: false }
        }
      }
    ),
    node(
      "animate",
      "nodetool.video.ImageToVideo",
      {
        image: [],
        model: { type: "video_model", provider: "", id: "", name: "", path: null, supported_tasks: [] },
        prompt: "",
        negative_prompt: "",
        entities: [],
        aspect_ratio: "1:1",
        resolution: "720p",
        duration: 5,
        timeout_seconds: 0
      },
      1450,
      560,
      "15  Animate"
    ),
    output("videos", "videos", "One clip per product, saved as an asset", 1850, 560, "16  Videos"),
    output("summary", "summary", "How many clips the range produces and which rows were skipped", 800, 900, "17  Summary")
  ],
  [
    ...readerEdges,
    edge("e-first", "first_row", "read", "first_row"),
    edge("e-last", "last_row", "read", "last_row"),
    edge("e-duration-read", "duration", "read", "duration"),
    edge("e-rows", "read", "each", "input_list", "rows"),
    edge("e-item", "each", "unpack", "item"),
    edge("e-image", "unpack", "animate", "image", "image"),
    edge("e-prompt", "unpack", "animate", "prompt", "prompt"),
    edge("e-model", "video_model", "animate", "model"),
    edge("e-aspect", "aspect_ratio", "animate", "aspect_ratio"),
    edge("e-resolution", "resolution", "animate", "resolution"),
    edge("e-duration", "duration", "animate", "duration"),
    edge("e-negative", "negative_prompt", "animate", "negative_prompt"),
    edge("e-videos", "animate", "videos", "value"),
    edge("e-summary", "read", "summary", "value", "summary")
  ]
);

const animateNodes = animate.graph.nodes;
const references = workflow(
  "Animate a Product Catalog with References",
  "Turn a product catalog into product videos made from reference images. Each row's own photo is image 1, and an optional background and decoration image follow it for the whole range. The prompt is filled from that row's columns, and its role placeholders become image 1, image 2 and image 3.",
  ["video", "example"],
  [
    comment(
      "intro-comment",
      "# Animate a Product Catalog with References\n\nAnimates a range of rows from a product catalog CSV with Reference To Video. Every product's own photo is image 1. \"Background image\" and \"Decoration image\" are optional and follow it in that order.\n\n**How it works:** \"Read the rows to animate\" fills \"Prompt template\" for each row and keeps `{{product_image}}`, `{{background_image}}` and `{{decoration_image}}`. \"References and prompt\" builds the image list and turns each placeholder into `image N` by its place in the list. A placeholder for an image you leave out is removed. \"Animate\" runs the chosen reference-to-video model, and \"Videos\" streams the clips in as they finish.\n\n**Try this:** Leave out the background. The decoration becomes image 2.",
      0
    ),
    ...animateNodes.filter((n) => !["intro-comment", "read", "unpack", "animate", "videos", "summary"].includes(n.id)).map((n) =>
      n.id === "prompt_template" ? { ...n, data: { ...n.data, value: CATALOG_REFERENCE_PROMPT_TEMPLATE } }
      : n.id === "video_model" ? { ...n, data: { ...n.data, description: "The reference-to-video model every product is animated with" } }
      : n
    ),
    node("background_image", "nodetool.input.ImageInput", { name: "background_image", value: { type: "image", uri: "", asset_id: null, data: null, metadata: null }, description: "Optional. The scene or backdrop every clip uses" }, 0, 1320, "18  Background image"),
    node("decoration_image", "nodetool.input.ImageInput", { name: "decoration_image", value: { type: "image", uri: "", asset_id: null, data: null, metadata: null }, description: "Optional. Props or decoration every clip uses" }, 0, 1500, "19  Decoration image"),
    readerNode(true, 400, 560, true),
    node(
      "unpack",
      "nodetool.code.Code",
      { code: REFERENCES_UNPACK_CODE, timeout: 10, max_response_mb: 1, allow_local_network: false, allow_host_filesystem: false, secrets: [], script: {} },
      1100,
      560,
      "14  References and prompt",
      {
        dynamic_properties: { item: null, background_image: null, decoration_image: null },
        dynamic_outputs: {
          images: { type: "list", type_args: [{ type: "image", type_args: [], optional: false }], optional: false },
          prompt: { type: "str", type_args: [], optional: false }
        }
      }
    ),
    node(
      "animate",
      "nodetool.video.ReferenceToVideo",
      {
        reference_images: [],
        reference_videos: [],
        model: { type: "video_model", provider: "", id: "", name: "", path: null, supported_tasks: [] },
        prompt: "",
        use_reference_video_audio: false,
        negative_prompt: "",
        entities: [],
        aspect_ratio: "1:1",
        resolution: "720p",
        duration: 5,
        timeout_seconds: 0
      },
      1450,
      560,
      "15  Animate"
    ),
    output("videos", "videos", "One clip per product, saved as an asset", 1850, 560, "16  Videos"),
    output("summary", "summary", "How many clips the range produces and which rows were skipped", 800, 900, "17  Summary")
  ],
  [
    ...animate.graph.edges.filter((e) => e.id !== "e-image"),
    edge("e-images", "unpack", "animate", "reference_images", "images"),
    edge("e-background", "background_image", "unpack", "background_image"),
    edge("e-decoration", "decoration_image", "unpack", "decoration_image")
  ]
);

for (const template of [read, animate, references]) {
  const file = join(EXAMPLES, `${template.name}.json`);
  writeFileSync(file, `${JSON.stringify(template, null, 2)}\n`);
  console.log(file);
}
