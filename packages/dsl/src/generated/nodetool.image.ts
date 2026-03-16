// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";
import type { ImageRef, FolderRef } from "../types.js";

// Load Image File — nodetool.image.LoadImageFile
export interface LoadImageFileInputs {
  path?: Connectable<string>;
}

export function loadImageFile(inputs: LoadImageFileInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("nodetool.image.LoadImageFile", inputs as Record<string, unknown>);
}

// Load Image Folder — nodetool.image.LoadImageFolder
export interface LoadImageFolderInputs {
  folder?: Connectable<string>;
  include_subdirectories?: Connectable<boolean>;
  extensions?: Connectable<string[]>;
  pattern?: Connectable<string>;
}

export interface LoadImageFolderOutputs {
  image: OutputHandle<ImageRef>;
  path: OutputHandle<string>;
}

export function loadImageFolder(inputs: LoadImageFolderInputs): DslNode<LoadImageFolderOutputs> {
  return createNode("nodetool.image.LoadImageFolder", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Save Image File — nodetool.image.SaveImageFile
export interface SaveImageFileInputs {
  image?: Connectable<ImageRef>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
  overwrite?: Connectable<boolean>;
}

export function saveImageFile(inputs: SaveImageFileInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("nodetool.image.SaveImageFile", inputs as Record<string, unknown>);
}

// Load Image Assets — nodetool.image.LoadImageAssets
export interface LoadImageAssetsInputs {
  folder?: Connectable<FolderRef>;
}

export interface LoadImageAssetsOutputs {
  image: OutputHandle<ImageRef>;
  name: OutputHandle<string>;
}

export function loadImageAssets(inputs: LoadImageAssetsInputs): DslNode<LoadImageAssetsOutputs> {
  return createNode("nodetool.image.LoadImageAssets", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Save Image Asset — nodetool.image.SaveImage
export interface SaveImageInputs {
  image?: Connectable<ImageRef>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
}

export function saveImage(inputs: SaveImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("nodetool.image.SaveImage", inputs as Record<string, unknown>);
}

// Get Metadata — nodetool.image.GetMetadata
export interface GetMetadataInputs {
  image?: Connectable<ImageRef>;
}

export interface GetMetadataOutputs {
  format: OutputHandle<string>;
  mode: OutputHandle<string>;
  width: OutputHandle<number>;
  height: OutputHandle<number>;
  channels: OutputHandle<number>;
}

export function getMetadata(inputs: GetMetadataInputs): DslNode<GetMetadataOutputs> {
  return createNode("nodetool.image.GetMetadata", inputs as Record<string, unknown>, { multiOutput: true });
}

// Batch To List — nodetool.image.BatchToList
export interface BatchToListInputs {
  batch?: Connectable<ImageRef>;
}

export function batchToList(inputs: BatchToListInputs): DslNode<SingleOutput<ImageRef[]>> {
  return createNode("nodetool.image.BatchToList", inputs as Record<string, unknown>);
}

// Images To List — nodetool.image.ImagesToList
export interface ImagesToListInputs {
}

export function imagesToList(inputs?: ImagesToListInputs): DslNode<SingleOutput<ImageRef[]>> {
  return createNode("nodetool.image.ImagesToList", (inputs ?? {}) as Record<string, unknown>);
}

// Paste — nodetool.image.Paste
export interface PasteInputs {
  image?: Connectable<ImageRef>;
  paste?: Connectable<ImageRef>;
  left?: Connectable<number>;
  top?: Connectable<number>;
}

export function paste(inputs: PasteInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("nodetool.image.Paste", inputs as Record<string, unknown>);
}

// Scale — nodetool.image.Scale
export interface ScaleInputs {
  image?: Connectable<ImageRef>;
  scale?: Connectable<number>;
}

export function scale(inputs: ScaleInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("nodetool.image.Scale", inputs as Record<string, unknown>);
}

// Resize — nodetool.image.Resize
export interface ResizeInputs {
  image?: Connectable<ImageRef>;
  width?: Connectable<number>;
  height?: Connectable<number>;
}

export function resize(inputs: ResizeInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("nodetool.image.Resize", inputs as Record<string, unknown>);
}

// Crop — nodetool.image.Crop
export interface CropInputs {
  image?: Connectable<ImageRef>;
  left?: Connectable<number>;
  top?: Connectable<number>;
  right?: Connectable<number>;
  bottom?: Connectable<number>;
}

export function crop(inputs: CropInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("nodetool.image.Crop", inputs as Record<string, unknown>);
}

// Fit — nodetool.image.Fit
export interface FitInputs {
  image?: Connectable<ImageRef>;
  width?: Connectable<number>;
  height?: Connectable<number>;
}

export function fit(inputs: FitInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("nodetool.image.Fit", inputs as Record<string, unknown>);
}

// Text To Image — nodetool.image.TextToImage
export interface TextToImageInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  guidance_scale?: Connectable<number>;
  num_inference_steps?: Connectable<number>;
  seed?: Connectable<number>;
  safety_check?: Connectable<boolean>;
  timeout_seconds?: Connectable<number>;
}

export function textToImage(inputs: TextToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("nodetool.image.TextToImage", inputs as Record<string, unknown>);
}

// Image To Image — nodetool.image.ImageToImage
export interface ImageToImageInputs {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  strength?: Connectable<number>;
  guidance_scale?: Connectable<number>;
  num_inference_steps?: Connectable<number>;
  target_width?: Connectable<number>;
  target_height?: Connectable<number>;
  seed?: Connectable<number>;
  scheduler?: Connectable<string>;
  safety_check?: Connectable<boolean>;
  timeout_seconds?: Connectable<number>;
}

export function imageToImage(inputs: ImageToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("nodetool.image.ImageToImage", inputs as Record<string, unknown>);
}
