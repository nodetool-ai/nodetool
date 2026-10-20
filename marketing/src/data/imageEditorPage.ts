import type { QaPair } from "@/lib/jsonld";

/**
 * Copy for /ai-image-editor, shared by the page and its Markdown mirror
 * (scripts/generate-llms-txt.mjs).
 *
 * Every claim here was checked against the product: editor features in
 * docs/sketch-editor.md, generated layers and stale regeneration in
 * web/src/components/sketch/Inspector/{DirectGenLayerPanel,SketchAIToolbar}.tsx,
 * inpaint in web/src/components/sketch/SelectionActionBar.tsx, segmentation in
 * web/src/components/sketch/tool-settings-panels/segmentSettingsPanel.tsx,
 * agent tools in packages/agents/src/capabilities/{sketches,media,entities}.specs.ts
 * and packages/system-skills/nodetool-sketch/SKILL.md. Change this file when
 * those change.
 */

export const IMAGE_TITLE = "Open-Source AI Image Editor with Layers | NodeTool";
export const IMAGE_DESCRIPTION =
  "A layered AI image editor: generate one layer with Flux, GPT Image, or your own workflow, inpaint a selection, keep versions, and let an agent edit the stack.";

export const IMAGE_LEAD =
  "NodeTool's sketch editor is an open-source AI image editor with layers. Each layer can be painted by hand or generated from a prompt or a workflow, so you regenerate one layer and leave the rest of the image alone. Select a region to inpaint it, cut objects out with the Segment tool, and keep every generation as a version on its layer. The built-in agent and coding agents over MCP edit the same document.";

export type Feature = { title: string; body: string };

export const LAYER_FEATURES: Feature[] = [
  {
    title: "Generated layers",
    body: "Bind a layer to an image model and a prompt, text-to-image or image-to-image, or to any of your workflows with an image output. The Inspector shows an estimated cost before you generate.",
  },
  {
    title: "Regenerate one layer",
    body: "Each generation is a version on its layer. Change a prompt or an upstream layer, and the layers that depend on it are marked stale. Re-generate Stale runs only those, in dependency order, and skips locked layers.",
  },
  {
    title: "Inpaint a selection",
    body: "Select a region and regenerate only that region from a prompt, with the selection as the mask.",
  },
  {
    title: "Segment and cut out",
    body: "The Segment tool finds objects from a point or a box and turns them into mask layers or cutout layers.",
  },
  {
    title: "A real layer stack",
    body: "Blend modes, opacity, lock, visibility, groups, a mask layer, and vector layers imported from SVG. Paint with brush, pencil, eraser, fill, gradient, blur, and clone stamp.",
  },
  {
    title: "Versions of the whole image",
    body: "Snapshot the document before a big change and restore any snapshot later. A restore saves the current state first, so it can be undone.",
  },
];

export const CONSISTENCY_POINTS: string[] = [
  "A prop entity holds your product with a reference image and a fixed description. The agent passes the reference image to the image model, so the product looks the same in every image.",
  "Edit an existing image from a prompt and hand the model more reference images to match, such as a brand style or an earlier result.",
];

export const AGENT_TOOLS: { name: string; body: string }[] = [
  { name: "create_sketch, edit_sketch", body: "Create a sketch and change its stack: add, remove, reorder, and rename layers, set blend mode and opacity, and place an image on a layer." },
  { name: "refine_image_brief", body: "Expand a one-line brief into subject, composition, lighting, style, and what to leave out, for you to review before anything renders." },
  { name: "generate_image, edit_image", body: "Render an image or edit one on the provider and model you name, then place the result on a layer." },
  { name: "list_sketch_versions, restore_sketch_version", body: "Read the document's snapshots and roll back to one." },
  { name: "critique_image", body: "Look at a result and say what to fix before the next pass." },
];

export const IMAGE_LIMITS: string[] = [
  "Generation calls your own provider accounts, such as fal, OpenAI, Replicate, or Gemini, at their list price. A local model needs a machine that can run it.",
  "Headless agent tools change the layer stack and place images. Painting on pixels needs the editor open.",
  "The editor keeps the last 30 undo steps. Use document versions for anything older.",
];

export const IMAGE_FAQ: QaPair[] = [
  {
    question: "Is there an open-source AI image editor with layers?",
    answer:
      "Yes. NodeTool's sketch editor is open source under AGPL-3.0. It has a layer stack with blend modes and masks, and any layer can be generated from a prompt or a workflow and regenerated on its own.",
  },
  {
    question: "Can I regenerate one part of an image without changing the rest?",
    answer:
      "Yes, in two ways. Put the part on its own generated layer and regenerate only that layer, or select a region and inpaint it with the selection as the mask.",
  },
  {
    question: "Which image models does it use?",
    answer:
      "The models your providers offer, such as Flux on fal or Replicate, GPT Image on OpenAI, and Gemini image models, plus local models you run yourself. You can also bind a layer to your own workflow.",
  },
  {
    question: "Can an AI agent edit a layered image?",
    answer:
      "Yes. The built-in agent, or Claude Code or Codex over the NodeTool MCP server, creates the sketch, adds and orders layers, generates images onto them, and restores versions. You open the same document in the editor and keep working.",
  },
  {
    question: "How do I keep a product the same across images?",
    answer:
      "Save the product as a prop entity with a reference image. The agent passes that reference to the image model each time, and edit_image can take more reference images to match.",
  },
];

export const IMAGE_LINKS: { label: string; href: string }[] = [
  { label: "Sketch Editor guide", href: "https://docs.nodetool.ai/sketch-editor" },
  { label: "AI video editor", href: "/ai-video-editor" },
  { label: "Storyboards made in NodeTool", href: "/storyboards" },
  { label: "AI for advertising", href: "/marketing" },
  { label: "MCP server for coding agents", href: "/mcp" },
  { label: "Every supported model", href: "/models" },
];
