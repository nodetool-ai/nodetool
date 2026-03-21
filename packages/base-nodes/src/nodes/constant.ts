import { BaseNode, prop } from "@nodetool/node-sdk";

export class ConstantBaseNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.Constant";
            static readonly title = "Constant";
            static readonly description = "Base class for fixed-value nodes.\n\n    constant, parameter, default\n\n    Use cases:\n    - Provide static inputs to a workflow\n    - Hold configuration values\n    - Simplify testing with deterministic outputs";
  

  async process(_inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { output: null };
  }
}

export class ConstantBoolNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.Bool";
            static readonly title = "Bool";
            static readonly description = "Represents a boolean constant in the workflow.\n    boolean, logic, flag\n\n    Use cases:\n    - Control flow decisions in conditional nodes\n    - Toggle features or behaviors in the workflow\n    - Set default boolean values for configuration";
        static readonly metadataOutputTypes = {
    output: "bool"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "bool", default: false, title: "Value" })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? false };
  }
}

export class ConstantIntegerNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.Integer";
            static readonly title = "Integer";
            static readonly description = "Represents an integer constant in the workflow.\n    number, integer, whole\n\n    Use cases:\n    - Set numerical parameters for calculations\n    - Define counts, indices, or sizes\n    - Provide fixed numerical inputs for processing";
        static readonly metadataOutputTypes = {
    output: "int"
  };

  @prop({ type: "int", default: 0, title: "Value" })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? 0 };
  }
}

export class ConstantFloatNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.Float";
            static readonly title = "Float";
            static readonly description = "Represents a floating-point number constant in the workflow.\n    number, decimal, float\n\n    Use cases:\n    - Set numerical parameters for calculations\n    - Define thresholds or limits\n    - Provide fixed numerical inputs for processing";
        static readonly metadataOutputTypes = {
    output: "float"
  };

  @prop({ type: "float", default: 0, title: "Value" })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? 0.0 };
  }
}

export class ConstantStringNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.String";
            static readonly title = "String";
            static readonly description = "Represents a string constant in the workflow.\n    text, string, characters\n\n    Use cases:\n    - Provide fixed text inputs for processing\n    - Define labels, identifiers, or names\n    - Set default text values for configuration";
        static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "str", default: "", title: "Value" })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? "" };
  }
}

export class ConstantListNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.List";
            static readonly title = "List";
            static readonly description = "Represents a list constant in the workflow.\n    array, sequence, collection\n\n    Use cases:\n    - Store multiple values of the same type\n    - Provide ordered data inputs\n    - Define sequences for iteration in other nodes";
        static readonly metadataOutputTypes = {
    output: "list[any]"
  };

  @prop({ type: "list[any]", default: [], title: "Value" })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? [] };
  }
}

export class ConstantTextListNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.TextList";
            static readonly title = "Text List";
            static readonly description = "Represents a list of text strings in the workflow.\n    texts, strings, text collection\n\n    Use cases:\n    - Provide a fixed list of text strings for batch processing\n    - Reference multiple text values in the workflow\n    - Set default text list for testing or demonstration purposes";
        static readonly metadataOutputTypes = {
    output: "list[str]"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "list[str]", default: null, title: "Value", description: "List of text strings", required: true })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? [] };
  }
}

export class ConstantDictNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.Dict";
            static readonly title = "Dict";
            static readonly description = "Represents a dictionary constant in the workflow.\n    dictionary, key-value, mapping\n\n    Use cases:\n    - Store configuration settings\n    - Provide structured data inputs\n    - Define parameter sets for other nodes";
        static readonly metadataOutputTypes = {
    output: "dict[str, any]"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "dict[str, any]", default: {}, title: "Value" })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? {} };
  }
}

export class ConstantAudioNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.Audio";
            static readonly title = "Audio";
            static readonly description = "Represents an audio file constant in the workflow.\n    audio, file, mp3, wav\n\n    Use cases:\n    - Provide a fixed audio input for audio processing nodes\n    - Reference a specific audio file in the workflow\n    - Set default audio for testing or demonstration purposes";
        static readonly metadataOutputTypes = {
    output: "audio"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Value" })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? {} };
  }
}

