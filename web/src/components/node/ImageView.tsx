/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { Typography, IconButton, Tooltip } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import AssetViewer from "../assets/AssetViewer";
import { createImageUrl } from "../../utils/imageUtils";
import ImageDimensions from "./ImageDimensions";
import { CopyAssetButton } from "../common/CopyAssetButton";

interface ImageViewProps {
  source?: string | Uint8Array;
}

const ImageView: React.FC<ImageViewProps> = ({ source }) => {
  const [openViewer, setOpenViewer] = React.useState(false);
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

  const handleDownload = useCallback(() => {
    if (!imageUrl) { return; }

    const link = document.createElement("a");
    link.href = imageUrl;

    let filename = `image-${Date.now()}.png`;

    try {
      // Check for extension in URL (Asset URL or other)
      const urlPath = imageUrl.split('?')[0];
      const lastSegment = urlPath.split('/').pop();
      if (lastSegment && lastSegment.includes('.')) {
        filename = decodeURIComponent(lastSegment);
      } else if (imageUrl.startsWith("data:image/")) {
        // Handle data URIs
        const mime = imageUrl.substring(5, imageUrl.indexOf(";"));
        const ext = mime.split("/")[1];
        if (ext) {
          filename = `image-${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`;
        }
      }
    } catch (_e) {
      // fallback
    }

    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [imageUrl]);

  const handleOpenInViewer = useCallback(() => {
    setOpenViewer(true);
  }, []);

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
          right: 40, // Leave space for history button in parent ResultOverlay
          zIndex: 10,
          display: "flex",
          gap: "4px",
          opacity: 0,
          transition: "opacity 0.2s ease"
        }}
      >
        <CopyAssetButton
          contentType="image/png"
          url={imageUrl}
        />
        <Tooltip title="Download" placement="top">
          <IconButton
            size="small"
            onClick={handleDownload}
            sx={{
              width: 24,
              height: 24,
              padding: "4px",
              backgroundColor: "rgba(0, 0, 0, 0.6)",
              color: "#fff",
              borderRadius: "4px",
              "&:hover": {
                backgroundColor: "rgba(0, 0, 0, 0.85)"
              },
              "& svg": {
                fontSize: 14
              }
            }}
          >
            <DownloadIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Open in Viewer (double-click)" placement="top">
          <IconButton
            size="small"
            onClick={handleOpenInViewer}
            sx={{
              width: 24,
              height: 24,
              padding: "4px",
              backgroundColor: "rgba(0, 0, 0, 0.6)",
              color: "#fff",
              borderRadius: "4px",
              "&:hover": {
                backgroundColor: "rgba(0, 0, 0, 0.85)"
              },
              "& svg": {
                fontSize: 14
              }
            }}
          >
            <OpenInNewIcon />
          </IconButton>
        </Tooltip>
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
