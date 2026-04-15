import { useState, useCallback } from "react";
import { MessageContent } from "../../../stores/ApiTypes";
import { DroppedFile, DOC_TYPES_REGEX } from "../types/chat.types";
import { useNotificationStore } from "../../../stores/NotificationStore";

// Generate a unique ID for each file
const generateFileId = () => `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/** Infer MIME type from file extension when the browser doesn't provide one */
function resolveFileType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    pdf: "application/pdf"
  };
  return ext ? (mimeMap[ext] ?? "application/octet-stream") : "application/octet-stream";
}

export const useFileHandling = () => {
  const [droppedFiles, setDroppedFiles] = useState<DroppedFile[]>([]);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const makeMessageContent = (file: DroppedFile): MessageContent => {
    if (file.type.startsWith("image/")) {
      return {
        type: "image_url",
        image: {
          type: "image",
          uri: file.dataUri
        }
      };
    } else if (file.type.startsWith("audio/")) {
      return {
        type: "audio",
        audio: {
          type: "audio",
          uri: file.dataUri
        }
      };
    } else if (file.type.startsWith("video/")) {
      return {
        type: "video",
        video: {
          type: "video",
          uri: file.dataUri
        }
      };
    } else if (file.type.match(DOC_TYPES_REGEX)) {
      return {
        type: "document",
        document: {
          type: "document",
          uri: file.dataUri
        }
      };
    } else {
      return {
        type: "text",
        text: file.name
      };
    }
  };

  const addFiles = useCallback(
    (files: File[]) => {
      const filePromises = files.map((file) => {
        const mimeType = resolveFileType(file);
        return new Promise<DroppedFile>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              id: generateFileId(),
              dataUri: reader.result as string,
              type: mimeType,
              name: file.name
            });
          };
          reader.onerror = () => {
            reject(new Error(`Failed to read file: ${file.name}`));
          };
          reader.readAsDataURL(file);
        });
      });

      Promise.allSettled(filePromises).then((results) => {
        const successfulFiles: DroppedFile[] = [];
        const failedFiles: string[] = [];

        results.forEach((result, index) => {
          if (result.status === "fulfilled") {
            successfulFiles.push(result.value);
          } else {
            failedFiles.push(files[index].name);
          }
        });

        if (successfulFiles.length > 0) {
          setDroppedFiles((prev) => [...prev, ...successfulFiles]);
        }

        if (failedFiles.length > 0) {
          addNotification({
            type: "error",
            content: `Failed to load ${
              failedFiles.length
            } file(s): ${failedFiles.join(", ")}`,
            alert: true
          });
        }
      });
    },
    [addNotification]
  );

  const removeFile = useCallback((index: number) => {
    setDroppedFiles((files) => files.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setDroppedFiles([]);
  }, []);

  const getFileContents = useCallback((): MessageContent[] => {
    return droppedFiles.map(makeMessageContent);
  }, [droppedFiles]);

  return {
    droppedFiles,
    addFiles,
    removeFile,
    clearFiles,
    getFileContents,
    addDroppedFiles: useCallback((files: DroppedFile[]) => {
      const filesWithIds = files.map((file) => ({ ...file, id: generateFileId() }));
      setDroppedFiles((prev) => [...prev, ...filesWithIds]);
    }, [])
  };
};