export class ConstantImageNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.Image";
            static readonly title = "Image";
            static readonly description = "Represents an image file constant in the workflow.\n    picture, photo, image\n\n    Use cases:\n    - Provide a fixed image input for image processing nodes\n    - Reference a specific image file in the workflow\n    - Set default image for testing or demonstration purposes";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Value" })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? {} };
  }
}

export class ConstantVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.Video";
            static readonly title = "Video";
            static readonly description = "Represents a video file constant in the workflow.\n    video, movie, mp4, file\n\n    Use cases:\n    - Provide a fixed video input for video processing nodes\n    - Reference a specific video file in the workflow\n    - Set default video for testing or demonstration purposes";
        static readonly metadataOutputTypes = {
    output: "video"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "video", default: {
  "type": "video",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "duration": null,
  "format": null
}, title: "Value" })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? {} };
  }
}

export class ConstantDocumentNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.Document";
            static readonly title = "Document";
            static readonly description = "Represents a document constant in the workflow.\n    document, pdf, word, docx";
        static readonly metadataOutputTypes = {
    output: "document"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "document", default: {
  "type": "document",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Document" })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? {} };
  }
}

export class ConstantJSONNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.JSON";
            static readonly title = "JSON";
            static readonly description = "Represents a JSON constant in the workflow.\n    json, object, dictionary";
        static readonly metadataOutputTypes = {
    output: "json"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "json", default: {
  "type": "json",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Value" })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? {} };
  }
}

export class ConstantModel3DNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.Model3D";
            static readonly title = "Model 3D";
            static readonly description = "Represents a 3D model constant in the workflow.\n    3d, model, mesh, glb, obj, stl\n\n    Use cases:\n    - Provide a fixed 3D model input for processing nodes\n    - Reference a specific 3D model file in the workflow\n    - Set default 3D model for testing or demonstration purposes";
        static readonly metadataOutputTypes = {
    output: "model_3d"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "model_3d", default: {
  "type": "model_3d",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "format": null,
  "material_file": null,
  "texture_files": []
}, title: "Value" })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? {} };
  }
}

export class ConstantDataFrameNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.DataFrame";
            static readonly title = "Data Frame";
            static readonly description = "Represents a fixed DataFrame constant in the workflow.\n    table, data, dataframe, pandas\n\n    Use cases:\n    - Provide static data for analysis or processing\n    - Define lookup tables or reference data\n    - Set sample data for testing or demonstration";
        static readonly metadataOutputTypes = {
    output: "dataframe"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "dataframe", default: {
  "type": "dataframe",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "columns": null
}, title: "DataFrame" })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? {} };
  }
}

export class ConstantAudioListNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.AudioList";
            static readonly title = "Audio List";
            static readonly description = "Represents a list of audio file constants in the workflow.\n    audios, sounds, audio files, collection\n\n    Use cases:\n    - Provide a fixed list of audio files for batch processing\n    - Reference multiple audio files in the workflow\n    - Set default audio list for testing or demonstration purposes";
        static readonly metadataOutputTypes = {
    output: "list[audio]"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "list[audio]", default: null, title: "Value", description: "List of audio references", required: true })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? [] };
  }
}

export class ConstantImageListNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.ImageList";
            static readonly title = "Image List";
            static readonly description = "Represents a list of image file constants in the workflow.\n    pictures, photos, images, collection\n\n    Use cases:\n    - Provide a fixed list of images for batch processing\n    - Reference multiple image files in the workflow\n    - Set default image list for testing or demonstration purposes";
        static readonly metadataOutputTypes = {
    output: "list[image]"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "list[image]", default: null, title: "Value", description: "List of image references", required: true })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? [] };
  }
}

export class ConstantVideoListNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.VideoList";
            static readonly title = "Video List";
            static readonly description = "Represents a list of video file constants in the workflow.\n    videos, movies, clips, collection\n\n    Use cases:\n    - Provide a fixed list of videos for batch processing\n    - Reference multiple video files in the workflow\n    - Set default video list for testing or demonstration purposes";
        static readonly metadataOutputTypes = {
    output: "list[video]"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "list[video]", default: null, title: "Value", description: "List of video references", required: true })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? [] };
  }
}

