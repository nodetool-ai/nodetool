// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";
import type { ImageRef, AudioRef, VideoRef, DataframeRef, FolderRef } from "../../types.js";

// Float Input — nodetool.input.FloatInput
export type FloatInputInputs = {
  name?: string;
  value?: number;
  description?: string;
  min?: number;
  max?: number;
};

export interface FloatInputOutputs {
  output: number;
}

export function floatInput(inputs: FloatInputInputs): Promise<FloatInputOutputs> {
  return callNode<FloatInputOutputs>("nodetool.input.FloatInput", inputs);
}

// Boolean Input — nodetool.input.BooleanInput
export type BooleanInputInputs = {
  name?: string;
  value?: boolean;
  description?: string;
};

export interface BooleanInputOutputs {
  output: boolean;
}

export function booleanInput(inputs: BooleanInputInputs): Promise<BooleanInputOutputs> {
  return callNode<BooleanInputOutputs>("nodetool.input.BooleanInput", inputs);
}

// Integer Input — nodetool.input.IntegerInput
export type IntegerInputInputs = {
  name?: string;
  value?: number;
  description?: string;
  min?: number;
  max?: number;
};

export interface IntegerInputOutputs {
  output: number;
}

export function integerInput(inputs: IntegerInputInputs): Promise<IntegerInputOutputs> {
  return callNode<IntegerInputOutputs>("nodetool.input.IntegerInput", inputs);
}

// String Input — nodetool.input.StringInput
export type StringInputInputs = {
  name?: string;
  value?: string;
  description?: string;
  max_length?: number;
  line_mode?: string;
};

export interface StringInputOutputs {
  output: string;
}

export function stringInput(inputs: StringInputInputs): Promise<StringInputOutputs> {
  return callNode<StringInputOutputs>("nodetool.input.StringInput", inputs);
}

// Select Input — nodetool.input.SelectInput
export type SelectInputInputs = {
  name?: string;
  value?: string;
  description?: string;
  options?: string[];
  enum_type_name?: string;
};

export interface SelectInputOutputs {
  output: string;
}

export function selectInput(inputs: SelectInputInputs): Promise<SelectInputOutputs> {
  return callNode<SelectInputOutputs>("nodetool.input.SelectInput", inputs);
}

// String List Input — nodetool.input.StringListInput
export type StringListInputInputs = {
  name?: string;
  value?: string[];
  description?: string;
};

export interface StringListInputOutputs {
  output: string[];
}

export function stringListInput(inputs: StringListInputInputs): Promise<StringListInputOutputs> {
  return callNode<StringListInputOutputs>("nodetool.input.StringListInput", inputs);
}

// Folder Path Input — nodetool.input.FolderPathInput
export type FolderPathInputInputs = {
  name?: string;
  value?: string;
  description?: string;
};

export interface FolderPathInputOutputs {
  output: string;
}

export function folderPathInput(inputs: FolderPathInputInputs): Promise<FolderPathInputOutputs> {
  return callNode<FolderPathInputOutputs>("nodetool.input.FolderPathInput", inputs);
}

// Hugging Face Model Input — nodetool.input.HuggingFaceModelInput
export type HuggingFaceModelInputInputs = {
  name?: string;
  value?: unknown;
  description?: string;
};

export interface HuggingFaceModelInputOutputs {
  output: unknown;
}

export function huggingFaceModelInput(inputs: HuggingFaceModelInputInputs): Promise<HuggingFaceModelInputOutputs> {
  return callNode<HuggingFaceModelInputOutputs>("nodetool.input.HuggingFaceModelInput", inputs);
}

// Color Input — nodetool.input.ColorInput
export type ColorInputInputs = {
  name?: string;
  value?: unknown;
  description?: string;
};

export interface ColorInputOutputs {
  output: unknown;
}

export function colorInput(inputs: ColorInputInputs): Promise<ColorInputOutputs> {
  return callNode<ColorInputOutputs>("nodetool.input.ColorInput", inputs);
}

// Image Size Input — nodetool.input.ImageSizeInput
export type ImageSizeInputInputs = {
  name?: string;
  value?: unknown;
  description?: string;
};

export interface ImageSizeInputOutputs {
  output: unknown;
}

export function imageSizeInput(inputs: ImageSizeInputInputs): Promise<ImageSizeInputOutputs> {
  return callNode<ImageSizeInputOutputs>("nodetool.input.ImageSizeInput", inputs);
}

// Language Model Input — nodetool.input.LanguageModelInput
export type LanguageModelInputInputs = {
  name?: string;
  value?: unknown;
  description?: string;
};

export interface LanguageModelInputOutputs {
  output: unknown;
}

export function languageModelInput(inputs: LanguageModelInputInputs): Promise<LanguageModelInputOutputs> {
  return callNode<LanguageModelInputOutputs>("nodetool.input.LanguageModelInput", inputs);
}

