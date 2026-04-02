// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef, VideoRef, DataframeRef } from "../types.js";

// Constant — nodetool.constant.Constant
export interface ConstantInputs {}

export interface ConstantOutputs {}

export function constant(inputs?: ConstantInputs): DslNode<ConstantOutputs> {
  return createNode(
    "nodetool.constant.Constant",
    (inputs ?? {}) as Record<string, unknown>,
    { outputNames: [] }
  );
}

// Bool — nodetool.constant.Bool
export interface BoolInputs {
  value?: Connectable<boolean>;
}

export interface BoolOutputs {
  output: boolean;
}

export function bool(inputs: BoolInputs): DslNode<BoolOutputs, "output"> {
  return createNode(
    "nodetool.constant.Bool",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Integer — nodetool.constant.Integer
export interface IntegerInputs {
  value?: Connectable<number>;
}

export interface IntegerOutputs {
  output: number;
}

export function integer(
  inputs: IntegerInputs
): DslNode<IntegerOutputs, "output"> {
  return createNode(
    "nodetool.constant.Integer",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Float — nodetool.constant.Float
export interface FloatInputs {
  value?: Connectable<number>;
}

export interface FloatOutputs {
  output: number;
}

export function float(inputs: FloatInputs): DslNode<FloatOutputs, "output"> {
  return createNode(
    "nodetool.constant.Float",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// String — nodetool.constant.String
export interface StringInputs {
  value?: Connectable<string>;
}

export interface StringOutputs {
  output: string;
}

export function string(inputs: StringInputs): DslNode<StringOutputs, "output"> {
  return createNode(
    "nodetool.constant.String",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// List — nodetool.constant.List
export interface ListInputs {
  value?: Connectable<unknown[]>;
}

export interface ListOutputs {
  output: unknown[];
}

export function list(inputs: ListInputs): DslNode<ListOutputs, "output"> {
  return createNode(
    "nodetool.constant.List",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Text List — nodetool.constant.TextList
export interface TextListInputs {
  value?: Connectable<string[]>;
}

export interface TextListOutputs {
  output: string[];
}

export function textList(
  inputs: TextListInputs
): DslNode<TextListOutputs, "output"> {
  return createNode(
    "nodetool.constant.TextList",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Dict — nodetool.constant.Dict
export interface DictInputs {
  value?: Connectable<Record<string, unknown>>;
}

export interface DictOutputs {
  output: Record<string, unknown>;
}

export function dict(inputs: DictInputs): DslNode<DictOutputs, "output"> {
  return createNode(
    "nodetool.constant.Dict",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Audio — nodetool.constant.Audio
export interface AudioInputs {
  value?: Connectable<AudioRef>;
}

export interface AudioOutputs {
  output: AudioRef;
}

export function audio(inputs: AudioInputs): DslNode<AudioOutputs, "output"> {
  return createNode(
    "nodetool.constant.Audio",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Image — nodetool.constant.Image
export interface ImageInputs {
  value?: Connectable<ImageRef>;
}

export interface ImageOutputs {
  output: ImageRef;
}

export function image(inputs: ImageInputs): DslNode<ImageOutputs, "output"> {
  return createNode(
    "nodetool.constant.Image",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Video — nodetool.constant.Video
export interface VideoInputs {
  value?: Connectable<VideoRef>;
}

export interface VideoOutputs {
  output: VideoRef;
}

export function video(inputs: VideoInputs): DslNode<VideoOutputs, "output"> {
  return createNode(
    "nodetool.constant.Video",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Document — nodetool.constant.Document
export interface DocumentInputs {
  value?: Connectable<unknown>;
}

export interface DocumentOutputs {
  output: unknown;
}

export function document(
  inputs: DocumentInputs
): DslNode<DocumentOutputs, "output"> {
  return createNode(
    "nodetool.constant.Document",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// JSON — nodetool.constant.JSON
export interface JSONInputs {
  value?: Connectable<unknown>;
}

export interface JSONOutputs {
  output: unknown;
}

export function json(inputs: JSONInputs): DslNode<JSONOutputs, "output"> {
  return createNode(
    "nodetool.constant.JSON",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Model 3D — nodetool.constant.Model3D
export interface Model3DInputs {
  value?: Connectable<unknown>;
}

export interface Model3DOutputs {
  output: unknown;
}

export function model3D(
  inputs: Model3DInputs
): DslNode<Model3DOutputs, "output"> {
  return createNode(
    "nodetool.constant.Model3D",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Data Frame — nodetool.constant.DataFrame
export interface DataFrameInputs {
  value?: Connectable<DataframeRef>;
}

export interface DataFrameOutputs {
  output: DataframeRef;
}

export function dataFrame(
  inputs: DataFrameInputs
): DslNode<DataFrameOutputs, "output"> {
  return createNode(
    "nodetool.constant.DataFrame",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Audio List — nodetool.constant.AudioList
export interface AudioListInputs {
  value?: Connectable<AudioRef[]>;
}

export interface AudioListOutputs {
  output: AudioRef[];
}

export function audioList(
  inputs: AudioListInputs
): DslNode<AudioListOutputs, "output"> {
  return createNode(
    "nodetool.constant.AudioList",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Image List — nodetool.constant.ImageList
export interface ImageListInputs {
  value?: Connectable<ImageRef[]>;
}

export interface ImageListOutputs {
  output: ImageRef[];
}

export function imageList(
  inputs: ImageListInputs
): DslNode<ImageListOutputs, "output"> {
  return createNode(
    "nodetool.constant.ImageList",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Video List — nodetool.constant.VideoList
export interface VideoListInputs {
  value?: Connectable<VideoRef[]>;
}

export interface VideoListOutputs {
  output: VideoRef[];
}

export function videoList(
  inputs: VideoListInputs
): DslNode<VideoListOutputs, "output"> {
  return createNode(
    "nodetool.constant.VideoList",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function select(inputs: SelectInputs): DslNode<SelectOutputs, "output"> {
  return createNode(
    "nodetool.constant.Select",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function imageSize(inputs: ImageSizeInputs): DslNode<ImageSizeOutputs> {
  return createNode(
    "nodetool.constant.ImageSize",
    inputs as Record<string, unknown>,
    { outputNames: ["image_size", "width", "height"] }
  );
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

export function date(inputs: DateInputs): DslNode<DateOutputs, "output"> {
  return createNode(
    "nodetool.constant.Date",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function dateTime(
  inputs: DateTimeInputs
): DslNode<DateTimeOutputs, "output"> {
  return createNode(
    "nodetool.constant.DateTime",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// ASRModel Constant — nodetool.constant.ASRModelConstant
export interface ASRModelConstantInputs {
  value?: Connectable<unknown>;
}

export interface ASRModelConstantOutputs {
  output: unknown;
}

export function asrModelConstant(
  inputs: ASRModelConstantInputs
): DslNode<ASRModelConstantOutputs, "output"> {
  return createNode(
    "nodetool.constant.ASRModelConstant",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Embedding Model Constant — nodetool.constant.EmbeddingModelConstant
export interface EmbeddingModelConstantInputs {
  value?: Connectable<unknown>;
}

export interface EmbeddingModelConstantOutputs {
  output: unknown;
}

export function embeddingModelConstant(
  inputs: EmbeddingModelConstantInputs
): DslNode<EmbeddingModelConstantOutputs, "output"> {
  return createNode(
    "nodetool.constant.EmbeddingModelConstant",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Image Model Constant — nodetool.constant.ImageModelConstant
export interface ImageModelConstantInputs {
  value?: Connectable<unknown>;
}

export interface ImageModelConstantOutputs {
  output: unknown;
}

export function imageModelConstant(
  inputs: ImageModelConstantInputs
): DslNode<ImageModelConstantOutputs, "output"> {
  return createNode(
    "nodetool.constant.ImageModelConstant",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Language Model Constant — nodetool.constant.LanguageModelConstant
export interface LanguageModelConstantInputs {
  value?: Connectable<unknown>;
}

export interface LanguageModelConstantOutputs {
  output: unknown;
}

export function languageModelConstant(
  inputs: LanguageModelConstantInputs
): DslNode<LanguageModelConstantOutputs, "output"> {
  return createNode(
    "nodetool.constant.LanguageModelConstant",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// TTSModel Constant — nodetool.constant.TTSModelConstant
export interface TTSModelConstantInputs {
  value?: Connectable<unknown>;
}

export interface TTSModelConstantOutputs {
  output: unknown;
}

export function ttsModelConstant(
  inputs: TTSModelConstantInputs
): DslNode<TTSModelConstantOutputs, "output"> {
  return createNode(
    "nodetool.constant.TTSModelConstant",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Video Model Constant — nodetool.constant.VideoModelConstant
export interface VideoModelConstantInputs {
  value?: Connectable<unknown>;
}

export interface VideoModelConstantOutputs {
  output: unknown;
}

export function videoModelConstant(
  inputs: VideoModelConstantInputs
): DslNode<VideoModelConstantOutputs, "output"> {
  return createNode(
    "nodetool.constant.VideoModelConstant",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
