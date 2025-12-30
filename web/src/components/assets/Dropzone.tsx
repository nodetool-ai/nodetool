/** @jsxImportSource @emotion/react */
import { useState, DragEvent, useRef, useCallback, useEffect } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const styles = (theme: Theme) =>
  css({
    draggingOverlay: {
      display: "none",
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.5)`,
      zIndex: 1000,
      pointerEvents: "none",
      opacity: 0,
      transition: "opacity 0.2s"
    },
    dropzoneDraggingOverlay: {
      display: "block",
      opacity: 1
    },
    ".file-upload-button": {
      zIndex: 1,
      height: "fit-content",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: "0 .5em",
      right: "48px",
      margin: "0",
      border: "none",
      outline: "none",
      borderRadius: "5px",
      transition: "background 0.2s"
    }
  });

export interface DropzoneProps {
  onDrop: (files: File[]) => void;
  children?: React.ReactNode;
}

const Dropzone: React.FC<DropzoneProps> = (props) => {
  const theme = useTheme();
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
      css={styles(theme)}
      className={`dropzone${isExternalDrag ? " is-dragging" : ""}`}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isExternalDrag && <div className="dragging-overlay" />}
      {/* Upload button moved into the toolbar; keep drag-and-drop active here */}
      {props.children}
    </div>
  );
};

export default Dropzone;
