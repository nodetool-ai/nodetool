// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef, AudioRef, VideoRef, DataframeRef } from "../../types.js";

// Bool — nodetool.constant.Bool
export type BoolInputs = {
  value?: boolean;
};

export interface BoolOutputs {
  output: boolean;
}

export function bool(inputs: BoolInputs): Promise<BoolOutputs> {
  return callNode<BoolOutputs>("nodetool.constant.Bool", inputs);
}

// Integer — nodetool.constant.Integer
export type IntegerInputs = {
  value?: number;
};

export interface IntegerOutputs {
  output: number;
}

export function integer(inputs: IntegerInputs): Promise<IntegerOutputs> {
  return callNode<IntegerOutputs>("nodetool.constant.Integer", inputs);
}

// Float — nodetool.constant.Float
export type FloatInputs = {
  value?: number;
};

export interface FloatOutputs {
  output: number;
}

export function float(inputs: FloatInputs): Promise<FloatOutputs> {
  return callNode<FloatOutputs>("nodetool.constant.Float", inputs);
}

// String — nodetool.constant.String
export type StringInputs = {
  value?: string;
};

export interface StringOutputs {
  output: string;
}

export function string(inputs: StringInputs): Promise<StringOutputs> {
  return callNode<StringOutputs>("nodetool.constant.String", inputs);
}

// List — nodetool.constant.List
export type ListInputs = {
  value?: unknown[];
};

export interface ListOutputs {
  output: unknown[];
}

export function list(inputs: ListInputs): Promise<ListOutputs> {
  return callNode<ListOutputs>("nodetool.constant.List", inputs);
}

// Text List — nodetool.constant.TextList
export type TextListInputs = {
  value?: string[];
};

export interface TextListOutputs {
  output: string[];
}

export function textList(inputs: TextListInputs): Promise<TextListOutputs> {
  return callNode<TextListOutputs>("nodetool.constant.TextList", inputs);
}

// Dict — nodetool.constant.Dict
export type DictInputs = {
  value?: Record<string, unknown>;
};

export interface DictOutputs {
  output: Record<string, unknown>;
}

export function dict(inputs: DictInputs): Promise<DictOutputs> {
  return callNode<DictOutputs>("nodetool.constant.Dict", inputs);
}

// Audio — nodetool.constant.Audio
export type AudioInputs = {
  value?: AudioRef;
};

export interface AudioOutputs {
  output: AudioRef;
}

export function audio(inputs: AudioInputs): Promise<AudioOutputs> {
  return callNode<AudioOutputs>("nodetool.constant.Audio", inputs);
}

// Image — nodetool.constant.Image
export type ImageInputs = {
  value?: ImageRef;
};

export interface ImageOutputs {
  output: ImageRef;
}

export function image(inputs: ImageInputs): Promise<ImageOutputs> {
  return callNode<ImageOutputs>("nodetool.constant.Image", inputs);
}

// Video — nodetool.constant.Video
export type VideoInputs = {
  value?: VideoRef;
};

export interface VideoOutputs {
  output: VideoRef;
}

export function video(inputs: VideoInputs): Promise<VideoOutputs> {
  return callNode<VideoOutputs>("nodetool.constant.Video", inputs);
}

// Document — nodetool.constant.Document
export type DocumentInputs = {
  value?: unknown;
};

export interface DocumentOutputs {
  output: unknown;
}

export function document(inputs: DocumentInputs): Promise<DocumentOutputs> {
  return callNode<DocumentOutputs>("nodetool.constant.Document", inputs);
}

// Sketch — nodetool.constant.Sketch
export type SketchInputs = {
  value?: unknown;
  sketch_data?: string;
  image?: ImageRef;
  mask?: ImageRef;
  layers?: unknown[];
};

export interface SketchOutputs {
  output: unknown;
  image: ImageRef;
  mask: ImageRef;
  layers: ImageRef[];
}

export function sketch(inputs: SketchInputs): Promise<SketchOutputs> {
  return callNode<SketchOutputs>("nodetool.constant.Sketch", inputs);
}

// Timeline — nodetool.constant.Timeline
export type TimelineInputs = {
  value?: unknown;
};

export interface TimelineOutputs {
  output: unknown;
}

export function timeline(inputs: TimelineInputs): Promise<TimelineOutputs> {
  return callNode<TimelineOutputs>("nodetool.constant.Timeline", inputs);
}

// Script — nodetool.constant.Script
export type ScriptInputs = {
  value?: unknown;
};

export interface ScriptOutputs {
  output: unknown;
}

export function script(inputs: ScriptInputs): Promise<ScriptOutputs> {
  return callNode<ScriptOutputs>("nodetool.constant.Script", inputs);
}

// JSON — nodetool.constant.JSON
export type JSONInputs = {
  value?: unknown;
};

export interface JSONOutputs {
  output: unknown;
}

export function json(inputs: JSONInputs): Promise<JSONOutputs> {
  return callNode<JSONOutputs>("nodetool.constant.JSON", inputs);
}

// Model 3D — nodetool.constant.Model3D
export type Model3DInputs = {
  value?: unknown;
};

export interface Model3DOutputs {
  output: unknown;
}

export function model3D(inputs: Model3DInputs): Promise<Model3DOutputs> {
  return callNode<Model3DOutputs>("nodetool.constant.Model3D", inputs);
}

// Data Frame — nodetool.constant.DataFrame
export type DataFrameInputs = {
  value?: DataframeRef;
};

