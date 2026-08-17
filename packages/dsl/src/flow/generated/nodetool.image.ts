// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";
import type { ImageRef, FolderRef } from "../../types.js";

// Paste — nodetool.image.Paste
export type PasteInputs = {
  image?: ImageRef;
  paste?: ImageRef;
  left?: number;
  top?: number;
};

export interface PasteOutputs {
  output: ImageRef;
}

export function paste(inputs: PasteInputs): Promise<PasteOutputs> {
  return callNode<PasteOutputs>("nodetool.image.Paste", inputs);
}

// Scale — nodetool.image.Scale
export type ScaleInputs = {
  image?: ImageRef;
  scale?: number;
};

export interface ScaleOutputs {
  output: ImageRef;
}

export function scale(inputs: ScaleInputs): Promise<ScaleOutputs> {
  return callNode<ScaleOutputs>("nodetool.image.Scale", inputs);
}

// Resize — nodetool.image.Resize
export type ResizeInputs = {
  image?: ImageRef;
  width?: number;
  height?: number;
};

export interface ResizeOutputs {
  output: ImageRef;
}

export function resize(inputs: ResizeInputs): Promise<ResizeOutputs> {
  return callNode<ResizeOutputs>("nodetool.image.Resize", inputs);
}

// Canvas Resize — nodetool.image.CanvasResize
export type CanvasResizeInputs = {
  image?: ImageRef;
  mode?: "fixed" | "scale" | "padding";
  anchor?: "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right";
  width?: number;
  height?: number;
  scale?: number;
  padding_unit?: "px" | "percent";
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  color?: unknown;
};

export interface CanvasResizeOutputs {
  output: ImageRef;
}

export function canvasResize(inputs: CanvasResizeInputs): Promise<CanvasResizeOutputs> {
  return callNode<CanvasResizeOutputs>("nodetool.image.CanvasResize", inputs);
}

// Crop — nodetool.image.Crop
export type CropInputs = {
  image?: ImageRef;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
};

export interface CropOutputs {
  output: ImageRef;
}

export function crop(inputs: CropInputs): Promise<CropOutputs> {
  return callNode<CropOutputs>("nodetool.image.Crop", inputs);
}

// Fit — nodetool.image.Fit
export type FitInputs = {
  image?: ImageRef;
  width?: number;
  height?: number;
};

export interface FitOutputs {
  output: ImageRef;
}

export function fit(inputs: FitInputs): Promise<FitOutputs> {
  return callNode<FitOutputs>("nodetool.image.Fit", inputs);
}

// Rotate & Flip — nodetool.image.RotateAndFlip
export type RotateAndFlipInputs = {
  image?: ImageRef;
  angle?: number;
  flip_horizontal?: boolean;
  flip_vertical?: boolean;
};

export interface RotateAndFlipOutputs {
  output: ImageRef;
}

export function rotateAndFlip(inputs: RotateAndFlipInputs): Promise<RotateAndFlipOutputs> {
  return callNode<RotateAndFlipOutputs>("nodetool.image.RotateAndFlip", inputs);
}

// Channels — nodetool.image.Channels
export type ChannelsInputs = {
  image?: ImageRef;
  channel?: string;
};

export interface ChannelsOutputs {
  output: ImageRef;
}

export function channels(inputs: ChannelsInputs): Promise<ChannelsOutputs> {
  return callNode<ChannelsOutputs>("nodetool.image.Channels", inputs);
}

// Blur — nodetool.image.Blur
export type BlurInputs = {
  image?: ImageRef;
  blur_type?: string;
  size?: number;
};

export interface BlurOutputs {
  output: ImageRef;
}

export function blur(inputs: BlurInputs): Promise<BlurOutputs> {
  return callNode<BlurOutputs>("nodetool.image.Blur", inputs);
}

// Levels — nodetool.image.Levels
export type LevelsInputs = {
  image?: ImageRef;
  r_black?: number;
  r_gamma?: number;
  r_white?: number;
  g_black?: number;
  g_gamma?: number;
  g_white?: number;
  b_black?: number;
  b_gamma?: number;
  b_white?: number;
};

