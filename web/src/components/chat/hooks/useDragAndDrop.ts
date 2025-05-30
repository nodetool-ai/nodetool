import { useState, useCallback } from "react";

export const useDragAndDrop = (onFilesDropped: (files: File[]) => void) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    onFilesDropped(files);
  }, [onFilesDropped]);

  return {
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop
  };
};