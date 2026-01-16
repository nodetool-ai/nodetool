import React, { useMemo, useRef, useCallback, useState } from "react";
import { Typography, IconButton, Tooltip } from "@mui/material";
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

  const imageUrl = useMemo(() => {
    const result = createImageUrl(source, blobUrlRef.current);
    blobUrlRef.current = result.blobUrl;
    return result.url || undefined;
  }, [source]);

  const handleCopyToClipboard = useCallback(async () => {
    if (!imageUrl) {return;}

    try {
      // Fetch image as blob to avoid CORS issues with canvas
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      // Convert blob to data URL
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
        src={imageUrl}
        alt=""
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          borderRadius: "4px",
          cursor: "pointer"
        }}
        onDoubleClick={() => setOpenViewer(true)}
      />
    </div>
  );
};

export default React.memo(ImageView);
