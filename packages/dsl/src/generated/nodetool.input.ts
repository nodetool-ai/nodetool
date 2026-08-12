// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef, VideoRef, DataframeRef, FolderRef } from "../types.js";

// Float Input — nodetool.input.FloatInput
export type FloatInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<number>;
  description?: Connectable<string>;
  min?: Connectable<number>;
  max?: Connectable<number>;
};

export interface FloatInputOutputs {
  output: number;
}

export function floatInput(inputs: FloatInputInputs): DslNode<FloatInputOutputs, "output"> {
  return createNode("nodetool.input.FloatInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Boolean Input — nodetool.input.BooleanInput
export type BooleanInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<boolean>;
  description?: Connectable<string>;
};

export interface BooleanInputOutputs {
  output: boolean;
}

export function booleanInput(inputs: BooleanInputInputs): DslNode<BooleanInputOutputs, "output"> {
  return createNode("nodetool.input.BooleanInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Integer Input — nodetool.input.IntegerInput
export type IntegerInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<number>;
  description?: Connectable<string>;
  min?: Connectable<number>;
  max?: Connectable<number>;
};

export interface IntegerInputOutputs {
  output: number;
}

export function integerInput(inputs: IntegerInputInputs): DslNode<IntegerInputOutputs, "output"> {
  return createNode("nodetool.input.IntegerInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// String Input — nodetool.input.StringInput
export type StringInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<string>;
  description?: Connectable<string>;
  max_length?: Connectable<number>;
  line_mode?: Connectable<string>;
};

export interface StringInputOutputs {
  output: string;
}

export function stringInput(inputs: StringInputInputs): DslNode<StringInputOutputs, "output"> {
  return createNode("nodetool.input.StringInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Select Input — nodetool.input.SelectInput
export type SelectInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<string>;
  description?: Connectable<string>;
  options?: Connectable<string[]>;
  enum_type_name?: Connectable<string>;
};

export interface SelectInputOutputs {
  output: string;
}

export function selectInput(inputs: SelectInputInputs): DslNode<SelectInputOutputs, "output"> {
  return createNode("nodetool.input.SelectInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// String List Input — nodetool.input.StringListInput
export type StringListInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<string[]>;
  description?: Connectable<string>;
};

export interface StringListInputOutputs {
  output: string[];
}

export function stringListInput(inputs: StringListInputInputs): DslNode<StringListInputOutputs, "output"> {
  return createNode("nodetool.input.StringListInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Folder Path Input — nodetool.input.FolderPathInput
export type FolderPathInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<string>;
  description?: Connectable<string>;
};

export interface FolderPathInputOutputs {
  output: string;
}

export function folderPathInput(inputs: FolderPathInputInputs): DslNode<FolderPathInputOutputs, "output"> {
  return createNode("nodetool.input.FolderPathInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Hugging Face Model Input — nodetool.input.HuggingFaceModelInput
export type HuggingFaceModelInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
};

export interface HuggingFaceModelInputOutputs {
  output: unknown;
}

export function huggingFaceModelInput(inputs: HuggingFaceModelInputInputs): DslNode<HuggingFaceModelInputOutputs, "output"> {
  return createNode("nodetool.input.HuggingFaceModelInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Color Input — nodetool.input.ColorInput
export type ColorInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
};

export interface ColorInputOutputs {
  output: unknown;
}

export function colorInput(inputs: ColorInputInputs): DslNode<ColorInputOutputs, "output"> {
  return createNode("nodetool.input.ColorInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Image Size Input — nodetool.input.ImageSizeInput
export type ImageSizeInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
};

export interface ImageSizeInputOutputs {
  output: unknown;
}

export function imageSizeInput(inputs: ImageSizeInputInputs): DslNode<ImageSizeInputOutputs, "output"> {
  return createNode("nodetool.input.ImageSizeInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Language Model Input — nodetool.input.LanguageModelInput
export type LanguageModelInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
};

export interface LanguageModelInputOutputs {
  output: unknown;
}

export function languageModelInput(inputs: LanguageModelInputInputs): DslNode<LanguageModelInputOutputs, "output"> {
  return createNode("nodetool.input.LanguageModelInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Image Model Input — nodetool.input.ImageModelInput
export type ImageModelInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
};

export interface ImageModelInputOutputs {
  output: unknown;
}

export function imageModelInput(inputs: ImageModelInputInputs): DslNode<ImageModelInputOutputs, "output"> {
  return createNode("nodetool.input.ImageModelInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Video Model Input — nodetool.input.VideoModelInput
export type VideoModelInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
};

export interface VideoModelInputOutputs {
  output: unknown;
}

export function videoModelInput(inputs: VideoModelInputInputs): DslNode<VideoModelInputOutputs, "output"> {
  return createNode("nodetool.input.VideoModelInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// TTS Model Input — nodetool.input.TTSModelInput
export type TTSModelInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
};

export interface TTSModelInputOutputs {
  output: unknown;
}

export function ttsModelInput(inputs: TTSModelInputInputs): DslNode<TTSModelInputOutputs, "output"> {
  return createNode("nodetool.input.TTSModelInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// ASR Model Input — nodetool.input.ASRModelInput
export type ASRModelInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
};

export interface ASRModelInputOutputs {
  output: unknown;
}

export function asrModelInput(inputs: ASRModelInputInputs): DslNode<ASRModelInputOutputs, "output"> {
  return createNode("nodetool.input.ASRModelInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Embedding Model Input — nodetool.input.EmbeddingModelInput
export type EmbeddingModelInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
};

export interface EmbeddingModelInputOutputs {
  output: unknown;
}

export function embeddingModelInput(inputs: EmbeddingModelInputInputs): DslNode<EmbeddingModelInputOutputs, "output"> {
  return createNode("nodetool.input.EmbeddingModelInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Dataframe Input — nodetool.input.DataframeInput
export type DataframeInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<DataframeRef>;
  description?: Connectable<string>;
};

export interface DataframeInputOutputs {
  output: DataframeRef;
}

export function dataframeInput(inputs: DataframeInputInputs): DslNode<DataframeInputOutputs, "output"> {
  return createNode("nodetool.input.DataframeInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Document Input — nodetool.input.DocumentInput
export type DocumentInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
};

export interface DocumentInputOutputs {
  output: unknown;
}

export function documentInput(inputs: DocumentInputInputs): DslNode<DocumentInputOutputs, "output"> {
  return createNode("nodetool.input.DocumentInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Image Input — nodetool.input.ImageInput
export type ImageInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<ImageRef>;
  description?: Connectable<string>;
};

export interface ImageInputOutputs {
  output: ImageRef;
}

export function imageInput(inputs: ImageInputInputs): DslNode<ImageInputOutputs, "output"> {
  return createNode("nodetool.input.ImageInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Image List Input — nodetool.input.ImageListInput
export type ImageListInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<ImageRef[]>;
  description?: Connectable<string>;
};

export interface ImageListInputOutputs {
  output: ImageRef[];
}

export function imageListInput(inputs: ImageListInputInputs): DslNode<ImageListInputOutputs, "output"> {
  return createNode("nodetool.input.ImageListInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Video List Input — nodetool.input.VideoListInput
export type VideoListInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<VideoRef[]>;
  description?: Connectable<string>;
};

export interface VideoListInputOutputs {
  output: VideoRef[];
}

export function videoListInput(inputs: VideoListInputInputs): DslNode<VideoListInputOutputs, "output"> {
  return createNode("nodetool.input.VideoListInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Audio List Input — nodetool.input.AudioListInput
export type AudioListInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<AudioRef[]>;
  description?: Connectable<string>;
};

export interface AudioListInputOutputs {
  output: AudioRef[];
}

export function audioListInput(inputs: AudioListInputInputs): DslNode<AudioListInputOutputs, "output"> {
  return createNode("nodetool.input.AudioListInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Text List Input — nodetool.input.TextListInput
export type TextListInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<string[]>;
  description?: Connectable<string>;
};

export interface TextListInputOutputs {
  output: string[];
}

export function textListInput(inputs: TextListInputInputs): DslNode<TextListInputOutputs, "output"> {
  return createNode("nodetool.input.TextListInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Video Input — nodetool.input.VideoInput
export type VideoInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<VideoRef>;
  description?: Connectable<string>;
};

export interface VideoInputOutputs {
  output: VideoRef;
}

export function videoInput(inputs: VideoInputInputs): DslNode<VideoInputOutputs, "output"> {
  return createNode("nodetool.input.VideoInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Audio Input — nodetool.input.AudioInput
export type AudioInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<AudioRef>;
  description?: Connectable<string>;
};

export interface AudioInputOutputs {
  output: AudioRef;
}

export function audioInput(inputs: AudioInputInputs): DslNode<AudioInputOutputs, "output"> {
  return createNode("nodetool.input.AudioInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Model 3D Input — nodetool.input.Model3DInput
export type Model3DInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
};

export interface Model3DInputOutputs {
  output: unknown;
}

export function model3DInput(inputs: Model3DInputInputs): DslNode<Model3DInputOutputs, "output"> {
  return createNode("nodetool.input.Model3DInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Realtime Audio Input — nodetool.input.RealtimeAudioInput
export type RealtimeAudioInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<AudioRef>;
  description?: Connectable<string>;
};

export interface RealtimeAudioInputOutputs {
  chunk: unknown;
}

export function realtimeAudioInput(inputs: RealtimeAudioInputInputs): DslNode<RealtimeAudioInputOutputs, "chunk"> {
  return createNode("nodetool.input.RealtimeAudioInput", inputs, { outputNames: ["chunk"], defaultOutput: "chunk", streaming: true });
}

// Asset Folder Input — nodetool.input.AssetFolderInput
export type AssetFolderInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<FolderRef>;
  description?: Connectable<string>;
};

export interface AssetFolderInputOutputs {
  output: FolderRef;
}

export function assetFolderInput(inputs: AssetFolderInputInputs): DslNode<AssetFolderInputOutputs, "output"> {
  return createNode("nodetool.input.AssetFolderInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// File Path Input — nodetool.input.FilePathInput
export type FilePathInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<string>;
  description?: Connectable<string>;
};

export interface FilePathInputOutputs {
  output: string;
}

export function filePathInput(inputs: FilePathInputInputs): DslNode<FilePathInputOutputs, "output"> {
  return createNode("nodetool.input.FilePathInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Document File Input — nodetool.input.DocumentFileInput
export type DocumentFileInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<string>;
  description?: Connectable<string>;
};

export interface DocumentFileInputOutputs {
  document: unknown;
  path: string;
}

export function documentFileInput(inputs: DocumentFileInputInputs): DslNode<DocumentFileInputOutputs> {
  return createNode("nodetool.input.DocumentFileInput", inputs, { outputNames: ["document", "path"] });
}

// Message Input — nodetool.input.MessageInput
export type MessageInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
};

export interface MessageInputOutputs {
  output: unknown;
}

export function messageInput(inputs: MessageInputInputs): DslNode<MessageInputOutputs, "output"> {
  return createNode("nodetool.input.MessageInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Message List Input — nodetool.input.MessageListInput
export type MessageListInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown[]>;
  description?: Connectable<string>;
};

export interface MessageListInputOutputs {
  output: unknown[];
}

export function messageListInput(inputs: MessageListInputInputs): DslNode<MessageListInputOutputs, "output"> {
  return createNode("nodetool.input.MessageListInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Message Deconstructor — nodetool.input.MessageDeconstructor
export type MessageDeconstructorInputs = {
  value?: Connectable<unknown>;
};

export interface MessageDeconstructorOutputs {
  id: string;
  thread_id: string;
  role: string;
  text: string;
  image: ImageRef;
  audio: AudioRef;
  model: unknown;
}

export function messageDeconstructor(inputs: MessageDeconstructorInputs): DslNode<MessageDeconstructorOutputs> {
  return createNode("nodetool.input.MessageDeconstructor", inputs, { outputNames: ["id", "thread_id", "role", "text", "image", "audio", "model"] });
}