export interface DataFrameOutputs {
  output: DataframeRef;
}

export function dataFrame(inputs: DataFrameInputs): Promise<DataFrameOutputs> {
  return callNode<DataFrameOutputs>("nodetool.constant.DataFrame", inputs);
}

// Audio List — nodetool.constant.AudioList
export type AudioListInputs = {
  value?: AudioRef[];
};

export interface AudioListOutputs {
  output: AudioRef[];
}

export function audioList(inputs: AudioListInputs): Promise<AudioListOutputs> {
  return callNode<AudioListOutputs>("nodetool.constant.AudioList", inputs);
}

// Image List — nodetool.constant.ImageList
export type ImageListInputs = {
  value?: ImageRef[];
};

export interface ImageListOutputs {
  output: ImageRef[];
}

export function imageList(inputs: ImageListInputs): Promise<ImageListOutputs> {
  return callNode<ImageListOutputs>("nodetool.constant.ImageList", inputs);
}

// Video List — nodetool.constant.VideoList
export type VideoListInputs = {
  value?: VideoRef[];
};

export interface VideoListOutputs {
  output: VideoRef[];
}

export function videoList(inputs: VideoListInputs): Promise<VideoListOutputs> {
  return callNode<VideoListOutputs>("nodetool.constant.VideoList", inputs);
}

// Select — nodetool.constant.Select
export type SelectInputs = {
  value?: string;
  options?: string[];
  enum_type_name?: string;
};

export interface SelectOutputs {
  output: string;
}

export function select(inputs: SelectInputs): Promise<SelectOutputs> {
  return callNode<SelectOutputs>("nodetool.constant.Select", inputs);
}

// Image Size — nodetool.constant.ImageSize
export type ImageSizeInputs = {
  value?: unknown;
};

export interface ImageSizeOutputs {
  image_size: unknown;
  width: number;
  height: number;
}

export function imageSize(inputs: ImageSizeInputs): Promise<ImageSizeOutputs> {
  return callNode<ImageSizeOutputs>("nodetool.constant.ImageSize", inputs);
}

// Date — nodetool.constant.Date
export type DateInputs = {
  year?: number;
  month?: number;
  day?: number;
};

export interface DateOutputs {
  output: unknown;
}

export function date(inputs: DateInputs): Promise<DateOutputs> {
  return callNode<DateOutputs>("nodetool.constant.Date", inputs);
}

// Date Time — nodetool.constant.DateTime
export type DateTimeInputs = {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
  tzinfo?: string;
  utc_offset?: number;
};

export interface DateTimeOutputs {
  output: unknown;
}

export function dateTime(inputs: DateTimeInputs): Promise<DateTimeOutputs> {
  return callNode<DateTimeOutputs>("nodetool.constant.DateTime", inputs);
}

// ASR Model Constant — nodetool.constant.ASRModelConstant
export type ASRModelConstantInputs = {
  value?: unknown;
};

export interface ASRModelConstantOutputs {
  output: unknown;
}

export function asrModelConstant(inputs: ASRModelConstantInputs): Promise<ASRModelConstantOutputs> {
  return callNode<ASRModelConstantOutputs>("nodetool.constant.ASRModelConstant", inputs);
}

// Embedding Model Constant — nodetool.constant.EmbeddingModelConstant
export type EmbeddingModelConstantInputs = {
  value?: unknown;
};

export interface EmbeddingModelConstantOutputs {
  output: unknown;
}

export function embeddingModelConstant(inputs: EmbeddingModelConstantInputs): Promise<EmbeddingModelConstantOutputs> {
  return callNode<EmbeddingModelConstantOutputs>("nodetool.constant.EmbeddingModelConstant", inputs);
}

// Image Model Constant — nodetool.constant.ImageModelConstant
export type ImageModelConstantInputs = {
  value?: unknown;
};

export interface ImageModelConstantOutputs {
  output: unknown;
}

export function imageModelConstant(inputs: ImageModelConstantInputs): Promise<ImageModelConstantOutputs> {
  return callNode<ImageModelConstantOutputs>("nodetool.constant.ImageModelConstant", inputs);
}

// Language Model Constant — nodetool.constant.LanguageModelConstant
export type LanguageModelConstantInputs = {
  value?: unknown;
};

export interface LanguageModelConstantOutputs {
  output: unknown;
}

export function languageModelConstant(inputs: LanguageModelConstantInputs): Promise<LanguageModelConstantOutputs> {
  return callNode<LanguageModelConstantOutputs>("nodetool.constant.LanguageModelConstant", inputs);
}

// TTS Model Constant — nodetool.constant.TTSModelConstant
export type TTSModelConstantInputs = {
  value?: unknown;
};

export interface TTSModelConstantOutputs {
  output: unknown;
}

export function ttsModelConstant(inputs: TTSModelConstantInputs): Promise<TTSModelConstantOutputs> {
  return callNode<TTSModelConstantOutputs>("nodetool.constant.TTSModelConstant", inputs);
}

// Video Model Constant — nodetool.constant.VideoModelConstant
export type VideoModelConstantInputs = {
  value?: unknown;
};

export interface VideoModelConstantOutputs {
  output: unknown;
}

export function videoModelConstant(inputs: VideoModelConstantInputs): Promise<VideoModelConstantOutputs> {
  return callNode<VideoModelConstantOutputs>("nodetool.constant.VideoModelConstant", inputs);
}
