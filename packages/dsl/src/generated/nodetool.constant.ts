// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef, AudioRef, VideoRef, DataframeRef, StoryboardRef, Entity } from "../types.js";

// Bool — nodetool.constant.Bool
export type BoolInputs = {
  value?: Connectable<boolean>;
};

export interface BoolOutputs {
  output: boolean;
}

export function bool(inputs: BoolInputs, options?: NodeOptions): NodeWithOutputs<BoolOutputs, "output"> {
  return createNode("nodetool.constant.Bool", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"bool"}, defaultOutput: "output" });
}

// Integer — nodetool.constant.Integer
export type IntegerInputs = {
  value?: Connectable<number>;
};

export interface IntegerOutputs {
  output: number;
}

export function integer(inputs: IntegerInputs, options?: NodeOptions): NodeWithOutputs<IntegerOutputs, "output"> {
  return createNode("nodetool.constant.Integer", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"int"}, defaultOutput: "output" });
}

// Float — nodetool.constant.Float
export type FloatInputs = {
  value?: Connectable<number>;
};

export interface FloatOutputs {
  output: number;
}

export function float(inputs: FloatInputs, options?: NodeOptions): NodeWithOutputs<FloatOutputs, "output"> {
  return createNode("nodetool.constant.Float", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"float"}, defaultOutput: "output" });
}

// String — nodetool.constant.String
export type StringInputs = {
  value?: Connectable<string>;
};

export interface StringOutputs {
  output: string;
}

export function string(inputs: StringInputs, options?: NodeOptions): NodeWithOutputs<StringOutputs, "output"> {
  return createNode("nodetool.constant.String", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
}

// List — nodetool.constant.List
export type ListInputs = {
  value?: Connectable<unknown[]>;
};

export interface ListOutputs {
  output: unknown[];
}

export function list(inputs: ListInputs, options?: NodeOptions): NodeWithOutputs<ListOutputs, "output"> {
  return createNode("nodetool.constant.List", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[any]"}, defaultOutput: "output" });
}

// Text List — nodetool.constant.TextList
export type TextListInputs = {
  value?: Connectable<string[]>;
};

export interface TextListOutputs {
  output: string[];
}

export function textList(inputs: TextListInputs, options?: NodeOptions): NodeWithOutputs<TextListOutputs, "output"> {
  return createNode("nodetool.constant.TextList", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[str]"}, defaultOutput: "output" });
}

// Dict — nodetool.constant.Dict
export type DictInputs = {
  value?: Connectable<Record<string, unknown>>;
};

export interface DictOutputs {
  output: Record<string, unknown>;
}

export function dict(inputs: DictInputs, options?: NodeOptions): NodeWithOutputs<DictOutputs, "output"> {
  return createNode("nodetool.constant.Dict", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"dict[str, any]"}, defaultOutput: "output" });
}

// Audio — nodetool.constant.Audio
export type AudioInputs = {
  value?: Connectable<AudioRef>;
};

export interface AudioOutputs {
  output: AudioRef;
}

export function audio(inputs: AudioInputs, options?: NodeOptions): NodeWithOutputs<AudioOutputs, "output"> {
  return createNode("nodetool.constant.Audio", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"audio"}, defaultOutput: "output" });
}

// Image — nodetool.constant.Image
export type ImageInputs = {
  value?: Connectable<ImageRef>;
};

export interface ImageOutputs {
  output: ImageRef;
}

