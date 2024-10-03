import { devLog } from "./DevLog";

interface AssetFileResult {
  file: File;
  filename: string;
  type: string;
}

const convertDataFrameToCSV = (dataframe: any): string => {
  const headers = dataframe.columns.map((col: any) => col.name).join(",");
  const rows = dataframe.data.map((row: any) => row.join(",")).join("\n");
  return `${headers}\n${rows}`;
};

const createSingleAssetFile = (
  output: any,
  id: string,
  index?: number
): AssetFileResult => {
  const { type, data } = output;
  let content: BlobPart;
  let filename: string;
  let mimeType: string;

  const suffix = index !== undefined ? `_${index}` : "";

  switch (type) {
    case "image":
      content = new Uint8Array(Object.values(data));
      filename = `preview_${id}${suffix}.png`;
      mimeType = "image/png";
      break;
    case "video":
      content = new Uint8Array(Object.values(data));
      filename = `preview_${id}${suffix}.mp4`;
      mimeType = "video/mp4";
      break;
    case "audio":
      content = new Uint8Array(Object.values(data));
      filename = `preview_${id}${suffix}.mp3`;
      mimeType = "audio/mp3";
      break;
    case "dataframe":
      content = convertDataFrameToCSV(data);
      filename = `preview_${id}${suffix}.csv`;
      mimeType = "text/csv";
      break;
    case "object":
    case "array":
      content = JSON.stringify(data, null, 2);
      filename = `preview_${id}${suffix}.json`;
      mimeType = "application/json";
      break;
    default:
      content = JSON.stringify(output, null, 2);
      filename = `preview_${id}${suffix}.txt`;
      mimeType = "text/plain";
  }

  const file = new File([content], filename, { type: mimeType });
  devLog(`Created file for type: ${type}`);

  return { file, filename, type: mimeType };
};

export const createAssetFile = (
  output: any | any[],
  id: string
): AssetFileResult[] => {
  if (Array.isArray(output)) {
    devLog("Creating multiple asset files");
    return output.map((item, index) => createSingleAssetFile(item, id, index));
  } else {
    return [createSingleAssetFile(output, id)];
  }
};
