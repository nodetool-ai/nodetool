import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type {
  ASRModel,
  AudioRef,
  DataframeRef,
  DocumentRef,
  EmbeddingModel,
  FolderRef,
  HuggingFaceModel,
  ImageModel,
  ImageRef,
  InputMode,
  LanguageModel,
  Message,
  Model3DRef,
  OutputCorrelation,
  TTSModel,
  VideoModel,
  VideoRef
} from "@nodetool-ai/protocol";
import { tagAsUniversal } from "@nodetool-ai/nodes-utils";
import {
  NAME_PROP,
  INPUT_DESCRIPTION_PROP,
  asrModelDefault,
  audioRefDefault,
  colorDefault,
  dataframeRefDefault,
  documentRefDefault,
  embeddingModelDefault,
  folderRefDefault,
  hfModelDefault,
  imageModelDefault,
  imageRefDefault,
  languageModelDefault,
  messageRefDefault,
  model3DRefDefault,
  ttsModelDefault,
  videoModelDefault,
  videoRefDefault
} from "./ref-defaults.js";

interface ColorValue {
  type: "color";
  value: string | null;
}

interface ImageSizeValue {
  width?: number;
  height?: number;
}

export class FloatInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.FloatInput";
  static readonly title = "Float Input";
  static readonly description =
    "Accepts a floating-point number as a parameter for workflows, typically constrained by a minimum and maximum value.  This input allows for precise numeric settings, such as adjustments, scores, or any value requiring decimal precision.\n    input, parameter, float, number, decimal, range";
  static readonly metadataOutputTypes = {
    output: "float"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({ type: "float", default: 0, title: "Value" })
  declare value: number;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  @prop({ type: "float", default: 0, title: "Min" })
  declare min: number;

  @prop({ type: "float", default: 99999, title: "Max" })
  declare max: number;

  async process(): Promise<Record<string, unknown>> {
    const value = this.value ?? 0.0;
    const min = this.min ?? 0;
    const max = this.max ?? 99999;
    return { output: Math.min(Math.max(value, min), max) };
  }
}

export class BooleanInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.BooleanInput";
  static readonly title = "Boolean Input";
  static readonly description =
    "Accepts a boolean (true/false) value as a parameter for workflows.  This input is used for binary choices, enabling or disabling features, or controlling conditional logic paths.\n    input, parameter, boolean, bool, toggle, switch, flag";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({ type: "bool", default: false, title: "Value" })
  declare value: boolean;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? false };
  }
}

export class IntegerInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.IntegerInput";
  static readonly title = "Integer Input";
  static readonly description =
    "Accepts an integer (whole number) as a parameter for workflows, typically constrained by a minimum and maximum value.  This input is used for discrete numeric values like counts, indices, or iteration limits.\n    input, parameter, integer, number, count, index, whole_number";
  static readonly metadataOutputTypes = {
    output: "int"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({ type: "int", default: 0, title: "Value" })
  declare value: number;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  @prop({ type: "int", default: 0, title: "Min" })
  declare min: number;

  @prop({ type: "int", default: 99999, title: "Max" })
  declare max: number;

  async process(): Promise<Record<string, unknown>> {
    const value = this.value ?? 0;
    const min = this.min ?? 0;
    const max = this.max ?? 99999;
    return { output: Math.trunc(Math.min(Math.max(value, min), max)) };
  }
}

export class SelectInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.SelectInput";
  static readonly title = "Select Input";
  static readonly description =
    "Accepts a selection from a predefined set of options as a parameter for workflows.\n    input, parameter, select, enum, dropdown, choice, options\n\n    Use cases:\n    - Let users choose from a fixed set of values in app mode\n    - Configure enum-like options for downstream nodes\n    - Provide dropdown selection for workflow parameters\n\n    The output is a string that can be connected to enum-typed inputs.";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "str",
    default: "",
    title: "Value",
    description: "The currently selected value.",
    json_schema_extra: {
      type: "select"
    }
  })
  declare value: string;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  @prop({
    type: "list[str]",
    default: [],
    title: "Options",
    description: "The list of available options to choose from."
  })
  declare options: string[];

  @prop({
    type: "str",
    default: "",
    title: "Enum Type Name",
    description:
      "The enum type name this select corresponds to (for type matching)."
  })
  declare enum_type_name: string;

  async process(): Promise<Record<string, unknown>> {
    const value = this.value ?? "";
    const options = Array.isArray(this.options) ? this.options : [];
    if (value !== "" && options.length > 0 && !options.includes(value)) {
      throw new Error(
        `SelectInput value "${value}" is not one of the allowed options: ${options.join(", ")}`
      );
    }
    return { output: value };
  }
}

