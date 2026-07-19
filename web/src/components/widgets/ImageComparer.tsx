/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState, useCallback, useRef, useMemo } from "react";
import { ToolbarIconButton, BORDER_RADIUS, SPACING, Z_INDEX, getSpacingPx } from "../ui_primitives";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import { alphaSurfaceBg } from "../../styles/AlphaSurface";
import { formatFileSize } from "../../utils/formatUtils";

export interface ImageMetadata {
  width?: number;
  height?: number;
  size?: number;
}

export interface ImageComparerProps {
  imageA: string;
  imageB: string;
  labelA?: string;
  labelB?: string;
  showLabels?: boolean;
  showMetadata?: boolean;
  initialMode?: "horizontal" | "vertical";
  metadataA?: ImageMetadata;
  metadataB?: ImageMetadata;
}

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "relative",
      width: "100%",
      height: "100%",
      minHeight: "200px",
      overflow: "hidden",
      userSelect: "none",
      ...alphaSurfaceBg
    },
    ".comparer-container": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    ".image-layer": {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    ".image-layer img": {
      maxWidth: "100%",
      maxHeight: "100%",
      objectFit: "contain",
      pointerEvents: "none"
    },
    ".divider-line": {
      position: "absolute",
      backgroundColor: theme.vars.palette.common.white,
      boxShadow: `0 0 4px ${theme.vars.palette.c_scrim}`,
      zIndex: Z_INDEX.dropdown,
      pointerEvents: "none"
    },
    ".divider-line.horizontal": {
      width: "2px",
      height: "100%",
      top: 0
    },
    ".divider-line.vertical": {
      height: "2px",
      width: "100%",
      left: 0
    },
    ".label": {
      position: "absolute",
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
      fontSize: theme.fontSizeSmaller,
      fontWeight: 600,
      color: theme.vars.palette.common.white,
      backgroundColor: theme.vars.palette.c_scrim,
      borderRadius: BORDER_RADIUS.sm,
      zIndex: Z_INDEX.sticky,
      pointerEvents: "none"
    },
    ".label.label-a.horizontal": {
      top: "8px",
      left: "8px"
    },
    ".label.label-b.horizontal": {
      top: "8px",
      right: "8px"
    },
    ".label.label-a.vertical": {
      top: "8px",
      left: "8px"
    },
    ".label.label-b.vertical": {
      bottom: "8px",
      left: "8px"
    },
    ".metadata": {
      position: "absolute",
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[300],
      backgroundColor: theme.vars.palette.c_scrim,
      borderRadius: BORDER_RADIUS.sm,
      zIndex: Z_INDEX.sticky,
      pointerEvents: "none"
    },
    ".metadata.metadata-a.horizontal": {
      bottom: "8px",
      left: "8px"
    },
    ".metadata.metadata-b.horizontal": {
      bottom: "8px",
      right: "56px"
    },
    ".metadata.metadata-a.vertical": {
      top: "32px",
      left: "8px"
    },
    ".metadata.metadata-b.vertical": {
      bottom: "32px",
      left: "8px"
    },
    ".toggle-button": {
      position: "absolute",
      bottom: "8px",
      right: "24px",
      zIndex: Z_INDEX.overlay,
      backgroundColor: theme.vars.palette.c_scrim,
      color: theme.vars.palette.common.white,
      padding: getSpacingPx(SPACING.xs),
      "&:hover": {
        backgroundColor: theme.vars.palette.c_scrim_strong
      }
    }
  });

