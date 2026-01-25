import { MiniAppInputKind } from "./types";

export const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });

export const getInputKind = (nodeType: string): MiniAppInputKind | null => {
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
    default:
      return null;
  }
};

export const clampNumber = (value: number, min?: number, max?: number) => {
  let result = value;
  if (typeof min === "number") {
    result = Math.max(result, min);
  }
  if (typeof max === "number") {
    result = Math.min(result, max);
  }
  return result;
};
