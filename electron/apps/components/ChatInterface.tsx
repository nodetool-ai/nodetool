import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Box,
  Flex,
  ListItem,
  Textarea,
  IconButton,
  Spinner,
} from "@chakra-ui/react";

import { useColorModeValue } from "./ui/color-mode";
import useChatStore from "../chat-runner";
import { MessageContent } from "../types/workflow";
import { ImageDisplay } from "./ImageDisplay";
import { AudioPlayer } from "./AudioPlayer";
import { VideoPlayer } from "./VideoPlayer";
import { FileUploadRoot, FileUploadList } from "./ui/file-upload";

interface ChatInterfaceProps {
  workflowId: string;
  token: string;
}

interface FilePreviewProps {
  file: File;
  onRemove: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ workflowId, token }) => {
  const {
    status,
    messages,
    droppedFiles,
    isDragging,
    sendMessage,
    setDroppedFiles,
    addDroppedFiles,
    removeDroppedFile,
    setIsDragging,
  } = useChatStore();
  const [disabled, setDisabled] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      addDroppedFiles(files);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!textareaRef.current) return;

    const message = textareaRef.current.value.trim();

    if (message || droppedFiles.length > 0) {
      const messageContents: MessageContent[] = [];

      if (message) {
        messageContents.push({
          type: "text",
          text: message,
        });
      }

      const messageFiles = droppedFiles.map((file): MessageContent => {
        if (file.type.startsWith("image/")) {
          return {
            type: "image_url",
            image: {
              type: "image",
              // @ts-ignore
              uri: "file://" + file.path,
            },
          };
        } else if (file.type.startsWith("audio/")) {
          return {
            type: "audio",
            audio: {
              type: "audio",
              // @ts-ignore
              uri: "file://" + file.path,
            },
          };
        } else if (file.type.startsWith("video/")) {
          return {
            type: "video",
            video: {
              type: "video",
              // @ts-ignore
              uri: "file://" + file.path,
            },
          };
        }
        return {
          type: "text",
          text: file.name,
        };
      });

      messageContents.push(...messageFiles);

      sendMessage({
        type: "message",
        role: "user",
        content: messageContents,
        name: "",
        workflow_id: workflowId,
        auth_token: token,
      });
      textareaRef.current.value = "";
      setDroppedFiles([]);
      setDisabled(true);
    }
  }, [droppedFiles]);

  const renderMessageContent = (content: MessageContent) => {
    switch (content.type) {
      case "text":
        return <div>{content.text}</div>;
      case "image_url":
        return (
          <div className="media-content">
            <ImageDisplay data={content.image.uri} />
          </div>
        );
      case "audio":
        return (
          <div className="media-content">
            <AudioPlayer data={content.audio.uri} />
          </div>
        );
      case "video":
        return (
          <div className="media-content">
            <VideoPlayer data={content.video.uri} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Box h="100%">
      <Flex direction="column" h="calc(100% - 80px)" overflow="hidden">
        <Box flex="1" overflowY="auto">
          {messages.map((msg, index) => (
            <Box
              key={index}
              mb="4"
              p="3"
              borderRadius="md"
              maxW="80%"
              bg={
                msg.role === "user"
                  ? useColorModeValue("gray.100", "gray.700")
                  : msg.role === "assistant"
                    ? useColorModeValue("gray.700", "gray.100")
                    : "transparent"
              }
              ml={msg.role === "user" ? "auto" : undefined}
              mr={msg.role === "assistant" ? "auto" : undefined}
              mx={msg.role === "system" ? "auto" : undefined}
              opacity={msg.role === "system" ? 0.7 : 1}
            >
              {Array.isArray(msg.content)
                ? msg.content.map((content, i) => (
                    <Box key={i} mt={i > 0 ? 2 : 0}>
                      {renderMessageContent(content)}
                    </Box>
                  ))
                : renderMessageContent({
                    type: "text",
                    text: msg.content as string,
                  })}
            </Box>
          ))}
          <Box ref={messagesEndRef} />
        </Box>

        {status === "loading" && (
          <Box>
            <Spinner />
          </Box>
        )}
      </Flex>

      <Box
        position="relative"
        h="80px"
        p="5"
        bg={useColorModeValue("gray.100", "gray.700")}
        borderTop="1px"
        borderColor={useColorModeValue("gray.200", "gray.600")}
      >
        <FileUploadRoot maxFiles={10}>
          <Flex position="relative" gap="2" alignItems="center">
            <Textarea
              ref={textareaRef}
              placeholder="Type your message..."
              flex="1"
              bg="transparent"
              border="none"
              color={useColorModeValue("gray.800", "gray.100")}
              fontSize="sm"
              resize="none"
              minH="24px"
              maxH="200px"
              p="2"
              _placeholder={{
                color: `${useColorModeValue("gray.800", "gray.100")}80`,
              }}
              onKeyDown={handleKeyDown}
            />

            <IconButton
              aria-label="Send message"
              onClick={handleSubmit}
              variant="ghost"
              color={useColorModeValue("teal.500", "teal.300")}
              _hover={{ opacity: 0.8 }}
            >
              <SendIcon />
            </IconButton>
          </Flex>
          {droppedFiles.length > 0 && <FileUploadList />}
        </FileUploadRoot>
      </Box>
    </Box>
  );
};

// Add icon components
const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24">
    <path
      fill="currentColor"
      d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"
    />
  </svg>
);

const FileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"
    />
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
    />
  </svg>
);

export default ChatInterface;
