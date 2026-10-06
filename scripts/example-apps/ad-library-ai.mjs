// AI help for the ad library Recipe apps: read one website and offer three
// complete ways to fill the ad. Picking one fills the copy, the brand color and
// the image fields with real images from the site, saved as assets. Suggesting
// is a bundled workflow job and applying is a script operation. Both write the
// same variables the input widgets edit, so the user reviews every value before
// planning, and planning still preserves exactly what the fields hold.

import { AD_STEPS } from "./ad-library-steps.mjs";

export const SUGGEST_CODE = `import { run_agent } from "@nodetool-ai/sandbox-nodetool/agents";
import { browser } from "@nodetool-ai/sandbox-nodetool/web";
const brief = inputs.brief;
const model = inputs.model;
if (!model?.provider?.trim() || !model?.id?.trim()) throw new Error("Select the finishing model on the Start step first. The agent uses it too.");
const text = (value) => typeof value === "string" ? value.trim() : "";
// A bare domain such as "shop.example" gets https:// in front.
const typed = text(inputs.sourceUrl);
const url = !typed || /^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : "https://" + typed.replace(/^\\/+/, "");
if (!/^https?:\\/\\/[^\\s/]+\\.[^\\s]/.test(url)) throw new Error("Paste a website URL, such as your-product.com.");
progress(10, "Reading the website");
const page = String(await browser({url}));
if (page.startsWith("Error:")) throw new Error("Could not read the website. " + page.slice(6).trim());
// The readable text drops images, so collect them from the page's HTML.
const candidates = [];
try {
  const html = await (await fetch(url)).text();
  const absolute = (src) => { try { return new URL(src.trim(), url).href; } catch { return ""; } };
  const attr = (tag, name) => (tag.match(new RegExp("\\\\b" + name + "\\\\s*=\\\\s*[\\"']([^\\"']+)[\\"']", "i")) || [])[1] || "";
  const add = (src, note) => { const href = absolute(src); if (href.startsWith("http") && !candidates.some(item => item.url === href)) candidates.push({url: href, note}); };
  for (const tag of html.match(/<meta\\b[^>]*>/gi) || []) {
    if (/(og:image|twitter:image)/i.test(attr(tag, "property") + attr(tag, "name"))) add(attr(tag, "content"), "social preview image");
  }
  for (const tag of html.match(/<link\\b[^>]*>/gi) || []) {
    if (/icon|logo/i.test(attr(tag, "rel"))) add(attr(tag, "href"), "site icon (" + attr(tag, "rel") + ")");
  }
  // A srcset lists sizes, so take its widest entry over the src fallback.
  const widest = (srcset) => srcset.split(",").map(entry => entry.trim().split(/\\s+/)).filter(([src]) => src).sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0))[0]?.[0] || "";
  for (const tag of html.match(/<img\\b[^>]*>/gi) || []) {
    const src = widest(attr(tag, "srcset") || attr(tag, "data-srcset")) || attr(tag, "data-src") || attr(tag, "src");
    const size = attr(tag, "width") && attr(tag, "height") ? ", declared " + attr(tag, "width") + "x" + attr(tag, "height") : "";
    if (src && !src.startsWith("data:")) add(src, "img alt=" + JSON.stringify(attr(tag, "alt")) + (/logo/i.test(tag) ? " logo" : "") + size);
  }
} catch (error) {
  console.log("Could not collect images from the page: " + error);
}
const fieldProperties = Object.fromEntries(brief.fields.map(field => [field.id, {type: "string", description: field.label + ": " + field.purpose + ". At most " + field.maxWords + " words."}]));
const imageProperties = Object.fromEntries(brief.images.map(image => [image.id, {type: "string", description: "Direct URL of an existing image for " + image.label + ". " + image.guidance + " Use an empty string when no image fits."}]));
const option = {type: "object", properties: {
  title: {type: "string", description: "A name for this direction in 2 to 4 words."},
  angle: {type: "string", description: "One sentence on what this direction emphasizes."},
  brandColor: {type: "string", description: "The brand's main color as #RRGGBB, as the site shows it."},
  fields: {type: "object", properties: fieldProperties, required: Object.keys(fieldProperties)},
  images: {type: "object", properties: imageProperties, required: Object.keys(imageProperties)}
}, required: ["title", "angle", "brandColor", "fields", "images"]};
progress(30, "Writing three options");
const answer = await run_agent({
  label: "suggest",
  model: {provider: model.provider, id: model.id},
  tools: ["browser", "image_search"],
  system: "You are a performance-ad copywriter and art director. Use only facts the website or pages you read state. Never invent prices, discounts, dates, guarantees or claims. When a fact a field needs is missing, write a short placeholder in square brackets, such as [offer end date]. Make the three options clearly different in angle, wording and image choice. For images, choose real, large images of this brand and product: first from the page's image candidates, preferring a large declared size, then with image_search when the page has no fitting image. Give the direct URL of the image file, never a page URL, and never an image of another brand.",
  prompt: [
    "Write three different options to fill the ad concept " + JSON.stringify(brief.title) + " from this website.",
    "Objective: " + brief.objective,
    "Visual rule: " + brief.direction,
    "Beats, in order:",
    ...brief.beats.map(beat => "- " + beat),
    "",
    "Website " + url + ":",
    page.slice(0, 20000),
    ...(candidates.length ? ["", "Image candidates on the website:", ...candidates.slice(0, 60).map(item => "- " + item.url + " (" + item.note + ")")] : [])
  ].join("\\n"),
  output_schema: {type: "object", properties: {options: {type: "array", minItems: 3, maxItems: 3, items: option}}, required: ["options"]},
  max_turns: 40
});
// Copy is kept verbatim, so an HTML entity the model echoes from a page would show in the ad.
const decode = (value) => text(value).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const options = (Array.isArray(answer.result?.options) ? answer.result.options : []).slice(0, 3).map((raw, index) => {
  const fields = Object.fromEntries(brief.fields.map(field => [field.id, decode(raw?.fields?.[field.id])]));
  const images = Object.fromEntries(brief.images.map(image => [image.id, /^https?:\\/\\//.test(text(raw?.images?.[image.id])) ? text(raw.images[image.id]) : ""]));
  const color = text(raw?.brandColor);
  const preview = brief.images.map(image => images[image.id]).find(Boolean);
  return {
    value: String(index + 1),
    title: decode(raw?.title) || "Option " + (index + 1),
    description: [decode(raw?.angle), ...brief.fields.slice(0, 2).map(field => "“" + fields[field.id] + "”")].filter(Boolean).join(" "),
    ...(preview ? {image: preview} : {}),
    brandColor: /^#[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : "",
    fields,
    images
  };
});
if (!options.length) throw new Error("The agent returned no options. Try again, or try another page of the site.");
await output("fillOptions", options);
await output("fillChoice", "");
await output("fillReport", "");
progress(100, "Pick one option.");`;

