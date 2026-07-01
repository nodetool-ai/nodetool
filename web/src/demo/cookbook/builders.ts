/**
 * Shared metadata builders for the cookbook demo casts.
 *
 * The 15 cookbook recipes (docs/cookbook/patterns.md) reuse the same handful of
 * node shapes — inputs, a Preview/Output sink, a streaming text agent, an image
 * generator, a video generator, an audio generator. These factories fabricate
 * the exact `NodeMetadata` each one needs (real registry `node_type` strings,
 * verified against the source) so every cast file stays focused on its graph,
 * timeline, and narration rather than repeating metadata boilerplate.
 *
 * Every node type used here is a real type from the registry; the strings are
 * checked by `__tests__/cookbookCasts.test.ts`.
 */
import { PREVIEW_NODE_TYPE } from "../../constants/nodeTypes";
import { edge, meta, node, out, prop, type GraphNode } from "../castHelpers";
import type { CastViewport } from "../castTypes";
import type { NodeMetadata, Workflow } from "../../stores/ApiTypes";

/** Assemble a synthetic Workflow from nodes/edges (positions are real). */
export const cookbookWorkflow = (
  id: string,
  name: string,
  description: string,
  nodes: GraphNode[],
  edges: ReturnType<typeof edge>[]
): Workflow =>
  ({
    id,
    name,
    access: "private",
    description,
    thumbnail: "",
    tags: [],
    run_mode: "workflow",
    settings: {},
    updated_at: new Date(0).toISOString(),
    created_at: new Date(0).toISOString(),
    graph: { nodes, edges },
  }) as unknown as Workflow;

export { edge, node };

const FRAME_W = 1920;
const FRAME_H = 1080;

/**
 * A "wide" viewport that frames the whole graph in 1920×1080 with margin. The
 * Tutorial camera uses this as its establishing/pull-back shot and zooms onto
 * individual nodes per step. Node heights vary (content cards run tall), so the
 * vertical extent is estimated generously to keep every node on-screen.
 */
export const fitViewport = (
  nodes: GraphNode[],
  estNodeHeight = 300,
  padding = 140
): CastViewport => {
  const xs = nodes.map((n) => n.ui_properties.position.x);
  const rights = nodes.map(
    (n) => n.ui_properties.position.x + n.ui_properties.width
  );
  const ys = nodes.map((n) => n.ui_properties.position.y);
  const bottoms = nodes.map((n) => n.ui_properties.position.y + estNodeHeight);
  const minX = Math.min(...xs);
  const maxX = Math.max(...rights);
  const minY = Math.min(...ys);
  const maxY = Math.max(...bottoms);
  const zoom = Math.min(
    (FRAME_W - 2 * padding) / Math.max(1, maxX - minX),
    (FRAME_H - 2 * padding) / Math.max(1, maxY - minY),
    1.1
  );
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return {
    x: FRAME_W / 2 - centerX * zoom,
    y: FRAME_H / 2 - centerY * zoom,
    zoom: Math.round(zoom * 1000) / 1000,
  };
};

/** Generic workflow output sink (the cookbook diagrams' "Output" node). */
export const OUTPUT_NODE_TYPE = "nodetool.output.Output";

export const stringInputMeta = (): NodeMetadata =>
  meta({
    node_type: "nodetool.input.StringInput",
    title: "String Input",
    properties: [prop("name", "str"), prop("value", "str")],
    outputs: [out("output", "str")],
    inline_fields: ["value"],
    input_fields: [],
  });

export const imageInputMeta = (): NodeMetadata =>
  meta({
    node_type: "nodetool.input.ImageInput",
    title: "Image Input",
    properties: [prop("name", "str"), prop("value", "image")],
    outputs: [out("output", "image")],
    inline_fields: ["value"],
    input_fields: [],
  });

export const audioInputMeta = (): NodeMetadata =>
  meta({
    node_type: "nodetool.input.AudioInput",
    title: "Audio Input",
    properties: [prop("name", "str"), prop("value", "audio")],
    outputs: [out("output", "audio")],
    inline_fields: ["value"],
    input_fields: [],
  });

