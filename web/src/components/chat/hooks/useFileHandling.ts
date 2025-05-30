import { useState, useCallback } from "react";
import { MessageContent } from "../../../stores/ApiTypes";
import { DroppedFile, DOC_TYPES_REGEX } from "../types";

export const useFileHandling = () => {
  const [droppedFiles, setDroppedFiles] = useState<DroppedFile[]>([]);

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

  const addFiles = useCallback((files: File[]) => {
    const filePromises = files.map((file) => {
      return new Promise<DroppedFile>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            dataUri: reader.result as string,
            type: file.type,
            name: file.name
          });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(filePromises).then((newFiles) => {
      setDroppedFiles((prev) => [...prev, ...newFiles]);
    });
  }, []);

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
    getFileContents
  };
};