export class ConstantSelectNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.Select";
            static readonly title = "Select";
            static readonly description = "Represents a selection from a predefined set of options in the workflow.\n    select, enum, dropdown, choice, options\n\n    Use cases:\n    - Choose from a fixed set of values\n    - Configure options for downstream nodes\n    - Provide enum-compatible inputs for nodes that expect specific values\n\n    The output is a string that can be connected to enum-typed inputs.";
        static readonly metadataOutputTypes = {
    output: "str"
  };
          static readonly basicFields = [
  "value"
];

  @prop({ type: "str", default: "", title: "Value", description: "The currently selected value.", json_schema_extra: {
  "type": "select"
} })
  declare value: any;

  @prop({ type: "list[str]", default: [], title: "Options", description: "The list of available options to choose from." })
  declare options: any;

  @prop({ type: "str", default: "", title: "Enum Type Name", description: "The enum type name this select corresponds to (for type matching)." })
  declare enum_type_name: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? "" };
  }
}

export class ConstantImageSizeNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.ImageSize";
            static readonly title = "Image Size";
            static readonly description = "";
        static readonly metadataOutputTypes = {
    image_size: "image_size",
    width: "int",
    height: "int"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "image_size", default: null, title: "Value", required: true })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = (inputs.value ?? this.value ?? { width: 1024, height: 1024 }) as {
      width?: number;
      height?: number;
    };
    const width = Number(value.width ?? 1024);
    const height = Number(value.height ?? 1024);
    return { output: value, image_size: value, width, height };
  }
}

export class ConstantDateNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.Date";
            static readonly title = "Date";
            static readonly description = "Make a date object from year, month, day.\n    date, make, create";
        static readonly metadataOutputTypes = {
    output: "date"
  };

  @prop({ type: "int", default: 1900, title: "Year", description: "Year of the date", min: 1, max: 9999 })
  declare year: any;

  @prop({ type: "int", default: 1, title: "Month", description: "Month of the date", min: 1, max: 12 })
  declare month: any;

  @prop({ type: "int", default: 1, title: "Day", description: "Day of the date", min: 1, max: 31 })
  declare day: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const year = Number(inputs.year ?? this.year ?? 2024);
    const month = Number(inputs.month ?? this.month ?? 1);
    const day = Number(inputs.day ?? this.day ?? 1);
    return { output: { year, month, day } };
  }
}

export class ConstantDateTimeNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.DateTime";
            static readonly title = "Date Time";
            static readonly description = "Make a datetime object from year, month, day, hour, minute, second.\n    datetime, make, create";
        static readonly metadataOutputTypes = {
    output: "datetime"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "int", default: 1900, title: "Year", description: "Year of the datetime", min: 1, max: 9999 })
  declare year: any;

  @prop({ type: "int", default: 1, title: "Month", description: "Month of the datetime", min: 1, max: 12 })
  declare month: any;

  @prop({ type: "int", default: 1, title: "Day", description: "Day of the datetime", min: 1, max: 31 })
  declare day: any;

  @prop({ type: "int", default: 0, title: "Hour", description: "Hour of the datetime", min: 0, max: 23 })
  declare hour: any;

  @prop({ type: "int", default: 0, title: "Minute", description: "Minute of the datetime", min: 0, max: 59 })
  declare minute: any;

  @prop({ type: "int", default: 0, title: "Second", description: "Second of the datetime", min: 0, max: 59 })
  declare second: any;

  @prop({ type: "int", default: 0, title: "Millisecond", description: "Millisecond of the datetime", min: 0, max: 999 })
  declare millisecond: any;

  @prop({ type: "str", default: "UTC", title: "Tzinfo", description: "Timezone of the datetime" })
  declare tzinfo: any;

  @prop({ type: "int", default: 0, title: "Utc Offset", description: "UTC offset of the datetime in minutes", min: -720, max: 840 })
  declare utc_offset: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {
      output: {
        year: Number(inputs.year ?? this.year ?? 2024),
        month: Number(inputs.month ?? this.month ?? 1),
        day: Number(inputs.day ?? this.day ?? 1),
        hour: Number(inputs.hour ?? this.hour ?? 0),
        minute: Number(inputs.minute ?? this.minute ?? 0),
        second: Number(inputs.second ?? this.second ?? 0),
        millisecond: Number(inputs.millisecond ?? this.millisecond ?? 0),
        tzinfo: String(inputs.tzinfo ?? this.tzinfo ?? ""),
        utc_offset: String(inputs.utc_offset ?? this.utc_offset ?? ""),
      },
    };
  }
}

