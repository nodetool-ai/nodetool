// The marketing site's ad library concepts as Recipe mini apps.
//
// Beats, timing, copy slots and composition notes come from
// marketing/src/data/adLibrary.json, so an app and its /ad-library page stay in
// step. Each concept below adds only what the JSON does not say: the images a
// user supplies and the beats that show them. Every beat also shows the brand
// color as a background, and the last beat adds the logo. Concepts that call
// for footage take stills: the shared operations build still motion graphics.
import { readFileSync } from "node:fs";

import { addAiAssist } from "./ad-library-ai.mjs";
import { AD_STEPS } from "./ad-library-steps.mjs";
import { buildRecipeAppBundle, RECIPE_APP_DEBUG_INTERACTIONS } from "./recipe-app.mjs";

const CONCEPTS = JSON.parse(readFileSync(new URL("../../marketing/src/data/adLibrary.json", import.meta.url), "utf8"));

const product = (id, label) => ({id, label, role: "product"});
const visual = (id, label) => ({id, label, role: "decorative"});
const numbered = (make, prefix, label, count) => Array.from({length: count}, (_, i) => make(`${prefix}${i + 1}`, `${label} ${i + 1}`));

/** Images per concept, and the image inputs each beat (by beat role) shows. */
const IMAGES = {
  "kinetic-offer-wall": {
    images: numbered(product, "product", "Product cutout", 3),
    beats: {hook: ["product1"], range: ["product1", "product2", "product3"], benefit: ["product1"], proof_of_offer: ["product1", "product2", "product3"], cta: ["product1"]}
  },
  "product-cutout-shuffle": {
    images: numbered(product, "product", "Product cutout", 3),
    beats: {hook: ["product1"], variant_1: ["product1"], variant_2: ["product2", "product3"], range: ["product1", "product2", "product3"], cta: ["product1", "product2", "product3"]}
  },
  "one-hub-three-product-benefits": {
    images: [product("hub", "Hub icon"), ...numbered(visual, "featureCard", "Feature card", 3)],
    beats: {hook: ["hub"], feature_1: ["hub", "featureCard1"], feature_2: ["hub", "featureCard2"], feature_3: ["hub", "featureCard3"], outcome_and_cta: ["hub", "featureCard1", "featureCard2", "featureCard3"]}
  },
  "benefit-led-dashboard-punch-in": {
    images: [visual("uiCrop", "Product UI crop"), visual("resultState", "Result state")],
    beats: {hook: ["uiCrop"], action: ["uiCrop"], result: ["resultState"], context: ["uiCrop"], cta: ["resultState"]}
  },
  "fast-footage-plus-kinetic-captions": {
    images: [visual("heroShot", "Hero shot"), ...numbered(visual, "benefitShot", "Benefit shot", 3)],
    beats: {hook: ["heroShot"], benefit_1: ["benefitShot1"], benefit_2: ["benefitShot2"], benefit_3: ["benefitShot3"], cta: ["heroShot"]}
  },
  "editorial-image-panels": {
    images: numbered(visual, "panel", "Panel image", 3),
    beats: {hook: ["panel1"], panel_2: ["panel1", "panel2"], panel_3: ["panel1", "panel2", "panel3"], hero: ["panel1"], cta: ["panel1"]}
  },
  "binary-choice-participation-card": {
    images: [visual("contextImage", "Context image"), visual("choiceAImage", "Choice A image"), visual("choiceBImage", "Choice B image")],
    beats: {question: ["contextImage"], choice_a: ["choiceAImage"], choice_b: ["choiceBImage"], compare: ["choiceAImage", "choiceBImage"], cta: ["choiceAImage", "choiceBImage"]}
  },
  "desktop-chaos-to-one-clean-result": {
    images: [...numbered(visual, "window", "Window card", 3), product("resultCard", "Result card")],
    beats: {hook: ["window1", "window2"], pressure: ["window1", "window2", "window3"], turn: ["window1", "window2", "window3"], result: ["resultCard"], cta: ["resultCard"]}
  },
  "headline-plus-inset-motion-module": {
    images: [visual("moduleA", "Inset image A"), visual("moduleB", "Inset image B")],
    beats: {hook: ["moduleA"], module_a: ["moduleA"], module_b: ["moduleB"], payoff: ["moduleB"], cta: ["moduleB"]}
  },
  "integration-puzzle-that-snaps-together": {
    images: numbered(visual, "tile", "Integration tile", 4),
    beats: Object.fromEntries(["hook", "assembly", "resolve", "explain", "cta"].map(beat => [beat, ["tile1", "tile2", "tile3", "tile4"]]))
  },
  "hero-artwork-becomes-a-type-stage": {
    images: [visual("heroArt", "Hero artwork"), visual("secondaryArt", "Secondary artwork")],
    beats: {art_hook: ["heroArt"], transform: ["heroArt", "secondaryArt"], message: ["secondaryArt"], offer: ["secondaryArt"], cta: ["secondaryArt"]}
  },
  "fixed-glyph-changing-world": {
    images: [visual("glyph", "Anchor glyph"), ...numbered(visual, "world", "World", 4)],
    beats: {anchor: ["glyph"], worlds_1: ["glyph", "world1", "world2"], worlds_2: ["glyph", "world3", "world4"], promise: ["glyph"], cta: ["glyph"]}
  },
  "calm-breathing-shape-loop": {
    images: [visual("calmShape", "Calm shape")],
    beats: Object.fromEntries(["invitation", "expand", "contract", "benefit", "cta"].map(beat => [beat, ["calmShape"]]))
  },
  "macro-feature-proof": {
    images: [product("macroDetail", "Macro detail"), product("fullProduct", "Full product")],
    beats: {macro_hook: ["macroDetail"], demonstration: ["macroDetail"], context: ["fullProduct"], proof: ["fullProduct"], cta: ["fullProduct"]}
  },
  "result-seen-through-the-product": {
    images: [visual("resultImage", "Result image"), product("productFrame", "Product frame")],
    beats: {result_hook: ["resultImage"], frame_reveal: ["resultImage", "productFrame"], demonstrate: ["resultImage", "productFrame"], benefit: ["resultImage", "productFrame"], cta: ["resultImage", "productFrame"]}
  },
  "a-capability-journey-on-connected-paths": {
    images: numbered(visual, "stageIcon", "Stage icon", 4),
    beats: {hook: ["stageIcon1"], stage_1: ["stageIcon1", "stageIcon2"], stage_2: ["stageIcon1", "stageIcon2", "stageIcon3"], stage_3: ["stageIcon1", "stageIcon2", "stageIcon3", "stageIcon4"], outcome_and_cta: ["stageIcon1", "stageIcon2", "stageIcon3", "stageIcon4"]}
  }
};

