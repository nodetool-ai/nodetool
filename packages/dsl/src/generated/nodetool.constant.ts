// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef, VideoRef, DataframeRef } from "../types.js";

// Bool — nodetool.constant.Bool
export type BoolInputs = {
  value?: Connectable<boolean>;
};

export interface BoolOutputs {
  output: boolean;
}

export function bool(inputs: BoolInputs): DslNode<BoolOutputs, "output"> {
  return createNode("nodetool.constant.Bool", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Integer — nodetool.constant.Integer
export type IntegerInputs = {
  value?: Connectable<number>;
};

export interface IntegerOutputs {
  output: number;
}

export function integer(inputs: IntegerInputs): DslNode<IntegerOutputs, "output"> {
  return createNode("nodetool.constant.Integer", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Float — nodetool.constant.Float
export type FloatInputs = {
  value?: Connectable<number>;
};

export interface FloatOutputs {
  output: number;
}

export function float(inputs: FloatInputs): DslNode<FloatOutputs, "output"> {
  return createNode("nodetool.constant.Float", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// String — nodetool.constant.String
export type StringInputs = {
  value?: Connectable<string>;
};

export interface StringOutputs {
  output: string;
}

export function string(inputs: StringInputs): DslNode<StringOutputs, "output"> {
  return createNode("nodetool.constant.String", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// List — nodetool.constant.List
export type ListInputs = {
  value?: Connectable<unknown[]>;
};

export interface ListOutputs {
  output: unknown[];
}

export function list(inputs: ListInputs): DslNode<ListOutputs, "output"> {
  return createNode("nodetool.constant.List", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Text List — nodetool.constant.TextList
export type TextListInputs = {
  value?: Connectable<string[]>;
};

export interface TextListOutputs {
  output: string[];
}

export function textList(inputs: TextListInputs): DslNode<TextListOutputs, "output"> {
  return createNode("nodetool.constant.TextList", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Dict — nodetool.constant.Dict
export type DictInputs = {
  value?: Connectable<Record<string, unknown>>;
};

export interface DictOutputs {
  output: Record<string, unknown>;
}

export function dict(inputs: DictInputs): DslNode<DictOutputs, "output"> {
  return createNode("nodetool.constant.Dict", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Audio — nodetool.constant.Audio
export type AudioInputs = {
  value?: Connectable<AudioRef>;
};

export interface AudioOutputs {
  output: AudioRef;
}

export function audio(inputs: AudioInputs): DslNode<AudioOutputs, "output"> {
  return createNode("nodetool.constant.Audio", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Image — nodetool.constant.Image
export type ImageInputs = {
  value?: Connectable<ImageRef>;
};

export interface ImageOutputs {
  output: ImageRef;
}

export function image(inputs: ImageInputs): DslNode<ImageOutputs, "output"> {
  return createNode("nodetool.constant.Image", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Video — nodetool.constant.Video
export type VideoInputs = {
  value?: Connectable<VideoRef>;
};

export interface VideoOutputs {
  output: VideoRef;
}

export function video(inputs: VideoInputs): DslNode<VideoOutputs, "output"> {
  return createNode("nodetool.constant.Video", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Document — nodetool.constant.Document
export type DocumentInputs = {
  value?: Connectable<unknown>;
};

export interface DocumentOutputs {
  output: unknown;
}

export function document(inputs: DocumentInputs): DslNode<DocumentOutputs, "output"> {
  return createNode("nodetool.constant.Document", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Sketch — nodetool.constant.Sketch
export type SketchInputs = {
  value?: Connectable<unknown>;
  sketch_data?: Connectable<string>;
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  layers?: Connectable<unknown[]>;
};

export interface SketchOutputs {
  output: unknown;
  image: ImageRef;
  mask: ImageRef;
  layers: ImageRef[];
}

export function sketch(inputs: SketchInputs): DslNode<SketchOutputs> {
  return createNode("nodetool.constant.Sketch", inputs, { outputNames: ["output", "image", "mask", "layers"] });
}

// Timeline — nodetool.constant.Timeline
export type TimelineInputs = {
  value?: Connectable<unknown>;
};

export interface TimelineOutputs {
  output: unknown;
}

export function timeline(inputs: TimelineInputs): DslNode<TimelineOutputs, "output"> {
  return createNode("nodetool.constant.Timeline", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Script — nodetool.constant.Script
export type ScriptInputs = {
  value?: Connectable<unknown>;
};

export interface ScriptOutputs {
  output: unknown;
}

export function script(inputs: ScriptInputs): DslNode<ScriptOutputs, "output"> {
  return createNode("nodetool.constant.Script", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// JSON — nodetool.constant.JSON
export type JSONInputs = {
  value?: Connectable<unknown>;
};

export interface JSONOutputs {
  output: unknown;
}

export function json(inputs: JSONInputs): DslNode<JSONOutputs, "output"> {
  return createNode("nodetool.constant.JSON", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Model 3D — nodetool.constant.Model3D
export type Model3DInputs = {
  value?: Connectable<unknown>;
};

export interface Model3DOutputs {
  output: unknown;
}

export function model3D(inputs: Model3DInputs): DslNode<Model3DOutputs, "output"> {
  return createNode("nodetool.constant.Model3D", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Data Frame — nodetool.constant.DataFrame
export type DataFrameInputs = {
  value?: Connectable<DataframeRef>;
};

export interface DataFrameOutputs {
  output: DataframeRef;
}

export function dataFrame(inputs: DataFrameInputs): DslNode<DataFrameOutputs, "output"> {
  return createNode("nodetool.constant.DataFrame", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Audio List — nodetool.constant.AudioList
export type AudioListInputs = {
  value?: Connectable<AudioRef[]>;
};

export interface AudioListOutputs {
  output: AudioRef[];
}

export function audioList(inputs: AudioListInputs): DslNode<AudioListOutputs, "output"> {
  return createNode("nodetool.constant.AudioList", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Image List — nodetool.constant.ImageList
export type ImageListInputs = {
  value?: Connectable<ImageRef[]>;
};

export interface ImageListOutputs {
  output: ImageRef[];
}

export function imageList(inputs: ImageListInputs): DslNode<ImageListOutputs, "output"> {
  return createNode("nodetool.constant.ImageList", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Video List — nodetool.constant.VideoList
export type VideoListInputs = {
  value?: Connectable<VideoRef[]>;
};

export interface VideoListOutputs {
  output: VideoRef[];
}

export function videoList(inputs: VideoListInputs): DslNode<VideoListOutputs, "output"> {
  return createNode("nodetool.constant.VideoList", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Select — nodetool.constant.Select
export type SelectInputs = {
  value?: Connectable<string>;
  options?: Connectable<string[]>;
  enum_type_name?: Connectable<string>;
};

export interface SelectOutputs {
  output: string;
}

export function select(inputs: SelectInputs): DslNode<SelectOutputs, "output"> {
  return createNode("nodetool.constant.Select", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Image Size — nodetool.constant.ImageSize
export type ImageSizeInputs = {
  value?: Connectable<unknown>;
};

export interface ImageSizeOutputs {
  image_size: unknown;
  width: number;
  height: number;
}

export function imageSize(inputs: ImageSizeInputs): DslNode<ImageSizeOutputs> {
  return createNode("nodetool.constant.ImageSize", inputs, { outputNames: ["image_size", "width", "height"] });
}

// Date — nodetool.constant.Date
export type DateInputs = {
  year?: Connectable<number>;
  month?: Connectable<number>;
  day?: Connectable<number>;
};

export interface DateOutputs {
  output: unknown;
}

export function date(inputs: DateInputs): DslNode<DateOutputs, "output"> {
  return createNode("nodetool.constant.Date", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Date Time — nodetool.constant.DateTime
export type DateTimeInputs = {
  year?: Connectable<number>;
  month?: Connectable<number>;
  day?: Connectable<number>;
  hour?: Connectable<number>;
  minute?: Connectable<number>;
  second?: Connectable<number>;
  millisecond?: Connectable<number>;
  tzinfo?: Connectable<string>;
  utc_offset?: Connectable<number>;
};

export interface DateTimeOutputs {
  output: unknown;
}

export function dateTime(inputs: DateTimeInputs): DslNode<DateTimeOutputs, "output"> {
  return createNode("nodetool.constant.DateTime", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// ASR Model Constant — nodetool.constant.ASRModelConstant
export type ASRModelConstantInputs = {
  value?: Connectable<unknown>;
};

export interface ASRModelConstantOutputs {
  output: unknown;
}

export function asrModelConstant(inputs: ASRModelConstantInputs): DslNode<ASRModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.ASRModelConstant", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Embedding Model Constant — nodetool.constant.EmbeddingModelConstant
export type EmbeddingModelConstantInputs = {
  value?: Connectable<unknown>;
};

export interface EmbeddingModelConstantOutputs {
  output: unknown;
}

export function embeddingModelConstant(inputs: EmbeddingModelConstantInputs): DslNode<EmbeddingModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.EmbeddingModelConstant", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Image Model Constant — nodetool.constant.ImageModelConstant
export type ImageModelConstantInputs = {
  value?: Connectable<unknown>;
};

export interface ImageModelConstantOutputs {
  output: unknown;
}

export function imageModelConstant(inputs: ImageModelConstantInputs): DslNode<ImageModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.ImageModelConstant", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Language Model Constant — nodetool.constant.LanguageModelConstant
export type LanguageModelConstantInputs = {
  value?: Connectable<unknown>;
};

export interface LanguageModelConstantOutputs {
  output: unknown;
}

export function languageModelConstant(inputs: LanguageModelConstantInputs): DslNode<LanguageModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.LanguageModelConstant", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// TTS Model Constant — nodetool.constant.TTSModelConstant
export type TTSModelConstantInputs = {
  value?: Connectable<unknown>;
};

export interface TTSModelConstantOutputs {
  output: unknown;
}

export function ttsModelConstant(inputs: TTSModelConstantInputs): DslNode<TTSModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.TTSModelConstant", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Video Model Constant — nodetool.constant.VideoModelConstant
export type VideoModelConstantInputs = {
  value?: Connectable<unknown>;
};

export interface VideoModelConstantOutputs {
  output: unknown;
}

export function videoModelConstant(inputs: VideoModelConstantInputs): DslNode<VideoModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.VideoModelConstant", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
