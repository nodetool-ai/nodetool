/** @jsxImportSource @emotion/react */
import { useState, DragEvent, useRef, useCallback, useEffect } from "react";
import FileUploadButton from "../buttons/FileUploadButton";
import { css } from "@emotion/react";

const styles = css({
  draggingOverlay: {
    display: "none",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 1000,
    pointerEvents: "none",
    opacity: 0,
    transition: "opacity 0.2s"
  },
  dropzoneDraggingOverlay: {
    display: "block",
    opacity: 1
  }
});

export interface DropzoneProps {
  onDrop: (files: File[]) => void;
  children?: React.ReactNode;
}

const Dropzone: React.FC<DropzoneProps> = (props) => {
  const [isExternalDrag, setIsExternalDrag] = useState(false);
  const leaveTimeoutId = useRef<NodeJS.Timeout | null>(null);
  const clearLeaveTimeout = () => {
    if (leaveTimeoutId.current) {
      clearTimeout(leaveTimeoutId.current);
      leaveTimeoutId.current = null;
    }
  };

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    clearLeaveTimeout();

    // check if the drag event contains external files
    const hasFiles = Array.from(e.dataTransfer.items).some(
      (item) => item.kind === "file"
    );
    setIsExternalDrag(hasFiles);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    leaveTimeoutId.current = setTimeout(() => {
      setIsExternalDrag(false);
    }, 50);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      clearLeaveTimeout();
      setIsExternalDrag(false);

      // If dropped items are files, handle them
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        props.onDrop(files);
      }
    },
    [props]
  );

  useEffect(() => {
    return () => {
      clearLeaveTimeout();
    };
  }, []);

  return (
    <div
      css={styles}
      className={`dropzone${isExternalDrag ? " is-dragging" : ""}`}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isExternalDrag && <div className="dragging-overlay" />}
      <div
        className="actions-secondary"
        style={{ display: "flex", gap: "0.5em", marginLeft: "0.5em" }}
      >
        <FileUploadButton onFileChange={props.onDrop} />
      </div>
      {props.children}
    </div>
  );
};

export default Dropzone;