/**
 * Authored frames: the geometry a concept's own layout implies, carried on the
 * manifest so Plan hands it to the scaffold. Only concepts listed here get frames.
 * Boxes are [left, top, width, height] in canvas fractions and may leave 0..1.
 */
const R12_ANCHOR = [0.285, 0.29, 0.43, 0.34];   // layout.anchor_center [0.5, 0.46] and anchor_size [0.43, 0.34]
const R12_CAPTION = [0.1, 0.16, 0.78, 0.14];    // layout.caption_box
// One world per shot, under the caption box, behind the anchor, bleeding off the sides and bottom.
const R12_WORLD = [-0.02, 0.31, 1.04, 0.71];
// The art direction of each world when its input is empty. Each one differs in place and palette.
const R12_WORLD_PROMPT = (label, place) => `A full-bleed photograph of ${place}, standing for the line "{${label}}" in an ad about "{premise}". Its own vivid palette and light, rich detail, a calm and uncluttered center where an icon will sit. No text, letters, logos or faces.`;
const R12_COPY_LIMITS = {y: 0.03, scale: 0.15};
const AUTHORED_FRAMES = {
  "fixed-glyph-changing-world": {
    reviewRules: [
      "The anchor never changes position or silhouette while the world around it changes.",
      "Anchor center and silhouette remain fixed at all scene boundaries."
    ],
    // The concept cuts every 1500 ms inside a worlds beat: one world per shot.
    split: {worlds_1: ["world1", "world2"], worlds_2: ["world3", "world4"]},
    fallbacks: {
      world1: R12_WORLD_PROMPT("label12", "a warm open landscape at golden hour"),
      world2: R12_WORLD_PROMPT("label12", "lush green nature in soft mist"),
      world3: R12_WORLD_PROMPT("label34", "an underwater scene full of light and color"),
      world4: R12_WORLD_PROMPT("label34", "a city street at night with neon reflections")
    },
    shotRules: {
      worlds_1: ["Anchor position is identical across cuts.", "Each world is distinguishable without relying on its caption."],
      worlds_2: ["Do not introduce a new grammar on every cut.", "Each world is distinguishable without relying on its caption."],
      cta: ["The final brand and CTA are fully settled and readable."]
    },
    // The CTA lockup of R12-B05: the logo on a light panel, so a logo in the
    // brand color stays visible, and the call to action in an outlined pill.
    extras: {
      cta: [
        {id: "logoPanel", kind: "shape", role: "decorative", frame: {box: [0.26, 0.15, 0.48, 0.14]}, style: {fill: "#FFFFFF", cornerRadius: 0.03}, limits: {x: 0.03, y: 0.03, scale: 0.1}},
        {id: "ctaPill", inputId: "brandColor", kind: "shape", role: "decorative", frame: {box: [0.21, 0.715, 0.58, 0.075]}, style: {stroke: "#FFFFFF", strokeWidth: 0.005, cornerRadius: 0.066}, limits: R12_COPY_LIMITS}
      ]
    },
    // The concept's layer stack, bottom to top. Element order sets the track order.
    layerOf(element) {
      return element.id === "background" ? 0 : element.id.startsWith("world") ? 1 : element.id === "glyph" ? 2 : element.kind === "shape" ? 3 : element.kind === "asset" ? 4 : 5;
    },
    frameOf(element) {
      if (element.kind === "shape") return {frame: {box: [0, 0, 1, 1]}};
      if (element.kind === "asset" && element.id === "glyph") return {frame: {box: R12_ANCHOR, fit: "contain"}, lock: ["position", "scale", "crop"]};
      if (element.kind === "asset" && element.id.startsWith("world")) return {frame: {box: R12_WORLD, fit: "cover", clip: true}, limits: {x: 0.05, y: 0.05, scale: 0.15}, fallback: {prompt: this.fallbacks[element.id]}};
      if (element.kind === "asset" && element.role === "logo") return {frame: {box: [0.3, 0.17, 0.4, 0.1], fit: "contain"}, limits: {x: 0.03, y: 0.03, scale: 0.1}};
      if (element.kind === "text" && element.role === "cta") return {frame: {box: [0.21, 0.715, 0.58, 0.075]}, typography: {size: 0.05, weight: 600, align: "center", maxLines: 1}, limits: R12_COPY_LIMITS};
      if (element.kind === "text") return {frame: {box: R12_CAPTION}, typography: {size: 0.075, weight: 700, align: "center", maxLines: 2}, limits: R12_COPY_LIMITS};
      return {};
    }
  }
};

