import React, { useCallback, useState } from "react";
import { Box, HStack } from "@chakra-ui/react";
import {
  FileUploadRoot,
  FileUploadTrigger,
  FileUploadDropzone,
} from "./ui/file-upload";
import { Button } from "./ui/button";
import { HiUpload } from "react-icons/hi";
import { LuX } from "react-icons/lu";

interface VideoRef {
  type: "video";
  data: Uint8Array;
}

interface VideoInputProps {
  onChange: (file: VideoRef | null) => void;
  className?: string;
}

const VideoInput = ({ onChange, className }: VideoInputProps) => {
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
      className={
        className ? `video-input-root ${className}` : "video-input-root"
      }
      onFileChange={handleFileChange}
      maxFiles={1}
      width="100%"
      accept={{ "video/*": [".mp4", ".mov", ".avi", ".webm"] }}
    >
      <HStack width="100%">
        <FileUploadTrigger>
          <Button size="sm" variant="ghost" colorScheme="gray">
            <HiUpload />
          </Button>
        </FileUploadTrigger>
        {!file && (
          <FileUploadDropzone width="100%" label="Drop your video here" />
        )}
        {file && (
          <Box position="relative" width="100%" paddingTop="56.25%">
            <Box
              as="video"
              position="absolute"
              top={0}
              left={0}
              width="100%"
              height="100%"
              objectFit="contain"
              css={{
                "&": {
                  src: URL.createObjectURL(file),
                  controls: true,
                },
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClear}
              position="absolute"
              top={2}
              right={2}
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
