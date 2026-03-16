// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";
import type { ImageRef, AudioRef, VideoRef, DataframeRef, FolderRef } from "../types.js";

// Float Input — nodetool.input.FloatInput
export interface FloatInputInputs {
  name?: Connectable<string>;
  value?: Connectable<number>;
  description?: Connectable<string>;
  min?: Connectable<number>;
  max?: Connectable<number>;
}

export function floatInput(inputs: FloatInputInputs): DslNode<SingleOutput<number>> {
  return createNode("nodetool.input.FloatInput", inputs as Record<string, unknown>);
}

// Boolean Input — nodetool.input.BooleanInput
export interface BooleanInputInputs {
  name?: Connectable<string>;
  value?: Connectable<boolean>;
  description?: Connectable<string>;
}

export function booleanInput(inputs: BooleanInputInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.input.BooleanInput", inputs as Record<string, unknown>);
}

// Integer Input — nodetool.input.IntegerInput
export interface IntegerInputInputs {
  name?: Connectable<string>;
  value?: Connectable<number>;
  description?: Connectable<string>;
  min?: Connectable<number>;
  max?: Connectable<number>;
}

export function integerInput(inputs: IntegerInputInputs): DslNode<SingleOutput<number>> {
  return createNode("nodetool.input.IntegerInput", inputs as Record<string, unknown>);
}

// String Input — nodetool.input.StringInput
export interface StringInputInputs {
  name?: Connectable<string>;
  value?: Connectable<string>;
  description?: Connectable<string>;
  max_length?: Connectable<number>;
  line_mode?: Connectable<string>;
}

export function stringInput(inputs: StringInputInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.input.StringInput", inputs as Record<string, unknown>);
}

// Select Input — nodetool.input.SelectInput
export interface SelectInputInputs {
  name?: Connectable<string>;
  value?: Connectable<string>;
  description?: Connectable<string>;
  options?: Connectable<string[]>;
  enum_type_name?: Connectable<string>;
}

export function selectInput(inputs: SelectInputInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.input.SelectInput", inputs as Record<string, unknown>);
}

// String List Input — nodetool.input.StringListInput
export interface StringListInputInputs {
  name?: Connectable<string>;
  value?: Connectable<string[]>;
  description?: Connectable<string>;
}

export function stringListInput(inputs: StringListInputInputs): DslNode<SingleOutput<string[]>> {
  return createNode("nodetool.input.StringListInput", inputs as Record<string, unknown>);
}

// Folder Path Input — nodetool.input.FolderPathInput
export interface FolderPathInputInputs {
  name?: Connectable<string>;
  value?: Connectable<string>;
  description?: Connectable<string>;
}

export function folderPathInput(inputs: FolderPathInputInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.input.FolderPathInput", inputs as Record<string, unknown>);
}

// Hugging Face Model Input — nodetool.input.HuggingFaceModelInput
export interface HuggingFaceModelInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export function huggingFaceModelInput(inputs: HuggingFaceModelInputInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.input.HuggingFaceModelInput", inputs as Record<string, unknown>);
}

// Color Input — nodetool.input.ColorInput
export interface ColorInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export function colorInput(inputs: ColorInputInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.input.ColorInput", inputs as Record<string, unknown>);
}

// Image Size Input — nodetool.input.ImageSizeInput
export interface ImageSizeInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export function imageSizeInput(inputs: ImageSizeInputInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.input.ImageSizeInput", inputs as Record<string, unknown>);
}

// Language Model Input — nodetool.input.LanguageModelInput
export interface LanguageModelInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export function languageModelInput(inputs: LanguageModelInputInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.input.LanguageModelInput", inputs as Record<string, unknown>);
}

// Image Model Input — nodetool.input.ImageModelInput
export interface ImageModelInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export function imageModelInput(inputs: ImageModelInputInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.input.ImageModelInput", inputs as Record<string, unknown>);
}

// Video Model Input — nodetool.input.VideoModelInput
export interface VideoModelInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export function videoModelInput(inputs: VideoModelInputInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.input.VideoModelInput", inputs as Record<string, unknown>);
}

// TTSModel Input — nodetool.input.TTSModelInput
export interface TTSModelInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export function tTSModelInput(inputs: TTSModelInputInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.input.TTSModelInput", inputs as Record<string, unknown>);
}

// ASRModel Input — nodetool.input.ASRModelInput
export interface ASRModelInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export function aSRModelInput(inputs: ASRModelInputInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.input.ASRModelInput", inputs as Record<string, unknown>);
}

// Embedding Model Input — nodetool.input.EmbeddingModelInput
export interface EmbeddingModelInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export function embeddingModelInput(inputs: EmbeddingModelInputInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.input.EmbeddingModelInput", inputs as Record<string, unknown>);
}

// Dataframe Input — nodetool.input.DataframeInput
export interface DataframeInputInputs {
  name?: Connectable<string>;
  value?: Connectable<DataframeRef>;
  description?: Connectable<string>;
}

export function dataframeInput(inputs: DataframeInputInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.input.DataframeInput", inputs as Record<string, unknown>);
}

// Document Input — nodetool.input.DocumentInput
export interface DocumentInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export function documentInput(inputs: DocumentInputInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.input.DocumentInput", inputs as Record<string, unknown>);
}

// Image Input — nodetool.input.ImageInput
export interface ImageInputInputs {
  name?: Connectable<string>;
  value?: Connectable<ImageRef>;
  description?: Connectable<string>;
}