/** Add a concept's authored frames and review rules to its built shots, in place. */
const authorFrames = (concept, built) => {
  const authored = AUTHORED_FRAMES[concept.slug];
  if (!authored) return {shots: built};
  // Split a beat into one shot per listed image, in equal parts of its time.
  const shots = built.flatMap(shot => {
    const parts = authored.split?.[shot.id];
    if (!parts) return [{...shot, beat: shot.id}];
    return parts.map(keep => ({...shot, id: keep.replace(/^world(\d)$/, "world_$1"), beat: shot.id, durationSeconds: shot.durationSeconds / parts.length, elements: shot.elements.filter(element => !parts.includes(element.id) || element.id === keep)}));
  });
  for (const shot of shots) {
    const extras = authored.extras[shot.id] ?? [];
    shot.elements = [...shot.elements.map(element => ({...element, ...authored.frameOf(element)})), ...extras].sort((a, b) => authored.layerOf(a) - authored.layerOf(b));
    if (authored.shotRules[shot.beat]) shot.reviewRules = authored.shotRules[shot.beat];
    delete shot.beat;
  }
  return {shots, reviewRules: authored.reviewRules};
};

const camel = (slot) => slot.replace(/_(\w)/g, (_, letter) => letter.toUpperCase());
const sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const slotLabel = (slot) => sentence(slot.replace(/_(\d+)_(\d+)$/, " $1–$2").replaceAll("_", " ").replace(/\bcta\b/g, "CTA").replace(/ ([a-z])$/, (_, letter) => ` ${letter.toUpperCase()}`));
const COMMON_LABELS = {cta: "Call to action"};
const policyOf = (kind) => kind === "image" ? "exact_asset" : kind === "color" ? "exact_color" : "exact_text";