export class StringListInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.StringListInput";
  static readonly title = "String List Input";
  static readonly description =
    "Accepts a list of strings as a parameter for workflows.\n    input, parameter, string, text, label, name, value";
  static readonly metadataOutputTypes = {
    output: "list[str]"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "list[str]",
    default: [],
    title: "Value",
    description: "The list of strings to use as input."
  })
  declare value: string[];

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? [] };
  }
}

export class FolderPathInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.FolderPathInput";
  static readonly title = "Folder Path Input";
  static readonly description =
    "Accepts a folder path as a parameter for workflows.\n    input, parameter, folder, path, folderpath, local_folder, filesystem";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "str",
    default: "",
    title: "Value",
    description: "The folder path to use as input.",
    json_schema_extra: {
      type: "folder_path"
    }
  })
  declare value: string;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? "" };
  }
}

export class HuggingFaceModelInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.HuggingFaceModelInput";
  static readonly title = "Hugging Face Model Input";
  static readonly description =
    "Accepts a Hugging Face model as a parameter for workflows.\n    input, parameter, model, huggingface, hugging_face, model_name";
  static readonly metadataOutputTypes = {
    output: "hf.model"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "hf.model",
    default: hfModelDefault,
    title: "Value",
    description: "The Hugging Face model to use as input."
  })
  declare value: HuggingFaceModel | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class ColorInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.ColorInput";
  static readonly title = "Color Input";
  static readonly description =
    "Accepts a color value as a parameter for workflows.\n    input, parameter, color, color_picker, color_input";
  static readonly metadataOutputTypes = {
    output: "color"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "color",
    default: colorDefault,
    title: "Value",
    description: "The color to use as input."
  })
  declare value: ColorValue | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class ImageSizeInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.ImageSizeInput";
  static readonly title = "Image Size Input";
  static readonly description =
    "Accepts image dimensions as a parameter for workflows.\n    input, parameter, image_size, resolution, width, height, dimensions";
  static readonly metadataOutputTypes = {
    output: "image_size"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "image_size",
    default: null,
    title: "Value",
    description: "The image size to use as input.",
    required: true
  })
  declare value: ImageSizeValue | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class LanguageModelInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.LanguageModelInput";
  static readonly title = "Language Model Input";
  static readonly description =
    "Accepts a language model as a parameter for workflows.\n    input, parameter, model, language, model_name";
  static readonly metadataOutputTypes = {
    output: "language_model"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "language_model",
    default: languageModelDefault,
    title: "Value",
    description: "The language model to use as input."
  })
  declare value: LanguageModel | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class ImageModelInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.ImageModelInput";
  static readonly title = "Image Model Input";
  static readonly description =
    "Accepts an image generation model as a parameter for workflows.\n    input, parameter, model, image, generation";
  static readonly metadataOutputTypes = {
    output: "image_model"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "image_model",
    default: imageModelDefault,
    title: "Value",
    description: "The image generation model to use as input."
  })
  declare value: ImageModel | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class VideoModelInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.VideoModelInput";
  static readonly title = "Video Model Input";
  static readonly description =
    "Accepts a video generation model as a parameter for workflows.\n    input, parameter, model, video, generation";
  static readonly metadataOutputTypes = {
    output: "video_model"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "video_model",
    default: videoModelDefault,
    title: "Value",
    description: "The video generation model to use as input."
  })
  declare value: VideoModel | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class TTSModelInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.TTSModelInput";
  static readonly title = "TTS Model Input";
  static readonly description =
    "Accepts a text-to-speech model as a parameter for workflows.\n    input, parameter, model, tts, speech, voice";
  static readonly metadataOutputTypes = {
    output: "tts_model"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "tts_model",
    default: ttsModelDefault,
    title: "Value",
    description: "The text-to-speech model to use as input."
  })
  declare value: TTSModel | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class ASRModelInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.ASRModelInput";
  static readonly title = "ASR Model Input";
  static readonly description =
    "Accepts an automatic speech recognition model as a parameter for workflows.\n    input, parameter, model, asr, transcription, speech";
  static readonly metadataOutputTypes = {
    output: "asr_model"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "asr_model",
    default: asrModelDefault,
    title: "Value",
    description: "The speech recognition model to use as input."
  })
  declare value: ASRModel | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class EmbeddingModelInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.EmbeddingModelInput";
  static readonly title = "Embedding Model Input";
  static readonly description =
    "Accepts an embedding model as a parameter for workflows.\n    input, parameter, model, embedding, vector";
  static readonly metadataOutputTypes = {
    output: "embedding_model"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "embedding_model",
    default: embeddingModelDefault,
    title: "Value",
    description: "The embedding model to use as input."
  })
  declare value: EmbeddingModel | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class DataframeInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.DataframeInput";
  static readonly title = "Dataframe Input";
  static readonly description =
    "Accepts a reference to a dataframe asset for workflows.\n    input, parameter, dataframe, table, data";
  static readonly metadataOutputTypes = {
    output: "dataframe"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "dataframe",
    default: dataframeRefDefault,
    title: "Value",
    description: "The dataframe to use as input."
  })
  declare value: DataframeRef | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class DocumentInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.DocumentInput";
  static readonly title = "Document Input";
  static readonly description =
    "Accepts a reference to a document asset for workflows, specified by a 'DocumentRef'.  A 'DocumentRef' points to a structured document (e.g., PDF, DOCX, TXT) which can be processed or analyzed. This node is used when the workflow needs to operate on a document as a whole entity, potentially including its structure and metadata, rather than just raw text.\n    input, parameter, document, file, asset, reference\n\n    Use cases:\n    - Load a specific document (e.g., PDF, Word, text file) for content extraction or analysis.\n    - Pass a document to models that are designed to process specific document formats.\n    - Manage documents as distinct assets within a workflow.\n    - If you have a local file path and need to convert it to a 'DocumentRef', consider using 'DocumentFileInput'.";
  static readonly metadataOutputTypes = {
    output: "document"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "document",
    default: documentRefDefault,
    title: "Value",
    description: "The document to use as input."
  })
  declare value: DocumentRef | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class ImageInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.ImageInput";
  static readonly title = "Image Input";
  static readonly description =
    "Accepts a reference to an image asset for workflows, specified by an 'ImageRef'.  An 'ImageRef' points to image data that can be used for display, analysis, or processing by vision models.\n    input, parameter, image, picture, graphic, visual, asset";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "image",
    default: imageRefDefault,
    title: "Value",
    description: "The image to use as input."
  })
  declare value: ImageRef | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class ImageListInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.ImageListInput";
  static readonly title = "Image List Input";
  static readonly description =
    "Accepts a list of image references as a parameter for workflows.\n    input, parameter, image, picture, graphic, visual, asset, list";
  static readonly metadataOutputTypes = {
    output: "list[image]"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "list[image]",
    default: [],
    title: "Value",
    description: "The list of images to use as input."
  })
  declare value: ImageRef[];

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? [] };
  }
}

