// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef, VideoRef, DataframeRef } from "../types.js";

// Constant — nodetool.constant.Constant
export interface ConstantInputs {
}

export interface ConstantOutputs {
}

export function constant(inputs?: ConstantInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ConstantOutputs> {
  return createNode("nodetool.constant.Constant", (inputs ?? {}) as Record<string, unknown>, { outputNames: [], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Bool — nodetool.constant.Bool
export interface BoolInputs {
  value?: Connectable<boolean>;
}

export interface BoolOutputs {
  output: boolean;
}

export function bool(inputs: BoolInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<BoolOutputs, "output"> {
  return createNode("nodetool.constant.Bool", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Integer — nodetool.constant.Integer
export interface IntegerInputs {
  value?: Connectable<number>;
}

export interface IntegerOutputs {
  output: number;
}

export function integer(inputs: IntegerInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<IntegerOutputs, "output"> {
  return createNode("nodetool.constant.Integer", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Float — nodetool.constant.Float
export interface FloatInputs {
  value?: Connectable<number>;
}

export interface FloatOutputs {
  output: number;
}

export function float(inputs: FloatInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FloatOutputs, "output"> {
  return createNode("nodetool.constant.Float", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// String — nodetool.constant.String
export interface StringInputs {
  value?: Connectable<string>;
}

export interface StringOutputs {
  output: string;
}

export function string(inputs: StringInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<StringOutputs, "output"> {
  return createNode("nodetool.constant.String", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// List — nodetool.constant.List
export interface ListInputs {
  value?: Connectable<unknown[]>;
}

export interface ListOutputs {
  output: unknown[];
}

export function list(inputs: ListInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ListOutputs, "output"> {
  return createNode("nodetool.constant.List", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Text List — nodetool.constant.TextList
export interface TextListInputs {
  value?: Connectable<string[]>;
}

export interface TextListOutputs {
  output: string[];
}

export function textList(inputs: TextListInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TextListOutputs, "output"> {
  return createNode("nodetool.constant.TextList", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Dict — nodetool.constant.Dict
export interface DictInputs {
  value?: Connectable<Record<string, unknown>>;
}

export interface DictOutputs {
  output: Record<string, unknown>;
}

export function dict(inputs: DictInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DictOutputs, "output"> {
  return createNode("nodetool.constant.Dict", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Audio — nodetool.constant.Audio
export interface AudioInputs {
  value?: Connectable<AudioRef>;
}

export interface AudioOutputs {
  output: AudioRef;
}

export function audio(inputs: AudioInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<AudioOutputs, "output"> {
  return createNode("nodetool.constant.Audio", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Image — nodetool.constant.Image
export interface ImageInputs {
  value?: Connectable<ImageRef>;
}

export interface ImageOutputs {
  output: ImageRef;
}

export function image(inputs: ImageInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ImageOutputs, "output"> {
  return createNode("nodetool.constant.Image", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Video — nodetool.constant.Video
export interface VideoInputs {
  value?: Connectable<VideoRef>;
}

export interface VideoOutputs {
  output: VideoRef;
}

export function video(inputs: VideoInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<VideoOutputs, "output"> {
  return createNode("nodetool.constant.Video", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Document — nodetool.constant.Document
export interface DocumentInputs {
  value?: Connectable<unknown>;
}

export interface DocumentOutputs {
  output: unknown;
}

export function document(inputs: DocumentInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DocumentOutputs, "output"> {
  return createNode("nodetool.constant.Document", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// JSON — nodetool.constant.JSON
export interface JSONInputs {
  value?: Connectable<unknown>;
}

export interface JSONOutputs {
  output: unknown;
}

export function json(inputs: JSONInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<JSONOutputs, "output"> {
  return createNode("nodetool.constant.JSON", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Model 3D — nodetool.constant.Model3D
export interface Model3DInputs {
  value?: Connectable<unknown>;
}

export interface Model3DOutputs {
  output: unknown;
}

export function model3D(inputs: Model3DInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<Model3DOutputs, "output"> {
  return createNode("nodetool.constant.Model3D", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Data Frame — nodetool.constant.DataFrame
export interface DataFrameInputs {
  value?: Connectable<DataframeRef>;
}

export interface DataFrameOutputs {
  output: DataframeRef;
}

export function dataFrame(inputs: DataFrameInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DataFrameOutputs, "output"> {
  return createNode("nodetool.constant.DataFrame", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Audio List — nodetool.constant.AudioList
export interface AudioListInputs {
  value?: Connectable<AudioRef[]>;
}

export interface AudioListOutputs {
  output: AudioRef[];
}

export function audioList(inputs: AudioListInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<AudioListOutputs, "output"> {
  return createNode("nodetool.constant.AudioList", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Image List — nodetool.constant.ImageList
export interface ImageListInputs {
  value?: Connectable<ImageRef[]>;
}

export interface ImageListOutputs {
  output: ImageRef[];
}

export function imageList(inputs: ImageListInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ImageListOutputs, "output"> {
  return createNode("nodetool.constant.ImageList", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Video List — nodetool.constant.VideoList
export interface VideoListInputs {
  value?: Connectable<VideoRef[]>;
}

export interface VideoListOutputs {
  output: VideoRef[];
}

export function videoList(inputs: VideoListInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<VideoListOutputs, "output"> {
  return createNode("nodetool.constant.VideoList", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Select — nodetool.constant.Select
export interface SelectInputs {
  value?: Connectable<string>;
  options?: Connectable<string[]>;
  enum_type_name?: Connectable<string>;
}

export interface SelectOutputs {
  output: string;
}

export function select(inputs: SelectInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SelectOutputs, "output"> {
  return createNode("nodetool.constant.Select", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Image Size — nodetool.constant.ImageSize
export interface ImageSizeInputs {
  value?: Connectable<unknown>;
}

export interface ImageSizeOutputs {
  image_size: unknown;
  width: number;
  height: number;
}

export function imageSize(inputs: ImageSizeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ImageSizeOutputs> {
  return createNode("nodetool.constant.ImageSize", inputs as Record<string, unknown>, { outputNames: ["image_size", "width", "height"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Date — nodetool.constant.Date
export interface DateInputs {
  year?: Connectable<number>;
  month?: Connectable<number>;
  day?: Connectable<number>;
}

export interface DateOutputs {
  output: unknown;
}

export function date(inputs: DateInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DateOutputs, "output"> {
  return createNode("nodetool.constant.Date", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Date Time — nodetool.constant.DateTime
export interface DateTimeInputs {
  year?: Connectable<number>;
  month?: Connectable<number>;
  day?: Connectable<number>;
  hour?: Connectable<number>;
  minute?: Connectable<number>;
  second?: Connectable<number>;
  millisecond?: Connectable<number>;
  tzinfo?: Connectable<string>;
  utc_offset?: Connectable<number>;
}

export interface DateTimeOutputs {
  output: unknown;
}

export function dateTime(inputs: DateTimeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DateTimeOutputs, "output"> {
  return createNode("nodetool.constant.DateTime", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// ASRModel Constant — nodetool.constant.ASRModelConstant
export interface ASRModelConstantInputs {
  value?: Connectable<unknown>;
}

export interface ASRModelConstantOutputs {
  output: unknown;
}

export function asrModelConstant(inputs: ASRModelConstantInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ASRModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.ASRModelConstant", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Embedding Model Constant — nodetool.constant.EmbeddingModelConstant
export interface EmbeddingModelConstantInputs {
  value?: Connectable<unknown>;
}

export interface EmbeddingModelConstantOutputs {
  output: unknown;
}

export function embeddingModelConstant(inputs: EmbeddingModelConstantInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<EmbeddingModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.EmbeddingModelConstant", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Image Model Constant — nodetool.constant.ImageModelConstant
export interface ImageModelConstantInputs {
  value?: Connectable<unknown>;
}

export interface ImageModelConstantOutputs {
  output: unknown;
}

export function imageModelConstant(inputs: ImageModelConstantInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ImageModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.ImageModelConstant", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Language Model Constant — nodetool.constant.LanguageModelConstant
export interface LanguageModelConstantInputs {
  value?: Connectable<unknown>;
}

export interface LanguageModelConstantOutputs {
  output: unknown;
}

export function languageModelConstant(inputs: LanguageModelConstantInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<LanguageModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.LanguageModelConstant", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// TTSModel Constant — nodetool.constant.TTSModelConstant
export interface TTSModelConstantInputs {
  value?: Connectable<unknown>;
}

export interface TTSModelConstantOutputs {
  output: unknown;
}

export function ttsModelConstant(inputs: TTSModelConstantInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TTSModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.TTSModelConstant", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Video Model Constant — nodetool.constant.VideoModelConstant
export interface VideoModelConstantInputs {
  value?: Connectable<unknown>;
}

export interface VideoModelConstantOutputs {
  output: unknown;
}

export function videoModelConstant(inputs: VideoModelConstantInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<VideoModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.VideoModelConstant", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
