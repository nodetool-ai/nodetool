import React, { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { Typography, IconButton, Tooltip, Box } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import AssetViewer from "../assets/AssetViewer";
import { isElectron } from "../../utils/browser";
import { createImageUrl } from "../../utils/imageUtils";

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

  const handleCopyToClipboard = useCallback(async () => {
    if (!imageUrl) { return; }

    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      await window.api.clipboardWriteImage(dataUrl);

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
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          zIndex: 10,
          display: "flex",
          gap: "4px"
        }}
      >
        {isElectron && (
          <Tooltip title={copied ? "Copied!" : "Copy to clipboard"}>
            <IconButton
              onClick={handleCopyToClipboard}
              size="small"
              aria-label={copied ? "Image copied to clipboard" : "Copy image to clipboard"}
              sx={{
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                color: "white",
                "&:hover": {
                  backgroundColor: "rgba(0, 0, 0, 0.7)"
                }
              }}
            >
              {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
      </div>
      <img
        ref={imageRef}
        src={imageUrl}
        alt="Generated image output"
        onLoad={handleImageLoad}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          borderRadius: "4px",
          cursor: "pointer"
        }}
        onDoubleClick={() => setOpenViewer(true)}
      />
      {imageDimensions && (
        <Box
          sx={{
            position: "absolute",
            bottom: 4,
            right: 4,
            bgcolor: "rgba(0, 0, 0, 0.6)",
            color: "white",
            px: 0.5,
            py: 0.25,
            borderRadius: 0.5,
            fontSize: "0.65rem",
            fontFamily: "monospace",
            pointerEvents: "none"
          }}
        >
          {imageDimensions.width} × {imageDimensions.height}
        </Box>
      )}
    </div>
  );
};

export default React.memo(ImageView);
