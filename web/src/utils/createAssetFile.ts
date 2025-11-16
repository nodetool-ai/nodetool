import log from "loglevel";

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
      // Handle different data formats
      if (data instanceof Uint8Array) {
        content = data;
      } else if (Array.isArray(data)) {
        content = new Uint8Array(data);
      } else if (typeof data === "string") {
        // Handle data URIs (base64 encoded)
        if (data.startsWith("data:")) {
          try {
            const base64Data = data.split(",")[1];
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            content = bytes;
          } catch (error) {
            throw new Error("Failed to parse image data URI");
          }
        } else {
          // Regular URL - should have been fetched before reaching here
          throw new Error("Image data is a URL string. Cannot create file directly. Please fetch the data first.");
        }
      } else {
        // Assume it's an object with numeric keys
        content = new Uint8Array(Object.values(data));
      }
      filename = `preview_${id}${suffix}.png`;
      mimeType = "image/png";
      break;
    case "video":
      // Handle different data formats
      if (data instanceof Uint8Array) {
        content = data;
      } else if (Array.isArray(data)) {
        content = new Uint8Array(data);
      } else if (typeof data === "string") {
        throw new Error("Video data is a URI string. Cannot create file directly.");
      } else {
        content = new Uint8Array(Object.values(data));
      }
      filename = `preview_${id}${suffix}.mp4`;
      mimeType = "video/mp4";
      break;
    case "audio":
      // Handle different data formats
      if (data instanceof Uint8Array) {
        content = data;
      } else if (Array.isArray(data)) {
        content = new Uint8Array(data);
      } else if (typeof data === "string") {
        throw new Error("Audio data is a URI string. Cannot create file directly.");
      } else {
        content = new Uint8Array(Object.values(data));
      }
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
    case "text":
      content = data;
      filename = `preview_${id}${suffix}.txt`;
      mimeType = "text/plain";
      break;
    default:
      content =
        typeof output === "string" ? output : JSON.stringify(output, null, 2);
      filename = `preview_${id}${suffix}.txt`;
      mimeType = "text/plain";
  }

  const file = new File([content], filename, { type: mimeType });
  log.info(`Created file for type: ${type}`);

  return { file, filename, type: mimeType };
};

export const createAssetFile = (
  output: any | any[],
  id: string
): AssetFileResult[] => {
  if (Array.isArray(output)) {
    log.info("Creating multiple asset files");
    return output.map((item, index) => createSingleAssetFile(item, id, index));
  } else {
    return [createSingleAssetFile(output, id)];
  }
};
