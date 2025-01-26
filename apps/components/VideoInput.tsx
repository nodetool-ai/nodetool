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

interface VideoRef {
  type: "video";
  data: Uint8Array;
}

interface VideoInputProps {
  onChange: (file: VideoRef | null) => void;
}

const VideoInput = ({ onChange }: VideoInputProps) => {
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
            type: "video",
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
      onFileChange={handleFileChange}
      maxFiles={1}
      width="100%"
      accept={{ "video/*": [".mp4", ".mov", ".avi", ".webm"] }}
    >
      <HStack width="100%">
        <FileUploadTrigger asChild>
          <Button size="sm" variant="ghost" colorScheme="gray">
            <HiUpload />
          </Button>
        </FileUploadTrigger>
        {!file && (
          <FileUploadDropzone width="100%" label="Drop your video here" />
        )}
        {file && (
          <Box position="relative" width="100%">
            <video
              src={URL.createObjectURL(file)}
              controls
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              colorScheme="red"
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

export default VideoInput;