export interface LevelsOutputs {
  output: ImageRef;
}

export function levels(inputs: LevelsInputs): Promise<LevelsOutputs> {
  return callNode<LevelsOutputs>("nodetool.image.Levels", inputs);
}

// Compositor — nodetool.image.Compositor
export type CompositorInputs = {
  layers?: unknown[];
  canvas_width?: number;
  canvas_height?: number;
};

export interface CompositorOutputs {
  output: ImageRef;
}

export function compositor(inputs: CompositorInputs): Promise<CompositorOutputs> {
  return callNode<CompositorOutputs>("nodetool.image.Compositor", inputs);
}

// Load Image File — nodetool.image.LoadImageFile
export type LoadImageFileInputs = {
  path?: string;
};

export interface LoadImageFileOutputs {
  output: ImageRef;
}

export function loadImageFile(inputs: LoadImageFileInputs): Promise<LoadImageFileOutputs> {
  return callNode<LoadImageFileOutputs>("nodetool.image.LoadImageFile", inputs);
}

// Load Image Folder — nodetool.image.LoadImageFolder
export type LoadImageFolderInputs = {
  folder?: string;
  include_subdirectories?: boolean;
  extensions?: string[];
  pattern?: string;
};

export interface LoadImageFolderOutputs {
  image: ImageRef;
  path: string;
  images: unknown[];
}

export function loadImageFolder(inputs: LoadImageFolderInputs): Promise<LoadImageFolderOutputs> {
  return callNode<LoadImageFolderOutputs>("nodetool.image.LoadImageFolder", inputs);
}

loadImageFolder.stream = function (inputs: LoadImageFolderInputs): AsyncIterable<Partial<LoadImageFolderOutputs>> {
  return streamNode<Partial<LoadImageFolderOutputs>>("nodetool.image.LoadImageFolder", inputs);
};

// Save Image File — nodetool.image.SaveImageFile
export type SaveImageFileInputs = {
  image?: ImageRef;
  folder?: string;
  filename?: string;
  overwrite?: boolean;
};

export interface SaveImageFileOutputs {
  output: ImageRef;
  path: string;
}

export function saveImageFile(inputs: SaveImageFileInputs): Promise<SaveImageFileOutputs> {
  return callNode<SaveImageFileOutputs>("nodetool.image.SaveImageFile", inputs);
}

// Load Image Assets — nodetool.image.LoadImageAssets
export type LoadImageAssetsInputs = {
  folder?: FolderRef;
};

export interface LoadImageAssetsOutputs {
  image: ImageRef;
  name: string;
  images: unknown[];
}

export function loadImageAssets(inputs: LoadImageAssetsInputs): Promise<LoadImageAssetsOutputs> {
  return callNode<LoadImageAssetsOutputs>("nodetool.image.LoadImageAssets", inputs);
}

loadImageAssets.stream = function (inputs: LoadImageAssetsInputs): AsyncIterable<Partial<LoadImageAssetsOutputs>> {
  return streamNode<Partial<LoadImageAssetsOutputs>>("nodetool.image.LoadImageAssets", inputs);
};

// Save Image Asset — nodetool.image.SaveImage
export type SaveImageInputs = {
  image?: ImageRef;
  folder?: FolderRef;
  name?: string;
};

export interface SaveImageOutputs {
  output: ImageRef;
}

export function saveImage(inputs: SaveImageInputs): Promise<SaveImageOutputs> {
  return callNode<SaveImageOutputs>("nodetool.image.SaveImage", inputs);
}

// Get Metadata — nodetool.image.GetMetadata
export type GetMetadataInputs = {
  image?: ImageRef;
};

export interface GetMetadataOutputs {
  format: string;
  mode: string;
  width: number;
  height: number;
  channels: number;
}

export function getMetadata(inputs: GetMetadataInputs): Promise<GetMetadataOutputs> {
  return callNode<GetMetadataOutputs>("nodetool.image.GetMetadata", inputs);
}

