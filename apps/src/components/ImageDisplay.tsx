import React, { useEffect, useState } from "react";
import { Box, Text } from "@chakra-ui/react";

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
    <Box
      bg="gray.800"
      color="white"
      borderRadius="lg"
      boxShadow="md"
      p={4}
      textAlign="center"
    >
      <Text fontSize="sm" color="gray.400" mb={2}>
        ↓ Drag image to save ↓
      </Text>
      {isLoading && (
        <Text fontSize="sm" color="gray.300">
          Loading image...
        </Text>
      )}
      {error && (
        <Text fontSize="sm" color="red.400">
          {error}
        </Text>
      )}
      <img
        src={imageUrl}
        draggable
        style={{
          opacity: isLoading ? 0 : 1,
          borderRadius: "8px",
          maxWidth: "100%",
        }}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setError("Error loading image");
        }}
        alt="Result"
      />
    </Box>
  );
};