export class VideoListInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.VideoListInput";
  static readonly title = "Video List Input";
  static readonly description =
    "Accepts a list of video references as a parameter for workflows.\n    input, parameter, video, movie, clip, visual, asset, list";
  static readonly metadataOutputTypes = {
    output: "list[video]"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "list[video]",
    default: [],
    title: "Value",
    description: "The list of videos to use as input."
  })
  declare value: VideoRef[];

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? [] };
  }
}

export class AudioListInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.AudioListInput";
  static readonly title = "Audio List Input";
  static readonly description =
    "Accepts a list of audio references as a parameter for workflows.\n    input, parameter, audio, sound, voice, speech, asset, list";
  static readonly metadataOutputTypes = {
    output: "list[audio]"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "list[audio]",
    default: [],
    title: "Value",
    description: "The list of audio files to use as input."
  })
  declare value: AudioRef[];

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? [] };
  }
}

export class TextListInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.TextListInput";
  static readonly title = "Text List Input";
  static readonly description =
    "Accepts a list of text strings as a parameter for workflows.\n    input, parameter, text, string, list";
  static readonly metadataOutputTypes = {
    output: "list[str]"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "list[str]",
    default: [],
    title: "Value",
    description: "The list of text strings to use as input."
  })
  declare value: string[];

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? [] };
  }
}

