/**
 * Input-kind detection for workflow Input nodes, mirroring
 * `web/src/components/appbuilder/inputKinds.ts`. Each kind maps to the native
 * control that edits a value of that input's type.
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

const KIND_BY_NODE_TYPE: Readonly<Record<string, WorkflowInputKind>> = {
  "nodetool.input.StringInput": "string",
  "nodetool.input.TextInput": "string",
  "nodetool.input.MessageInput": "string",
  "nodetool.input.BooleanInput": "boolean",
  "nodetool.input.IntegerInput": "integer",
  "nodetool.input.FloatInput": "float",
  "nodetool.input.ColorInput": "color",
  "nodetool.input.ImageInput": "image",
  "nodetool.input.VideoInput": "video",
  "nodetool.input.AudioInput": "audio",
  "nodetool.input.RealtimeAudioInput": "audio",
  "nodetool.input.DocumentInput": "document",
  "nodetool.input.DataFrameInput": "dataframe",
  "nodetool.input.Model3DInput": "model3d",
  "nodetool.input.ImageSizeInput": "image_size",
  "nodetool.input.HuggingFaceModelInput": "huggingface_model",
  "nodetool.input.DataframeInput": "dataframe",
  "nodetool.input.FilePathInput": "file_path",
  "nodetool.input.FolderPathInput": "folder_path",
  "nodetool.input.Folder": "folder",
  "nodetool.input.SelectInput": "select",
  "nodetool.input.LanguageModelInput": "language_model",
  "nodetool.input.ImageModelInput": "image_model",
  "nodetool.input.VideoModelInput": "video_model",
  "nodetool.input.TTSModelInput": "tts_model",
  "nodetool.input.ASRModelInput": "asr_model",
  "nodetool.input.EmbeddingModelInput": "embedding_model",
  "nodetool.input.ImageListInput": "image_list",
  "nodetool.input.VideoListInput": "video_list",
  "nodetool.input.AudioListInput": "audio_list",
  "nodetool.input.TextListInput": "text_list",
  "nodetool.input.StringListInput": "text_list",
};

export const getWorkflowInputKind = (
  nodeType: string
): WorkflowInputKind | null => KIND_BY_NODE_TYPE[nodeType] ?? null;

export const clampNumber = (
  value: number,
  min?: number,
  max?: number
): number => {
  let result = value;
  if (min != null) {result = Math.max(result, min);}
  if (max != null) {result = Math.min(result, max);}
  return result;
};