export function image(inputs: ImageInputs, options?: NodeOptions): NodeWithOutputs<ImageOutputs, "output"> {
  return createNode("nodetool.constant.Image", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Video — nodetool.constant.Video
export type VideoInputs = {
  value?: Connectable<VideoRef>;
};

export interface VideoOutputs {
  output: VideoRef;
}

export function video(inputs: VideoInputs, options?: NodeOptions): NodeWithOutputs<VideoOutputs, "output"> {
  return createNode("nodetool.constant.Video", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video"}, defaultOutput: "output" });
}

// Document — nodetool.constant.Document
export type DocumentInputs = {
  value?: Connectable<unknown>;
};

export interface DocumentOutputs {
  output: unknown;
}

export function document(inputs: DocumentInputs, options?: NodeOptions): NodeWithOutputs<DocumentOutputs, "output"> {
  return createNode("nodetool.constant.Document", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"document"}, defaultOutput: "output" });
}

// Sketch — nodetool.constant.Sketch
export type SketchInputs = {
  value?: Connectable<unknown>;
  sketch_data?: Connectable<string>;
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  layers?: Connectable<unknown[]>;
  [name: string]: unknown;
};

export interface SketchOutputs {
  output: unknown;
  image: ImageRef;
  mask: ImageRef;
  layers: ImageRef[];
}

export function sketch(inputs: SketchInputs, options?: NodeOptions): NodeWithOutputs<SketchOutputs> {
  return createNode("nodetool.constant.Sketch", inputs, { id: options?.id, outputNames: ["output", "image", "mask", "layers"], outputTypes: {"output":"sketch","image":"image","mask":"image","layers":"list[image]"} });
}

// Timeline — nodetool.constant.Timeline
export type TimelineInputs = {
  value?: Connectable<unknown>;
};

export interface TimelineOutputs {
  output: unknown;
}

export function timeline(inputs: TimelineInputs, options?: NodeOptions): NodeWithOutputs<TimelineOutputs, "output"> {
  return createNode("nodetool.constant.Timeline", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"timeline"}, defaultOutput: "output" });
}

// Script — nodetool.constant.Script
export type ScriptInputs = {
  value?: Connectable<unknown>;
};

export interface ScriptOutputs {
  output: unknown;
}

export function script(inputs: ScriptInputs, options?: NodeOptions): NodeWithOutputs<ScriptOutputs, "output"> {
  return createNode("nodetool.constant.Script", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"script"}, defaultOutput: "output" });
}

// Storyboard — nodetool.constant.Storyboard
export type StoryboardInputs = {
  value?: Connectable<StoryboardRef>;
};

export interface StoryboardOutputs {
  output: StoryboardRef;
}

export function storyboard(inputs: StoryboardInputs, options?: NodeOptions): NodeWithOutputs<StoryboardOutputs, "output"> {
  return createNode("nodetool.constant.Storyboard", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"storyboard"}, defaultOutput: "output" });
}

// Entity — nodetool.constant.Entity
export type EntityInputs = {
  value?: Connectable<Entity>;
};

export interface EntityOutputs {
  output: Entity;
}

export function entity(inputs: EntityInputs, options?: NodeOptions): NodeWithOutputs<EntityOutputs, "output"> {
  return createNode("nodetool.constant.Entity", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"entity"}, defaultOutput: "output" });
}

// JSON — nodetool.constant.JSON
export type JSONInputs = {
  value?: Connectable<unknown>;
};

export interface JSONOutputs {
  output: unknown;
}

export function json(inputs: JSONInputs, options?: NodeOptions): NodeWithOutputs<JSONOutputs, "output"> {
  return createNode("nodetool.constant.JSON", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"json"}, defaultOutput: "output" });
}

// Model 3D — nodetool.constant.Model3D
export type Model3DInputs = {
  value?: Connectable<unknown>;
};

export interface Model3DOutputs {
  output: unknown;
}

export function model3D(inputs: Model3DInputs, options?: NodeOptions): NodeWithOutputs<Model3DOutputs, "output"> {
  return createNode("nodetool.constant.Model3D", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
}

// Data Frame — nodetool.constant.DataFrame
export type DataFrameInputs = {
  value?: Connectable<DataframeRef>;
};

export interface DataFrameOutputs {
  output: DataframeRef;
}

export function dataFrame(inputs: DataFrameInputs, options?: NodeOptions): NodeWithOutputs<DataFrameOutputs, "output"> {
  return createNode("nodetool.constant.DataFrame", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"dataframe"}, defaultOutput: "output" });
}

// Audio List — nodetool.constant.AudioList
export type AudioListInputs = {
  value?: Connectable<AudioRef[]>;
};

export interface AudioListOutputs {
  output: AudioRef[];
}

