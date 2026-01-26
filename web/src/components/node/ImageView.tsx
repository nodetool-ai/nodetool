/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import AssetViewer from "../assets/AssetViewer";
import { isElectron } from "../../utils/browser";
import { createImageUrl } from "../../utils/imageUtils";
import ImageDimensions from "./ImageDimensions";
import { copyAssetToClipboard } from "../../utils/clipboardUtils";
import { ToolbarIconButton } from "../ui_primitives";

interface ImageViewProps {
  source?: string | Uint8Array;
}

const ImageView: React.FC<ImageViewProps> = ({ source }) => {
  const [openViewer, setOpenViewer] = React.useState(false);
  const [copied, setCopied] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  const imageUrl = useMemo(() => {
    const result = createImageUrl(source, blobUrlRef.current);
    blobUrlRef.current = result.blobUrl;
    return result.url || undefined;
  }, [source]);

  const handleImageLoad = useCallback(() => {
    if (imageRef.current) {
      setImageDimensions({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight
      });
    }
  }, []);

  useEffect(() => {
    setImageDimensions(null);
  }, [imageUrl]);



  const styles = css({
    ".image-dimensions": {
      opacity: 0,
      transition: "opacity 0.2s ease"
    },
    "&:hover .image-dimensions": {
      opacity: 1
    },
    ".image-view-actions": {
      opacity: 0,
      transition: "opacity 0.2s ease"
    },
    "&:hover .image-view-actions": {
      opacity: 1
    }
  });
  const handleCopyToClipboard = useCallback(async () => {
    if (!imageUrl) { return; }

    try {
      await copyAssetToClipboard("image/png", imageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy image to clipboard:", error);
    }
  }, [imageUrl]);

  if (!imageUrl) {
    return <Typography>No Image found</Typography>;
  }

  return (
    <div
     css={styles}
      className="image-output"
      style={{
        position: "relative",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        height: "100%",
        minHeight: "80px"
      }}
    >
      <AssetViewer
        contentType="image/*"
        url={imageUrl}
        open={openViewer}
        onClose={() => setOpenViewer(false)}
      />
      <div
        className="image-view-actions"
        style={{
          position: "absolute",
          top: 4,
          right: 32, // Leave space for history button in parent ResultOverlay
          zIndex: 10,
          display: "flex",
          gap: "4px",
          opacity: 0,
          transition: "opacity 0.2s ease"
        }}
      >
        {isElectron && (
          <ToolbarIconButton
            icon={copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
            tooltip={copied ? "Copied!" : "Copy to clipboard "}
            onClick={handleCopyToClipboard}
            size="small"
            nodrag={false}
            sx={{
              width: 24,
              height: 24,
              padding: "4px",
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              color: "white",
              "&:hover": {
                backgroundColor: "rgba(0, 0, 0, 0.7)"
              }
            }}
          />
        )}
      </div>
      <img
        ref={imageRef}
        src={imageUrl}
        alt=""
        onLoad={handleImageLoad}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          borderRadius: "4px",
          cursor: "pointer"
        }}
        onDoubleClick={() => setOpenViewer(true)}
        draggable={false}
      />
      {imageDimensions && (
        <ImageDimensions
          width={imageDimensions.width}
          height={imageDimensions.height}
        />
      )}
    </div>
  );
};

export default React.memo(ImageView);
