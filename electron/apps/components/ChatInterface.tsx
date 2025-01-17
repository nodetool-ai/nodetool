import React, { useState, useRef, useEffect, useCallback } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { ProgressRoot, ProgressBar, ProgressValueText } from "./ui/progress";
import styled from "@emotion/styled";
import ReactMarkdown from "react-markdown";

import { useColorModeValue } from "./ui/color-mode";
import useChatStore from "../stores/ChatStore";
import { MessageContent } from "../types/workflow";
import { ImageDisplay } from "./ImageDisplay";
import { AudioPlayer } from "./AudioPlayer";
import { VideoPlayer } from "./VideoPlayer";
import { FileUploadRoot, FileUploadList } from "./ui/file-upload";
import { Composer } from "./Composer";

interface ChatInterfaceProps {
  workflowId: string;
  token: string;
}

const LoadingDots = styled.div`
  display: flex;
  justify-content: center;
  gap: 4px;
  padding: 10px;

  span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: currentColor;
    animation: bounce 1.4s infinite ease-in-out;

    &:nth-of-type(1) {
      animation-delay: -0.32s;
    }
    &:nth-of-type(2) {
      animation-delay: -0.16s;
    }
  }

  @keyframes bounce {
    0%,
    80%,
    100% {
      transform: scale(0);
    }
    40% {
      transform: scale(1);
    }
  }
`;

const ChatInterface: React.FC<ChatInterfaceProps> = ({ workflowId, token }) => {
  const userBgColor = useColorModeValue("gray.100", "gray.900");
  const assistantBgColor = useColorModeValue("gray.200", "gray.800");

  const {
    connect,
    status,
    statusMessage,
    streamingMessage,
    messages,
    droppedFiles,
    progress,
    sendMessage,
    setDroppedFiles,
  } = useChatStore();

  useEffect(() => {
    connect(workflowId);
  }, []);

  const [disabled, setDisabled] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const handleSubmit = useCallback(
    async (message: string) => {
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
      setDroppedFiles([]);
      setDisabled(true);
    },
    [droppedFiles]
  );

  const renderMessageContent = (content: MessageContent) => {
    console.log("content", content);
    switch (content.type) {
      case "text":
        return <ReactMarkdown>{content.text}</ReactMarkdown>;
      case "image_url":
        return (
          <div className="media-content">
            <ImageDisplay
              data={content.image.uri || (content.image.data as string)}
            />
          </div>
        );
      case "audio":
        return (
          <div className="media-content">
            <AudioPlayer
              data={content.audio.uri || (content.audio.data as string)}
            />
          </div>
        );
      case "video":
        return (
          <div className="media-content">
            <VideoPlayer
              data={content.video.uri || (content.video.data as string)}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Box h="100%">
      <Flex direction="column" h="calc(100% - 120px)" overflow="hidden">
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
                  ? userBgColor
                  : msg.role === "assistant"
                    ? assistantBgColor
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
          {streamingMessage && (
            <Box
              mb="4"
              p="3"
              borderRadius="md"
              maxW="80%"
              bg={assistantBgColor}
              mr="auto"
            >
              <ReactMarkdown>{streamingMessage}</ReactMarkdown>
            </Box>
          )}
          <Box ref={messagesEndRef} />
        </Box>

        {status === "loading" && (
          <Box textAlign="center" py={2}>
            <LoadingDots>
              <span></span>
              <span></span>
              <span></span>
            </LoadingDots>
            <Text>{statusMessage}</Text>
          </Box>
        )}
        {progress.current > 0 && (
          <ProgressRoot
            value={(progress.current * 100.0) / progress.total}
            size="xs"
            colorScheme="blue"
            marginLeft="2"
            marginRight="2"
          >
            <ProgressBar />
            <ProgressValueText>
              {progress.current} / {progress.total}
            </ProgressValueText>
          </ProgressRoot>
        )}
      </Flex>
      <Composer
        onSubmit={handleSubmit}
        disabled={disabled}
        droppedFiles={droppedFiles}
        setDroppedFiles={setDroppedFiles}
      />
    </Box>
  );
};

// Keep FileIcon and CloseIcon if they're still needed

export default ChatInterface;
