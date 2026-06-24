/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { Text, ToolbarIconButton, MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import DownloadIcon from "@mui/icons-material/Download";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import AssetViewer from "../assets/AssetViewer";
import { createImageUrl } from "../../utils/imageUtils";
import BitmapCanvas from "./BitmapCanvas";
import ImageDimensions from "./ImageDimensions";
import { CopyAssetButton } from "../common/CopyAssetButton";
import { alphaSurfaceBg } from "../../styles/AlphaSurface";
import { useMediaOverlay } from "./MediaOverlayContext";

const hoverStyles = css({
  ".image-dimensions": {
    opacity: 0,
    transition: `opacity ${MOTION.normal}`
  },
  "&:hover .image-dimensions": {
    opacity: 1
  },
  ".image-view-actions": {
    opacity: 0,
    transition: `opacity ${MOTION.normal}`
  },
  "&:hover .image-view-actions": {
    opacity: 1
  }
});

interface ImageViewProps {
  source?: string | Uint8Array;
  /**
   * Preview bitmap from the in-browser runner (zero-copy transport). When set
   * it takes precedence over `source`: the frame is painted straight onto a
   * canvas, and a PNG blob URL for the action buttons (copy / download /
   * viewer) is derived lazily off the display path.
   */
  bitmap?: ImageBitmap;
}

const ImageView: React.FC<ImageViewProps> = ({ source, bitmap }) => {
  const [openViewer, setOpenViewer] = React.useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const { suppressed: overlaySuppressed, onRequestOpenViewer } =
    useMediaOverlay();

  // Double-buffer the displayed image so an output update replaces the old one
  // smoothly: the visible <img> keeps the current (already-decoded) URL until
  // the next one has finished loading, then swaps — no blank gap/flicker (the
  // pattern transform nodes hit when they re-render their live output). Owned
  // blob URLs are revoked only once they're no longer shown.
  const displayedBlobRef = useRef<string | null>(null);
  const nextBlobRef = useRef<string | null>(null);
  const [displayedUrl, setDisplayedUrl] = useState<string>();

  const nextUrl = useMemo(() => {
    // A newer source arrived before the previous preload committed — drop the
    // superseded blob.
    if (nextBlobRef.current) {
      URL.revokeObjectURL(nextBlobRef.current);
      nextBlobRef.current = null;
    }
    const result = createImageUrl(source, null);
    nextBlobRef.current = result.blobUrl;
    return result.url || undefined;
  }, [source]);

  const promote = useCallback((url: string) => {
    if (
      displayedBlobRef.current &&
      displayedBlobRef.current !== nextBlobRef.current
    ) {
      URL.revokeObjectURL(displayedBlobRef.current);
    }
    displayedBlobRef.current = nextBlobRef.current;
    nextBlobRef.current = null;
    setDisplayedUrl(url);
  }, []);

  useEffect(() => {
    if (nextUrl === undefined) {
      if (displayedBlobRef.current) {
        URL.revokeObjectURL(displayedBlobRef.current);
        displayedBlobRef.current = null;
      }
      setDisplayedUrl(undefined);
      return;
    }
    if (nextUrl === displayedUrl) return;
    // First image: nothing underneath to keep — commit immediately.
    if (displayedUrl === undefined) {
      promote(nextUrl);
      return;
    }
    // Preload the next image off-screen and swap only once it's decoded, so the
    // current frame stays put until then.
    let cancelled = false;
    const preload = new Image();
    const commit = () => {
      if (!cancelled) promote(nextUrl);
    };
    preload.onload = commit;
    preload.onerror = commit;
    preload.src = nextUrl;
    return () => {
      cancelled = true;
    };
  }, [nextUrl, displayedUrl, promote]);

  useEffect(
    () => () => {
      if (displayedBlobRef.current) {
        URL.revokeObjectURL(displayedBlobRef.current);
      }
      if (nextBlobRef.current) {
        URL.revokeObjectURL(nextBlobRef.current);
      }
    },
    []
  );

  // Bitmap path: the canvas shows the frame immediately; the PNG blob URL the
  // action buttons need is encoded asynchronously after a short debounce, so a
  // live scrub (a new bitmap every few frames) never pays for an encode — only
  // the resting frame does, off the display path.
  const bitmapUrlRef = useRef<string | null>(null);
  const [bitmapUrl, setBitmapUrl] = useState<string | null>(null);
  const commitBitmapUrl = useCallback((url: string | null) => {
    if (bitmapUrlRef.current && bitmapUrlRef.current !== url) {
      URL.revokeObjectURL(bitmapUrlRef.current);
    }
    bitmapUrlRef.current = url;
    setBitmapUrl(url);
  }, []);

  useEffect(() => {
    if (!bitmap) {
      commitBitmapUrl(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(bitmap, 0, 0);
        const blob = await canvas.convertToBlob({ type: "image/png" });
        if (!cancelled) {
          commitBitmapUrl(URL.createObjectURL(blob));
        }
      } catch {
        // Encode failed (bitmap closed mid-scrub) — actions stay hidden.
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bitmap, commitBitmapUrl]);

  useEffect(
    () => () => {
      if (bitmapUrlRef.current) {
        URL.revokeObjectURL(bitmapUrlRef.current);
      }
    },
    []
  );

  // Show the committed image, falling back to the freshly-computed one on the
  // first render so there's no "no image" flash before the effect runs.
  const imageUrl = bitmap ? bitmapUrl ?? undefined : displayedUrl ?? nextUrl;

  const handleImageLoad = useCallback(() => {
    if (imageRef.current) {
      setImageDimensions({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight
      });
    }
  }, []);

  useEffect(() => {
    if (bitmap) {
      setImageDimensions({ width: bitmap.width, height: bitmap.height });
      return;
    }
    setImageDimensions(null);
  }, [bitmap, imageUrl]);

  // Memoize style objects to prevent recreation on every render
  const containerStyle = useMemo(() => ({
    position: "relative" as const,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    height: "100%",
    minHeight: "80px",
    borderRadius: BORDER_RADIUS.sm,
    overflow: "hidden" as const,
    ...alphaSurfaceBg
  }), []);

  const actionsStyle = useMemo(() => ({
    position: "absolute" as const,
    top: 4,
    right: 40, // Leave space for history button in parent ResultOverlay
    zIndex: 10,
    display: "flex",
    gap: getSpacingPx(SPACING.xs),
    opacity: 0,
    transition: `opacity ${MOTION.normal}`
  }), []);

  const iconButtonStyle = useMemo(() => ({
    width: 24,
    height: 24,
    padding: getSpacingPx(SPACING.xs),
    backgroundColor: "var(--palette-c_scrim)",
    color: "var(--palette-grey-0)",
    borderRadius: BORDER_RADIUS.sm,
    "&:hover": {
      backgroundColor: "var(--palette-c_scrim_strong)"
    },
    "& svg": {
      fontSize: 14
    }
  }), []);

  const imageStyle = useMemo(() => ({
    width: "100%",
    height: "100%",
    objectFit: "contain" as const,
    borderRadius: BORDER_RADIUS.sm,
    cursor: "pointer"
  }), []);

  // Memoize event handlers to prevent recreation on every render
  const handleCloseViewer = useCallback(() => {
    setOpenViewer(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    // Inside a node's content card, defer to the parent so the viewer's gallery
    // shows all of the node's generations rather than just this one image.
    if (onRequestOpenViewer) {
      onRequestOpenViewer();
      return;
    }
    setOpenViewer(true);
  }, [onRequestOpenViewer]);

  const handleDownload = useCallback(async () => {
    if (!imageUrl) { return; }

    let filename = `image-${Date.now()}.png`;
    try {
      const urlPath = imageUrl.split('?')[0];
      const lastSegment = urlPath.split('/').pop();
      if (lastSegment && lastSegment.includes('.') && !imageUrl.startsWith("blob:") && !imageUrl.startsWith("data:")) {
        filename = decodeURIComponent(lastSegment);
      } else if (imageUrl.startsWith("data:image/")) {
        const mime = imageUrl.substring(5, imageUrl.indexOf(";"));
        const ext = mime.split("/")[1];
        if (ext) {
          filename = `image-${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`;
        }
      }
    } catch (_e) {
      console.warn("ImageView: could not determine filename from URL, using default");
    }

    // Fetch through a fresh blob so cross-origin /api/* URLs still honor `download`,
    // and so a revoked/stale blob URL in imageUrl can't produce a truncated file.
    let downloadUrl = imageUrl;
    let createdUrl: string | null = null;
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      createdUrl = URL.createObjectURL(blob);
      downloadUrl = createdUrl;
    } catch (err) {
      console.warn("ImageView: fetch for download failed, using raw URL", err);
    }

    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (createdUrl) {
      setTimeout(() => URL.revokeObjectURL(createdUrl), 0);
    }
  }, [imageUrl]);

  const handleOpenInViewer = useCallback(() => {
    setOpenViewer(true);
  }, []);

  if (!imageUrl && !bitmap) {
    return <Text>No Image found</Text>;
  }

  return (
    <div
      css={hoverStyles}
      className="image-output"
      style={containerStyle}
    >
      {!onRequestOpenViewer && imageUrl && (
        <AssetViewer
          contentType="image/*"
          url={imageUrl}
          open={openViewer}
          onClose={handleCloseViewer}
        />
      )}
      {!overlaySuppressed && imageUrl && (
        <div
          className="image-view-actions"
          style={actionsStyle}
        >
          <CopyAssetButton
            contentType="image/png"
            url={imageUrl}
          />
          <ToolbarIconButton
            title="Download"
            size="small"
            onClick={handleDownload}
            sx={iconButtonStyle}
          >
            <DownloadIcon />
          </ToolbarIconButton>
          <ToolbarIconButton
            title="Open in Viewer (double-click)"
            size="small"
            onClick={handleOpenInViewer}
            sx={iconButtonStyle}
          >
            <OpenInNewIcon />
          </ToolbarIconButton>
        </div>
      )}
      {bitmap ? (
        <BitmapCanvas
          bitmap={bitmap}
          aria-label="Generated image output"
          style={imageStyle}
          onDoubleClick={handleDoubleClick}
        />
      ) : (
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Generated image output"
          onLoad={handleImageLoad}
          style={imageStyle}
          onDoubleClick={handleDoubleClick}
          draggable={false}
        />
      )}
      {!overlaySuppressed && imageDimensions && (
        <ImageDimensions
          width={imageDimensions.width}
          height={imageDimensions.height}
        />
      )}
    </div>
  );
};

export default React.memo(ImageView);
