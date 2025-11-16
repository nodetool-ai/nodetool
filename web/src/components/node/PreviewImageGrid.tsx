/** @jsxImportSource @emotion/react */
import React, { useMemo, useRef, useEffect, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
export type ImageSource = Uint8Array | string;

export interface PreviewImageGridProps {
  images: ImageSource[];
  onDoubleClick?: (index: number) => void;
  itemSize?: number; // base min size for tiles
  gap?: number; // grid gap in px
}

const styles = (theme: Theme, gap: number) =>
  css({
    "&": {
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
      background: "rgba(0,0,0,0.5)",
      color: "#fff",
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
        "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 100%)",
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
    }
  });

// Helper to safely revoke previous blob URLs
function revokeAll(urls: string[]) {
  urls.forEach((u) => {
    try {
      if (u && u.startsWith("blob:")) URL.revokeObjectURL(u);
    } catch {
      console.error("Error revoking blob URL", u);
    }
  });
}

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
  itemSize = 128,
  gap = 8
}) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  // Map each ImageSource to a persistent URL. Strings map to themselves.
  const urlMapRef = useRef<Map<ImageSource, string>>(new Map());
  const [version, setVersion] = useState(0); // force rerender when map changes

  // Build URLs for current images and cleanup URLs for removed ones
  useEffect(() => {
    const map = urlMapRef.current;
    const currentSet = new Set<ImageSource>(images);

    // Add new URLs
    let changed = false;
    images.forEach((img) => {
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

    if (changed) setVersion((v) => v + 1);

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
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      // no-op for now; grid is auto-fill and responds via CSS
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div css={styles(theme as any, gap)} ref={containerRef}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${itemSize}px, 1fr))`
        }}
      >
        {images.map((img, idx) => (
          <div
            key={idx}
            className="tile"
            onDoubleClick={() => onDoubleClick && onDoubleClick(idx)}
          >
            {urlMapRef.current.get(img) ? (
              <img
                className="img"
                src={urlMapRef.current.get(img) as string}
                alt={`image-${idx + 1}`}
                loading="lazy"
              />
            ) : (
              <div className="placeholder">IMAGE</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PreviewImageGrid;
