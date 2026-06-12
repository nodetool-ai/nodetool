/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  BORDER_RADIUS,
  Caption,
  FlexColumn,
  PADDING,
  SPACING
} from "../ui_primitives";
import { useCompositing } from "./sketchCanvasHooks";
import type { ActiveStrokeInfo } from "./rendering";
import {
  normalizeSketchDocument,
  type LayerTransform,
  type SketchDocument
} from "./types";

const rendererStyles = (theme: Theme) =>
  css({
    "&.sketch-renderer": {
      position: "relative",
      width: "100%",
      height: "100%",
      minHeight: 0,
      overflow: "hidden",
      borderRadius: BORDER_RADIUS.sm,
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.c_editor_bg_color,
      backgroundImage: `radial-gradient(${theme.vars.palette.c_editor_grid_color} 1px, transparent 1px)`,
      backgroundSize: theme.spacing(SPACING.lg)
    },
    ".sketch-renderer__canvas": {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "contain",
      objectPosition: "center",
      imageRendering: "auto",
      pointerEvents: "none"
    },
    ".sketch-renderer__canvas--hidden": {
      visibility: "hidden"
    },
    ".sketch-renderer__canvas--transparent": {
      opacity: 0
    },
    ".sketch-renderer__meta": {
      position: "absolute",
      right: theme.spacing(SPACING.xs),
      bottom: theme.spacing(SPACING.xs),
      pointerEvents: "none",
      backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.72)`,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.sm,
      color: theme.vars.palette.text.secondary
    }
  });

export interface SketchRendererProps {
  document: SketchDocument;
  className?: string;
  ariaLabel?: string;
  isolatedLayerId?: string | null;
  showDimensions?: boolean;
}

const getViewportScale = (
  viewportWidth: number,
  viewportHeight: number,
  canvasWidth: number,
  canvasHeight: number
): number => {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return 1;
  }
  return Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight);
};

const SketchRenderer: React.FC<SketchRendererProps> = ({
  document,
  className,
  ariaLabel = "Sketch preview",
  isolatedLayerId = null,
  showDimensions = false
}) => {
  const theme = useTheme();
  const styles = useMemo(() => rendererStyles(theme), [theme]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeStrokeRef = useRef<ActiveStrokeInfo | null>(null);
  const transformPreviewByLayerIdRef = useRef<Record<string, LayerTransform>>({});
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const normalizedDocument = useMemo(
    () => normalizeSketchDocument(document),
    [document]
  );
  const canvasWidth = Math.max(1, Math.round(normalizedDocument.canvas.width));
  const canvasHeight = Math.max(1, Math.round(normalizedDocument.canvas.height));
  const viewportScale = useMemo(
    () =>
      getViewportScale(
        viewportSize.width,
        viewportSize.height,
        canvasWidth,
        canvasHeight
      ),
    [viewportSize.width, viewportSize.height, canvasWidth, canvasHeight]
  );

  const {
    bootstrapDisplayRef,
    displayCanvasRef,
    bootstrapPhaseActive,
    requestRedraw
  } = useCompositing({
    doc: normalizedDocument,
    zoom: viewportScale,
    isolatedLayerId,
    activeStrokeRef,
    transformPreviewByLayerIdRef
  });

  useEffect(() => {
    const element = rootRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      const nextSize = {
        width: entry.contentRect.width,
        height: entry.contentRect.height
      };
      setViewportSize((currentSize) =>
        currentSize.width === nextSize.width && currentSize.height === nextSize.height
          ? currentSize
          : nextSize
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    requestRedraw();
  }, [requestRedraw, canvasWidth, canvasHeight]);

  const rootClassName = className
    ? `sketch-renderer ${className}`
    : "sketch-renderer";
  const bootstrapClassName = bootstrapPhaseActive
    ? "sketch-renderer__canvas"
    : "sketch-renderer__canvas sketch-renderer__canvas--hidden";
  const displayClassName = bootstrapPhaseActive
    ? "sketch-renderer__canvas sketch-renderer__canvas--transparent"
    : "sketch-renderer__canvas";

  return (
    <div
      ref={rootRef}
      css={styles}
      className={rootClassName}
      role="img"
      aria-label={ariaLabel}
      data-testid="sketch-renderer"
    >
      <canvas
        ref={bootstrapDisplayRef}
        className={bootstrapClassName}
        width={canvasWidth}
        height={canvasHeight}
        aria-hidden="true"
      />
      <canvas
        ref={displayCanvasRef}
        className={displayClassName}
        width={canvasWidth}
        height={canvasHeight}
        aria-hidden="true"
      />
      {showDimensions && (
        <FlexColumn
          className="sketch-renderer__meta"
          padding={PADDING.micro}
        >
          <Caption>
            {canvasWidth} × {canvasHeight}
          </Caption>
        </FlexColumn>
      )}
    </div>
  );
};

export default memo(SketchRenderer);
