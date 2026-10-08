// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef, FolderRef, Entity } from "../types.js";

// Paste — nodetool.image.Paste
export type PasteInputs = {
  image?: Connectable<ImageRef>;
  paste?: Connectable<ImageRef>;
  left?: Connectable<number>;
  top?: Connectable<number>;
};

export interface PasteOutputs {
  output: ImageRef;
}

export function paste(inputs: PasteInputs, options?: NodeOptions): NodeWithOutputs<PasteOutputs, "output"> {
  return createNode("nodetool.image.Paste", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Scale — nodetool.image.Scale
export type ScaleInputs = {
  image?: Connectable<ImageRef>;
  scale?: Connectable<number>;
};

export interface ScaleOutputs {
  output: ImageRef;
}

export function scale(inputs: ScaleInputs, options?: NodeOptions): NodeWithOutputs<ScaleOutputs, "output"> {
  return createNode("nodetool.image.Scale", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Resize Image — nodetool.image.ResizeImage
export type ResizeImageInputs = {
  image?: Connectable<ImageRef>;
  mode?: Connectable<"scale" | "dimensions" | "fit">;
  scale?: Connectable<number>;
  width?: Connectable<number>;
  height?: Connectable<number>;
};

export interface ResizeImageOutputs {
  output: ImageRef;
}

export function resizeImage(inputs: ResizeImageInputs, options?: NodeOptions): NodeWithOutputs<ResizeImageOutputs, "output"> {
  return createNode("nodetool.image.ResizeImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Resize — nodetool.image.Resize
export type ResizeInputs = {
  image?: Connectable<ImageRef>;
  width?: Connectable<number>;
  height?: Connectable<number>;
};

export interface ResizeOutputs {
  output: ImageRef;
}

export function resize(inputs: ResizeInputs, options?: NodeOptions): NodeWithOutputs<ResizeOutputs, "output"> {
  return createNode("nodetool.image.Resize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Canvas Resize — nodetool.image.CanvasResize
export type CanvasResizeInputs = {
  image?: Connectable<ImageRef>;
  mode?: Connectable<"fixed" | "scale" | "padding">;
  anchor?: Connectable<"top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right">;
  width?: Connectable<number>;
  height?: Connectable<number>;
  scale?: Connectable<number>;
  padding_unit?: Connectable<"px" | "percent">;
  top?: Connectable<number>;
  bottom?: Connectable<number>;
  left?: Connectable<number>;
  right?: Connectable<number>;
  color?: Connectable<unknown>;
};

export interface CanvasResizeOutputs {
  output: ImageRef;
}

export function canvasResize(inputs: CanvasResizeInputs, options?: NodeOptions): NodeWithOutputs<CanvasResizeOutputs, "output"> {
  return createNode("nodetool.image.CanvasResize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Crop — nodetool.image.Crop
export type CropInputs = {
  image?: Connectable<ImageRef>;
  left?: Connectable<number>;
  top?: Connectable<number>;
  right?: Connectable<number>;
  bottom?: Connectable<number>;
};

export interface CropOutputs {
  output: ImageRef;
}

export function crop(inputs: CropInputs, options?: NodeOptions): NodeWithOutputs<CropOutputs, "output"> {
  return createNode("nodetool.image.Crop", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Fit — nodetool.image.Fit
export type FitInputs = {
  image?: Connectable<ImageRef>;
  width?: Connectable<number>;
  height?: Connectable<number>;
};

export interface FitOutputs {
  output: ImageRef;
}

export function fit(inputs: FitInputs, options?: NodeOptions): NodeWithOutputs<FitOutputs, "output"> {
  return createNode("nodetool.image.Fit", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Rotate & Flip — nodetool.image.RotateAndFlip
export type RotateAndFlipInputs = {
  image?: Connectable<ImageRef>;
  angle?: Connectable<number>;
  flip_horizontal?: Connectable<boolean>;
  flip_vertical?: Connectable<boolean>;
};

export interface RotateAndFlipOutputs {
  output: ImageRef;
}

export function rotateAndFlip(inputs: RotateAndFlipInputs, options?: NodeOptions): NodeWithOutputs<RotateAndFlipOutputs, "output"> {
  return createNode("nodetool.image.RotateAndFlip", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Channels — nodetool.image.Channels
export type ChannelsInputs = {
  image?: Connectable<ImageRef>;
  channel?: Connectable<string>;
};

export interface ChannelsOutputs {
  output: ImageRef;
}

export function channels(inputs: ChannelsInputs, options?: NodeOptions): NodeWithOutputs<ChannelsOutputs, "output"> {
  return createNode("nodetool.image.Channels", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Blur — nodetool.image.Blur
export type BlurInputs = {
  image?: Connectable<ImageRef>;
  blur_type?: Connectable<string>;
  size?: Connectable<number>;
};

export interface BlurOutputs {
  output: ImageRef;
}

export function blur(inputs: BlurInputs, options?: NodeOptions): NodeWithOutputs<BlurOutputs, "output"> {
  return createNode("nodetool.image.Blur", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Levels — nodetool.image.Levels
export type LevelsInputs = {
  image?: Connectable<ImageRef>;
  r_black?: Connectable<number>;
  r_gamma?: Connectable<number>;
  r_white?: Connectable<number>;
  g_black?: Connectable<number>;
  g_gamma?: Connectable<number>;
  g_white?: Connectable<number>;
  b_black?: Connectable<number>;
  b_gamma?: Connectable<number>;
  b_white?: Connectable<number>;
};

export interface LevelsOutputs {
  output: ImageRef;
}

export function levels(inputs: LevelsInputs, options?: NodeOptions): NodeWithOutputs<LevelsOutputs, "output"> {
  return createNode("nodetool.image.Levels", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Compositor — nodetool.image.Compositor
export type CompositorInputs = {
  layers?: Connectable<unknown[]>;
  canvas_width?: Connectable<number>;
  canvas_height?: Connectable<number>;
  [name: string]: unknown;
};

export interface CompositorOutputs {
  output: ImageRef;
}

export function compositor(inputs: CompositorInputs, options?: NodeOptions): NodeWithOutputs<CompositorOutputs, "output"> {
  return createNode("nodetool.image.Compositor", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Load Image File — nodetool.image.LoadImageFile
export type LoadImageFileInputs = {
  path?: Connectable<string>;
};

export interface LoadImageFileOutputs {
  output: ImageRef;
}

export function loadImageFile(inputs: LoadImageFileInputs, options?: NodeOptions): NodeWithOutputs<LoadImageFileOutputs, "output"> {
  return createNode("nodetool.image.LoadImageFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Load Image Folder — nodetool.image.LoadImageFolder
export type LoadImageFolderInputs = {
  folder?: Connectable<string>;
  include_subdirectories?: Connectable<boolean>;
  extensions?: Connectable<string[]>;
  pattern?: Connectable<string>;
};

export interface LoadImageFolderOutputs {
  image: ImageRef;
  path: string;
  images: unknown[];
}

export function loadImageFolder(inputs: LoadImageFolderInputs, options?: NodeOptions): NodeWithOutputs<LoadImageFolderOutputs> {
  return createNode("nodetool.image.LoadImageFolder", inputs, { id: options?.id, outputNames: ["image", "path", "images"], outputTypes: {"image":"image","path":"str","images":"list"}, streaming: true, inputMode: "buffered", outputCorrelation: {"image":{"kind":"iteration","source":"__execution__","group":"items"},"path":{"kind":"iteration","source":"__execution__","group":"items"},"images":{"kind":"single","source":"__execution__"}} });
}

// Save Image File — nodetool.image.SaveImageFile
export type SaveImageFileInputs = {
  image?: Connectable<ImageRef>;
  save_to_workspace?: Connectable<boolean>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
  overwrite?: Connectable<boolean>;
};

export interface SaveImageFileOutputs {
  output: ImageRef;
  path: string;
}

export function saveImageFile(inputs: SaveImageFileInputs, options?: NodeOptions): NodeWithOutputs<SaveImageFileOutputs> {
  return createNode("nodetool.image.SaveImageFile", inputs, { id: options?.id, outputNames: ["output", "path"], outputTypes: {"output":"image","path":"str"} });
}

// Load Image Assets — nodetool.image.LoadImageAssets
export type LoadImageAssetsInputs = {
  folder?: Connectable<FolderRef>;
};

export interface LoadImageAssetsOutputs {
  image: ImageRef;
  name: string;
  images: unknown[];
}

export function loadImageAssets(inputs: LoadImageAssetsInputs, options?: NodeOptions): NodeWithOutputs<LoadImageAssetsOutputs> {
  return createNode("nodetool.image.LoadImageAssets", inputs, { id: options?.id, outputNames: ["image", "name", "images"], outputTypes: {"image":"image","name":"str","images":"list"}, streaming: true, inputMode: "buffered", outputCorrelation: {"image":{"kind":"iteration","source":"__execution__","group":"items"},"name":{"kind":"iteration","source":"__execution__","group":"items"},"images":{"kind":"single","source":"__execution__"}} });
}

// Save Image Asset — nodetool.image.SaveImage
export type SaveImageInputs = {
  image?: Connectable<ImageRef>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
};

export interface SaveImageOutputs {
  output: ImageRef;
}

export function saveImage(inputs: SaveImageInputs, options?: NodeOptions): NodeWithOutputs<SaveImageOutputs, "output"> {
  return createNode("nodetool.image.SaveImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Get Metadata — nodetool.image.GetMetadata
export type GetMetadataInputs = {
  image?: Connectable<ImageRef>;
};

export interface GetMetadataOutputs {
  format: string;
  mode: string;
  width: number;
  height: number;
  channels: number;
}

export function getMetadata(inputs: GetMetadataInputs, options?: NodeOptions): NodeWithOutputs<GetMetadataOutputs> {
  return createNode("nodetool.image.GetMetadata", inputs, { id: options?.id, outputNames: ["format", "mode", "width", "height", "channels"], outputTypes: {"format":"str","mode":"str","width":"int","height":"int","channels":"int"} });
}

// Batch To List — nodetool.image.BatchToList
export type BatchToListInputs = {
  batch?: Connectable<ImageRef>;
};

export interface BatchToListOutputs {
  output: ImageRef[];
}

export function batchToList(inputs: BatchToListInputs, options?: NodeOptions): NodeWithOutputs<BatchToListOutputs, "output"> {
  return createNode("nodetool.image.BatchToList", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[image]"}, defaultOutput: "output" });
}

// Images To List — nodetool.image.ImagesToList
export type ImagesToListInputs = {
  [name: string]: unknown;
};

export interface ImagesToListOutputs {
  output: ImageRef[];
}

export function imagesToList(inputs?: ImagesToListInputs, options?: NodeOptions): NodeWithOutputs<ImagesToListOutputs, "output"> {
  return createNode("nodetool.image.ImagesToList", inputs ?? {}, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[image]"}, defaultOutput: "output" });
}

// Painter — nodetool.image.Painter
export type PainterInputs = {
  image?: Connectable<ImageRef>;
  mask_data?: Connectable<string>;
  canvas_width?: Connectable<number>;
  canvas_height?: Connectable<number>;
};

export interface PainterOutputs {
  mask: ImageRef;
  image: ImageRef;
}

export function painter(inputs: PainterInputs, options?: NodeOptions): NodeWithOutputs<PainterOutputs> {
  return createNode("nodetool.image.Painter", inputs, { id: options?.id, outputNames: ["mask", "image"], outputTypes: {"mask":"image","image":"image"} });
}

// Text To Image — nodetool.image.TextToImage
export type TextToImageInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  entities?: Connectable<Entity[]>;
  aspect_ratio?: Connectable<string>;
  resolution?: Connectable<string>;
};

export interface TextToImageOutputs {
  output: ImageRef;
}

export function textToImage(inputs: TextToImageInputs, options?: NodeOptions): NodeWithOutputs<TextToImageOutputs, "output"> {
  return createNode("nodetool.image.TextToImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Image To Image — nodetool.image.ImageToImage
export type ImageToImageInputs = {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef[]>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  entities?: Connectable<Record<string, unknown>[]>;
  strength?: Connectable<number>;
  aspect_ratio?: Connectable<string>;
  resolution?: Connectable<string>;
  scheduler?: Connectable<string>;
};

export interface ImageToImageOutputs {
  output: ImageRef;
}

export function imageToImage(inputs: ImageToImageInputs, options?: NodeOptions): NodeWithOutputs<ImageToImageOutputs, "output"> {
  return createNode("nodetool.image.ImageToImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Upscale Image — nodetool.image.Upscale
export type UpscaleInputs = {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  scale?: Connectable<number>;
  prompt?: Connectable<string>;
};

export interface UpscaleOutputs {
  output: ImageRef;
}

export function upscale(inputs: UpscaleInputs, options?: NodeOptions): NodeWithOutputs<UpscaleOutputs, "output"> {
  return createNode("nodetool.image.Upscale", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Remove Background — nodetool.image.RemoveBackground
export type RemoveBackgroundInputs = {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
};

export interface RemoveBackgroundOutputs {
  output: ImageRef;
}

export function removeBackground(inputs: RemoveBackgroundInputs, options?: NodeOptions): NodeWithOutputs<RemoveBackgroundOutputs, "output"> {
  return createNode("nodetool.image.RemoveBackground", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Estimate Depth — nodetool.image.EstimateDepth
export type EstimateDepthInputs = {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
};

export interface EstimateDepthOutputs {
  output: ImageRef;
}

export function estimateDepth(inputs: EstimateDepthInputs, options?: NodeOptions): NodeWithOutputs<EstimateDepthOutputs, "output"> {
  return createNode("nodetool.image.EstimateDepth", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Relight Image — nodetool.image.Relight
export type RelightInputs = {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
};

export interface RelightOutputs {
  output: ImageRef;
}

export function relight(inputs: RelightInputs, options?: NodeOptions): NodeWithOutputs<RelightOutputs, "output"> {
  return createNode("nodetool.image.Relight", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Vectorize Image — nodetool.image.Vectorize
export type VectorizeInputs = {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
};

export interface VectorizeOutputs {
  output: unknown;
}

export function vectorize(inputs: VectorizeInputs, options?: NodeOptions): NodeWithOutputs<VectorizeOutputs, "output"> {
  return createNode("nodetool.image.Vectorize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"svg_element"}, defaultOutput: "output" });
}

// Segment Image — nodetool.image.Segment
export type SegmentInputs = {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  points?: Connectable<Record<string, unknown>[]>;
  box?: Connectable<Record<string, unknown>>;
  max_masks?: Connectable<number>;
  min_confidence?: Connectable<number>;
};

export interface SegmentOutputs {
  masks: ImageRef[];
  labels: string[];
  scores: number[];
}

export function segment(inputs: SegmentInputs, options?: NodeOptions): NodeWithOutputs<SegmentOutputs> {
  return createNode("nodetool.image.Segment", inputs, { id: options?.id, outputNames: ["masks", "labels", "scores"], outputTypes: {"masks":"list[image]","labels":"list[str]","scores":"list[float]"} });
}
