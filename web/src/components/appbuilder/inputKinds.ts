/**
 * Input-kind detection for workflow InputNodes. Each kind maps to the UI
 * component that edits a value of that input's type.
 */
export type WorkflowInputKind =
  | "string"
  | "integer"
  | "float"
  | "boolean"
  | "color"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "dataframe"
  | "file_path"
  | "folder_path"
  | "folder"
  | "select"
  | "language_model"
  | "image_model"
  | "video_model"
  | "tts_model"
  | "asr_model"
  | "embedding_model"
  | "image_list"
  | "video_list"
  | "audio_list"
  | "text_list"
  | "model3d"
  | "image_size"
  | "huggingface_model";

export const getWorkflowInputKind = (
  nodeType: string
): WorkflowInputKind | null => {
  switch (nodeType) {
    case "nodetool.input.StringInput":
    case "nodetool.input.TextInput":
    case "nodetool.input.MessageInput":
      return "string";
    case "nodetool.input.BooleanInput":
      return "boolean";
    case "nodetool.input.IntegerInput":
      return "integer";
    case "nodetool.input.FloatInput":
      return "float";
    case "nodetool.input.ColorInput":
      return "color";
    case "nodetool.input.ImageInput":
      return "image";
    case "nodetool.input.VideoInput":
      return "video";
    case "nodetool.input.AudioInput":
    case "nodetool.input.RealtimeAudioInput":
      return "audio";
    case "nodetool.input.DocumentInput":
      return "document";
    case "nodetool.input.DataFrameInput":
    case "nodetool.input.DataframeInput":
      return "dataframe";
    case "nodetool.input.Model3DInput":
      return "model3d";
    case "nodetool.input.ImageSizeInput":
      return "image_size";
    case "nodetool.input.HuggingFaceModelInput":
      return "huggingface_model";
    case "nodetool.input.FilePathInput":
      return "file_path";
    case "nodetool.input.FolderPathInput":
      return "folder_path";
    case "nodetool.input.Folder":
      return "folder";
    case "nodetool.input.SelectInput":
      return "select";
    case "nodetool.input.LanguageModelInput":
      return "language_model";
    case "nodetool.input.ImageModelInput":
      return "image_model";
    case "nodetool.input.VideoModelInput":
      return "video_model";
    case "nodetool.input.TTSModelInput":
      return "tts_model";
    case "nodetool.input.ASRModelInput":
      return "asr_model";
    case "nodetool.input.EmbeddingModelInput":
      return "embedding_model";
    case "nodetool.input.ImageListInput":
      return "image_list";
    case "nodetool.input.VideoListInput":
      return "video_list";
    case "nodetool.input.AudioListInput":
      return "audio_list";
    case "nodetool.input.TextListInput":
    case "nodetool.input.StringListInput":
      return "text_list";
    default:
      return null;
  }
};

/**
 * The editing kind for a JS script port, whose `type` is a TypeMetadata name
 * (`"str"`, `"int"`, `"list[str]"`, `"ImageRef"`) rather than an input node
 * type. A type with no widget of its own falls back to `string`, which edits
 * the value as text — a script port is never unbindable for want of a match.
 */
export const getScriptPortInputKind = (
  portType: string
): WorkflowInputKind => {
  switch (portType) {
    case "int":
      return "integer";
    case "float":
      return "float";
    case "bool":
      return "boolean";
    case "image":
    case "ImageRef":
      return "image";
    case "video":
    case "VideoRef":
      return "video";
    case "audio":
    case "AudioRef":
      return "audio";
    case "document":
    case "DocumentRef":
      return "document";
    case "dataframe":
    case "DataframeRef":
      return "dataframe";
    case "list[str]":
      return "text_list";
    case "list[image]":
      return "image_list";
    case "list[video]":
      return "video_list";
    case "list[audio]":
      return "audio_list";
    default:
      return "string";
  }
};

export const clampNumber = (
  value: number,
  min?: number,
  max?: number
): number => {
  let result = value;
  if (typeof min === "number") result = Math.max(result, min);
  if (typeof max === "number") result = Math.min(result, max);
  return result;
};
