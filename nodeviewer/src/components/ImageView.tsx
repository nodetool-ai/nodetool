import React, { useMemo } from "react";

interface ImageViewProps {
  source?: string | Uint8Array;
}

const ImageView: React.FC<ImageViewProps> = ({ source }) => {
  const [openViewer, setOpenViewer] = React.useState(false);

  const imageUrl = useMemo(() => {
    if (!source) return undefined;
    if (typeof source === "string") return source;

    return URL.createObjectURL(new Blob([source], { type: "image/png" }));
  }, [source]);

  if (!imageUrl) {
    return <div>No Image found</div>;
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
        minHeight: "100px",
      }}
    >
      <div
        style={{
          position: "absolute",
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          width: "100%",
          height: "100%",
          minHeight: "20px",
        }}
        onDoubleClick={() => setOpenViewer(true)}
      />
    </div>
  );
};

export default React.memo(ImageView);
