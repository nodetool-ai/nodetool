/**
 * Hook for handling file attachments in chat.
 * Adapted from web/src/components/chat/hooks/useFileHandling.ts
 */

import { useState, useCallback } from 'react';
import { MessageContent } from '../types/ApiTypes';
import { DroppedFile, DOC_TYPES_REGEX } from '../types/chat.types';

export const useFileHandling = () => {
  const [droppedFiles, setDroppedFiles] = useState<DroppedFile[]>([]);

  /**
   * Converts a DroppedFile to MessageContent format
   */
  const makeMessageContent = (file: DroppedFile): MessageContent => {
    if (file.type.startsWith('image/')) {
      return {
        type: 'image_url',
        image: {
          type: 'image',
          uri: file.dataUri,
        },
      };
    } else if (file.type.startsWith('audio/')) {
      return {
        type: 'audio',
        audio: {
          type: 'audio',
          uri: file.dataUri,
        },
      };
    } else if (file.type.startsWith('video/')) {
      return {
        type: 'video',
        video: {
          type: 'video',
          uri: file.dataUri,
        },
      };
    } else if (file.type.match(DOC_TYPES_REGEX)) {
      return {
        type: 'document',
        document: {
          type: 'document',
          uri: file.dataUri,
        },
      };
    } else {
      return {
        type: 'text',
        text: file.name,
      };
    }
  };

  /**
   * Add files from a native file picker or similar source
   * Files should already be converted to data URIs
   */
  const addDroppedFiles = useCallback((files: DroppedFile[]) => {
    setDroppedFiles((prev) => [...prev, ...files]);
  }, []);

  /**
   * Remove a file by index
   */
  const removeFile = useCallback((index: number) => {
    setDroppedFiles((files) => files.filter((_, i) => i !== index));
  }, []);

  /**
   * Clear all attached files
   */
  const clearFiles = useCallback(() => {
    setDroppedFiles([]);
  }, []);

  /**
   * Get all attached files as MessageContent array
   */
  const getFileContents = useCallback((): MessageContent[] => {
    return droppedFiles.map(makeMessageContent);
  }, [droppedFiles]);

  return {
    droppedFiles,
    addDroppedFiles,
    removeFile,
    clearFiles,
    getFileContents,
  };
};