export const APPLY_CODE = `import { save_asset } from "@nodetool-ai/sandbox-nodetool/assets";
const brief = inputs.brief;
const option = (Array.isArray(inputs.options) ? inputs.options : []).find(item => item.value === inputs.choice);
if (!option) throw new Error("Pick one of the suggested options.");
for (const field of brief.fields) {
  if (option.fields?.[field.id]) await output(field.id, option.fields[field.id]);
}
if (option.brandColor) await output("brandColor", option.brandColor);
const missing = [];
const tooSmall = [];
for (const wanted of brief.images) {
  const source = option.images?.[wanted.id] || "";
  if (!source) { missing.push(wanted.label); continue; }
  progress(20, "Saving " + wanted.label);
  try {
    const saved = await save_asset({name: wanted.label + " from " + source.split("/").pop().split("?")[0], source});
    if (!saved?.asset_id || !String(saved.content_type || "").startsWith("image/")) throw new Error("not an image");
    if (saved.content_type !== "image/svg+xml") {
      const {width, height} = await image.info(await media.bytes({type: "image", uri: "asset://" + saved.asset_id}));
      if (Math.min(width, height) < (wanted.role === "logo" ? 100 : 400)) {
        tooSmall.push(wanted.label + " (" + width + "x" + height + ")");
        continue;
      }
    }
    await output(wanted.id, {type: "image", uri: "asset://" + saved.asset_id, asset_id: saved.asset_id});
  } catch (error) {
    console.log("Could not save " + wanted.label + " from " + source + ": " + error);
    missing.push(wanted.label);
  }
}
const report = [
  ...(missing.length ? ["No usable image found for: " + missing.join(", ") + "."] : []),
  ...(tooSmall.length ? ["Only images too small for the ad were found for: " + tooSmall.join(", ") + "."] : [])
];
await output("fillReport", report.length ? report.join(" ") + " Upload these yourself." : "Filled from " + option.title + ". Check every field before you plan.");
await output("approval", "pending");`;

