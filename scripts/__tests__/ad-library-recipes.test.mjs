import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isMissingRequiredMediaValue, parseApplicationBundle } from "@nodetool-ai/app-runtime";
import { extractScriptIO } from "../../web/src/components/appbuilder/workflowIO.ts";
import { applicationDocument } from "@nodetool-ai/protocol/api-schemas/applications.js";

import { AD_LIBRARY_APPS } from "../example-apps/ad-library-recipes.mjs";
import { APPLY_CODE, SUGGEST_CODE } from "../example-apps/ad-library-ai.mjs";
import { PLAN_CODE } from "../example-apps/recipe-app.mjs";

const CONCEPTS = JSON.parse(readFileSync(new URL("../../marketing/src/data/adLibrary.json", import.meta.url), "utf8"));

const execute = async (code, inputs, capabilities) => {
  const outputs = {};
  const body = code.replace(/^import .*;\n/gm, "");
  const globals = {progress: () => {}, ...capabilities};
  const run = new Function("inputs", "output", ...Object.keys(globals), `return (async () => {${body}})();`);
  await run(inputs, async (id, value) => {outputs[id] = value;}, ...Object.values(globals));
  return outputs;
};

describe("ad library Recipe apps", () => {
  it("ships one valid app per ad library concept", () => {
    expect(AD_LIBRARY_APPS.map(app => app.slug)).toEqual(CONCEPTS.map(concept => `ad-${concept.slug}`));
    for (const app of AD_LIBRARY_APPS) {
      expect(parseApplicationBundle(app.bundle)).not.toBeNull();
      expect(applicationDocument.safeParse(app.bundle.app).success).toBe(true);
    }
  });

  it("keeps each concept's beat timing and copy slots", () => {
    for (const concept of CONCEPTS) {
      const recipe = AD_LIBRARY_APPS.find(app => app.slug === `ad-${concept.slug}`).bundle.app.recipe;
      // Shots fill the beats in order. A template may cut one beat into several shots.
      let beat = 0, used = 0;
      for (const shot of recipe.creativeStrategy.shots) {
        const {role, start_ms, end_ms} = concept.beats[beat];
        used += shot.durationSeconds * 1000;
        if (used === shot.durationSeconds * 1000 && used === end_ms - start_ms) expect(shot.id).toBe(role);
        expect(used).toBeLessThanOrEqual(end_ms - start_ms);
        if (used === end_ms - start_ms) { beat += 1; used = 0; }
      }
      expect(beat).toBe(concept.beats.length);
      const textInputs = recipe.inputs.filter(input => input.kind === "text");
      expect(textInputs).toHaveLength(concept.copy_slots.length);
      expect(recipe.creativeStrategy.shots.at(-1).elements.some(element => element.role === "logo")).toBe(true);
    }
  });

  it("keeps the editorial panels on one grid across cuts", () => {
    const strategy = AD_LIBRARY_APPS.find(app => app.slug === "ad-editorial-image-panels").bundle.app.recipe.creativeStrategy;
    const boxes = (shotId) => Object.fromEntries(strategy.shots.find(shot => shot.id === shotId).elements.filter(element => element.id.startsWith("panel")).map(element => [element.id, element.frame.box]));
    expect(boxes("hook")).toEqual({panel1: [0.1, 0.34, 0.78, 0.34]});
    // A panel keeps its cell from the cut where it appears to the cut where the grid fills.
    expect(boxes("panel_3").panel1).toEqual(boxes("panel_2").panel1);
    expect(boxes("panel_3").panel2).toEqual(boxes("panel_2").panel2);
    expect(boxes("hero")).toEqual(boxes("hook"));
    const cta = strategy.shots.find(shot => shot.id === "cta").elements.map(element => element.id);
    expect(cta.indexOf("ctaPill")).toBeLessThan(cta.indexOf("cta"));
  });

  it("authors frames for the fixed-glyph and editorial panel concepts only", () => {
    const frameKeys = ["frame", "typography", "lock", "limits"];
    for (const app of AD_LIBRARY_APPS) {
      const strategy = app.bundle.app.recipe.creativeStrategy;
      const authored = ["ad-fixed-glyph-changing-world", "ad-editorial-image-panels"].includes(app.slug);
      expect(strategy.shots.some(shot => shot.elements.some(element => frameKeys.some(key => key in element)))).toBe(authored);
      expect("reviewRules" in strategy).toBe(authored);
    }
    const strategy = AD_LIBRARY_APPS.find(app => app.slug === "ad-fixed-glyph-changing-world").bundle.app.recipe.creativeStrategy;
    // Each worlds beat cuts in two: one world per shot, in equal halves of its time.
    expect(strategy.shots.map(shot => shot.id)).toEqual(["anchor", "world_1", "world_2", "world_3", "world_4", "promise", "cta"]);
    expect(strategy.shots.filter(shot => shot.id.startsWith("world_")).map(shot => [shot.durationSeconds, shot.elements.filter(element => element.id.startsWith("world")).map(element => element.id)])).toEqual([[1.5, ["world1"]], [1.5, ["world2"]], [1.5, ["world3"]], [1.5, ["world4"]]]);
    // An empty world falls back to a generated image, so its input is optional.
    const recipe = AD_LIBRARY_APPS.find(app => app.slug === "ad-fixed-glyph-changing-world").bundle.app.recipe;
    expect(recipe.inputs.filter(input => !input.required).map(input => input.id)).toEqual(["world1", "world2", "world3", "world4"]);
    const worlds = strategy.shots.flatMap(shot => shot.elements.filter(element => element.id.startsWith("world")));
    expect(new Set(worlds.map(world => world.fallback.prompt)).size).toBe(4);
    // The CTA lockup: template-owned dark ink panels under the logo and the CTA.
    const cta = strategy.shots.find(shot => shot.id === "cta").elements;
    const panel = cta.find(element => element.id === "logoPanel");
    expect(panel).toMatchObject({kind: "shape", style: {fill: "#0B1633"}});
    expect("inputId" in panel).toBe(false);
    expect(cta.findIndex(element => element.id === "logoPanel")).toBeLessThan(cta.findIndex(element => element.id === "logo"));
    const pill = cta.find(element => element.id === "ctaPill");
    expect(pill).toMatchObject({style: {fill: "#0B1633", stroke: "#FFFFFF"}});
    expect("inputId" in pill).toBe(false);
    // The clipped worlds crop their source, so only their inputs allow crop.
    const allowsCrop = AD_LIBRARY_APPS.find(app => app.slug === "ad-fixed-glyph-changing-world").bundle.app.recipe.preservationRules.filter(rule => rule.allowedTransformations.includes("crop")).map(rule => rule.inputId);
    expect(allowsCrop).toEqual(["world1", "world2", "world3", "world4"]);
    expect(strategy.reviewRules).toContain(CONCEPTS.find(concept => concept.slug === "fixed-glyph-changing-world").visual_invariant);
    for (const shot of strategy.shots) {
      const glyph = shot.elements.find(element => element.id === "glyph");
      // Element order is track order: the worlds sit under the anchor, the copy on top.
      const position = (id) => shot.elements.findIndex(element => element.id === id);
      for (const world of shot.elements.filter(element => element.id.startsWith("world"))) expect(position(world.id)).toBeLessThan(position("glyph"));
      expect(shot.elements.at(-1).kind).toBe("text");
      expect(glyph.frame).toEqual({box: [0.285, 0.29, 0.43, 0.34], fit: "contain"});
      expect(glyph.lock).toEqual(["position", "scale", "crop"]);
      for (const element of shot.elements.filter(element => element.id.startsWith("world"))) {
        expect(element.frame).toMatchObject({fit: "cover", clip: true});
        expect(element.frame.box[1]).toBeGreaterThanOrEqual(0.3);
        expect(element.limits).toEqual({x: 0.05, y: 0.05, scale: 0.15});
      }
      for (const element of shot.elements.filter(element => element.kind === "text" && element.role === "headline")) {
        expect(element.frame.box).toEqual([0.1, 0.16, 0.78, 0.14]);
        expect(element.limits).toEqual({y: 0.03, scale: 0.15});
      }
    }
  });

  // Every widget in the tree, with the step Container it sits in.
  const walk = (items, step = null) => items.flatMap(item => {
    const own = item.props.id?.startsWith("step-") ? item.props.visibleWhen.value : step;
    const children = ["content", "left", "right"].flatMap(slot => Array.isArray(item.props[slot]) ? walk(item.props[slot], own) : []);
    return [{item, step: own}, ...children];
  });

  it("shows every beat's shipped illustration on Start, with a gallery thumbnail", () => {
    const assets = new URL("../../packages/base-nodes/nodetool/assets/nodetool-base/", import.meta.url);
    for (const concept of CONCEPTS) {
      const {app} = AD_LIBRARY_APPS.find(candidate => candidate.slug === `ad-${concept.slug}`).bundle;
      expect(existsSync(new URL(`ad-${concept.slug}.jpg`, assets))).toBe(true);
      const strip = walk(app.ui.content).find(({item}) => item.props.id === "start-strip").item;
      expect(strip.props.content.map(frame => frame.props.binding)).toEqual(concept.beats.map((_, index) => `var:beatExample${index + 1}`));
      concept.beats.forEach((beat, index) => {
        const variable = app.variables.find(candidate => candidate.id === `beatExample${index + 1}`);
        expect(variable.default.uri).toBe(`package://nodetool-base/ad-library/${beat.illustration_asset_id}.webp`);
        expect(existsSync(new URL(`ad-library/${beat.illustration_asset_id}.webp`, assets))).toBe(true);
      });
    }
  });

  it("guides the user through Start, the content steps and Ending, one field in one place", () => {
    for (const {slug, bundle} of AD_LIBRARY_APPS) {
      const {app} = bundle;
      const [stepper, ...rest] = app.ui.content;
      expect(stepper.type).toBe("Stepper");
      const keys = stepper.props.steps.map(step => step.value);
      expect(keys.slice(0, 2)).toEqual(["start", keys[1]]);
      expect(keys.slice(-4)).toEqual(["ending", "review", "build", "result"]);
      expect(keys.length, slug).toBeLessThanOrEqual(8);
      expect(app.recipe.defaults.step).toBe("start");
      // One Container per input step, in stepper order.
      const inputSteps = keys.slice(0, -3);
      expect(rest.slice(0, inputSteps.length).map(item => item.props.visibleWhen)).toEqual(inputSteps.map(value => ({binding: "var:step", op: "eq", value})));
      const widgets = walk(app.ui.content);
      // Each Recipe input has exactly one widget, inside a content step, and
      // no input widget keeps a condition of its own.
      for (const input of app.recipe.inputs) {
        const placed = widgets.filter(({item}) => item.props.binding === `var:${input.id}`);
        expect(placed, `${slug}.${input.id}`).toHaveLength(1);
        expect(inputSteps.slice(1)).toContain(placed[0].step);
        expect(placed[0].item.props.visibleWhen).toBeUndefined();
      }
      // Next and Back walk the input steps in order; Ending plans.
      inputSteps.slice(1).forEach((key, index) => {
        const nav = widgets.find(({item}) => item.props.id === `${key}-nav`).item.props;
        expect(nav.left[0].props.events).toEqual([{trigger: "click", kind: "setVariable", key: "var:step", value: inputSteps[index]}]);
        const next = nav.right[0].props;
        if (key === "ending") {
          expect(next.events).toEqual([{trigger: "click", kind: "run", operationId: "plan"}]);
        } else {
          expect(next.events).toEqual([{trigger: "click", kind: "setVariable", key: "var:step", value: inputSteps[index + 2]}]);
        }
      });
      const requestChanges = widgets.find(({item}) => item.props.id === "request-changes").item;
      expect(requestChanges.props.events).toContainEqual({trigger: "click", kind: "setVariable", key: "var:step", value: keys[1]});
    }
  });

  it("plans every concept with exact source assets and copy", async () => {
    for (const {bundle} of AD_LIBRARY_APPS) {
      const recipe = bundle.app.recipe;
      const values = Object.fromEntries(recipe.inputs.map(input => [input.id, input.kind === "image" ? {asset_id: input.id.padEnd(32, "a")} : input.kind === "color" ? "#1248AB" : "Exact " + input.id]));
      const inputs = {...values, recipe, finishModel: {provider: "openai", id: "gpt-5.4-mini"}};
      const shots = [];
      let revision = 0;
      let laidOut;
      const outputs = await execute(PLAN_CODE, inputs, {
        get_entity: async ({entity_id}) => ({entity: {id: entity_id, reference_images: [{asset_id: entity_id}]}}),
        layout_storyboard: async args => {laidOut = args; return {timelineId: "cut", timelineRevision: 0, storyboardRevision: args.expectedStoryboardRevision + 1, timeline: {type: "timeline", id: "cut"}};},
        create_storyboard: async () => ({id: "board", shots: []}),
        edit_storyboard: async ({ops}) => {
          for (const op of ops) {
            if (op.op === "add_shot") {shots.push({...op, id: "shot-" + shots.length});}
          }
          return {shots: shots.map(({id, slug, action}) => ({id, slug, action})), failed: 0, revision: ++revision};
        }
      });
      expect(shots.map(shot => shot.slug)).toEqual(recipe.creativeStrategy.shots.map(shot => shot.id));
      // The layout agent composes the frames before the review shows them.
      expect(laidOut).toMatchObject({storyboardId: "board", model: {provider: "openai", id: "gpt-5.4-mini"}});
      expect(outputs.designPreview).toEqual({type: "timeline", id: "cut"});
      expect(outputs.layoutFindings).toEqual([]);
      for (const shot of shots) {
        const intent = recipe.creativeStrategy.shots.find(candidate => candidate.id === shot.slug);
        for (const graphic of shot.graphics.elements) {
          const inputId = intent.elements.find(element => element.id === graphic.id).inputId;
          if (graphic.kind === "asset") {expect(graphic.asset_id).toBe(values[inputId].asset_id);}
          if (graphic.kind === "text") {expect(graphic.text).toBe(values[inputId]);}
        }
      }
    }
  });

  it("asks for an image model on Start and runs planning and building as agent jobs", () => {
    for (const {bundle} of AD_LIBRARY_APPS) {
      const stepContent = id => bundle.app.ui.content.find(widget => widget.props.id === id).props.content;
      expect(stepContent("step-start").find(widget => widget.props.id === "imageModel").props).toMatchObject({binding: "var:imageModel", modelKind: "image_model"});
      expect(stepContent("step-ending").find(widget => widget.props.id === "plan-activity").props.binding).toBe("op:plan/exec#transcript");
      // A layout that needs a look warns on the review step and can still be approved.
      const panel = bundle.app.ui.content.find(widget => widget.props.id === "layout-review");
      expect(panel.props.visibleWhen).toEqual({binding: "var:step", op: "eq", value: "review"});
      const warning = panel.props.content.find(widget => widget.props.id === "layout-needs-review");
      expect(warning).toMatchObject({type: "Alert", props: {severity: "warning", visibleWhen: {binding: "var:layoutFindings", op: "notEmpty"}}});
      expect(panel.props.content.find(widget => widget.props.id === "layout-findings").props.binding).toBe("var:layoutFindings");
      for (const id of ["plan", "finish"]) {
        const operation = bundle.app.operations.find(candidate => candidate.id === id);
        expect(operation).toMatchObject({workflowId: id, workflowVersion: 1});
        expect(Object.keys(operation.inputs).every(key => key.startsWith("in-"))).toBe(true);
        // A script operation stops after 120 seconds. The layout agent needs longer.
        const run = bundle.workflows.find(workflow => workflow.key === id).graph.nodes.find(node => node.id === "run");
        expect(run.data.timeout).toBeGreaterThan(120);
      }
      expect(bundle.app.operations.find(operation => operation.id === "plan").inputs["in-imageModel"]).toEqual({from: "variable", variableId: "imageModel"});
      expect(bundle.scripts.map(script => script.key)).toEqual(["apply_ad_option-v1"]);
    }
  });

  describe("AI assist", () => {
    const offerWall = AD_LIBRARY_APPS.find(app => app.slug === "ad-kinetic-offer-wall").bundle;
    const suggestGraph = offerWall.workflows.find(workflow => workflow.key === "suggest").graph;
    const brief = suggestGraph.nodes.find(node => node.id === "suggest").dynamic_properties.brief;
    const model = {type: "language_model", provider: "openai", id: "writer", name: "Writer"};
    const url = "https://shop.example/serum";
    const html = `<html><head><meta property="og:image" content="/hero.jpg"><link rel="icon" href="https://shop.example/favicon.png"></head>
      <body><img class="logo" src="/img/logo.svg" alt="Verde"><img data-src="//cdn.example/serum.png" alt="Serum bottle" width="2000" height="2000">
      <img src="/cream_128.jpg" srcset="/cream_640.jpg 640w, /cream_1600.jpg 1600w, /cream_320.jpg 320w" alt="Cream"><img src="data:image/gif;base64,R0lG"></body></html>`;
    const site = {browser: async () => "Verde serum: 20% off until May 31.", fetch: async () => ({text: async () => html})};
    const agentOption = (n) => ({
      title: "Direction " + n, angle: "Angle " + n + ".", brandColor: n === 2 ? "teal" : "#1a2b3c",
      fields: Object.fromEntries(brief.fields.map(field => [field.id, "  Copy " + n + " for " + field.id + " "])),
      images: Object.fromEntries(brief.images.map(image => [image.id, n === 3 ? "" : "https://cdn.example/" + n + "/" + image.id + ".png"]))
    });

    it("reads the website and turns the agent's answer into three option cards", async () => {
      let request;
      const answer = [agentOption(1), agentOption(2), agentOption(3)];
      answer[0].fields[brief.fields[0].id] = "Serums &amp; creams";
      answer[1].images[brief.images[0].id] = "shop.example/not-a-url";
      const outputs = await execute(SUGGEST_CODE, {brief, model, sourceUrl: " " + url + " "}, {
        ...site, run_agent: async (args) => {request = args; return {result: {options: answer}};}
      });
      expect(request.model).toEqual({provider: "openai", id: "writer"});
      expect(request.tools).toEqual(["browser", "image_search"]);
      expect(request.max_turns).toBe(40);
      expect(request.prompt).toContain("20% off until May 31");
      expect(request.prompt).toContain(brief.beats[0]);
      expect(request.prompt).toContain("https://shop.example/hero.jpg (social preview image)");
      expect(request.prompt).toContain("https://shop.example/favicon.png (site icon (icon))");
      expect(request.prompt).toContain('https://shop.example/img/logo.svg (img alt="Verde" logo)');
      expect(request.prompt).toContain('https://cdn.example/serum.png (img alt="Serum bottle", declared 2000x2000)');
      expect(request.prompt).toContain('https://shop.example/cream_1600.jpg (img alt="Cream")');
      expect(request.prompt).not.toContain("cream_128");
      expect(request.prompt).not.toContain("data:image");
      expect(request.output_schema.properties.options).toMatchObject({minItems: 3, maxItems: 3});
      const [first, second, third] = outputs.fillOptions;
      expect(outputs.fillOptions.map(option => option.value)).toEqual(["1", "2", "3"]);
      expect(first.title).toBe("Direction 1");
      expect(first.fields[brief.fields[0].id]).toBe("Serums & creams");
      expect(first.fields[brief.fields[1].id]).toBe("Copy 1 for " + brief.fields[1].id);
      expect(first.description).toBe("Angle 1. “Serums & creams” “Copy 1 for " + brief.fields[1].id + "”");
      expect(first.brandColor).toBe("#1A2B3C");
      expect(first.image).toBe("https://cdn.example/1/" + brief.images[0].id + ".png");
      expect(second.brandColor).toBe("");
      expect(second.images[brief.images[0].id]).toBe("");
      expect(second.image).toBe("https://cdn.example/2/" + brief.images[1].id + ".png");
      expect(third.image).toBeUndefined();
      expect(outputs.fillChoice).toBe("");
      expect(outputs.fillReport).toBe("");
    });

    it("puts https:// in front of a bare domain", async () => {
      const read = [];
      const capture = {browser: async ({url: page}) => { read.push(page); return "Error: stop here"; }};
      for (const typed of ["shop.example/serum", " //shop.example/serum"]) {
        await expect(execute(SUGGEST_CODE, {brief, model, sourceUrl: typed}, capture)).rejects.toThrow("Could not read the website");
      }
      await expect(execute(SUGGEST_CODE, {brief, model, sourceUrl: "http://shop.example/serum"}, capture)).rejects.toThrow("Could not read the website");
      expect(read).toEqual(["https://shop.example/serum", "https://shop.example/serum", "http://shop.example/serum"]);
    });

    it("refuses to suggest without the finishing model, a website URL, a readable page or any option", async () => {
      const never = {run_agent: async () => { throw new Error("must not call the model"); }};
      await expect(execute(SUGGEST_CODE, {brief, model: {provider: "", id: ""}, sourceUrl: url}, never)).rejects.toThrow("Select the finishing model");
      await expect(execute(SUGGEST_CODE, {brief, model, sourceUrl: ""}, never)).rejects.toThrow("Paste a website URL");
      await expect(execute(SUGGEST_CODE, {brief, model, sourceUrl: "my shop"}, never)).rejects.toThrow("Paste a website URL");
      await expect(execute(SUGGEST_CODE, {brief, model, sourceUrl: "ftp://shop.example"}, never)).rejects.toThrow("Paste a website URL");
      await expect(execute(SUGGEST_CODE, {brief, model, sourceUrl: url}, {...never, browser: async () => "Error: HTTP 503"})).rejects.toThrow("Could not read the website");
      await expect(execute(SUGGEST_CODE, {brief, model, sourceUrl: url}, {...site, run_agent: async () => ({result: {options: []}})})).rejects.toThrow("no options");
    });

    // Saved images measure 1200x1600 unless a test names a size for an asset.
    const library = (sizes = {}, contentTypes = {}) => {
      const calls = [];
      return {
        calls,
        save_asset: async (args) => { calls.push(args); const id = "id-" + calls.length; return {success: true, asset_id: id, content_type: contentTypes[args.source] ?? "image/png"}; },
        media: {bytes: async (ref) => ref.uri},
        image: {info: async (uri) => sizes[uri] ?? {width: 1200, height: 1600}}
      };
    };

    it("fills every field from the picked option and saves its images", async () => {
      const store = library();
      const options = [{value: "1", title: "One", brandColor: "#111111", fields: {}, images: {}}, {value: "2", title: "Two", brandColor: "#1A2B3C", fields: Object.fromEntries(brief.fields.map(field => [field.id, "Copy for " + field.id])), images: Object.fromEntries(brief.images.map(image => [image.id, "https://cdn.example/" + image.id + ".png"]))}];
      const outputs = await execute(APPLY_CODE, {brief, options, choice: "2"}, store);
      for (const field of brief.fields) {expect(outputs[field.id]).toBe("Copy for " + field.id);}
      expect(outputs.brandColor).toBe("#1A2B3C");
      expect(store.calls.map(call => call.source)).toEqual(brief.images.map(image => "https://cdn.example/" + image.id + ".png"));
      brief.images.forEach((image, index) => {
        expect(outputs[image.id]).toEqual({type: "image", uri: "asset://id-" + (index + 1), asset_id: "id-" + (index + 1)});
      });
      expect(outputs.fillReport).toBe("Filled from Two. Check every field before you plan.");
      expect(outputs.approval).toBe("pending");
    });

    it("never sets a non-image or a thumbnail, and names the image fields left empty", async () => {
      const [page, none, thumb, ...rest] = brief.images;
      const images = {[page.id]: "https://shop.example/page", [none.id]: "", [thumb.id]: "https://cdn.example/thumb.png", ...Object.fromEntries(rest.map(image => [image.id, "https://cdn.example/" + image.id + ".png"]))};
      const store = library({"asset://id-2": {width: 128, height: 128}}, {"https://shop.example/page": "text/html"});
      const outputs = await execute(APPLY_CODE, {brief, options: [{value: "1", title: "One", brandColor: "", fields: {}, images}], choice: "1"}, store);
      expect(outputs[page.id]).toBeUndefined();
      expect(outputs[none.id]).toBeUndefined();
      expect(outputs[thumb.id]).toBeUndefined();
      for (const image of rest) {expect(outputs[image.id].asset_id).toMatch(/^id-/);}
      expect(outputs.brandColor).toBeUndefined();
      expect(outputs.fillReport).toBe("No usable image found for: " + page.label + ", " + none.label + ". Only images too small for the ad were found for: " + thumb.label + " (128x128). Upload these yourself.");
      await expect(execute(APPLY_CODE, {brief, options: [], choice: "1"}, library())).rejects.toThrow("Pick one of the suggested options");
    });

    it("lets the web runtime start the apply script with every value empty", () => {
      const document = offerWall.scripts.find(script => script.key === "apply_ad_option-v1").document;
      expect(extractScriptIO(document).inputs.filter(input => isMissingRequiredMediaValue(input.nodeType, undefined))).toEqual([]);
    });

    it("suggests in a workflow job, outside the 120-second script limit, with the agent's code", () => {
      for (const {bundle} of AD_LIBRARY_APPS) {
        const suggest = bundle.app.operations.find(operation => operation.id === "suggest");
        expect(suggest.workflowId).toBe("suggest");
        expect(suggest.target).toBeUndefined();
        expect(suggest.inputs).toEqual({"in-sourceUrl": {from: "variable", variableId: "sourceUrl"}, "in-model": {from: "variable", variableId: "finishModel"}});
        expect(Object.keys(suggest.outputs)).toEqual(["out-fillOptions", "out-fillChoice", "out-fillReport"]);
        const graph = bundle.workflows.find(workflow => workflow.key === "suggest").graph;
        const code = graph.nodes.find(node => node.id === "suggest");
        expect(code.data.code).toBe(SUGGEST_CODE);
        // A Code node timeout of 0 falls back to the sandbox's 30-second default.
        expect(code.data.timeout).toBeGreaterThan(120);
        expect(code.dynamic_properties.brief.fields.length).toBeGreaterThan(0);
        expect(graph.edges.map(edge => `${edge.source}.${edge.sourceHandle}>${edge.target}.${edge.targetHandle}`)).toEqual([
          "in-sourceUrl.output>suggest.sourceUrl", "in-model.output>suggest.model",
          "suggest.fillOptions>out-fillOptions.value", "suggest.fillChoice>out-fillChoice.value", "suggest.fillReport>out-fillReport.value"
        ]);
        expect(bundle.scripts.map(script => script.key)).not.toContain("suggest_ad_options-v1");
      }
    });

    it("asks only for a website URL once the user picks it on Start, shows the agent, and fills on a picked card", () => {
      for (const {bundle} of AD_LIBRARY_APPS) {
        expect(bundle.app.operations.map(operation => operation.id)).toEqual(["plan", "finish", "suggest", "apply"]);
        const imageIds = bundle.app.recipe.inputs.filter(input => input.kind === "image").map(input => input.id);
        expect(Object.keys(bundle.app.operations[3].outputs)).toEqual(expect.arrayContaining(imageIds));
        const start = bundle.app.ui.content.find(widget => widget.props.id === "step-start").props.content;
        const path = start.find(widget => widget.props.id === "fillPath");
        expect(path.props.options.map(option => option.value)).toEqual(["web", "self"]);
        const panel = start.find(widget => widget.props.id === "ai-fill");
        expect(panel.type).toBe("Container");
        expect(panel.props.visibleWhen).toEqual({binding: "var:fillPath", op: "eq", value: "web"});
        const widgets = panel.props.content.flatMap(widget => widget.type === "Columns" ? [...widget.props.left, ...widget.props.right] : [widget]);
        expect(widgets.filter(widget => /Input|ModelSelect/.test(widget.type)).map(widget => widget.props.binding)).toEqual(["var:sourceUrl"]);
        expect(widgets).toContainEqual(expect.objectContaining({type: "AgentActivity", props: expect.objectContaining({binding: "op:suggest/exec#transcript"})}));
        const cards = widgets.find(widget => widget.type === "ChoiceCards");
        expect(cards.props.optionsBinding).toBe("var:fillOptions");
        expect(cards.props.events).toEqual([{trigger: "change", kind: "run", operationId: "apply"}]);
      }
    });

    it("offers one example website per concept beside the URL field", () => {
      const examples = AD_LIBRARY_APPS.map(({bundle}) => {
        const start = bundle.app.ui.content.find(widget => widget.props.id === "step-start").props.content;
        const row = start.find(widget => widget.props.id === "ai-fill").props.content.find(widget => widget.props.id === "source-row");
        expect(row.props.left.map(widget => widget.props.id)).toEqual(["sourceUrl"]);
        const button = row.props.right.find(widget => widget.props.id === "source-example");
        const [event] = button.props.events;
        expect(event).toMatchObject({trigger: "click", kind: "setVariable", key: "var:sourceUrl"});
        expect(event.value).toMatch(/^https:\/\/[^\s/]+\.[^\s]/);
        expect(event.value).toContain(button.props.label);
        return event.value;
      });
      expect(new Set(examples).size).toBe(AD_LIBRARY_APPS.length);
    });
  });
});