export function imageInput(inputs: ImageInputInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("nodetool.input.ImageInput", inputs as Record<string, unknown>);
}

// Image List Input — nodetool.input.ImageListInput
export interface ImageListInputInputs {
  name?: Connectable<string>;
  value?: Connectable<ImageRef[]>;
  description?: Connectable<string>;
}

export function imageListInput(inputs: ImageListInputInputs): DslNode<SingleOutput<ImageRef[]>> {
  return createNode("nodetool.input.ImageListInput", inputs as Record<string, unknown>);
}

// Video List Input — nodetool.input.VideoListInput
export interface VideoListInputInputs {
  name?: Connectable<string>;
  value?: Connectable<VideoRef[]>;
  description?: Connectable<string>;
}

export function videoListInput(inputs: VideoListInputInputs): DslNode<SingleOutput<VideoRef[]>> {
  return createNode("nodetool.input.VideoListInput", inputs as Record<string, unknown>);
}

// Audio List Input — nodetool.input.AudioListInput
export interface AudioListInputInputs {
  name?: Connectable<string>;
  value?: Connectable<AudioRef[]>;
  description?: Connectable<string>;
}

export function audioListInput(inputs: AudioListInputInputs): DslNode<SingleOutput<AudioRef[]>> {
  return createNode("nodetool.input.AudioListInput", inputs as Record<string, unknown>);
}

// Text List Input — nodetool.input.TextListInput
export interface TextListInputInputs {
  name?: Connectable<string>;
  value?: Connectable<string[]>;
  description?: Connectable<string>;
}

export function textListInput(inputs: TextListInputInputs): DslNode<SingleOutput<string[]>> {
  return createNode("nodetool.input.TextListInput", inputs as Record<string, unknown>);
}

// Video Input — nodetool.input.VideoInput
export interface VideoInputInputs {
  name?: Connectable<string>;
  value?: Connectable<VideoRef>;
  description?: Connectable<string>;
}

export function videoInput(inputs: VideoInputInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.input.VideoInput", inputs as Record<string, unknown>);
}

// Audio Input — nodetool.input.AudioInput
export interface AudioInputInputs {
  name?: Connectable<string>;
  value?: Connectable<AudioRef>;
  description?: Connectable<string>;
}

export function audioInput(inputs: AudioInputInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.input.AudioInput", inputs as Record<string, unknown>);
}

// Model 3D Input — nodetool.input.Model3DInput
export interface Model3DInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export function model3DInput(inputs: Model3DInputInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.input.Model3DInput", inputs as Record<string, unknown>);
}

// Realtime Audio Input — nodetool.input.RealtimeAudioInput
export interface RealtimeAudioInputInputs {
  name?: Connectable<string>;
  value?: Connectable<AudioRef>;
  description?: Connectable<string>;
}

export interface RealtimeAudioInputOutputs {
  chunk: OutputHandle<unknown>;
}

export function realtimeAudioInput(inputs: RealtimeAudioInputInputs): DslNode<RealtimeAudioInputOutputs> {
  return createNode("nodetool.input.RealtimeAudioInput", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Asset Folder Input — nodetool.input.AssetFolderInput
export interface AssetFolderInputInputs {
  name?: Connectable<string>;
  value?: Connectable<FolderRef>;
  description?: Connectable<string>;
}

export function assetFolderInput(inputs: AssetFolderInputInputs): DslNode<SingleOutput<FolderRef>> {
  return createNode("nodetool.input.AssetFolderInput", inputs as Record<string, unknown>);
}

// File Path Input — nodetool.input.FilePathInput
export interface FilePathInputInputs {
  name?: Connectable<string>;
  value?: Connectable<string>;
  description?: Connectable<string>;
}

export function filePathInput(inputs: FilePathInputInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.input.FilePathInput", inputs as Record<string, unknown>);
}

// Document File Input — nodetool.input.DocumentFileInput
export interface DocumentFileInputInputs {
  name?: Connectable<string>;
  value?: Connectable<string>;
  description?: Connectable<string>;
}

export interface DocumentFileInputOutputs {
  document: OutputHandle<unknown>;
  path: OutputHandle<string>;
}

export function documentFileInput(inputs: DocumentFileInputInputs): DslNode<DocumentFileInputOutputs> {
  return createNode("nodetool.input.DocumentFileInput", inputs as Record<string, unknown>, { multiOutput: true });
}

// Message Input — nodetool.input.MessageInput
export interface MessageInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export function messageInput(inputs: MessageInputInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.input.MessageInput", inputs as Record<string, unknown>);
}

// Message List Input — nodetool.input.MessageListInput
export interface MessageListInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown[]>;
  description?: Connectable<string>;
}

export function messageListInput(inputs: MessageListInputInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.input.MessageListInput", inputs as Record<string, unknown>);
}

// Message Deconstructor — nodetool.input.MessageDeconstructor
export interface MessageDeconstructorInputs {
  value?: Connectable<unknown>;
}

export interface MessageDeconstructorOutputs {
  id: OutputHandle<string>;
  thread_id: OutputHandle<string>;
  role: OutputHandle<string>;
  text: OutputHandle<string>;
  image: OutputHandle<ImageRef>;
  audio: OutputHandle<AudioRef>;
  model: OutputHandle<unknown>;
}

export function messageDeconstructor(inputs: MessageDeconstructorInputs): DslNode<MessageDeconstructorOutputs> {
  return createNode("nodetool.input.MessageDeconstructor", inputs as Record<string, unknown>, { multiOutput: true });
}
