// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef, AudioRef, VideoRef, DataframeRef, FolderRef } from "../types.js";

// Value Input — nodetool.input.ValueInput
export type ValueInputInputs = {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
};

export interface ValueInputOutputs {
  output: unknown;
}

export function valueInput(inputs: ValueInputInputs, options?: NodeOptions): NodeWithOutputs<ValueInputOutputs, "output"> {
  return createNode("nodetool.input.ValueInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"any"}, defaultOutput: "output" });
}

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

export function floatInput(inputs: FloatInputInputs, options?: NodeOptions): NodeWithOutputs<FloatInputOutputs, "output"> {
  return createNode("nodetool.input.FloatInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"float"}, defaultOutput: "output" });
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

export function booleanInput(inputs: BooleanInputInputs, options?: NodeOptions): NodeWithOutputs<BooleanInputOutputs, "output"> {
  return createNode("nodetool.input.BooleanInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"bool"}, defaultOutput: "output" });
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

export function integerInput(inputs: IntegerInputInputs, options?: NodeOptions): NodeWithOutputs<IntegerInputOutputs, "output"> {
  return createNode("nodetool.input.IntegerInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"int"}, defaultOutput: "output" });
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

export function stringInput(inputs: StringInputInputs, options?: NodeOptions): NodeWithOutputs<StringInputOutputs, "output"> {
  return createNode("nodetool.input.StringInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
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

export function selectInput(inputs: SelectInputInputs, options?: NodeOptions): NodeWithOutputs<SelectInputOutputs, "output"> {
  return createNode("nodetool.input.SelectInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
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

export function stringListInput(inputs: StringListInputInputs, options?: NodeOptions): NodeWithOutputs<StringListInputOutputs, "output"> {
  return createNode("nodetool.input.StringListInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[str]"}, defaultOutput: "output" });
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

export function folderPathInput(inputs: FolderPathInputInputs, options?: NodeOptions): NodeWithOutputs<FolderPathInputOutputs, "output"> {
  return createNode("nodetool.input.FolderPathInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
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

export function huggingFaceModelInput(inputs: HuggingFaceModelInputInputs, options?: NodeOptions): NodeWithOutputs<HuggingFaceModelInputOutputs, "output"> {
  return createNode("nodetool.input.HuggingFaceModelInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"hf.model"}, defaultOutput: "output" });
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

export function colorInput(inputs: ColorInputInputs, options?: NodeOptions): NodeWithOutputs<ColorInputOutputs, "output"> {
  return createNode("nodetool.input.ColorInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"color"}, defaultOutput: "output" });
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

export function imageSizeInput(inputs: ImageSizeInputInputs, options?: NodeOptions): NodeWithOutputs<ImageSizeInputOutputs, "output"> {
  return createNode("nodetool.input.ImageSizeInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image_size"}, defaultOutput: "output" });
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

export function languageModelInput(inputs: LanguageModelInputInputs, options?: NodeOptions): NodeWithOutputs<LanguageModelInputOutputs, "output"> {
  return createNode("nodetool.input.LanguageModelInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"language_model"}, defaultOutput: "output" });
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

export function imageModelInput(inputs: ImageModelInputInputs, options?: NodeOptions): NodeWithOutputs<ImageModelInputOutputs, "output"> {
  return createNode("nodetool.input.ImageModelInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image_model"}, defaultOutput: "output" });
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

export function videoModelInput(inputs: VideoModelInputInputs, options?: NodeOptions): NodeWithOutputs<VideoModelInputOutputs, "output"> {
  return createNode("nodetool.input.VideoModelInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video_model"}, defaultOutput: "output" });
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

export function ttsModelInput(inputs: TTSModelInputInputs, options?: NodeOptions): NodeWithOutputs<TTSModelInputOutputs, "output"> {
  return createNode("nodetool.input.TTSModelInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"tts_model"}, defaultOutput: "output" });
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

export function asrModelInput(inputs: ASRModelInputInputs, options?: NodeOptions): NodeWithOutputs<ASRModelInputOutputs, "output"> {
  return createNode("nodetool.input.ASRModelInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"asr_model"}, defaultOutput: "output" });
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

export function embeddingModelInput(inputs: EmbeddingModelInputInputs, options?: NodeOptions): NodeWithOutputs<EmbeddingModelInputOutputs, "output"> {
  return createNode("nodetool.input.EmbeddingModelInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"embedding_model"}, defaultOutput: "output" });
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

export function dataframeInput(inputs: DataframeInputInputs, options?: NodeOptions): NodeWithOutputs<DataframeInputOutputs, "output"> {
  return createNode("nodetool.input.DataframeInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"dataframe"}, defaultOutput: "output" });
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

export function documentInput(inputs: DocumentInputInputs, options?: NodeOptions): NodeWithOutputs<DocumentInputOutputs, "output"> {
  return createNode("nodetool.input.DocumentInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"document"}, defaultOutput: "output" });
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

export function imageInput(inputs: ImageInputInputs, options?: NodeOptions): NodeWithOutputs<ImageInputOutputs, "output"> {
  return createNode("nodetool.input.ImageInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
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

export function imageListInput(inputs: ImageListInputInputs, options?: NodeOptions): NodeWithOutputs<ImageListInputOutputs, "output"> {
  return createNode("nodetool.input.ImageListInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[image]"}, defaultOutput: "output" });
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

export function videoListInput(inputs: VideoListInputInputs, options?: NodeOptions): NodeWithOutputs<VideoListInputOutputs, "output"> {
  return createNode("nodetool.input.VideoListInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[video]"}, defaultOutput: "output" });
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

export function audioListInput(inputs: AudioListInputInputs, options?: NodeOptions): NodeWithOutputs<AudioListInputOutputs, "output"> {
  return createNode("nodetool.input.AudioListInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[audio]"}, defaultOutput: "output" });
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

export function textListInput(inputs: TextListInputInputs, options?: NodeOptions): NodeWithOutputs<TextListInputOutputs, "output"> {
  return createNode("nodetool.input.TextListInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[str]"}, defaultOutput: "output" });
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

export function videoInput(inputs: VideoInputInputs, options?: NodeOptions): NodeWithOutputs<VideoInputOutputs, "output"> {
  return createNode("nodetool.input.VideoInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
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

export function audioInput(inputs: AudioInputInputs, options?: NodeOptions): NodeWithOutputs<AudioInputOutputs, "output"> {
  return createNode("nodetool.input.AudioInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
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

export function model3DInput(inputs: Model3DInputInputs, options?: NodeOptions): NodeWithOutputs<Model3DInputOutputs, "output"> {
  return createNode("nodetool.input.Model3DInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
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

export function realtimeAudioInput(inputs: RealtimeAudioInputInputs, options?: NodeOptions): NodeWithOutputs<RealtimeAudioInputOutputs, "chunk"> {
  return createNode("nodetool.input.RealtimeAudioInput", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: {"chunk":"chunk"}, defaultOutput: "chunk", streaming: true, inputMode: "buffered", outputCorrelation: {"chunk":{"kind":"chunk","source":"__execution__"}} });
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

export function assetFolderInput(inputs: AssetFolderInputInputs, options?: NodeOptions): NodeWithOutputs<AssetFolderInputOutputs, "output"> {
  return createNode("nodetool.input.AssetFolderInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"folder"}, defaultOutput: "output" });
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

export function filePathInput(inputs: FilePathInputInputs, options?: NodeOptions): NodeWithOutputs<FilePathInputOutputs, "output"> {
  return createNode("nodetool.input.FilePathInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
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

export function documentFileInput(inputs: DocumentFileInputInputs, options?: NodeOptions): NodeWithOutputs<DocumentFileInputOutputs> {
  return createNode("nodetool.input.DocumentFileInput", inputs, { id: options?.id, outputNames: ["document", "path"], outputTypes: {"document":"document","path":"str"} });
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

export function messageInput(inputs: MessageInputInputs, options?: NodeOptions): NodeWithOutputs<MessageInputOutputs, "output"> {
  return createNode("nodetool.input.MessageInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"message"}, defaultOutput: "output" });
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

export function messageListInput(inputs: MessageListInputInputs, options?: NodeOptions): NodeWithOutputs<MessageListInputOutputs, "output"> {
  return createNode("nodetool.input.MessageListInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[message]"}, defaultOutput: "output" });
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

export function messageDeconstructor(inputs: MessageDeconstructorInputs, options?: NodeOptions): NodeWithOutputs<MessageDeconstructorOutputs> {
  return createNode("nodetool.input.MessageDeconstructor", inputs, { id: options?.id, outputNames: ["id", "thread_id", "role", "text", "image", "audio", "model"], outputTypes: {"id":"str","thread_id":"str","role":"str","text":"str","image":"image","audio":"audio","model":"language_model"} });
}