// Image Model Input — nodetool.input.ImageModelInput
export type ImageModelInputInputs = {
  name?: string;
  value?: unknown;
  description?: string;
};

export interface ImageModelInputOutputs {
  output: unknown;
}

export function imageModelInput(inputs: ImageModelInputInputs): Promise<ImageModelInputOutputs> {
  return callNode<ImageModelInputOutputs>("nodetool.input.ImageModelInput", inputs);
}

// Video Model Input — nodetool.input.VideoModelInput
export type VideoModelInputInputs = {
  name?: string;
  value?: unknown;
  description?: string;
};

export interface VideoModelInputOutputs {
  output: unknown;
}

export function videoModelInput(inputs: VideoModelInputInputs): Promise<VideoModelInputOutputs> {
  return callNode<VideoModelInputOutputs>("nodetool.input.VideoModelInput", inputs);
}

// TTS Model Input — nodetool.input.TTSModelInput
export type TTSModelInputInputs = {
  name?: string;
  value?: unknown;
  description?: string;
};

export interface TTSModelInputOutputs {
  output: unknown;
}

export function ttsModelInput(inputs: TTSModelInputInputs): Promise<TTSModelInputOutputs> {
  return callNode<TTSModelInputOutputs>("nodetool.input.TTSModelInput", inputs);
}

// ASR Model Input — nodetool.input.ASRModelInput
export type ASRModelInputInputs = {
  name?: string;
  value?: unknown;
  description?: string;
};

export interface ASRModelInputOutputs {
  output: unknown;
}

export function asrModelInput(inputs: ASRModelInputInputs): Promise<ASRModelInputOutputs> {
  return callNode<ASRModelInputOutputs>("nodetool.input.ASRModelInput", inputs);
}

// Embedding Model Input — nodetool.input.EmbeddingModelInput
export type EmbeddingModelInputInputs = {
  name?: string;
  value?: unknown;
  description?: string;
};

export interface EmbeddingModelInputOutputs {
  output: unknown;
}

export function embeddingModelInput(inputs: EmbeddingModelInputInputs): Promise<EmbeddingModelInputOutputs> {
  return callNode<EmbeddingModelInputOutputs>("nodetool.input.EmbeddingModelInput", inputs);
}

// Dataframe Input — nodetool.input.DataframeInput
export type DataframeInputInputs = {
  name?: string;
  value?: DataframeRef;
  description?: string;
};

export interface DataframeInputOutputs {
  output: DataframeRef;
}

export function dataframeInput(inputs: DataframeInputInputs): Promise<DataframeInputOutputs> {
  return callNode<DataframeInputOutputs>("nodetool.input.DataframeInput", inputs);
}

// Document Input — nodetool.input.DocumentInput
export type DocumentInputInputs = {
  name?: string;
  value?: unknown;
  description?: string;
};

export interface DocumentInputOutputs {
  output: unknown;
}

export function documentInput(inputs: DocumentInputInputs): Promise<DocumentInputOutputs> {
  return callNode<DocumentInputOutputs>("nodetool.input.DocumentInput", inputs);
}

// Image Input — nodetool.input.ImageInput
export type ImageInputInputs = {
  name?: string;
  value?: ImageRef;
  description?: string;
};

export interface ImageInputOutputs {
  output: ImageRef;
}

export function imageInput(inputs: ImageInputInputs): Promise<ImageInputOutputs> {
  return callNode<ImageInputOutputs>("nodetool.input.ImageInput", inputs);
}

// Image List Input — nodetool.input.ImageListInput
export type ImageListInputInputs = {
  name?: string;
  value?: ImageRef[];
  description?: string;
};

export interface ImageListInputOutputs {
  output: ImageRef[];
}

export function imageListInput(inputs: ImageListInputInputs): Promise<ImageListInputOutputs> {
  return callNode<ImageListInputOutputs>("nodetool.input.ImageListInput", inputs);
}

// Video List Input — nodetool.input.VideoListInput
export type VideoListInputInputs = {
  name?: string;
  value?: VideoRef[];
  description?: string;
};

export interface VideoListInputOutputs {
  output: VideoRef[];
}

export function videoListInput(inputs: VideoListInputInputs): Promise<VideoListInputOutputs> {
  return callNode<VideoListInputOutputs>("nodetool.input.VideoListInput", inputs);
}

// Audio List Input — nodetool.input.AudioListInput
export type AudioListInputInputs = {
  name?: string;
  value?: AudioRef[];
  description?: string;
};

export interface AudioListInputOutputs {
  output: AudioRef[];
}

export function audioListInput(inputs: AudioListInputInputs): Promise<AudioListInputOutputs> {
  return callNode<AudioListInputOutputs>("nodetool.input.AudioListInput", inputs);
}