export const previewMeta = (title = "Preview"): NodeMetadata =>
  meta({
    node_type: PREVIEW_NODE_TYPE,
    title,
    properties: [prop("value", "any")],
    outputs: [out("output", "any")],
  });

export const outputMeta = (title = "Output"): NodeMetadata =>
  meta({
    node_type: OUTPUT_NODE_TYPE,
    title,
    properties: [prop("name", "str"), prop("value", "any")],
    outputs: [out("output", "any")],
  });

/** A streaming text LLM (Agent / Summarizer) rendered as a text content card. */
export const textAgentMeta = (
  nodeType: string,
  title: string,
  properties = [prop("prompt", "str"), prop("model", "language_model")],
  inputFields = ["prompt"]
): NodeMetadata =>
  meta({
    node_type: nodeType,
    title,
    body: "content_card",
    auto_save_asset: true,
    properties,
    outputs: [out("text", "str"), out("chunk", "chunk", true)],
    inline_fields: [],
    input_fields: inputFields,
    is_streaming_output: true,
  });

/** A streaming list generator with its bespoke numbered-list body. */
export const listGeneratorMeta = (): NodeMetadata =>
  meta({
    node_type: "nodetool.generators.ListGenerator",
    title: "List Generator",
    auto_save_asset: true,
    properties: [prop("model", "language_model"), prop("prompt", "str")],
    outputs: [out("item", "str", true), out("index", "int", true), out("output", "list")],
    inline_fields: [],
    input_fields: ["prompt"],
    is_streaming_output: true,
  });

/** A streaming dataframe generator (Flashcards / structured records). */
export const dataGeneratorMeta = (): NodeMetadata =>
  meta({
    node_type: "nodetool.generators.DataGenerator",
    title: "Data Generator",
    properties: [prop("model", "language_model"), prop("prompt", "str")],
    outputs: [
      out("record", "dict", true),
      out("index", "int", true),
      out("dataframe", "dataframe"),
    ],
    inline_fields: [],
    input_fields: ["prompt"],
    is_streaming_output: true,
  });

/** An image generator / processor — image output routes to the image card. */
export const imageNodeMeta = (
  nodeType: string,
  title: string,
  properties = [prop("prompt", "str")]
): NodeMetadata =>
  meta({
    node_type: nodeType,
    title,
    body: "content_card",
    auto_save_asset: true,
    properties,
    outputs: [out("output", "image")],
    inline_fields: [],
    input_fields: properties.map((p) => p.name),
  });

/** A video generator — video output routes to the video content card. */
export const videoNodeMeta = (
  nodeType: string,
  title: string,
  properties = [prop("prompt", "str")]
): NodeMetadata =>
  meta({
    node_type: nodeType,
    title,
    body: "content_card",
    auto_save_asset: true,
    properties,
    outputs: [out("output", "video")],
    inline_fields: [],
    input_fields: properties.map((p) => p.name),
  });

/** An audio generator (TextToSpeech) — audio output routes to the audio card. */
export const audioNodeMeta = (
  nodeType: string,
  title: string,
  properties = [prop("text", "str"), prop("model", "language_model")]
): NodeMetadata =>
  meta({
    node_type: nodeType,
    title,
    body: "content_card",
    auto_save_asset: true,
    properties,
    outputs: [out("audio", "audio"), out("chunk", "chunk", true)],
    inline_fields: [],
    input_fields: properties.map((p) => p.name),
  });

/** A plain processing/plumbing node with a single typed output. */
export const simpleMeta = (
  nodeType: string,
  title: string,
  outType: string,
  opts: {
    inputs?: string[];
    inline?: string[];
    properties?: ReturnType<typeof prop>[];
    streaming?: boolean;
  } = {}
): NodeMetadata =>
  meta({
    node_type: nodeType,
    title,
    properties: opts.properties ?? [prop(opts.inputs?.[0] ?? "input", "str")],
    outputs: [out("output", outType, opts.streaming ?? false)],
    inline_fields: opts.inline ?? [],
    input_fields: opts.inputs ?? [],
    is_streaming_output: opts.streaming ?? false,
  });