// Batch To List — nodetool.image.BatchToList
export type BatchToListInputs = {
  batch?: ImageRef;
};

export interface BatchToListOutputs {
  output: ImageRef[];
}

export function batchToList(inputs: BatchToListInputs): Promise<BatchToListOutputs> {
  return callNode<BatchToListOutputs>("nodetool.image.BatchToList", inputs);
}

// Images To List — nodetool.image.ImagesToList
export type ImagesToListInputs = {
};

export interface ImagesToListOutputs {
  output: ImageRef[];
}

export function imagesToList(inputs?: ImagesToListInputs): Promise<ImagesToListOutputs> {
  return callNode<ImagesToListOutputs>("nodetool.image.ImagesToList", inputs ?? {});
}

// Painter — nodetool.image.Painter
export type PainterInputs = {
  image?: ImageRef;
  mask_data?: string;
  canvas_width?: number;
  canvas_height?: number;
};

export interface PainterOutputs {
  mask: ImageRef;
  image: ImageRef;
}

export function painter(inputs: PainterInputs): Promise<PainterOutputs> {
  return callNode<PainterOutputs>("nodetool.image.Painter", inputs);
}

// Text To Image — nodetool.image.TextToImage
export type TextToImageInputs = {
  model?: unknown;
  prompt?: string;
  negative_prompt?: string;
  entities?: Record<string, unknown>[];
  aspect_ratio?: string;
  resolution?: string;
};

export interface TextToImageOutputs {
  output: ImageRef;
}

export function textToImage(inputs: TextToImageInputs): Promise<TextToImageOutputs> {
  return callNode<TextToImageOutputs>("nodetool.image.TextToImage", inputs);
}

// Image To Image — nodetool.image.ImageToImage
export type ImageToImageInputs = {
  model?: unknown;
  image?: ImageRef[];
  prompt?: string;
  negative_prompt?: string;
  entities?: Record<string, unknown>[];
  strength?: number;
  aspect_ratio?: string;
  resolution?: string;
  scheduler?: string;
};

export interface ImageToImageOutputs {
  output: ImageRef;
}

export function imageToImage(inputs: ImageToImageInputs): Promise<ImageToImageOutputs> {
  return callNode<ImageToImageOutputs>("nodetool.image.ImageToImage", inputs);
}

// Upscale Image — nodetool.image.Upscale
export type UpscaleInputs = {
  model?: unknown;
  image?: ImageRef;
  scale?: number;
  prompt?: string;
};

export interface UpscaleOutputs {
  output: ImageRef;
}

export function upscale(inputs: UpscaleInputs): Promise<UpscaleOutputs> {
  return callNode<UpscaleOutputs>("nodetool.image.Upscale", inputs);
}

// Remove Background — nodetool.image.RemoveBackground
export type RemoveBackgroundInputs = {
  model?: unknown;
  image?: ImageRef;
};

export interface RemoveBackgroundOutputs {
  output: ImageRef;
}

export function removeBackground(inputs: RemoveBackgroundInputs): Promise<RemoveBackgroundOutputs> {
  return callNode<RemoveBackgroundOutputs>("nodetool.image.RemoveBackground", inputs);
}

// Relight Image — nodetool.image.Relight
export type RelightInputs = {
  model?: unknown;
  image?: ImageRef;
  prompt?: string;
  negative_prompt?: string;
};

export interface RelightOutputs {
  output: ImageRef;
}

export function relight(inputs: RelightInputs): Promise<RelightOutputs> {
  return callNode<RelightOutputs>("nodetool.image.Relight", inputs);
}

// Vectorize Image — nodetool.image.Vectorize
export type VectorizeInputs = {
  model?: unknown;
  image?: ImageRef;
};

export interface VectorizeOutputs {
  output: unknown;
}

export function vectorize(inputs: VectorizeInputs): Promise<VectorizeOutputs> {
  return callNode<VectorizeOutputs>("nodetool.image.Vectorize", inputs);
}