export class VideoInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.VideoInput";
  static readonly title = "Video Input";
  static readonly description =
    "Accepts a reference to a video asset for workflows, specified by a 'VideoRef'.  A 'VideoRef' points to video data that can be used for playback, analysis, frame extraction, or processing by video-capable models.\n    input, parameter, video, movie, clip, visual, asset";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "video",
    default: videoRefDefault,
    title: "Value",
    description: "The video to use as input."
  })
  declare value: VideoRef | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class AudioInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.AudioInput";
  static readonly title = "Audio Input";
  static readonly description =
    "Accepts a reference to an audio asset for workflows, specified by an 'AudioRef'.  An 'AudioRef' points to audio data that can be used for playback, transcription, analysis, or processing by audio-capable models.\n    input, parameter, audio, sound, voice, speech, asset";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "audio",
    default: audioRefDefault,
    title: "Value",
    description: "The audio to use as input."
  })
  declare value: AudioRef | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class Model3DInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.Model3DInput";
  static readonly title = "Model 3D Input";
  static readonly description =
    "Accepts a reference to a 3D model asset for workflows, specified by a 'Model3DRef'.\n    A 'Model3DRef' points to 3D model data that can be used for visualization, processing,\n    or conversion by 3D-capable nodes.\n    input, parameter, 3d, model, mesh, obj, glb, stl, ply, asset";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "model_3d",
    default: model3DRefDefault,
    title: "Value",
    description: "The 3D model to use as input."
  })
  declare value: Model3DRef | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class AssetFolderInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.AssetFolderInput";
  static readonly title = "Asset Folder Input";
  static readonly description =
    "Accepts an asset folder as a parameter for workflows.\n    input, parameter, folder, path, folderpath, local_folder, filesystem";
  static readonly metadataOutputTypes = {
    output: "folder"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "folder",
    default: folderRefDefault,
    title: "Value",
    description: "The folder to use as input."
  })
  declare value: FolderRef | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class MessageInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.MessageInput";
  static readonly title = "Message Input";
  static readonly description =
    "Accepts a chat message object for workflows.\n    input, parameter, message, chat, conversation";
  static readonly metadataOutputTypes = {
    output: "message"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "message",
    default: messageRefDefault,
    title: "Value",
    description: "The message object containing role, content, and metadata."
  })
  declare value: Message | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? {} };
  }
}

export class MessageListInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.MessageListInput";
  static readonly title = "Message List Input";
  static readonly description =
    "Accepts a list of chat message objects for workflows.\n    input, parameter, messages, chat, conversation, history";
  static readonly metadataOutputTypes = {
    output: "list[message]"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "list[message]",
    default: [],
    title: "Value",
    description: "The list of message objects representing chat history."
  })
  declare value: Message[];

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? [] };
  }
}

export class StringInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.StringInput";
  static readonly title = "String Input";
  static readonly description =
    "Accepts a string value as a parameter for workflows.\n    input, parameter, string, text, label, name, value\n\n    Use cases:\n    - Define a name for an entity or process.\n    - Specify a label for a component or output.\n    - Enter a short keyword or search term.\n    - Provide a simple configuration value (e.g., an API key, a model name).\n    - If you need to input multi-line text or the content of a file, use 'DocumentFileInput'.";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({ type: "str", default: "", title: "Value" })
  declare value: string;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  @prop({
    type: "int",
    default: 0,
    title: "Max length",
    description: "Maximum number of characters allowed. Use 0 for unlimited.",
    min: 0,
    max: 100000
  })
  declare max_length: number;

  @prop({
    type: "str",
    default: "single_line",
    title: "Line mode",
    description:
      "Controls whether the UI should render the input as single-line or multiline.",
    json_schema_extra: {
      type: "enum",
      values: ["single_line", "multi_line"]
    }
  })
  declare line_mode: string;

  async process(): Promise<Record<string, unknown>> {
    const raw = String(this.value ?? "");
    const max = Number(this.max_length ?? 0);
    if (max > 0 && raw.length > max) {
      return { output: raw.slice(0, max) };
    }
    return { output: raw };
  }
}

export class RealtimeAudioInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.RealtimeAudioInput";
  static readonly title = "Realtime Audio Input";
  static readonly description =
    "Accepts streaming audio data for workflows.\n    input, parameter, audio, sound, voice, speech, asset";
  static readonly metadataOutputTypes = {
    chunk: "chunk"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["value"];
  static readonly inputMode: InputMode = "buffered";
  // RealtimeAudioInput pushes successive audio frames for a single logical
  // stream via runner.pushInputValue. Each chunk is a chunk of one logical
  // realtime stream, so kind: "chunk" preserves the repeats-per-key
  // semantics downstream rather than collapsing to one.
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    chunk: { kind: "chunk", source: "__execution__" }
  };

  @prop({
    type: "str",
    default: "audio",
    title: "Name",
    description: "The parameter name for the workflow."
  })
  declare name: string;

  @prop({
    type: "audio",
    default: audioRefDefault,
    title: "Value",
    description: "The audio to use as input."
  })
  declare value: AudioRef | null;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { chunk: this.value ?? null };
  }
}

