import React, { useMemo, useRef, useEffect } from "react";
import { Typography } from "@mui/material";
import AssetViewer from "../assets/AssetViewer";

interface ImageViewProps {
  source?: string | Uint8Array;
}

const ImageView: React.FC<ImageViewProps> = ({ source }) => {
  const [openViewer, setOpenViewer] = React.useState(false);
  const objectUrlRef = useRef<string | null>(null);

  const imageUrl = useMemo(() => {
    if (!source) return undefined;
    if (typeof source === "string") {
      // If it's already a URL string (data URL, blob URL, or http URL), return it directly
      if (source.startsWith('data:') || source.startsWith('blob:') || source.startsWith('http')) {
        return source;
      }
      // If it's a regular string that's not a URL, treat it as data
    }

    // Revoke previous object URL if it exists
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    // Create new object URL
    const newObjectUrl = URL.createObjectURL(new Blob([source], { type: "image/png" }));
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
        height: "calc(100% - 24px)",
        minHeight: "100px"
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

export default React.memo(ImageView);
