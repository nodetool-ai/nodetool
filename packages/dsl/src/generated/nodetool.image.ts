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

export function loadImageFile(
  inputs: LoadImageFileInputs
): DslNode<LoadImageFileOutputs, "output"> {
  return createNode(
    "nodetool.image.LoadImageFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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
}

export function loadImageFolder(
  inputs: LoadImageFolderInputs
): DslNode<LoadImageFolderOutputs> {
  return createNode(
    "nodetool.image.LoadImageFolder",
    inputs as Record<string, unknown>,
    { outputNames: ["image", "path"], streaming: true }
  );
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

export function saveImageFile(
  inputs: SaveImageFileInputs
): DslNode<SaveImageFileOutputs, "output"> {
  return createNode(
    "nodetool.image.SaveImageFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Load Image Assets — nodetool.image.LoadImageAssets
export interface LoadImageAssetsInputs {
  folder?: Connectable<FolderRef>;
}

export interface LoadImageAssetsOutputs {
  image: ImageRef;
  name: string;
}

export function loadImageAssets(
  inputs: LoadImageAssetsInputs
): DslNode<LoadImageAssetsOutputs> {
  return createNode(
    "nodetool.image.LoadImageAssets",
    inputs as Record<string, unknown>,
    { outputNames: ["image", "name"], streaming: true }
  );
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

export function saveImage(
  inputs: SaveImageInputs
): DslNode<SaveImageOutputs, "output"> {
  return createNode(
    "nodetool.image.SaveImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function getMetadata(
  inputs: GetMetadataInputs
): DslNode<GetMetadataOutputs> {
  return createNode(
    "nodetool.image.GetMetadata",
    inputs as Record<string, unknown>,
    { outputNames: ["format", "mode", "width", "height", "channels"] }
  );
}

// Batch To List — nodetool.image.BatchToList
export interface BatchToListInputs {
  batch?: Connectable<ImageRef>;
}

export interface BatchToListOutputs {
  output: ImageRef[];
}

export function batchToList(
  inputs: BatchToListInputs
): DslNode<BatchToListOutputs, "output"> {
  return createNode(
    "nodetool.image.BatchToList",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Images To List — nodetool.image.ImagesToList
export interface ImagesToListInputs {}

export interface ImagesToListOutputs {
  output: ImageRef[];
}

export function imagesToList(
  inputs?: ImagesToListInputs
): DslNode<ImagesToListOutputs, "output"> {
  return createNode(
    "nodetool.image.ImagesToList",
    (inputs ?? {}) as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function paste(inputs: PasteInputs): DslNode<PasteOutputs, "output"> {
  return createNode("nodetool.image.Paste", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Scale — nodetool.image.Scale
export interface ScaleInputs {
  image?: Connectable<ImageRef>;
  scale?: Connectable<number>;
}

export interface ScaleOutputs {
  output: ImageRef;
}

export function scale(inputs: ScaleInputs): DslNode<ScaleOutputs, "output"> {
  return createNode("nodetool.image.Scale", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
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

export function resize(inputs: ResizeInputs): DslNode<ResizeOutputs, "output"> {
  return createNode(
    "nodetool.image.Resize",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function crop(inputs: CropInputs): DslNode<CropOutputs, "output"> {
  return createNode("nodetool.image.Crop", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
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

export function fit(inputs: FitInputs): DslNode<FitOutputs, "output"> {
  return createNode("nodetool.image.Fit", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
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

export interface TextToImageOutputs {
  output: ImageRef;
}

export function textToImage(
  inputs: TextToImageInputs
): DslNode<TextToImageOutputs, "output"> {
  return createNode(
    "nodetool.image.TextToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export interface ImageToImageOutputs {
  output: ImageRef;
}

export function imageToImage(
  inputs: ImageToImageInputs
): DslNode<ImageToImageOutputs, "output"> {
  return createNode(
    "nodetool.image.ImageToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