export class DocumentFileInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.DocumentFileInput";
  static readonly title = "Document File Input";
  static readonly description =
    "Accepts a local file path pointing to a document and converts it into a 'DocumentRef'.\n    input, parameter, document, file, path, local_file, load";
  static readonly metadataOutputTypes = {
    document: "document",
    path: "str"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "str",
    default: "",
    title: "Value",
    description: "The path to the document file.",
    json_schema_extra: {
      type: "file_path"
    }
  })
  declare value: string;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    const p = String(this.value ?? "");
    return {
      document: { type: "document", uri: p ? `file://${p}` : "" },
      path: p
    };
  }
}

export class FilePathInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.FilePathInput";
  static readonly title = "File Path Input";
  static readonly description =
    "Accepts a local filesystem path (to a file or directory) as input for workflows.\n    input, parameter, path, filepath, directory, local_file, filesystem";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly inlineFields = ["value"];
  static readonly inputFields = [];

  @prop(NAME_PROP)
  declare name: string;

  @prop({
    type: "str",
    default: "",
    title: "Value",
    description: "The path to use as input.",
    json_schema_extra: {
      type: "file_path"
    }
  })
  declare value: string;

  @prop(INPUT_DESCRIPTION_PROP)
  declare description: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? "" };
  }
}

export class MessageDeconstructorNode extends BaseNode {
  static readonly nodeType = "nodetool.input.MessageDeconstructor";
  static readonly title = "Message Deconstructor";
  static readonly description =
    "Deconstructs a chat message object into its individual fields.\n    extract, decompose, message, fields, chat\n\n    Use cases:\n    - Extract specific fields from a message (e.g., role, content, thread_id).\n    - Access message metadata for workflow logic.\n    - Process different parts of a message separately.";
  static readonly metadataOutputTypes = {
    id: "str",
    thread_id: "str",
    role: "str",
    text: "str",
    image: "image",
    audio: "audio",
    model: "language_model"
  };

  @prop({
    type: "message",
    default: messageRefDefault,
    title: "Value",
    description: "The message object to deconstruct."
  })
  declare value: Message | null;

  async process(): Promise<Record<string, unknown>> {
    const msg = (this.value ?? {}) as Record<string, unknown>;
    const content = msg.content;
    let text = "";
    let image: unknown = null;
    let audio: unknown = null;
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      for (const item of content) {
        if (!item || typeof item !== "object") continue;
        const block = item as Record<string, unknown>;
        const type = String(block.type ?? "");
        if (type === "text") text = String(block.text ?? "");
        else if (type === "image" || type === "image_url")
          image = block.image_url ?? block.image ?? null;
        else if (type === "audio") audio = block.audio ?? null;
      }
    }
    const provider = msg.provider;
    const modelId = msg.model;
    const model =
      typeof provider === "string" && typeof modelId === "string"
        ? { provider, id: modelId }
        : null;
    return {
      id: msg.id ?? "",
      thread_id: msg.thread_id ?? "",
      role: String(msg.role ?? ""),
      text,
      image,
      audio,
      model
    };
  }
}

export const INPUT_NODES = tagAsUniversal([
  FloatInputNode,
  BooleanInputNode,
  IntegerInputNode,
  StringInputNode,
  SelectInputNode,
  StringListInputNode,
  FolderPathInputNode,
  HuggingFaceModelInputNode,
  ColorInputNode,
  ImageSizeInputNode,
  LanguageModelInputNode,
  ImageModelInputNode,
  VideoModelInputNode,
  TTSModelInputNode,
  ASRModelInputNode,
  EmbeddingModelInputNode,
  DataframeInputNode,
  DocumentInputNode,
  ImageInputNode,
  ImageListInputNode,
  VideoListInputNode,
  AudioListInputNode,
  TextListInputNode,
  VideoInputNode,
  AudioInputNode,
  Model3DInputNode,
  RealtimeAudioInputNode,
  AssetFolderInputNode,
  FilePathInputNode,
  DocumentFileInputNode,
  MessageInputNode,
  MessageListInputNode,
  MessageDeconstructorNode
]);