const GUIDANCE = {
  product: "A shot of the product alone, ideally on a plain or transparent background, so it reads as a cutout.",
  logo: "The brand's own logo file, such as the site header logo or its icon.",
  decorative: "A real photo or screenshot that matches the beats that show it."
};

const seconds = (ms) => Number((ms / 1000).toFixed(2));

/** What both scripts need to know about one concept, as a constant input. */
export const fillBrief = (manifest, concept) => {
  const labelOf = new Map(manifest.inputs.map(input => [input.id, input.label]));
  const images = manifest.inputs.filter(input => input.kind === "image");
  const copy = manifest.inputs.filter(input => input.kind === "text");
  const shownIn = (id) => manifest.creativeStrategy.shots.filter(shot => shot.elements.some(element => element.inputId === id)).map(shot => shot.title);
  return {
    title: concept.title, objective: concept.objective, direction: concept.visual_invariant,
    beats: concept.beats.map((beat, index) => `${seconds(beat.start_ms)}–${seconds(beat.end_ms)} s: ${beat.composition} Shows ${[...new Set(manifest.creativeStrategy.shots[index].elements.map(element => labelOf.get(element.inputId)))].join(", ")}.`),
    fields: concept.copy_slots.map((slot, index) => ({id: copy[index].id, label: copy[index].label, purpose: slot.purpose, maxWords: slot.suggested_max_words})),
    images: images.map(input => {
      const role = manifest.creativeStrategy.shots.flatMap(shot => shot.elements).find(element => element.inputId === input.id).role;
      return {id: input.id, label: input.label, role, guidance: `${GUIDANCE[role]} Shown in: ${shownIn(input.id).join(" | ")}`};
    })
  };
};

/**
 * Adds the "Fill from a website" panel: the URL, the suggest button with its
 * live agent activity, the option cards, and a report of the images it could
 * not use. It shows once the user picks "Fill from a website" (`var:fillPath`).
 * The step layout places the panel on the Start step.
 */
