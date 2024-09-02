// - get node type from mime type
// - test if json is comfy or nodetool workflow
// - get workflow data from png

import { TypeName } from "../../stores/ApiTypes";

export const nodeTypeFor = (contentType: string): TypeName | null => {
  switch (contentType) {
    case "application/json":
    case "text/plain":
      return "text";
    case "text/csv":
      return "dataframe";
    case "image/png":
    case "image/jpeg":
    case "image/gif":
    case "image/webp":
      return "image";
    case "video/mp4":
    case "video/mpeg":
    case "video/ogg":
    case "video/webm":
      return "video";
    case "audio/mpeg":
    case "audio/ogg":
    case "audio/wav":
    case "audio/webm":
    case "audio/mp3":
      return "audio";
    default:
      return null;
  }
};

export const extractWorkflowFromPng = async (
  file: File
): Promise<Record<string, never> | null> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = function (event: ProgressEvent<FileReader>) {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      const uint8Array = new Uint8Array(arrayBuffer);

      const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
      let offset = pngSignature.length;

      while (offset < uint8Array.length) {
        const chunkLength =
          uint8Array[offset] * 16777216 +
          uint8Array[offset + 1] * 65536 +
          uint8Array[offset + 2] * 256 +
          uint8Array[offset + 3];
        offset += 4;

        const chunkType = String.fromCharCode(
          uint8Array[offset],
          uint8Array[offset + 1],
          uint8Array[offset + 2],
          uint8Array[offset + 3]
        );
        offset += 4;

        if (chunkType === "tEXt") {
          let keywordEnd = offset;
          while (
            uint8Array[keywordEnd] !== 0 &&
            keywordEnd < offset + chunkLength
          ) {
            keywordEnd++;
          }

          const keyword = String.fromCharCode(
            ...uint8Array.slice(offset, keywordEnd)
          );

          if (keyword === "workflow") {
            const textContent = new TextDecoder().decode(
              uint8Array.slice(keywordEnd + 1, offset + chunkLength)
            );
            try {
              const workflow = JSON.parse(textContent);
              resolve(workflow);
              return;
            } catch (error) {
              reject(new Error("Failed to parse workflow JSON"));
              return;
            }
          }
        }

        offset += chunkLength + 4; // Skip CRC
      }

      resolve(null); // No workflow found
    };

    reader.onerror = function () {
      reject(new Error("Error reading file"));
    };

    reader.readAsArrayBuffer(file);
  });
};

export const isComfyWorkflowJson = (json: any): boolean => {
  return json.last_node_id && json.last_link_id && json.nodes;
};

export const isNodetoolWorkflowJson = (json: any): boolean => {
  return json.graph && json.name && json.description;
};
