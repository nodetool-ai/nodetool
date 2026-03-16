// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";
import type { ImageRef, AudioRef, VideoRef, DataframeRef } from "../types.js";

// Constant — nodetool.constant.Constant
export interface ConstantInputs {
}

export function constant(inputs?: ConstantInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.constant.Constant", (inputs ?? {}) as Record<string, unknown>);
}

// Bool — nodetool.constant.Bool
export interface BoolInputs {
  value?: Connectable<boolean>;
}

export function bool(inputs: BoolInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.constant.Bool", inputs as Record<string, unknown>);
}

// Integer — nodetool.constant.Integer
export interface IntegerInputs {
  value?: Connectable<number>;
}

export function integer(inputs: IntegerInputs): DslNode<SingleOutput<number>> {
  return createNode("nodetool.constant.Integer", inputs as Record<string, unknown>);
}

// Float — nodetool.constant.Float
export interface FloatInputs {
  value?: Connectable<number>;
}

export function float(inputs: FloatInputs): DslNode<SingleOutput<number>> {
  return createNode("nodetool.constant.Float", inputs as Record<string, unknown>);
}

// String — nodetool.constant.String
export interface StringInputs {
  value?: Connectable<string>;
}

export function string(inputs: StringInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.constant.String", inputs as Record<string, unknown>);
}

// List — nodetool.constant.List
export interface ListInputs {
  value?: Connectable<unknown[]>;
}

export function list(inputs: ListInputs): DslNode<SingleOutput<unknown[]>> {
  return createNode("nodetool.constant.List", inputs as Record<string, unknown>);
}

// Text List — nodetool.constant.TextList
export interface TextListInputs {
  value?: Connectable<string[]>;
}

export function textList(inputs: TextListInputs): DslNode<SingleOutput<string[]>> {
  return createNode("nodetool.constant.TextList", inputs as Record<string, unknown>);
}

// Dict — nodetool.constant.Dict
export interface DictInputs {
  value?: Connectable<Record<string, unknown>>;
}

export function dict(inputs: DictInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("nodetool.constant.Dict", inputs as Record<string, unknown>);
}

// Audio — nodetool.constant.Audio
export interface AudioInputs {
  value?: Connectable<AudioRef>;
}

export function audio(inputs: AudioInputs): DslNode<SingleOutput<AudioRef>> {
  return createNode("nodetool.constant.Audio", inputs as Record<string, unknown>);
}

// Image — nodetool.constant.Image
export interface ImageInputs {
  value?: Connectable<ImageRef>;
}

export function image(inputs: ImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("nodetool.constant.Image", inputs as Record<string, unknown>);
}

// Video — nodetool.constant.Video
export interface VideoInputs {
  value?: Connectable<VideoRef>;
}

export function video(inputs: VideoInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.constant.Video", inputs as Record<string, unknown>);
}

// Document — nodetool.constant.Document
export interface DocumentInputs {
  value?: Connectable<unknown>;
}

export function document(inputs: DocumentInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.constant.Document", inputs as Record<string, unknown>);
}

// JSON — nodetool.constant.JSON
export interface JSONInputs {
  value?: Connectable<unknown>;
}

export function json(inputs: JSONInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.constant.JSON", inputs as Record<string, unknown>);
}

// Model 3D — nodetool.constant.Model3D
export interface Model3DInputs {
  value?: Connectable<unknown>;
}

export function model3D(inputs: Model3DInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.constant.Model3D", inputs as Record<string, unknown>);
}

// Data Frame — nodetool.constant.DataFrame
export interface DataFrameInputs {
  value?: Connectable<DataframeRef>;
}

export function dataFrame(inputs: DataFrameInputs): DslNode<SingleOutput<DataframeRef>> {
  return createNode("nodetool.constant.DataFrame", inputs as Record<string, unknown>);
}

// Audio List — nodetool.constant.AudioList
export interface AudioListInputs {
  value?: Connectable<AudioRef[]>;
}

export function audioList(inputs: AudioListInputs): DslNode<SingleOutput<AudioRef[]>> {
  return createNode("nodetool.constant.AudioList", inputs as Record<string, unknown>);
}

// Image List — nodetool.constant.ImageList
export interface ImageListInputs {
  value?: Connectable<ImageRef[]>;
}

export function imageList(inputs: ImageListInputs): DslNode<SingleOutput<ImageRef[]>> {
  return createNode("nodetool.constant.ImageList", inputs as Record<string, unknown>);
}

// Video List — nodetool.constant.VideoList
export interface VideoListInputs {
  value?: Connectable<VideoRef[]>;
}

export function videoList(inputs: VideoListInputs): DslNode<SingleOutput<VideoRef[]>> {
  return createNode("nodetool.constant.VideoList", inputs as Record<string, unknown>);
}

// Select — nodetool.constant.Select
export interface SelectInputs {
  value?: Connectable<string>;
  options?: Connectable<string[]>;
  enum_type_name?: Connectable<string>;
}

export function select(inputs: SelectInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.constant.Select", inputs as Record<string, unknown>);
}

// Image Size — nodetool.constant.ImageSize
export interface ImageSizeInputs {
  value?: Connectable<unknown>;
}

export interface ImageSizeOutputs {
  image_size: OutputHandle<unknown>;
  width: OutputHandle<number>;
  height: OutputHandle<number>;
}

export function imageSize(inputs: ImageSizeInputs): DslNode<ImageSizeOutputs> {
  return createNode("nodetool.constant.ImageSize", inputs as Record<string, unknown>, { multiOutput: true });
}

// Date — nodetool.constant.Date
export interface DateInputs {
  year?: Connectable<number>;
  month?: Connectable<number>;
  day?: Connectable<number>;
}

export function date(inputs: DateInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.constant.Date", inputs as Record<string, unknown>);
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

export function dateTime(inputs: DateTimeInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.constant.DateTime", inputs as Record<string, unknown>);
}

// ASRModel Constant — nodetool.constant.ASRModelConstant
export interface ASRModelConstantInputs {
  value?: Connectable<unknown>;
}

export function asrModelConstant(inputs: ASRModelConstantInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.constant.ASRModelConstant", inputs as Record<string, unknown>);
}

// Embedding Model Constant — nodetool.constant.EmbeddingModelConstant
export interface EmbeddingModelConstantInputs {
  value?: Connectable<unknown>;
}

export function embeddingModelConstant(inputs: EmbeddingModelConstantInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.constant.EmbeddingModelConstant", inputs as Record<string, unknown>);
}

// Image Model Constant — nodetool.constant.ImageModelConstant
export interface ImageModelConstantInputs {
  value?: Connectable<unknown>;
}

export function imageModelConstant(inputs: ImageModelConstantInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.constant.ImageModelConstant", inputs as Record<string, unknown>);
}

// Language Model Constant — nodetool.constant.LanguageModelConstant
export interface LanguageModelConstantInputs {
  value?: Connectable<unknown>;
}

export function languageModelConstant(inputs: LanguageModelConstantInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.constant.LanguageModelConstant", inputs as Record<string, unknown>);
}

// TTSModel Constant — nodetool.constant.TTSModelConstant
export interface TTSModelConstantInputs {
  value?: Connectable<unknown>;
}

export function ttsModelConstant(inputs: TTSModelConstantInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.constant.TTSModelConstant", inputs as Record<string, unknown>);
}

// Video Model Constant — nodetool.constant.VideoModelConstant
export interface VideoModelConstantInputs {
  value?: Connectable<unknown>;
}

export function videoModelConstant(inputs: VideoModelConstantInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.constant.VideoModelConstant", inputs as Record<string, unknown>);
}
