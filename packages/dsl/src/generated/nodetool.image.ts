// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, FolderRef } from "../types.js";

// Load Image File — nodetool.image.LoadImageFile
export interface LoadImageFileInputs {
  path?: Connectable<string>;
}

export interface LoadImageFileOutputs {
  output: ImageRef;
}

export function loadImageFile(inputs: LoadImageFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<LoadImageFileOutputs, "output"> {
  return createNode("nodetool.image.LoadImageFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Load Image Folder — nodetool.image.LoadImageFolder
export interface LoadImageFolderInputs {
  folder?: Connectable<string>;
  include_subdirectories?: Connectable<boolean>;
  extensions?: Connectable<string[]>;
  pattern?: Connectable<string>;
}

export interface LoadImageFolderOutputs {
  image: ImageRef;
  path: string;
  images: unknown[];
}

export function loadImageFolder(inputs: LoadImageFolderInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<LoadImageFolderOutputs> {
  return createNode("nodetool.image.LoadImageFolder", inputs as Record<string, unknown>, { outputNames: ["image", "path", "images"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Save Image File — nodetool.image.SaveImageFile
export interface SaveImageFileInputs {
  image?: Connectable<ImageRef>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
  overwrite?: Connectable<boolean>;
}

export interface SaveImageFileOutputs {
  output: ImageRef;
}

export function saveImageFile(inputs: SaveImageFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SaveImageFileOutputs, "output"> {
  return createNode("nodetool.image.SaveImageFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Load Image Assets — nodetool.image.LoadImageAssets
export interface LoadImageAssetsInputs {
  folder?: Connectable<FolderRef>;
}

export interface LoadImageAssetsOutputs {
  image: ImageRef;
  name: string;
  images: unknown[];
}

export function loadImageAssets(inputs: LoadImageAssetsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<LoadImageAssetsOutputs> {
  return createNode("nodetool.image.LoadImageAssets", inputs as Record<string, unknown>, { outputNames: ["image", "name", "images"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Save Image Asset — nodetool.image.SaveImage
export interface SaveImageInputs {
  image?: Connectable<ImageRef>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
}

export interface SaveImageOutputs {
  output: ImageRef;
}

export function saveImage(inputs: SaveImageInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SaveImageOutputs, "output"> {
  return createNode("nodetool.image.SaveImage", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Get Metadata — nodetool.image.GetMetadata
export interface GetMetadataInputs {
  image?: Connectable<ImageRef>;
}

export interface GetMetadataOutputs {
  format: string;
  mode: string;
  width: number;
  height: number;
  channels: number;
}

export function getMetadata(inputs: GetMetadataInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetMetadataOutputs> {
  return createNode("nodetool.image.GetMetadata", inputs as Record<string, unknown>, { outputNames: ["format", "mode", "width", "height", "channels"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Batch To List — nodetool.image.BatchToList
export interface BatchToListInputs {
  batch?: Connectable<ImageRef>;
}

export interface BatchToListOutputs {
  output: ImageRef[];
}

export function batchToList(inputs: BatchToListInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<BatchToListOutputs, "output"> {
  return createNode("nodetool.image.BatchToList", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Images To List — nodetool.image.ImagesToList
export interface ImagesToListInputs {
}

export interface ImagesToListOutputs {
  output: ImageRef[];
}

export function imagesToList(inputs?: ImagesToListInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ImagesToListOutputs, "output"> {
  return createNode("nodetool.image.ImagesToList", (inputs ?? {}) as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Paste — nodetool.image.Paste
export interface PasteInputs {
  image?: Connectable<ImageRef>;
  paste?: Connectable<ImageRef>;
  left?: Connectable<number>;
  top?: Connectable<number>;
}

export interface PasteOutputs {
  output: ImageRef;
}

export function paste(inputs: PasteInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<PasteOutputs, "output"> {
  return createNode("nodetool.image.Paste", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Scale — nodetool.image.Scale
export interface ScaleInputs {
  image?: Connectable<ImageRef>;
  scale?: Connectable<number>;
}

export interface ScaleOutputs {
  output: ImageRef;
}

export function scale(inputs: ScaleInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ScaleOutputs, "output"> {
  return createNode("nodetool.image.Scale", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Resize — nodetool.image.Resize
export interface ResizeInputs {
  image?: Connectable<ImageRef>;
  width?: Connectable<number>;
  height?: Connectable<number>;
}

export interface ResizeOutputs {
  output: ImageRef;
}

export function resize(inputs: ResizeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ResizeOutputs, "output"> {
  return createNode("nodetool.image.Resize", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Crop — nodetool.image.Crop
export interface CropInputs {
  image?: Connectable<ImageRef>;
  left?: Connectable<number>;
  top?: Connectable<number>;
  right?: Connectable<number>;
  bottom?: Connectable<number>;
}

export interface CropOutputs {
  output: ImageRef;
}

export function crop(inputs: CropInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CropOutputs, "output"> {
  return createNode("nodetool.image.Crop", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Fit — nodetool.image.Fit
export interface FitInputs {
  image?: Connectable<ImageRef>;
  width?: Connectable<number>;
  height?: Connectable<number>;
}

export interface FitOutputs {
  output: ImageRef;
}

export function fit(inputs: FitInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FitOutputs, "output"> {
  return createNode("nodetool.image.Fit", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Rotate & Flip — nodetool.image.RotateAndFlip
export interface RotateAndFlipInputs {
  image?: Connectable<ImageRef>;
  angle?: Connectable<number>;
  flip_horizontal?: Connectable<boolean>;
  flip_vertical?: Connectable<boolean>;
}

export interface RotateAndFlipOutputs {
  output: ImageRef;
}

export function rotateAndFlip(inputs: RotateAndFlipInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RotateAndFlipOutputs, "output"> {
  return createNode("nodetool.image.RotateAndFlip", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Channels — nodetool.image.Channels
export interface ChannelsInputs {
  image?: Connectable<ImageRef>;
  channel?: Connectable<string>;
}

export interface ChannelsOutputs {
  output: ImageRef;
}

export function channels(inputs: ChannelsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ChannelsOutputs, "output"> {
  return createNode("nodetool.image.Channels", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Blur — nodetool.image.Blur
export interface BlurInputs {
  image?: Connectable<ImageRef>;
  blur_type?: Connectable<string>;
  size?: Connectable<number>;
}

export interface BlurOutputs {
  output: ImageRef;
}

export function blur(inputs: BlurInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<BlurOutputs, "output"> {
  return createNode("nodetool.image.Blur", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Text To Image — nodetool.image.TextToImage
export interface TextToImageInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  aspect_ratio?: Connectable<string>;
  resolution?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
}

export interface TextToImageOutputs {
  output: ImageRef;
}

export function textToImage(inputs: TextToImageInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TextToImageOutputs, "output"> {
  return createNode("nodetool.image.TextToImage", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Image To Image — nodetool.image.ImageToImage
export interface ImageToImageInputs {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  strength?: Connectable<number>;
  aspect_ratio?: Connectable<string>;
  resolution?: Connectable<string>;
  scheduler?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
}

export interface ImageToImageOutputs {
  output: ImageRef;
}

export function imageToImage(inputs: ImageToImageInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ImageToImageOutputs, "output"> {
  return createNode("nodetool.image.ImageToImage", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Image Editor — nodetool.image.ImageEditor
export interface ImageEditorInputs {
  sketch_data?: Connectable<string>;
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  layers?: Connectable<unknown[]>;
}

export interface ImageEditorOutputs {
  image: ImageRef;
  mask: ImageRef;
  layers: ImageRef[];
}

export function imageEditor(inputs: ImageEditorInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ImageEditorOutputs> {
  return createNode("nodetool.image.ImageEditor", inputs as Record<string, unknown>, { outputNames: ["image", "mask", "layers"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