/** The Recipe manifest for one ad library concept. */
export const adLibraryManifest = (concept) => {
  const spec = IMAGES[concept.slug];
  if (!spec) throw new Error(`No image plan for ad library concept ${concept.slug}.`);
  const labels = {...COMMON_LABELS, ...AD_STEPS[concept.slug]?.labels};
  const copy = concept.copy_slots.map(slot => ({id: camel(slot.id), label: labels[camel(slot.id)] ?? slotLabel(slot.id), kind: "text", required: true}));
  const images = spec.images.map(({id, label}) => ({id, label: labels[id] ?? label, kind: "image", required: true}));
  const inputs = [...images, {id: "logo", label: "Logo", kind: "image", required: true}, ...copy, {id: "brandColor", label: "Brand color", kind: "color", required: true}];
  const roleOf = new Map(spec.images.map(image => [image.id, image.role]));
  const last = concept.beats.length - 1;
  const shots = concept.beats.map((beat, index) => {
    const shown = spec.beats[beat.role];
    if (!shown) throw new Error(`${concept.slug}: no image plan for beat ${beat.role}.`);
    return {
      id: beat.role, title: beat.composition, durationSeconds: (beat.end_ms - beat.start_ms) / 1000,
      elements: [
        {id: "background", inputId: "brandColor", kind: "shape", role: "decorative"},
        ...shown.map(id => ({id, inputId: id, kind: "asset", role: roleOf.get(id)})),
        ...(index === last ? [{id: "logo", inputId: "logo", kind: "asset", role: "logo"}] : []),
        ...(beat.copy_slot === "none" ? [] : [{id: camel(beat.copy_slot), inputId: camel(beat.copy_slot), kind: "text", role: beat.copy_slot.includes("cta") ? "cta" : "headline", direction: beat.motion}])
      ]
    };
  });
  const authoredShots = authorFrames(concept, shots);
  const reviewRules = authoredShots.reviewRules;
  // An input whose element can fall back to a generated image is optional.
  const generatable = new Set(authoredShots.shots.flatMap(shot => shot.elements.filter(element => element.fallback).map(element => element.inputId)));
  for (const input of inputs) if (generatable.has(input.id)) input.required = false;
  const clipped = new Set(authoredShots.shots.flatMap(shot => shot.elements.filter(element => element.frame?.clip).map(element => element.inputId)));
  return {
    schemaVersion: 1, slug: `ad-${concept.slug}`, category: "Ad library",
    inputs, defaults: {step: "start"},
    // An authored clip crops its source to the box, so that input allows crop.
    preservationRules: inputs.map(({id, kind}) => ({inputId: id, policy: policyOf(kind), allowedTransformations: kind === "color" ? ["opacity", "composite"] : ["position", "scale", ...(clipped.has(id) ? ["crop"] : []), "opacity", "composite"]})),
    mediaPolicy: {defaultStrategy: "still_motion_graphics", allowGeneratedVideo: false},
    creativeStrategy: {objective: concept.objective, direction: concept.visual_invariant, aspectRatio: concept.layout_reference_format, ...(reviewRules ? {reviewRules} : {}), shots: authoredShots.shots},
    presentation: {groups: [
      {id: "visuals", title: "Images and brand", inputIds: [...images.map(input => input.id), "logo", "brandColor"]},
      {id: "copy", title: "Exact copy", inputIds: copy.map(input => input.id)}
    ]},
    operations: [{id: "plan", bindingId: "plan", intent: "plan_storyboard", version: 1}, {id: "finish", bindingId: "finish", intent: "finish_storyboard", version: 1, strategy: "agentic", model: {provider: "openai", id: "gpt-5.4-mini"}}],
    outputs: [{id: "storyboardId", kind: "storyboard", label: "Storyboard"}, {id: "designPreview", kind: "timeline", label: "Composed design preview"}, {id: "timeline", kind: "timeline", label: "Editable result"}]
  };
};

const seconds = (ms) => Number((ms / 1000).toFixed(2));
const onStep = (key) => ({binding: "var:step", op: "eq", value: key});
const go = (key) => ({trigger: "click", kind: "setVariable", key: "var:step", value: key});
const button = (id, label, events, extra = {}) => ({type: "Button", props: {id, label, fullWidth: false, events, ...extra}});
const navRow = (id, back, next) => ({type: "Columns", props: {id, gap: 16, left: back ? [back] : [], right: next ? [next] : []}});

/**
 * Rebuilds the app as guided steps: Start, one or two content steps, Ending,
 * then the compiled Review, Build and Result. Each step is one Container that
 * shows while `var:step` names it, with Back and Next at its foot. The input
 * widgets keep their compiled bindings and events; only their place, label,
 * placeholder and hint change.
 */
