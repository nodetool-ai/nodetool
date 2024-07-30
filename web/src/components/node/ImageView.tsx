import React, { useState, useEffect } from "react";
import { Typography } from "@mui/material";
import AssetViewer from "../assets/AssetViewer";

interface ImageViewProps {
  source?: string | Uint8Array;
}

const ImageView: React.FC<ImageViewProps> = ({ source }) => {
  const [openViewer, setOpenViewer] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (source instanceof Uint8Array) {
      const blob = new Blob([source], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setImageUrl(source);
    }
  }, [source]);

  if (!source) {
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
        height: "100%",
        minHeight: "50px"
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
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          width: "100%",
          height: "100%",
          minHeight: "20px"
        }}
        onDoubleClick={() => setOpenViewer(true)}
      />
    </div>
  );
};

export default ImageView;