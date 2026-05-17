// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef, VideoRef, DataframeRef, FolderRef } from "../types.js";

// Float Input — nodetool.input.FloatInput
export interface FloatInputInputs {
  name?: Connectable<string>;
  value?: Connectable<number>;
  description?: Connectable<string>;
  min?: Connectable<number>;
  max?: Connectable<number>;
}

export interface FloatInputOutputs {
  output: number;
}

export function floatInput(inputs: FloatInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FloatInputOutputs, "output"> {
  return createNode("nodetool.input.FloatInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Boolean Input — nodetool.input.BooleanInput
export interface BooleanInputInputs {
  name?: Connectable<string>;
  value?: Connectable<boolean>;
  description?: Connectable<string>;
}

export interface BooleanInputOutputs {
  output: boolean;
}

export function booleanInput(inputs: BooleanInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<BooleanInputOutputs, "output"> {
  return createNode("nodetool.input.BooleanInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Integer Input — nodetool.input.IntegerInput
export interface IntegerInputInputs {
  name?: Connectable<string>;
  value?: Connectable<number>;
  description?: Connectable<string>;
  min?: Connectable<number>;
  max?: Connectable<number>;
}

export interface IntegerInputOutputs {
  output: number;
}

export function integerInput(inputs: IntegerInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<IntegerInputOutputs, "output"> {
  return createNode("nodetool.input.IntegerInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// String Input — nodetool.input.StringInput
export interface StringInputInputs {
  name?: Connectable<string>;
  value?: Connectable<string>;
  description?: Connectable<string>;
  max_length?: Connectable<number>;
  line_mode?: Connectable<string>;
}

export interface StringInputOutputs {
  output: string;
}

export function stringInput(inputs: StringInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<StringInputOutputs, "output"> {
  return createNode("nodetool.input.StringInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Select Input — nodetool.input.SelectInput
export interface SelectInputInputs {
  name?: Connectable<string>;
  value?: Connectable<string>;
  description?: Connectable<string>;
  options?: Connectable<string[]>;
  enum_type_name?: Connectable<string>;
}

export interface SelectInputOutputs {
  output: string;
}

export function selectInput(inputs: SelectInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SelectInputOutputs, "output"> {
  return createNode("nodetool.input.SelectInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// String List Input — nodetool.input.StringListInput
export interface StringListInputInputs {
  name?: Connectable<string>;
  value?: Connectable<string[]>;
  description?: Connectable<string>;
}

export interface StringListInputOutputs {
  output: string[];
}

export function stringListInput(inputs: StringListInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<StringListInputOutputs, "output"> {
  return createNode("nodetool.input.StringListInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Folder Path Input — nodetool.input.FolderPathInput
export interface FolderPathInputInputs {
  name?: Connectable<string>;
  value?: Connectable<string>;
  description?: Connectable<string>;
}

export interface FolderPathInputOutputs {
  output: string;
}

export function folderPathInput(inputs: FolderPathInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FolderPathInputOutputs, "output"> {
  return createNode("nodetool.input.FolderPathInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Hugging Face Model Input — nodetool.input.HuggingFaceModelInput
export interface HuggingFaceModelInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export interface HuggingFaceModelInputOutputs {
  output: unknown;
}

export function huggingFaceModelInput(inputs: HuggingFaceModelInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<HuggingFaceModelInputOutputs, "output"> {
  return createNode("nodetool.input.HuggingFaceModelInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Color Input — nodetool.input.ColorInput
export interface ColorInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export interface ColorInputOutputs {
  output: unknown;
}

export function colorInput(inputs: ColorInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ColorInputOutputs, "output"> {
  return createNode("nodetool.input.ColorInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Image Size Input — nodetool.input.ImageSizeInput
export interface ImageSizeInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export interface ImageSizeInputOutputs {
  output: unknown;
}

export function imageSizeInput(inputs: ImageSizeInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ImageSizeInputOutputs, "output"> {
  return createNode("nodetool.input.ImageSizeInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Language Model Input — nodetool.input.LanguageModelInput
export interface LanguageModelInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export interface LanguageModelInputOutputs {
  output: unknown;
}

export function languageModelInput(inputs: LanguageModelInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<LanguageModelInputOutputs, "output"> {
  return createNode("nodetool.input.LanguageModelInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Image Model Input — nodetool.input.ImageModelInput
export interface ImageModelInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export interface ImageModelInputOutputs {
  output: unknown;
}

export function imageModelInput(inputs: ImageModelInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ImageModelInputOutputs, "output"> {
  return createNode("nodetool.input.ImageModelInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Video Model Input — nodetool.input.VideoModelInput
export interface VideoModelInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export interface VideoModelInputOutputs {
  output: unknown;
}

export function videoModelInput(inputs: VideoModelInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<VideoModelInputOutputs, "output"> {
  return createNode("nodetool.input.VideoModelInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// TTSModel Input — nodetool.input.TTSModelInput
export interface TTSModelInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export interface TTSModelInputOutputs {
  output: unknown;
}

export function ttsModelInput(inputs: TTSModelInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TTSModelInputOutputs, "output"> {
  return createNode("nodetool.input.TTSModelInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// ASRModel Input — nodetool.input.ASRModelInput
export interface ASRModelInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export interface ASRModelInputOutputs {
  output: unknown;
}

export function asrModelInput(inputs: ASRModelInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ASRModelInputOutputs, "output"> {
  return createNode("nodetool.input.ASRModelInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Embedding Model Input — nodetool.input.EmbeddingModelInput
export interface EmbeddingModelInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export interface EmbeddingModelInputOutputs {
  output: unknown;
}

export function embeddingModelInput(inputs: EmbeddingModelInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<EmbeddingModelInputOutputs, "output"> {
  return createNode("nodetool.input.EmbeddingModelInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Dataframe Input — nodetool.input.DataframeInput
export interface DataframeInputInputs {
  name?: Connectable<string>;
  value?: Connectable<DataframeRef>;
  description?: Connectable<string>;
}

export interface DataframeInputOutputs {
  output: DataframeRef;
}

export function dataframeInput(inputs: DataframeInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DataframeInputOutputs, "output"> {
  return createNode("nodetool.input.DataframeInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Document Input — nodetool.input.DocumentInput
export interface DocumentInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export interface DocumentInputOutputs {
  output: unknown;
}

export function documentInput(inputs: DocumentInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DocumentInputOutputs, "output"> {
  return createNode("nodetool.input.DocumentInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Image Input — nodetool.input.ImageInput
export interface ImageInputInputs {
  name?: Connectable<string>;
  value?: Connectable<ImageRef>;
  description?: Connectable<string>;
}

export interface ImageInputOutputs {
  output: ImageRef;
}

export function imageInput(inputs: ImageInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ImageInputOutputs, "output"> {
  return createNode("nodetool.input.ImageInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Image List Input — nodetool.input.ImageListInput
export interface ImageListInputInputs {
  name?: Connectable<string>;
  value?: Connectable<ImageRef[]>;
  description?: Connectable<string>;
}

export interface ImageListInputOutputs {
  output: ImageRef[];
}

export function imageListInput(inputs: ImageListInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ImageListInputOutputs, "output"> {
  return createNode("nodetool.input.ImageListInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Video List Input — nodetool.input.VideoListInput
export interface VideoListInputInputs {
  name?: Connectable<string>;
  value?: Connectable<VideoRef[]>;
  description?: Connectable<string>;
}

export interface VideoListInputOutputs {
  output: VideoRef[];
}

export function videoListInput(inputs: VideoListInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<VideoListInputOutputs, "output"> {
  return createNode("nodetool.input.VideoListInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Audio List Input — nodetool.input.AudioListInput
export interface AudioListInputInputs {
  name?: Connectable<string>;
  value?: Connectable<AudioRef[]>;
  description?: Connectable<string>;
}

export interface AudioListInputOutputs {
  output: AudioRef[];
}

export function audioListInput(inputs: AudioListInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<AudioListInputOutputs, "output"> {
  return createNode("nodetool.input.AudioListInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Text List Input — nodetool.input.TextListInput
export interface TextListInputInputs {
  name?: Connectable<string>;
  value?: Connectable<string[]>;
  description?: Connectable<string>;
}

export interface TextListInputOutputs {
  output: string[];
}

export function textListInput(inputs: TextListInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TextListInputOutputs, "output"> {
  return createNode("nodetool.input.TextListInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Video Input — nodetool.input.VideoInput
export interface VideoInputInputs {
  name?: Connectable<string>;
  value?: Connectable<VideoRef>;
  description?: Connectable<string>;
}

export interface VideoInputOutputs {
  output: VideoRef;
}

export function videoInput(inputs: VideoInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<VideoInputOutputs, "output"> {
  return createNode("nodetool.input.VideoInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Audio Input — nodetool.input.AudioInput
export interface AudioInputInputs {
  name?: Connectable<string>;
  value?: Connectable<AudioRef>;
  description?: Connectable<string>;
}

export interface AudioInputOutputs {
  output: AudioRef;
}

export function audioInput(inputs: AudioInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<AudioInputOutputs, "output"> {
  return createNode("nodetool.input.AudioInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Model 3D Input — nodetool.input.Model3DInput
export interface Model3DInputInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export interface Model3DInputOutputs {
  output: unknown;
}

export function model3DInput(inputs: Model3DInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<Model3DInputOutputs, "output"> {
  return createNode("nodetool.input.Model3DInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Realtime Audio Input — nodetool.input.RealtimeAudioInput
export interface RealtimeAudioInputInputs {
  name?: Connectable<string>;
  value?: Connectable<AudioRef>;
  description?: Connectable<string>;
}

export interface RealtimeAudioInputOutputs {
  chunk: unknown;
}

export function realtimeAudioInput(inputs: RealtimeAudioInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RealtimeAudioInputOutputs, "chunk"> {
  return createNode("nodetool.input.RealtimeAudioInput", inputs as Record<string, unknown>, { outputNames: ["chunk"], defaultOutput: "chunk", streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Asset Folder Input — nodetool.input.AssetFolderInput
export interface AssetFolderInputInputs {
  name?: Connectable<string>;
  value?: Connectable<FolderRef>;
  description?: Connectable<string>;
}

export interface AssetFolderInputOutputs {
  output: FolderRef;
}

export function assetFolderInput(inputs: AssetFolderInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<AssetFolderInputOutputs, "output"> {
  return createNode("nodetool.input.AssetFolderInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// File Path Input — nodetool.input.FilePathInput
export interface FilePathInputInputs {
  name?: Connectable<string>;
  value?: Connectable<string>;
  description?: Connectable<string>;
}

export interface FilePathInputOutputs {
  output: string;
}

export function filePathInput(inputs: FilePathInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FilePathInputOutputs, "output"> {
  return createNode("nodetool.input.FilePathInput", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Document File Input — nodetool.input.DocumentFileInput
export interface DocumentFileInputInputs {
  name?: Connectable<string>;
  value?: Connectable<string>;
  description?: Connectable<string>;
}

export interface DocumentFileInputOutputs {
  document: unknown;
  path: string;
}

export function documentFileInput(inputs: DocumentFileInputInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DocumentFileInputOutputs> {
  return createNode("nodetool.input.DocumentFileInput", inputs as Record<string, unknown>, { outputNames: ["document", "path"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Chat Composer — nodetool.input.ChatComposer
export interface ChatComposerInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export interface ChatComposerOutputs {
  output: unknown;
}

export function chatComposer(inputs: ChatComposerInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ChatComposerOutputs, "output"> {
  return createNode("nodetool.input.ChatComposer", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Chat Messages — nodetool.input.ChatMessages
export interface ChatMessagesInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown[]>;
  description?: Connectable<string>;
}

export interface ChatMessagesOutputs {
  output: unknown[];
}

export function chatMessages(inputs: ChatMessagesInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ChatMessagesOutputs, "output"> {
  return createNode("nodetool.input.ChatMessages", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Message Deconstructor — nodetool.input.MessageDeconstructor
export interface MessageDeconstructorInputs {
  value?: Connectable<unknown>;
}

export interface MessageDeconstructorOutputs {
  id: string;
  thread_id: string;
  role: string;
  text: string;
  image: ImageRef;
  audio: AudioRef;
  model: unknown;
}

export function messageDeconstructor(inputs: MessageDeconstructorInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<MessageDeconstructorOutputs> {
  return createNode("nodetool.input.MessageDeconstructor", inputs as Record<string, unknown>, { outputNames: ["id", "thread_id", "role", "text", "image", "audio", "model"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