export function audioList(inputs: AudioListInputs, options?: NodeOptions): NodeWithOutputs<AudioListOutputs, "output"> {
  return createNode("nodetool.constant.AudioList", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[audio]"}, defaultOutput: "output" });
}

// Image List — nodetool.constant.ImageList
export type ImageListInputs = {
  value?: Connectable<ImageRef[]>;
};

export interface ImageListOutputs {
  output: ImageRef[];
}

export function imageList(inputs: ImageListInputs, options?: NodeOptions): NodeWithOutputs<ImageListOutputs, "output"> {
  return createNode("nodetool.constant.ImageList", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[image]"}, defaultOutput: "output" });
}

// Video List — nodetool.constant.VideoList
export type VideoListInputs = {
  value?: Connectable<VideoRef[]>;
};

export interface VideoListOutputs {
  output: VideoRef[];
}

export function videoList(inputs: VideoListInputs, options?: NodeOptions): NodeWithOutputs<VideoListOutputs, "output"> {
  return createNode("nodetool.constant.VideoList", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"list[video]"}, defaultOutput: "output" });
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

export function select(inputs: SelectInputs, options?: NodeOptions): NodeWithOutputs<SelectOutputs, "output"> {
  return createNode("nodetool.constant.Select", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"str"}, defaultOutput: "output" });
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

export function imageSize(inputs: ImageSizeInputs, options?: NodeOptions): NodeWithOutputs<ImageSizeOutputs> {
  return createNode("nodetool.constant.ImageSize", inputs, { id: options?.id, outputNames: ["image_size", "width", "height"], outputTypes: {"image_size":"image_size","width":"int","height":"int"} });
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

export function date(inputs: DateInputs, options?: NodeOptions): NodeWithOutputs<DateOutputs, "output"> {
  return createNode("nodetool.constant.Date", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"date"}, defaultOutput: "output" });
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

export function dateTime(inputs: DateTimeInputs, options?: NodeOptions): NodeWithOutputs<DateTimeOutputs, "output"> {
  return createNode("nodetool.constant.DateTime", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"datetime"}, defaultOutput: "output" });
}

// ASR Model Constant — nodetool.constant.ASRModelConstant
export type ASRModelConstantInputs = {
  value?: Connectable<unknown>;
};

export interface ASRModelConstantOutputs {
  output: unknown;
}

export function asrModelConstant(inputs: ASRModelConstantInputs, options?: NodeOptions): NodeWithOutputs<ASRModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.ASRModelConstant", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"asr_model"}, defaultOutput: "output" });
}

// Embedding Model Constant — nodetool.constant.EmbeddingModelConstant
export type EmbeddingModelConstantInputs = {
  value?: Connectable<unknown>;
};

export interface EmbeddingModelConstantOutputs {
  output: unknown;
}

export function embeddingModelConstant(inputs: EmbeddingModelConstantInputs, options?: NodeOptions): NodeWithOutputs<EmbeddingModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.EmbeddingModelConstant", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"embedding_model"}, defaultOutput: "output" });
}

// Image Model Constant — nodetool.constant.ImageModelConstant
export type ImageModelConstantInputs = {
  value?: Connectable<unknown>;
};

export interface ImageModelConstantOutputs {
  output: unknown;
}

export function imageModelConstant(inputs: ImageModelConstantInputs, options?: NodeOptions): NodeWithOutputs<ImageModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.ImageModelConstant", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image_model"}, defaultOutput: "output" });
}

// Language Model Constant — nodetool.constant.LanguageModelConstant
export type LanguageModelConstantInputs = {
  value?: Connectable<unknown>;
};

export interface LanguageModelConstantOutputs {
  output: unknown;
}

export function languageModelConstant(inputs: LanguageModelConstantInputs, options?: NodeOptions): NodeWithOutputs<LanguageModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.LanguageModelConstant", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"language_model"}, defaultOutput: "output" });
}

// TTS Model Constant — nodetool.constant.TTSModelConstant
export type TTSModelConstantInputs = {
  value?: Connectable<unknown>;
};

export interface TTSModelConstantOutputs {
  output: unknown;
}

export function ttsModelConstant(inputs: TTSModelConstantInputs, options?: NodeOptions): NodeWithOutputs<TTSModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.TTSModelConstant", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"tts_model"}, defaultOutput: "output" });
}

// Video Model Constant — nodetool.constant.VideoModelConstant
export type VideoModelConstantInputs = {
  value?: Connectable<unknown>;
};

export interface VideoModelConstantOutputs {
  output: unknown;
}

export function videoModelConstant(inputs: VideoModelConstantInputs, options?: NodeOptions): NodeWithOutputs<VideoModelConstantOutputs, "output"> {
  return createNode("nodetool.constant.VideoModelConstant", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"video_model"}, defaultOutput: "output" });
}
