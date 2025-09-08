import { Box } from "@chakra-ui/react";
import { HStack } from "@chakra-ui/react";
import {
  FileUploadRoot,
  FileUploadTrigger,
  FileUploadDropzone,
} from "./ui/file-upload";
import { Button } from "./ui/button";
import { HiUpload } from "react-icons/hi";
import React, { useCallback, useState } from "react";
import { LuX } from "react-icons/lu";

interface ImageRef {
  type: "image";
  data: Uint8Array;
}

interface ImageInputProps {
  onChange: (file: ImageRef | null) => void;
  className?: string;
}

const ImageInput = ({ onChange, className }: ImageInputProps) => {
  const [file, setFile] = useState<File | null>(null);
  const handleFileChange = useCallback(
    (changes: any) => {
      const selectedFile = changes.acceptedFiles[0] || null;
      setFile(selectedFile);

      if (selectedFile) {
        const reader = new FileReader();
        reader.onload = () => {
          const arrayBuffer = reader.result as ArrayBuffer;
          onChange({
            type: "image",
            data: new Uint8Array(arrayBuffer),
          });
        };
        reader.readAsArrayBuffer(selectedFile);
      } else {
        onChange(null);
      }
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    setFile(null);
    onChange(null);
  }, [onChange]);

  return (
    <FileUploadRoot
      className={
        className ? `image-input-root ${className}` : "image-input-root"
      }
      onFileChange={handleFileChange}
      maxFiles={1}
      width="100%"
    >
      <HStack width="100%">
        <FileUploadTrigger>
          <Button size="sm" variant="ghost" colorScheme="gray">
            <HiUpload />
          </Button>
        </FileUploadTrigger>
        {!file && <FileUploadDropzone label="Drop your image here" />}
        {file && (
          <Box position="relative" width="100%">
            <img
              src={URL.createObjectURL(file)}
              alt="Preview"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClear}
              position="absolute"
              top={0}
              right={0}
              zIndex={1}
            >
              <LuX />
            </Button>
          </Box>
        )}
      </HStack>
    </FileUploadRoot>
  );
};

export default ImageInput;
