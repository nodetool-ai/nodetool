/** @jsxImportSource @emotion/react */
/**
 * CheckerDropzone
 *
 * Empty-state preview surface with a transparent-checker background.
 * Used by ContentCardBody and editing-node bodies as the "no content yet"
 * state for image / mask / 3d / video previews.
 *
 * Optional drop handling — when `onDrop` is set, the surface highlights
 * on drag-over and emits the dropped files.
 */

import React, { memo, useCallback, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { MOTION } from "./tokens";

const DEFAULT_CHECKER_SIZE = 12;

const styles = (theme: Theme, checkerSize: number, isOver: boolean) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: 80,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing(0.5),
    borderRadius: "var(--rounded-sm)",
    color: theme.vars.palette.grey[400],
    fontFamily: theme.fontFamily1,
    fontSize: theme.fontSizeSmall,
    textAlign: "center",
    overflow: "hidden",
    // CSS-only checker pattern using two layered gradients
    backgroundColor: theme.vars.palette.grey[900],
    backgroundImage: `
      linear-gradient(45deg, ${theme.vars.palette.grey[800]} 25%, transparent 25%),
      linear-gradient(-45deg, ${theme.vars.palette.grey[800]} 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, ${theme.vars.palette.grey[800]} 75%),
      linear-gradient(-45deg, transparent 75%, ${theme.vars.palette.grey[800]} 75%)
    `,
    backgroundSize: `${checkerSize * 2}px ${checkerSize * 2}px`,
    backgroundPosition: [
      `0 0`,
      `0 ${checkerSize}px`,
      `${checkerSize}px -${checkerSize}px`,
      `-${checkerSize}px 0px`
    ].join(", "),
    transition: `${MOTION.shadow}, border-color 150ms ease`,
    outline: isOver
      ? `2px dashed ${theme.vars.palette.primary.main}`
      : "1px solid transparent",
    outlineOffset: isOver ? -2 : 0,
    ".checker-icon": {
      opacity: 0.55,
      "& svg": {
        fontSize: 36,
        display: "block"
      }
    },
    ".checker-message": {
      opacity: 0.85,
      userSelect: "none"
    }
  });

export interface CheckerDropzoneProps {
  /** Optional message rendered below the icon */
  message?: string;
  /** Optional icon rendered above the message */
  icon?: React.ReactNode;
  /** Size of each checker square in px */
  checkerSize?: number;
  /** Called when files are dropped — when set, the surface accepts drops */
  onDrop?: (files: File[]) => void;
  /** Additional content rendered in place of the default icon + message */
  children?: React.ReactNode;
  className?: string;
}

const CheckerDropzoneInner: React.FC<CheckerDropzoneProps> = ({
  message,
  icon,
  checkerSize = DEFAULT_CHECKER_SIZE,
  onDrop,
  children,
  className
}) => {
  const theme = useTheme();
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!onDrop) {return;}
      e.preventDefault();
      e.stopPropagation();
      setIsOver(true);
    },
    [onDrop]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!onDrop) {return;}
      e.preventDefault();
      e.stopPropagation();
      setIsOver(false);
    },
    [onDrop]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!onDrop) {return;}
      e.preventDefault();
      e.stopPropagation();
      setIsOver(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) {onDrop(files);}
    },
    [onDrop]
  );

  return (
    <div
      css={styles(theme, checkerSize, isOver)}
      className={`checker-dropzone ${className ?? ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role={onDrop ? "button" : undefined}
      aria-label={onDrop ? message ?? "Drop files here" : undefined}
    >
      {children ?? (
        <>
          {icon && <span className="checker-icon">{icon}</span>}
          {message && <span className="checker-message">{message}</span>}
        </>
      )}
    </div>
  );
};

export const CheckerDropzone = memo(CheckerDropzoneInner);
CheckerDropzone.displayName = "CheckerDropzone";

export default CheckerDropzone;