export class ConstantASRModelNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.ASRModelConstant";
            static readonly title = "ASRModel Constant";
            static readonly description = "Represents an automatic speech recognition model constant in the workflow.\n    asr, speech, recognition, transcription, model\n\n    Use cases:\n    - Provide a fixed ASR model for transcription\n    - Set default ASR model for the workflow\n    - Configure model selection without user input";
        static readonly metadataOutputTypes = {
    output: "asr_model"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "asr_model", default: null, title: "Value", required: true })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? {} };
  }
}

export class ConstantEmbeddingModelNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.EmbeddingModelConstant";
            static readonly title = "Embedding Model Constant";
            static readonly description = "Represents an embedding model constant in the workflow.\n    embedding, model, vector, semantic\n\n    Use cases:\n    - Provide a fixed embedding model for vectorization\n    - Set default embedding model for the workflow\n    - Configure model selection without user input";
        static readonly metadataOutputTypes = {
    output: "embedding_model"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "embedding_model", default: null, title: "Value", required: true })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? {} };
  }
}

export class ConstantImageModelNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.ImageModelConstant";
            static readonly title = "Image Model Constant";
            static readonly description = "Represents an image generation model constant in the workflow.\n    image, model, ai, generation, diffusion\n\n    Use cases:\n    - Provide a fixed image model for generation\n    - Set default image model for the workflow\n    - Configure model selection without user input";
        static readonly metadataOutputTypes = {
    output: "image_model"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "image_model", default: null, title: "Value", required: true })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? {} };
  }
}

export class ConstantLanguageModelNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.LanguageModelConstant";
            static readonly title = "Language Model Constant";
            static readonly description = "Represents a language model constant in the workflow.\n    llm, language, model, ai, chat, gpt\n\n    Use cases:\n    - Provide a fixed language model for chat or text generation\n    - Set default language model for the workflow\n    - Configure model selection without user input";
        static readonly metadataOutputTypes = {
    output: "language_model"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "language_model", default: null, title: "Value", required: true })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? {} };
  }
}

export class ConstantTTSModelNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.TTSModelConstant";
            static readonly title = "TTSModel Constant";
            static readonly description = "Represents a text-to-speech model constant in the workflow.\n    tts, speech, voice, model, audio\n\n    Use cases:\n    - Provide a fixed TTS model for speech synthesis\n    - Set default TTS model for the workflow\n    - Configure model selection without user input";
        static readonly metadataOutputTypes = {
    output: "tts_model"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "tts_model", default: null, title: "Value", required: true })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? {} };
  }
}

export class ConstantVideoModelNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.VideoModelConstant";
            static readonly title = "Video Model Constant";
            static readonly description = "Represents a video generation model constant in the workflow.\n    video, model, ai, generation\n\n    Use cases:\n    - Provide a fixed video model for generation\n    - Set default video model for the workflow\n    - Configure model selection without user input";
        static readonly metadataOutputTypes = {
    output: "video_model"
  };
          static readonly exposeAsTool = true;

  @prop({ type: "video_model", default: null, title: "Value", required: true })
  declare value: any;


    

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? {} };
  }
}

export const CONSTANT_NODES = [
  ConstantBaseNode,
  ConstantBoolNode,
  ConstantIntegerNode,
  ConstantFloatNode,
  ConstantStringNode,
  ConstantListNode,
  ConstantTextListNode,
  ConstantDictNode,
  ConstantAudioNode,
  ConstantImageNode,
  ConstantVideoNode,
  ConstantDocumentNode,
  ConstantJSONNode,
  ConstantModel3DNode,
  ConstantDataFrameNode,
  ConstantAudioListNode,
  ConstantImageListNode,
  ConstantVideoListNode,
  ConstantSelectNode,
  ConstantImageSizeNode,
  ConstantDateNode,
  ConstantDateTimeNode,
  ConstantASRModelNode,
  ConstantEmbeddingModelNode,
  ConstantImageModelNode,
  ConstantLanguageModelNode,
  ConstantTTSModelNode,
  ConstantVideoModelNode,
] as const;
