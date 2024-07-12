/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import { ImageRef } from "../../stores/ApiTypes";
import AssetViewer from "../assets/AssetViewer";

const styles = (theme: any) =>
  css({
    "&": {
      maxHeight: "500px",
      overflow: "auto",
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: ".1em",
      padding: "0"
    },
  });

const ImageList: React.FC<{ images: Array<ImageRef> }> = ({ images }) => {
  const [uri, setUri] = React.useState<string | undefined>(undefined);
  return (
    <div className="image-list" css={styles}>
      <AssetViewer
        contentType="image/*"
        url={uri}
        open={uri !== undefined}
        onClose={() => setUri(undefined)}
      />
      {images.map((image) => (
        <div
          key={image.uri}
          className="image-output"
          style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
            width: '100%',
            height: '100%',
            minHeight: '50px',
          }}
        >
          <div
            style={{
              position: 'absolute',
              backgroundImage: `url(${image.uri})`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              width: '100%',
              height: '100%',
              minHeight: '20px',
            }}
            onDoubleClick={() => setUri(image.uri)}
          />
        </div>
      ))}
    </div>
  );
};

export default ImageList;
