/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import { ImageRef } from "../../stores/ApiTypes";

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
    "& img": {
      width: "100%"
    }
  });

const ImageList: React.FC<{ images: Array<ImageRef> }> = ({ images }) => {
  return (
    <div className="image-list" css={styles}>
      {images.map((image) => (
        <img key={image.uri} src={image.uri} alt="" width="150" />
      ))}
    </div>
  );
};

export default ImageList;