const ImageComparer: React.FC<ImageComparerProps> = ({
  imageA,
  imageB,
  labelA = "A",
  labelB = "B",
  showLabels = true,
  showMetadata = true,
  initialMode = "horizontal",
  metadataA,
  metadataB
}) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"horizontal" | "vertical">(initialMode);
  const [position, setPosition] = useState(50);
  const [isHovering, setIsHovering] = useState(false);
  const [loadedMetadataA, setLoadedMetadataA] = useState<ImageMetadata>({});
  const [loadedMetadataB, setLoadedMetadataB] = useState<ImageMetadata>({});

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current) {return;}

      const rect = containerRef.current.getBoundingClientRect();

      if (mode === "horizontal") {
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
        setPosition(percentage);
      } else {
        const y = e.clientY - rect.top;
        const percentage = Math.max(0, Math.min(100, (y / rect.height) * 100));
        setPosition(percentage);
      }
    },
    [mode]
  );

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    setPosition(50);
  }, []);

  const toggleMode = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setMode((prev) => (prev === "horizontal" ? "vertical" : "horizontal"));
    setPosition(50);
  }, []);

  const handleImageALoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      setLoadedMetadataA((prev) => ({
        ...prev,
        width: img.naturalWidth,
        height: img.naturalHeight
      }));
    },
    []
  );

  const handleImageBLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      setLoadedMetadataB((prev) => ({
        ...prev,
        width: img.naturalWidth,
        height: img.naturalHeight
      }));
    },
    []
  );

  const finalMetadataA = useMemo(
    () => ({ ...loadedMetadataA, ...metadataA }),
    [loadedMetadataA, metadataA]
  );
  const finalMetadataB = useMemo(
    () => ({ ...loadedMetadataB, ...metadataB }),
    [loadedMetadataB, metadataB]
  );

  const clipPathA = useMemo(() => {
    if (mode === "horizontal") {
      return `inset(0 ${100 - position}% 0 0)`;
    } else {
      return `inset(0 0 ${100 - position}% 0)`;
    }
  }, [mode, position]);

  const cursorStyle = mode === "horizontal" ? "ew-resize" : "ns-resize";

  const dividerStyle = useMemo(() => {
    if (mode === "horizontal") {
      return { left: `${position}%` };
    } else {
      return { top: `${position}%` };
    }
  }, [mode, position]);

  const formatMetadata = (meta: ImageMetadata): string => {
    const parts: string[] = [];
    if (meta.width && meta.height) {
      parts.push(`${meta.width} × ${meta.height}`);
    }
    const sizeStr = meta.size === undefined ? "" : formatFileSize(meta.size);
    if (sizeStr) {
      parts.push(sizeStr);
    }
    return parts.join(" • ");
  };

  return (
    <div css={styles(theme)} className="image-comparer">
      <div
        ref={containerRef}
        className="comparer-container"
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: cursorStyle }}
      >
        {/* Image B (background - full image) */}
        <div className="image-layer image-b">
          <img src={imageB} alt={labelB} onLoad={handleImageBLoad} />
        </div>

        {/* Image A (foreground - clipped) */}
        <div className="image-layer image-a" style={{ clipPath: clipPathA }}>
          <img src={imageA} alt={labelA} onLoad={handleImageALoad} />
        </div>

        {/* Divider line */}
        {isHovering && (
          <div
            className={`divider-line ${mode}`}
            style={dividerStyle}
          />
        )}

        {/* Labels */}
        {showLabels && (
          <>
            <div className={`label label-a ${mode}`}>{labelA}</div>
            <div className={`label label-b ${mode}`}>{labelB}</div>
          </>
        )}

        {/* Metadata */}
        {showMetadata && (
          <>
            {formatMetadata(finalMetadataA) && (
              <div className={`metadata metadata-a ${mode}`}>
                {formatMetadata(finalMetadataA)}
              </div>
            )}
            {formatMetadata(finalMetadataB) && (
              <div className={`metadata metadata-b ${mode}`}>
                {formatMetadata(finalMetadataB)}
              </div>
            )}
          </>
        )}

        {/* Toggle button */}
        <ToolbarIconButton
          tooltip={mode === "horizontal" ? "Switch to vertical" : "Switch to horizontal"}
          icon={mode === "horizontal" ? <SwapVertIcon fontSize="small" /> : <SwapHorizIcon fontSize="small" />}
          className="toggle-button"
          onClick={toggleMode}
          size="small"
        />
      </div>
    </div>
  );
};

export default ImageComparer;

