/** @jsxImportSource @emotion/react */
import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Button, IconButton, Checkbox, Tooltip } from "@mui/material";
import CompareIcon from "@mui/icons-material/Compare";
import ClearIcon from "@mui/icons-material/Clear";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import DownloadIcon from "@mui/icons-material/Download";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { ImageComparer } from "../widgets";
import AssetViewer from "../assets/AssetViewer";
import { CopyAssetButton } from "../common/CopyAssetButton";
import { Dialog } from "../ui_primitives";

export type ImageSource = Uint8Array | string;

export interface PreviewImageGridProps {
  images: ImageSource[];
  onDoubleClick?: (index: number) => void;
  onOpenInViewer?: (index: number) => void; // Open in asset viewer
  itemSize?: number; // base min size for tiles
  gap?: number; // grid gap in px
  enableSelection?: boolean; // enable multi-select mode
  showActions?: boolean; // show copy/download/open buttons on hover
}

const styles = (theme: Theme, gap: number) =>
  css({
    "&": {
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "auto"
    },
    ".grid": {
      display: "grid",
      gridTemplateColumns: `repeat(auto-fill, minmax(128px, 1fr))`,
      gap: `${gap}px`,
      padding: `${gap}px`,
      alignContent: "start"
    },
    ".tile": {
      position: "relative",
      width: "100%",
      aspectRatio: "1 / 1",
      borderRadius: 6,
      overflow: "hidden",
      background: theme.vars.palette.background.default,
      border: `1px solid ${theme.vars.palette.divider}`,
      cursor: "pointer",
      transition: "transform 0.08s ease-out, box-shadow 0.08s ease-out",
      boxShadow: "none",
      ["&:hover"]: {
        transform: "translateY(-1px)",
        boxShadow: theme.shadows[2]
      }
    },
    ".img": {
      width: "100%",
      height: "100%",
      objectFit: "cover" as const,
      display: "block",
      backgroundColor: theme.vars.palette.grey[900]
    },
    ".kind-badge": {
      position: "absolute",
      top: 6,
      left: 6,
      padding: "2px 6px",
      fontSize: 11,
      borderRadius: 4,
      background: `rgba(${theme.vars.palette.background.defaultChannel} / 0.5)`,
      color: "var(--palette-text-primary)",
      userSelect: "none" as const
    },
    ".name": {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: "4px 6px",
      fontSize: 11,
      color: theme.vars.palette.text.primary,
      background:
        `linear-gradient(180deg, rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0) 0%, rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.55) 100%)`,
      WebkitLineClamp: 1,
      display: "-webkit-box",
      WebkitBoxOrient: "vertical" as const,
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    ".placeholder": {
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      color: theme.vars.palette.text.secondary,
      background: theme.vars.palette.grey[900]
    },
    ".tile.selected": {
      outline: `3px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: -3
    },
    ".tile-actions": {
      position: "absolute",
      top: 4,
      right: 4,
      display: "flex",
      gap: 2,
      zIndex: 5,
      opacity: 0,
      transition: "opacity 0.15s ease"
    },
    ".tile:hover .tile-actions": {
      opacity: 1
    },
    ".tile-action-btn": {
      width: 24,
      height: 24,
      padding: 4,
      backgroundColor: `rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.6)`,
      color: theme.vars.palette.common.white,
      borderRadius: 4,
      "&:hover": {
        backgroundColor: `rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.85)`
      },
      "& svg": {
        fontSize: 14
      }
    },
    ".tile .select-checkbox": {
      position: "absolute",
      top: 4,
      right: 4,
      zIndex: 5,
      padding: 2,
      backgroundColor: `rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.5)`,
      borderRadius: 4,
      color: theme.vars.palette.common.white,
      "&:hover": {
        backgroundColor: `rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.7)`
      }
    },
    ".action-bar": {
      position: "absolute",
      bottom: 16,
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      gap: 8,
      padding: "8px 16px",
      backgroundColor: `rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.85)`,
      borderRadius: 8,
      zIndex: 100,
      alignItems: "center"
    },
    ".action-bar .action-button": {
      color: theme.vars.palette.common.white,
      fontSize: 13,
      textTransform: "none"
    },
    ".select-mode-toggle": {
      position: "absolute",
      top: 2,
      right: 4,
      zIndex: 50,
      backgroundColor: `rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.6)`,
      color: theme.vars.palette.common.white,
      fontSize: 11,
      textTransform: "none",
      padding: "2px 8px",
      minWidth: "unset",
      "&:hover": {
        backgroundColor: `rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.8)`
      }
    },
    ".compare-dialog .MuiPaper-root": {
      maxWidth: "90vw",
      maxHeight: "90vh",
      width: "90vw",
      height: "90vh",
      overflow: "hidden"
    }
  });

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const buffer = view.buffer as ArrayBuffer;
  if (view.byteOffset === 0 && view.byteLength === buffer.byteLength) {
    return buffer;
  }
  return buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

const PreviewImageGrid: React.FC<PreviewImageGridProps> = ({
  images,
  onDoubleClick,
  onOpenInViewer,
  itemSize = 128,
  gap = 8,
  enableSelection = true,
  showActions = true
}) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [compareImages, setCompareImages] = useState<[string, string] | null>(null);

  // Asset viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  // Reset selection when images change
  useEffect(() => {
    setSelectedIndices(new Set());
    setSelectionMode(false);
  }, [images.length]);

  const toggleSelect = useCallback((index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIndices(new Set());
  }, []);

  const handleCompare = useCallback(() => {
    if (selectedIndices.size !== 2) { return; }
    const indices = Array.from(selectedIndices);
    const map = urlMapRef.current;
    const urlA = map.get(images[indices[0]]);
    const urlB = map.get(images[indices[1]]);
    if (urlA && urlB) {
      setCompareImages([urlA, urlB]);
      setCompareDialogOpen(true);
    }
  }, [selectedIndices, images]);

  const handleCloseCompare = useCallback(() => {
    setCompareDialogOpen(false);
    setCompareImages(null);
  }, []);

  const handleDownloadImage = useCallback((index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    const img = images[index];
    const url = urlMapRef.current.get(img);
    if (!url) { return; }

    // Create a temporary link to download
    const link = document.createElement("a");
    link.href = url;

    let filename = `image-${index + 1}.png`; // fallback
    try {
      const parts = url.split("?")[0].split("/").pop();
      if (parts && parts.includes(".")) {
        filename = decodeURIComponent(parts);
      }
    } catch { }

    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [images]);

  const handleOpenInViewer = useCallback((index: number, event: React.MouseEvent) => {
    event.stopPropagation();
    if (onOpenInViewer) {
      onOpenInViewer(index);
    } else {
      const img = images[index];
      const url = urlMapRef.current.get(img);
      if (url) {
        setViewerUrl(url);
        setViewerOpen(true);
      }
    }
  }, [images, onOpenInViewer]);

  const handleCloseViewer = useCallback(() => {
    setViewerOpen(false);
    setViewerUrl(null);
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedIndices(new Set());
      }
      return !prev;
    });
  }, []);

  const showSelectionFeatures = enableSelection && images.length >= 2;

  // Map each ImageSource to a persistent URL. Strings map to themselves.
  const urlMapRef = useRef<Map<ImageSource, string>>(new Map());
  const [_version, setVersion] = useState(0); // force rerender when map changes

  // Build URLs for current images and cleanup URLs for removed ones
  useEffect(() => {
    const map = urlMapRef.current;
    const currentSet = new Set<ImageSource>(images.filter((img) => img != null));

    // Add new URLs
    let changed = false;
    images.forEach((img) => {
      // Skip null/undefined images
      if (img === null || img === undefined) {
        return;
      }
      if (!map.has(img)) {
        const url =
          typeof img === "string"
            ? img
            : URL.createObjectURL(
              new Blob([toArrayBuffer(img)], { type: "image/png" })
            );
        map.set(img, url);
        changed = true;
      }
    });

    // Remove URLs not present anymore
    for (const [key, url] of map.entries()) {
      if (!currentSet.has(key)) {
        map.delete(key);
        try {
          if (typeof key !== "string" && url.startsWith("blob:")) {
            URL.revokeObjectURL(url);
          }
        } catch {
          // Ignore URL cleanup errors
        }
        changed = true;
      }
    }

    if (changed) { setVersion((v) => v + 1); }

    // Cleanup all on unmount
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const urlMap = urlMapRef.current;
      if (urlMap && urlMap.size) {
        for (const [key, url] of urlMap.entries()) {
          try {
            if (typeof key !== "string" && url.startsWith("blob:")) {
              URL.revokeObjectURL(url);
            }
          } catch {
            // Ignore URL cleanup errors
          }
        }
        urlMap.clear();
      }
    };
  }, [images]);

  // Lightweight resize observer to trigger reflow on container changes, if needed later.
  useEffect(() => {
    if (!containerRef.current) { return; }
    const ro = new ResizeObserver(() => {
      // no-op for now; grid is auto-fill and responds via CSS
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="preview-image-grid" css={styles(theme as any, gap)} ref={containerRef}>
      {/* Selection mode toggle button */}
      {showSelectionFeatures && (
        <Button
          className="select-mode-toggle"
          size="small"
          onClick={toggleSelectionMode}
          startIcon={selectionMode ? <CheckBoxIcon /> : <CheckBoxOutlineBlankIcon />}
        >
          {selectionMode ? "Exit Select" : "Select"}
        </Button>
      )}

      <div
        className="grid"
        style={useMemo(() => ({
          gridTemplateColumns: `repeat(auto-fill, minmax(${itemSize}px, 1fr))`
        }), [itemSize])}
      >
        {images.map((img, idx) => {
          // Skip null/undefined images
          if (img === null || img === undefined) {
            return null;
          }
          const isSelected = selectedIndices.has(idx);
          // Use stable key: for strings use the URL, for Uint8Array use index
          const key = typeof img === 'string' ? img : `bytes-${idx}`;
          return (
            <div
              key={key}
              className={`tile ${isSelected ? "selected" : ""}`}
              onDoubleClick={() => {
                if (selectionMode) { return; }
                if (onDoubleClick) {
                  onDoubleClick(idx);
                } else {
                  // Default: open in viewer
                  const url = urlMapRef.current.get(img);
                  if (url) {
                    setViewerUrl(url);
                    setViewerOpen(true);
                  }
                }
              }}
              onClick={(e) => {
                if (selectionMode) {
                  toggleSelect(idx, e);
                }
              }}
            >
              {urlMapRef.current.get(img) ? (
                <img
                  className="img"
                  src={urlMapRef.current.get(img) as string}
                  alt={`image-${idx + 1}`}
                  loading="lazy"
                  draggable={false}
                />
              ) : (
                <div className="placeholder">IMAGE</div>
              )}
              {/* Action buttons on hover */}
              {showActions && !selectionMode && (
                <div className="tile-actions">
                  <CopyAssetButton
                    contentType="image/png"
                    url={urlMapRef.current.get(img) || ""}
                    className="tile-action-btn"
                  />
                  <Tooltip title="Download" placement="top">
                    <IconButton
                      className="tile-action-btn"
                      size="small"
                      onClick={(e) => handleDownloadImage(idx, e)}
                    >
                      <DownloadIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Open in Viewer (double-click)" placement="top">
                    <IconButton
                      className="tile-action-btn"
                      size="small"
                      onClick={(e) => handleOpenInViewer(idx, e)}
                    >
                      <OpenInNewIcon />
                    </IconButton>
                  </Tooltip>
                </div>
              )}
              {selectionMode && (
                <Checkbox
                  className="select-checkbox"
                  checked={isSelected}
                  onClick={(e) => toggleSelect(idx, e)}
                  icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                  checkedIcon={<CheckBoxIcon fontSize="small" />}
                  sx={{ padding: "2px" }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Action bar when items are selected */}
      {selectionMode && selectedIndices.size > 0 && (
        <Box className="action-bar">
          <Tooltip title="Compare the two selected images">
            <span>
              <Button
                className="action-button"
                size="small"
                startIcon={<CompareIcon />}
                onClick={handleCompare}
                disabled={selectedIndices.size !== 2}
              >
                Compare
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Clear selection">
            <IconButton size="small" onClick={clearSelection} sx={{ color: theme.vars.palette.common.white }}>
              <ClearIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Box sx={{ fontSize: 12, color: "grey.400", ml: 1 }}>
            {selectedIndices.size} selected
          </Box>
        </Box>
      )}

      {/* Compare dialog */}
      {compareImages && (
        <Dialog
          className="compare-dialog"
          open={compareDialogOpen}
          onClose={handleCloseCompare}
          maxWidth={false}
        >
          <Box sx={{ width: "90vw", height: "90vh", position: "relative" }}>
            <IconButton
              onClick={handleCloseCompare}
              sx={{
                position: "absolute",
                top: 8,
                right: 8,
                zIndex: 10,
                backgroundColor: `rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.6)`,
                color: theme.vars.palette.common.white,
                "&:hover": { backgroundColor: `rgba(${theme.vars.palette.common.blackChannel || "0, 0, 0"}, 0.8)` }
              }}
            >
              <ClearIcon />
            </IconButton>
            <ImageComparer
              imageA={compareImages[0]}
              imageB={compareImages[1]}
              labelA="Image 1"
              labelB="Image 2"
              showLabels={true}
              showMetadata={true}
              initialMode="horizontal"
            />
          </Box>
        </Dialog>
      )}

      {/* Asset Viewer for full-screen viewing */}
      {viewerUrl && (
        <AssetViewer
          url={viewerUrl}
          contentType="image/*"
          open={viewerOpen}
          onClose={handleCloseViewer}
        />
      )}
    </div>
  );
};

// Memoize component to prevent unnecessary re-renders when parent components update
// Custom comparison to avoid re-rendering on every prop change
const arePropsEqual = (prevProps: PreviewImageGridProps, nextProps: PreviewImageGridProps) => {
  return (
    prevProps.images === nextProps.images &&
    prevProps.itemSize === nextProps.itemSize &&
    prevProps.gap === nextProps.gap &&
    prevProps.enableSelection === nextProps.enableSelection &&
    prevProps.showActions === nextProps.showActions &&
    prevProps.onDoubleClick === nextProps.onDoubleClick &&
    prevProps.onOpenInViewer === nextProps.onOpenInViewer
  );
};

export default memo(PreviewImageGrid, arePropsEqual);
