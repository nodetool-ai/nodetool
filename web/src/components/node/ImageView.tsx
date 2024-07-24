import React, { useState } from "react";
import { Typography } from "@mui/material";
import AssetViewer from "../assets/AssetViewer";

interface ImageViewProps {
  uri?: string;
}

const ImageView: React.FC<ImageViewProps> = ({ uri }) => {
  const [openViewer, setOpenViewer] = useState(false);

  if (!uri) {
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
        url={uri}
        open={openViewer}
        onClose={() => setOpenViewer(false)}
      />
      <div
        style={{
          position: "absolute",
          backgroundImage: `url(${uri})`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          width: "100%",
          height: "100%",
          minHeight: "20px"
          //   paddingTop: "100%"
        }}
        onDoubleClick={() => setOpenViewer(true)}
      />
    </div>
  );
};

export default ImageView;
