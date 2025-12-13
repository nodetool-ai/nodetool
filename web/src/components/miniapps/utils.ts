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
      return "string";
    case "nodetool.input.BooleanInput":
      return "boolean";
    case "nodetool.input.IntegerInput":
      return "integer";
    case "nodetool.input.FloatInput":
      return "float";
    case "nodetool.input.ImageInput":
      return "image";
    case "nodetool.input.AudioInput":
      return "audio";
    case "nodetool.input.FilePathInput":
      return "file_path";
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