export const addAiAssist = (bundle, manifest, concept) => {
  const {app} = bundle;
  const brief = fillBrief(manifest, concept);
  const {exampleUrl} = AD_STEPS[concept.slug] ?? {};
  if (!exampleUrl) throw new Error(`No example website for ad library concept ${concept.slug}.`);
  const variable = (id, name, type, initial) => app.variables.push({id, name, type: {type}, scope: "instance", persist: false, default: initial});
  variable("fillPath", "How to start", "str", "");
  variable("sourceUrl", "Website URL", "str", "");
  variable("fillOptions", "Suggested options", "list[dict]", []);
  variable("fillChoice", "Picked option", "str", "");
  variable("fillReport", "Fill report", "str", "");

  const copy = [...brief.fields.map(field => field.id), "brandColor"];
  const images = brief.images.map(image => image.id);
  // Suggesting runs as a workflow job, so the agent is not bound by the
  // 120-second limit of a script operation. The Code node's 30-minute limit
  // only stops a runaway agent. Its timeout 0 does not mean "no limit": the
  // sandbox then applies its 30-second default.
  const model = {type: "language_model", provider: "", id: "", name: ""};
  const node = (id, type, data, x, extra = {}) => ({id, type, data, ui_properties: {position: {x, y: 0}}, dynamic_properties: {}, dynamic_outputs: {}, ...extra});
  const suggestOutputs = ["fillOptions", "fillChoice", "fillReport"];
  bundle.workflows.push({key: "suggest", name: `Suggest ${concept.title} ad options`, description: "Read one website and write three ways to fill the ad, with image picks.", version: null, graphHash: null, graph: {
    nodes: [
      node("in-sourceUrl", "nodetool.input.StringInput", {name: "sourceUrl", value: "", description: "The product or brand page to read."}, 0),
      node("in-model", "nodetool.input.LanguageModelInput", {name: "model", value: model, description: "The model the agent runs on."}, 0),
      node("suggest", "nodetool.code.Code", {code: SUGGEST_CODE, timeout: 1800}, 360, {
        dynamic_properties: {brief, sourceUrl: "", model},
        dynamic_inputs: {brief: {type: {type: "dict"}}, sourceUrl: {type: {type: "str"}}, model: {type: {type: "language_model"}}},
        dynamic_outputs: {fillOptions: {type: "list", type_args: [], optional: false}, fillChoice: {type: "str", type_args: [], optional: false}, fillReport: {type: "str", type_args: [], optional: false}},
        sync_mode: "on_all"
      }),
      ...suggestOutputs.map(name => node(`out-${name}`, "nodetool.output.Output", {name}, 820))
    ],
    edges: [
      {id: "url-to-suggest", source: "in-sourceUrl", sourceHandle: "output", target: "suggest", targetHandle: "sourceUrl"},
      {id: "model-to-suggest", source: "in-model", sourceHandle: "output", target: "suggest", targetHandle: "model"},
      ...suggestOutputs.map(name => ({id: `suggest-to-${name}`, source: "suggest", sourceHandle: name, target: `out-${name}`, targetHandle: "value"}))
    ]
  }});
  bundle.scripts.push({key: "apply_ad_option-v1", name: "Fill the ad from the picked option", version: 1, document: {schemaVersion: 1, code: APPLY_CODE,
    inputs: [{name: "brief", type: "dict"}, {name: "options", type: "list[dict]"}, {name: "choice", type: "str"}],
    outputs: [...copy.map(name => ({name, type: "str"})), ...images.map(name => ({name, type: "image"})), {name: "fillReport", type: "str"}, {name: "approval", type: "str"}],
    packages: [], secrets: [], timeoutSeconds: 120, tests: []}});
  const toVariables = (names, prefix = "") => Object.fromEntries(names.map(name => [prefix + name, {to: "variable", variableId: name}]));
  app.operations.push(
    {id: "suggest", name: "Suggest options from a website", workflowId: "suggest", policy: "replace",
      inputs: {"in-sourceUrl": {from: "variable", variableId: "sourceUrl"}, "in-model": {from: "variable", variableId: "finishModel"}},
      outputs: toVariables(suggestOutputs, "out-")},
    {id: "apply", name: "Fill the ad from the picked option", workflowId: "", policy: "replace", target: {kind: "script", scriptId: "apply_ad_option-v1", scriptVersion: 1},
      inputs: {brief: {from: "constant", value: brief}, options: {from: "variable", variableId: "fillOptions"}, choice: {from: "variable", variableId: "fillChoice"}},
      outputs: toVariables([...copy, ...images, "fillReport", "approval"])}
  );

  const panel = {type: "Container", props: {id: "ai-fill", variant: "plain", visibleWhen: {binding: "var:fillPath", op: "eq", value: "web"}, content: [
    {type: "Columns", props: {id: "source-row", layout: "main-aside", gap: 16,
      left: [{type: "TextInput", props: {id: "sourceUrl", binding: "var:sourceUrl", label: "Website", placeholder: "https://your-product.com", hint: "The agent reads the page with the finishing model and suggests three filled versions, with real images from the site. Pick one, then check each step.", events: []}}],
      right: [
        {type: "Text", props: {id: "source-example-label", text: "No site at hand? Try this one.", tone: "hint"}},
        {type: "Button", props: {id: "source-example", label: exampleUrl.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, ""), variant: "outlined", fullWidth: false, events: [{trigger: "click", kind: "setVariable", key: "var:sourceUrl", value: exampleUrl}]}}
      ]}},
    {type: "Button", props: {id: "suggest", label: "Suggest options", variant: "contained", fullWidth: false, disabledWhen: {binding: "op:suggest/exec#running", op: "notEmpty"}, events: [{trigger: "click", kind: "run", operationId: "suggest"}]}},
    {type: "Alert", props: {id: "suggest-error", binding: "op:suggest/exec#error", title: "Could not suggest options", text: "", severity: "error", visibleWhen: {binding: "op:suggest/exec#error", op: "notEmpty"}}},
    {type: "AgentActivity", props: {id: "suggest-activity", binding: "op:suggest/exec#transcript", label: "Agent", height: 280, placeholder: "The agent's reading and image searches appear here."}},
    {type: "ChoiceCards", props: {id: "fillChoice", binding: "var:fillChoice", optionsBinding: "var:fillOptions", label: "Pick one option", columns: 3, visibleWhen: {binding: "var:fillOptions", op: "notEmpty"}, events: [{trigger: "change", kind: "run", operationId: "apply"}]}},
    {type: "Alert", props: {id: "apply-error", binding: "op:apply/exec#error", title: "Could not fill the ad", text: "", severity: "error", visibleWhen: {binding: "op:apply/exec#error", op: "notEmpty"}}},
    {type: "Text", props: {id: "fill-report", binding: "var:fillReport", text: "", visibleWhen: {binding: "var:fillReport", op: "notEmpty"}}}
  ]}};
  app.ui.content.push(panel);
  return bundle;
};
