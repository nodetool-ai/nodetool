import React, { useCallback, useRef } from "react";
import {
  Box,
  Flex,
  Textarea,
  IconButton,
  Button,
  HStack,
} from "@chakra-ui/react";
import { FileUploadRoot, FileUploadTrigger } from "./ui/file-upload";
import { FileUploadList } from "./ui/file-upload";
import { HiUpload } from "react-icons/hi";

interface ComposerProps {
  onSubmit: (message: string) => void;
  disabled: boolean;
  droppedFiles: File[];
  setDroppedFiles: (files: File[]) => void;
  className?: string;
}

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24">
    <path
      fill="currentColor"
      d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"
    />
  </svg>
);

export const Composer: React.FC<ComposerProps> = ({
  onSubmit,
  disabled,
  droppedFiles,
  setDroppedFiles,
  className,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, []);

  const handleSubmit = useCallback(() => {
    if (!textareaRef.current) return;
    const message = textareaRef.current.value.trim();
    if (message || droppedFiles.length > 0) {
      onSubmit(message);
      textareaRef.current.value = "";
    }
  }, []);

  const handleFileChange = useCallback((changes: any) => {
    setDroppedFiles(changes.acceptedFiles);
    console.log(changes);
  }, []);

  return (
    <HStack
      className={className ? `composer-root ${className}` : "composer-root"}
      p={4}
      gap={4}
    >
      <Box width={droppedFiles.length > 0 ? "40%" : "10%"}>
        <FileUploadRoot onFileChange={handleFileChange} maxFiles={3}>
          <HStack>
            <FileUploadTrigger asChild>
              <Button size="sm" variant="ghost" colorScheme="gray">
                <HiUpload />
              </Button>
            </FileUploadTrigger>
            <FileUploadList />
          </HStack>
        </FileUploadRoot>
      </Box>

      <Box
        width="100%"
        boxShadow="sm"
        borderRadius="lg"
        bg="bg"
        border="1px solid"
        borderColor="border"
      >
        <Flex position="relative" alignItems="flex-end">
          <Textarea
            ref={textareaRef}
            placeholder="Write a message..."
            flex="1"
            bg="transparent"
            border="none"
            color="text"
            fontSize="sm"
            resize="none"
            minH="24px"
            maxH="200px"
            p={4}
            _placeholder={{
              color: "textGray",
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            css={{
              "&::-webkit-scrollbar": {
                display: "none",
              },
            }}
          />
          <IconButton
            aria-label="Send message"
            onClick={handleSubmit}
            disabled={disabled}
            variant="ghost"
            color="text"
            _hover={{
              color: "text",
              bg: "buttonHover",
            }}
            position="absolute"
            right={2}
            bottom={2}
          >
            <SendIcon />
          </IconButton>
        </Flex>
      </Box>
    </HStack>
  );
};
