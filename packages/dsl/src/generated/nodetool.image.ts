// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, FolderRef } from "../types.js";

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

export function paste(inputs: PasteInputs): DslNode<PasteOutputs, "output"> {
  return createNode("nodetool.image.Paste", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Scale — nodetool.image.Scale
export type ScaleInputs = {
  image?: Connectable<ImageRef>;
  scale?: Connectable<number>;
};

export interface ScaleOutputs {
  output: ImageRef;
}

export function scale(inputs: ScaleInputs): DslNode<ScaleOutputs, "output"> {
  return createNode("nodetool.image.Scale", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function resize(inputs: ResizeInputs): DslNode<ResizeOutputs, "output"> {
  return createNode("nodetool.image.Resize", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function canvasResize(inputs: CanvasResizeInputs): DslNode<CanvasResizeOutputs, "output"> {
  return createNode("nodetool.image.CanvasResize", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function crop(inputs: CropInputs): DslNode<CropOutputs, "output"> {
  return createNode("nodetool.image.Crop", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function fit(inputs: FitInputs): DslNode<FitOutputs, "output"> {
  return createNode("nodetool.image.Fit", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function rotateAndFlip(inputs: RotateAndFlipInputs): DslNode<RotateAndFlipOutputs, "output"> {
  return createNode("nodetool.image.RotateAndFlip", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Channels — nodetool.image.Channels
export type ChannelsInputs = {
  image?: Connectable<ImageRef>;
  channel?: Connectable<string>;
};

export interface ChannelsOutputs {
  output: ImageRef;
}

export function channels(inputs: ChannelsInputs): DslNode<ChannelsOutputs, "output"> {
  return createNode("nodetool.image.Channels", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function blur(inputs: BlurInputs): DslNode<BlurOutputs, "output"> {
  return createNode("nodetool.image.Blur", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function levels(inputs: LevelsInputs): DslNode<LevelsOutputs, "output"> {
  return createNode("nodetool.image.Levels", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Compositor — nodetool.image.Compositor
export type CompositorInputs = {
  layers?: Connectable<unknown[]>;
  canvas_width?: Connectable<number>;
  canvas_height?: Connectable<number>;
};

export interface CompositorOutputs {
  output: ImageRef;
}

export function compositor(inputs: CompositorInputs): DslNode<CompositorOutputs, "output"> {
  return createNode("nodetool.image.Compositor", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Load Image File — nodetool.image.LoadImageFile
export type LoadImageFileInputs = {
  path?: Connectable<string>;
};

export interface LoadImageFileOutputs {
  output: ImageRef;
}

export function loadImageFile(inputs: LoadImageFileInputs): DslNode<LoadImageFileOutputs, "output"> {
  return createNode("nodetool.image.LoadImageFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function loadImageFolder(inputs: LoadImageFolderInputs): DslNode<LoadImageFolderOutputs> {
  return createNode("nodetool.image.LoadImageFolder", inputs, { outputNames: ["image", "path", "images"], streaming: true });
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

export function saveImageFile(inputs: SaveImageFileInputs): DslNode<SaveImageFileOutputs> {
  return createNode("nodetool.image.SaveImageFile", inputs, { outputNames: ["output", "path"] });
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

export function loadImageAssets(inputs: LoadImageAssetsInputs): DslNode<LoadImageAssetsOutputs> {
  return createNode("nodetool.image.LoadImageAssets", inputs, { outputNames: ["image", "name", "images"], streaming: true });
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

export function saveImage(inputs: SaveImageInputs): DslNode<SaveImageOutputs, "output"> {
  return createNode("nodetool.image.SaveImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function getMetadata(inputs: GetMetadataInputs): DslNode<GetMetadataOutputs> {
  return createNode("nodetool.image.GetMetadata", inputs, { outputNames: ["format", "mode", "width", "height", "channels"] });
}

// Batch To List — nodetool.image.BatchToList
export type BatchToListInputs = {
  batch?: Connectable<ImageRef>;
};

export interface BatchToListOutputs {
  output: ImageRef[];
}

export function batchToList(inputs: BatchToListInputs): DslNode<BatchToListOutputs, "output"> {
  return createNode("nodetool.image.BatchToList", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Images To List — nodetool.image.ImagesToList
export type ImagesToListInputs = {
};

export interface ImagesToListOutputs {
  output: ImageRef[];
}

export function imagesToList(inputs?: ImagesToListInputs): DslNode<ImagesToListOutputs, "output"> {
  return createNode("nodetool.image.ImagesToList", inputs ?? {}, { outputNames: ["output"], defaultOutput: "output" });
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

export function painter(inputs: PainterInputs): DslNode<PainterOutputs> {
  return createNode("nodetool.image.Painter", inputs, { outputNames: ["mask", "image"] });
}

// Text To Image — nodetool.image.TextToImage
export type TextToImageInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  entities?: Connectable<Record<string, unknown>[]>;
  aspect_ratio?: Connectable<string>;
  resolution?: Connectable<string>;
};

export interface TextToImageOutputs {
  output: ImageRef;
}

export function textToImage(inputs: TextToImageInputs): DslNode<TextToImageOutputs, "output"> {
  return createNode("nodetool.image.TextToImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function imageToImage(inputs: ImageToImageInputs): DslNode<ImageToImageOutputs, "output"> {
  return createNode("nodetool.image.ImageToImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function upscale(inputs: UpscaleInputs): DslNode<UpscaleOutputs, "output"> {
  return createNode("nodetool.image.Upscale", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Remove Background — nodetool.image.RemoveBackground
export type RemoveBackgroundInputs = {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
};

export interface RemoveBackgroundOutputs {
  output: ImageRef;
}

export function removeBackground(inputs: RemoveBackgroundInputs): DslNode<RemoveBackgroundOutputs, "output"> {
  return createNode("nodetool.image.RemoveBackground", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function relight(inputs: RelightInputs): DslNode<RelightOutputs, "output"> {
  return createNode("nodetool.image.Relight", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Vectorize Image — nodetool.image.Vectorize
export type VectorizeInputs = {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
};

export interface VectorizeOutputs {
  output: unknown;
}

export function vectorize(inputs: VectorizeInputs): DslNode<VectorizeOutputs, "output"> {
  return createNode("nodetool.image.Vectorize", inputs, { outputNames: ["output"], defaultOutput: "output" });
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

export function segment(inputs: SegmentInputs): DslNode<SegmentOutputs> {
  return createNode("nodetool.image.Segment", inputs, { outputNames: ["masks", "labels", "scores"] });
}