// Text List Input — nodetool.input.TextListInput
export type TextListInputInputs = {
  name?: string;
  value?: string[];
  description?: string;
};

export interface TextListInputOutputs {
  output: string[];
}

export function textListInput(inputs: TextListInputInputs): Promise<TextListInputOutputs> {
  return callNode<TextListInputOutputs>("nodetool.input.TextListInput", inputs);
}

// Video Input — nodetool.input.VideoInput
export type VideoInputInputs = {
  name?: string;
  value?: VideoRef;
  description?: string;
};

export interface VideoInputOutputs {
  output: VideoRef;
}

export function videoInput(inputs: VideoInputInputs): Promise<VideoInputOutputs> {
  return callNode<VideoInputOutputs>("nodetool.input.VideoInput", inputs);
}

// Audio Input — nodetool.input.AudioInput
export type AudioInputInputs = {
  name?: string;
  value?: AudioRef;
  description?: string;
};

export interface AudioInputOutputs {
  output: AudioRef;
}

export function audioInput(inputs: AudioInputInputs): Promise<AudioInputOutputs> {
  return callNode<AudioInputOutputs>("nodetool.input.AudioInput", inputs);
}

// Model 3D Input — nodetool.input.Model3DInput
export type Model3DInputInputs = {
  name?: string;
  value?: unknown;
  description?: string;
};

export interface Model3DInputOutputs {
  output: unknown;
}

export function model3DInput(inputs: Model3DInputInputs): Promise<Model3DInputOutputs> {
  return callNode<Model3DInputOutputs>("nodetool.input.Model3DInput", inputs);
}

// Realtime Audio Input — nodetool.input.RealtimeAudioInput
export type RealtimeAudioInputInputs = {
  name?: string;
  value?: AudioRef;
  description?: string;
};

export interface RealtimeAudioInputOutputs {
  chunk: unknown;
}

export function realtimeAudioInput(inputs: RealtimeAudioInputInputs): Promise<RealtimeAudioInputOutputs> {
  return callNode<RealtimeAudioInputOutputs>("nodetool.input.RealtimeAudioInput", inputs);
}

realtimeAudioInput.stream = function (inputs: RealtimeAudioInputInputs): AsyncIterable<Partial<RealtimeAudioInputOutputs>> {
  return streamNode<Partial<RealtimeAudioInputOutputs>>("nodetool.input.RealtimeAudioInput", inputs);
};

// Asset Folder Input — nodetool.input.AssetFolderInput
export type AssetFolderInputInputs = {
  name?: string;
  value?: FolderRef;
  description?: string;
};

export interface AssetFolderInputOutputs {
  output: FolderRef;
}

export function assetFolderInput(inputs: AssetFolderInputInputs): Promise<AssetFolderInputOutputs> {
  return callNode<AssetFolderInputOutputs>("nodetool.input.AssetFolderInput", inputs);
}

// File Path Input — nodetool.input.FilePathInput
export type FilePathInputInputs = {
  name?: string;
  value?: string;
  description?: string;
};

export interface FilePathInputOutputs {
  output: string;
}

export function filePathInput(inputs: FilePathInputInputs): Promise<FilePathInputOutputs> {
  return callNode<FilePathInputOutputs>("nodetool.input.FilePathInput", inputs);
}

// Document File Input — nodetool.input.DocumentFileInput
export type DocumentFileInputInputs = {
  name?: string;
  value?: string;
  description?: string;
};

export interface DocumentFileInputOutputs {
  document: unknown;
  path: string;
}

export function documentFileInput(inputs: DocumentFileInputInputs): Promise<DocumentFileInputOutputs> {
  return callNode<DocumentFileInputOutputs>("nodetool.input.DocumentFileInput", inputs);
}

// Message Input — nodetool.input.MessageInput
export type MessageInputInputs = {
  name?: string;
  value?: unknown;
  description?: string;
};

export interface MessageInputOutputs {
  output: unknown;
}

export function messageInput(inputs: MessageInputInputs): Promise<MessageInputOutputs> {
  return callNode<MessageInputOutputs>("nodetool.input.MessageInput", inputs);
}

// Message List Input — nodetool.input.MessageListInput
export type MessageListInputInputs = {
  name?: string;
  value?: unknown[];
  description?: string;
};

export interface MessageListInputOutputs {
  output: unknown[];
}

export function messageListInput(inputs: MessageListInputInputs): Promise<MessageListInputOutputs> {
  return callNode<MessageListInputOutputs>("nodetool.input.MessageListInput", inputs);
}

// Message Deconstructor — nodetool.input.MessageDeconstructor
export type MessageDeconstructorInputs = {
  value?: unknown;
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

export function messageDeconstructor(inputs: MessageDeconstructorInputs): Promise<MessageDeconstructorOutputs> {
  return callNode<MessageDeconstructorOutputs>("nodetool.input.MessageDeconstructor", inputs);
}
