import React, { useMemo, useRef, useCallback, useState } from "react";
import { Typography, IconButton, Tooltip } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import AssetViewer from "../assets/AssetViewer";
import { isElectron } from "../../utils/browser";

interface ImageViewProps {
  source?: string | Uint8Array;
}

const ImageView: React.FC<ImageViewProps> = ({ source }) => {
  const [openViewer, setOpenViewer] = React.useState(false);
  const [copied, setCopied] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  const imageUrl = useMemo(() => {
    if (!source) {return undefined;}
    if (typeof source === "string") {
      // If it's already a URL string (data URL, blob URL, or http URL), return it directly
      if (
        source.startsWith("data:") ||
        source.startsWith("blob:") ||
        source.startsWith("http")
      ) {
        return source;
      }
      // If it's a regular string that's not a URL, treat it as data
    }

    // Revoke previous object URL if it exists
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    // Create new object URL
    const newObjectUrl = URL.createObjectURL(
      new Blob([source as BlobPart], { type: "image/png" })
    );
    objectUrlRef.current = newObjectUrl;
    return newObjectUrl;
  }, [source]);

  // this cleanup is broken, at least in dev mode
  // useEffect(() => {
  //   return () => {
  //     if (objectUrlRef.current) {
  //       URL.revokeObjectURL(objectUrlRef.current);
  //       objectUrlRef.current = null;
  //     }
  //   };
  // }, []);

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
        justifyContent: "flex-start",
        alignItems: "flex-start",
        width: "100%",
        maxWidth: "100%",
        height: "100%",
        minHeight: "100px"
      }}
    >
      <AssetViewer
        contentType="image/*"
        url={imageUrl}
        open={openViewer}
        onClose={() => setOpenViewer(false)}
      />
      {isElectron && (
        <Tooltip title={copied ? "Copied!" : "Copy to clipboard"}>
          <IconButton
            onClick={handleCopyToClipboard}
            size="small"
            sx={{
              position: "absolute",
              top: 4,
              right: 4,
              zIndex: 10,
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
      <div
        style={{
          position: "absolute",
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          width: "100%",
          maxWidth: "100%",
          height: "100%",
          minHeight: "20px"
        }}
        onDoubleClick={() => setOpenViewer(true)}
      />
    </div>
  );
};

export default React.memo(ImageView);