const layoutSteps = (bundle, concept) => {
  const {app} = bundle;
  const plan = AD_STEPS[concept.slug];
  if (!plan) throw new Error(`No step plan for ad library concept ${concept.slug}.`);
  const content = app.ui.content;
  const take = (id) => {
    const index = content.findIndex(item => item.props.id === id);
    if (index < 0) throw new Error(`${concept.slug}: no compiled widget ${id}.`);
    const [widget] = content.splice(index, 1);
    // The compiled app has one "inputs" step. Here the step Container decides.
    if (widget.props.visibleWhen?.value === "inputs") delete widget.props.visibleWhen;
    return widget;
  };
  const shotIndex = new Map(concept.beats.map((beat, index) => [beat.role, index]));
  concept.beats.forEach((beat, index) => {
    app.variables.push({id: `beatExample${index + 1}`, name: `Beat ${index + 1} example`, type: {type: "image"}, scope: "instance", persist: false, default: {type: "image", uri: `package://nodetool-base/ad-library/${beat.illustration_asset_id}.webp`}});
  });
  const frame = (prefix, role, width) => {
    const index = shotIndex.get(role);
    if (index === undefined) throw new Error(`${concept.slug}: no beat ${role}.`);
    const beat = concept.beats[index];
    return {type: "Image", props: {id: `${prefix}-frame-${index + 1}`, binding: `var:beatExample${index + 1}`, fit: "cover", aspectRatio: "9 / 16", caption: `${seconds(beat.start_ms)}–${seconds(beat.end_ms)} s · ${slotLabel(beat.role)}`, download: false, ...(width ? {width} : {})}};
  };
  const placed = new Set();
  const field = (id) => {
    placed.add(id);
    const widget = take(id);
    const label = app.recipe.inputs.find(input => input.id === id).label;
    const placeholder = plan.placeholders?.[id];
    const hint = plan.hints?.[id];
    if (widget.type === "TextInput") {
      Object.assign(widget.props, {label, ...(placeholder ? {placeholder} : {}), ...(hint ? {hint} : {})});
      return [widget];
    }
    widget.props.label = label;
    return hint ? [widget, {type: "Text", props: {id: `${id}-hint`, text: hint, tone: "hint"}}] : [widget];
  };
  const cardOf = ({image, text}) => ({type: "Container", props: {id: `card-${image}`, variant: "card", content: [...field(image), ...(text ? field(text) : [])]}});
  const group = (stepKey, groupIndex, {frames, cards = [], fields = []}) => ({type: "Columns", props: {id: `${stepKey}-group-${groupIndex + 1}`, layout: "main-aside", gap: 24,
    left: [...(cards.length ? [{type: "Container", props: {id: `${stepKey}-cards-${groupIndex + 1}`, variant: "plain", columns: cards.length, content: cards.map(cardOf)}}] : []), ...fields.flatMap(field)],
    right: frames.map(role => frame(stepKey, role, 112))}});
  const heading = (key, text, subtitle) => ({type: "Heading", props: {id: `${key}-title`, text, level: "2", subtitle}});

  // Take every widget a step needs before the compiled inputs are discarded.
  const stepper = take("steps");
  const model = take("finishModel");
  const modelHelp = take("finishModel-help");
  const imageModel = take("imageModel");
  const imageModelHelp = take("imageModel-help");
  const aiFill = take("ai-fill");
  const planButton = take("plan");
  const planError = take("plan-error");
  const planActivity = take("plan-activity");
  const finish = take("finish");
  const requestChanges = take("request-changes");
  const lastCopy = app.recipe.inputs.filter(input => input.kind === "text").at(-1).id;
  const content_steps = [...plan.steps, {key: "ending", title: "Ending", intro: plan.ending, groups: [{frames: [concept.beats.at(-1).role], fields: [lastCopy, "logo", "brandColor"]}]}];
  const first = content_steps[0];

  const steps = [{key: "start", title: "Start"}, ...content_steps];
  const startStep = {type: "Container", props: {id: "step-start", variant: "plain", visibleWhen: onStep("start"), content: [
    heading("start", "What you will make", `A ${concept.beats.length}-scene vertical ad, ${seconds(concept.duration_ms)} seconds long. You supply images and short lines of copy. The app builds an editable cut, not a generated video.`),
    {type: "Container", props: {id: "start-strip", variant: "plain", columns: concept.beats.length, content: concept.beats.map(beat => frame("start", beat.role))}},
    model,
    {...modelHelp, props: {...modelHelp.props, text: "Lays out every frame and finishes the cut. Pick one that reads images. Saved for next time.", tone: "hint"}},
    imageModel,
    {...imageModelHelp, props: {...imageModelHelp.props, text: "Optional. Paints backgrounds and decoration for the layout. Saved for next time.", tone: "hint"}},
    {type: "ChoiceCards", props: {id: "fillPath", binding: "var:fillPath", label: "How do you want to start?", columns: 2, options: [
      {value: "web", title: "Fill from a website", description: "Paste a product page. AI suggests the copy and images."},
      {value: "self", title: "Fill in myself", description: `Go through ${content_steps.length} short steps.`}
    ], events: []}},
    aiFill,
    navRow("start-nav", null, button("start-next", `Next: ${first.title}`, [go(first.key)], {align: "end", visibleWhen: {binding: "var:fillPath", op: "notEmpty"}}))
  ]}};
  const stepContainers = content_steps.map((step, index) => {
    const previous = steps[index];
    const last = index === content_steps.length - 1;
    const next = last
      ? {...planButton, props: {...planButton.props, label: "Plan the storyboard", fullWidth: false, align: "end"}}
      : button(`${step.key}-next`, `Next: ${content_steps[index + 1].title}`, [go(content_steps[index + 1].key)], {align: "end"});
    return {type: "Container", props: {id: `step-${step.key}`, variant: "plain", visibleWhen: onStep(step.key), content: [
      heading(step.key, step.title, step.intro),
      ...step.groups.map((spec, groupIndex) => group(step.key, groupIndex, spec)),
      ...(last ? [planError, planActivity] : []),
      {type: "Divider", props: {id: `${step.key}-divider`}},
      navRow(`${step.key}-nav`, button(`${step.key}-back`, `Back: ${previous.title}`, [go(previous.key)], {variant: "outlined"}), next)
    ]}};
  });

  const missing = app.recipe.inputs.filter(input => !placed.has(input.id)).map(input => input.id);
  if (missing.length) throw new Error(`${concept.slug}: the steps place no field for ${missing.join(", ")}.`);
  // The compiled group headings and any input the steps did not take go away.
  for (const id of ["group-visuals", "group-copy"]) take(id);

  stepper.props.steps = [
    ...steps.map(({key, title}) => ({value: key, title})),
    {value: "review", title: "Review"}, {value: "build", title: "Build"}, {value: "result", title: "Result"}
  ];
  requestChanges.props.events = requestChanges.props.events.map(event => event.key === "var:step" ? {...event, value: first.key} : event);
  const reviewNav = navRow("review-nav",
    {...requestChanges, props: {...requestChanges.props, fullWidth: false}},
    {...finish, props: {...finish.props, fullWidth: false, align: "end"}});
  reviewNav.props.visibleWhen = onStep("review");
  for (const widget of [reviewNav.props.left[0], reviewNav.props.right[0]]) delete widget.props.visibleWhen;
  const outputsAt = content.findIndex(item => item.props.visibleWhen?.value === "build");
  content.splice(outputsAt, 0, reviewNav);
  app.ui.content = [stepper, startStep, ...stepContainers, ...content];
  return bundle;
};

/** Catalog entries in the shape scripts/example-apps/apps.mjs expects. */
export const AD_LIBRARY_APPS = CONCEPTS.map(concept => {
  const manifest = adLibraryManifest(concept);
  const description = `${concept.objective} Builds an editable ${seconds(concept.duration_ms)}-second vertical ad from your images, logo and copy. AI can suggest options from a website to fill the fields with its copy and images. No generated video.`;
  const bundle = layoutSteps(addAiAssist(buildRecipeAppBundle(manifest, concept.title, description), manifest, concept), concept);
  // The option cards show once a suggestion returns, which a no-run debug never executes.
  // A no-run debug never executes the suggestion or the plan, so it sets the
  // state they would leave: the website panel open with options, then each
  // step a user passes through. The last input step holds the plan button.
  const debugInteractions = [
    {set: {key: "fillPath", value: "web"}},
    {set: {key: "fillOptions", value: [{value: "1", title: "Option 1"}]}},
    {set: {key: "step", value: "ending"}},
    ...RECIPE_APP_DEBUG_INTERACTIONS
  ];
  return {slug: `ad-${concept.slug}`, name: concept.title, description: bundle.description, tagline: concept.selection.use_when, workflows: {}, featured: false, bundle, debugInteractions};
});
