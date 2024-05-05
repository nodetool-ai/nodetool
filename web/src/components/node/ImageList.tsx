import React from "react";
import { ImageRef } from "../../stores/ApiTypes";

const ImageList: React.FC<{ images: Array<ImageRef>; }> = ({ images }) => {
  return (
    <div>
      {images.map((image) => (
        <img key={image.uri} src={image.uri} alt="" width="150" />
      ))}
    </div>
  );
};

export default ImageList;