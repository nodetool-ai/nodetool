import React, { useEffect, useState } from "react";

interface ImageDisplayProps {
  data: Uint8Array | string;
}

export const ImageDisplay: React.FC<ImageDisplayProps> = ({ data }) => {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const url =
        data instanceof Uint8Array
          ? URL.createObjectURL(new Blob([data]))
          : data;
      setImageUrl(url);

      return () => {
        if (data instanceof Uint8Array) {
          URL.revokeObjectURL(url);
        }
      };
    } catch (err) {
      setError("Error creating image");
      console.error("Error creating image:", err);
    }
  }, [data]);

  return (
    <div className="image-result">
      <div className="drag-indicator">↓ Drag image to save ↓</div>
      {isLoading && <div className="image-loader">Loading image...</div>}
      {error && <div className="error-message">{error}</div>}
      <img
        src={imageUrl}
        draggable
        style={{ opacity: isLoading ? 0 : 1 }}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setError("Error loading image");
        }}
        alt="Result"
      />
    </div>
  );
};
