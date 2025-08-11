import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { ProgressRoot, ProgressBar, ProgressValueText } from "./ui/progress";
import styled from "@emotion/styled";
import ReactMarkdown from "react-markdown";
import "./ChatInterface.css";

// import { useColorModeValue } from "./ui/color-mode";
import useChatStore from "../stores/ChatStore";
import { Button } from "./ui/button";
import { Message, MessageContent, ToolCall } from "../types/workflow";
import { ImageDisplay } from "./ImageDisplay";
import { AudioPlayer } from "./AudioPlayer";
import { VideoPlayer } from "./VideoPlayer";
import { Composer } from "./Composer";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "./ui/select";
import { createListCollection } from "@chakra-ui/react";

interface ChatInterfaceProps {
  workflowId?: string;
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
const fileToData = async (file: File): Promise<Uint8Array> => {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
};

const createMediaContent = async (
  file: File,
  messageType: "image_url" | "audio" | "video" | "document",
  mediaType: "image" | "audio" | "video" | "document"
): Promise<MessageContent> => {
  // @ts-expect-error tsc is not happy with the type of the messageType
  return {
    type: messageType,
    [mediaType]: {
      type: mediaType,
      data: await fileToData(file),
    },
  };
};

const ChatInterface: React.FC<ChatInterfaceProps> = ({ workflowId, token }) => {
  // const userBgColor = useColorModeValue("gray.100", "gray.900");
  // const assistantBgColor = useColorModeValue("gray.200", "gray.800");

  const {
    status,
    statusMessage,
    messages,
    droppedFiles,
    progress,
    sendMessage,
    setDroppedFiles,
    selectedTools,
    isFetchingModels,
    fetchModels,
    models,
    selectedModelId,
    setSelectedModel,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const modelOptions = useMemo(() => {
    return createListCollection({
      items: (models || []).map((m) => ({
        label: m.provider ? `${m.name} · ${m.provider}` : m.name,
        value: m.id,
      })),
    });
  }, [models]);

  const handleOpenModelList = useCallback(async () => {
    if (!isFetchingModels && (!models || models.length === 0)) {
      const result = await fetchModels(false);
      if ((!selectedModelId || selectedModelId.length === 0) && result && result.length > 0) {
        setSelectedModel(result[0].id);
      }
    }
  }, [fetchModels, isFetchingModels, models, selectedModelId, setSelectedModel]);

  const handleSubmit = useCallback(
    async (message: string) => {
      const messageContents: MessageContent[] = [];

      if (message) {
        messageContents.push({
          type: "text",
          text: message,
        });
      }

      const messageFiles = await Promise.all(
        droppedFiles.map(async (file): Promise<MessageContent> => {
          if (file.type.startsWith("image/")) {
            return createMediaContent(file, "image_url", "image");
          } else if (file.type.startsWith("audio/")) {
            return createMediaContent(file, "audio", "audio");
          } else if (file.type.startsWith("video/")) {
            return createMediaContent(file, "video", "video");
          } else if (file.type.startsWith("application/pdf")) {
            return createMediaContent(file, "document", "document");
          }
          return {
            type: "text",
            text: file.name,
          };
        })
      );

      messageContents.push(...messageFiles);

      sendMessage({
        type: "message",
        role: "user",
        content: messageContents,
        name: "",
        workflow_id: workflowId,
        auth_token: token,
        tools: selectedTools,
      });
      setDroppedFiles([]);
    },
    [
      droppedFiles,
      sendMessage,
      workflowId,
      token,
      setDroppedFiles,
      selectedTools,
    ]
  );

  // Add state for tracking expanded thoughts
  const [expandedThoughts, setExpandedThoughts] = useState<{
    [key: string]: boolean;
  }>({});

  // Add state for tracking thoughts that are being loaded
  const [loadingThoughts, setLoadingThoughts] = useState<{
    [key: string]: boolean;
  }>({});

  // Add state for expanded tool calls
  const [expandedToolCalls, setExpandedToolCalls] = useState<{
    [key: string]: boolean;
  }>({});

  const toggleThought = useCallback(
    (messageIndex: number, thoughtIndex: number) => {
      const key = `${messageIndex}-${thoughtIndex}`;
      setLoadingThoughts((prev) => ({ ...prev, [key]: true }));

      // Simulate loading time (remove this in production and replace with actual loading logic)
      setTimeout(() => {
        setExpandedThoughts((prev) => ({
          ...prev,
          [key]: !prev[key],
        }));
        setLoadingThoughts((prev) => ({ ...prev, [key]: false }));
      }, 500);
    },
    []
  );

  const renderMessageContent = useCallback(
    (content: MessageContent, messageIndex: number, contentIndex: number) => {
      switch (content.type) {
        case "text": {
          const thoughtMatch = content.text?.match(
            /<think>([\s\S]*?)(<\/think>|$)/s
          );
          if (thoughtMatch) {
            const key = `${messageIndex}-${contentIndex}`;
            const isExpanded = expandedThoughts[key];
            const hasClosingTag = thoughtMatch[2] === "</think>";
            const textBeforeThought = content.text.split("<think>")[0];
            const textAfterThought = hasClosingTag
              ? content.text.split("</think>").pop() || ""
              : "";

            return (
              <>
                {textBeforeThought && (
                  <ReactMarkdown>{textBeforeThought}</ReactMarkdown>
                )}
                <Box>
                  <Button
                    variant="outline"
                    onClick={() => toggleThought(messageIndex, contentIndex)}
                    _hover={{ textDecoration: "underline" }}
                  >
                    {!hasClosingTag ? (
                      <>
                        Show thought
                        <LoadingDots>
                          <span></span>
                          <span></span>
                          <span></span>
                        </LoadingDots>
                      </>
                    ) : (
                      `${isExpanded ? "Hide thought" : "Show thought"}`
                    )}
                  </Button>
                  {isExpanded && (
                    <Box ml={4} mt={2} p={2} bg="gray.700" borderRadius="md">
                      <ReactMarkdown>{thoughtMatch[1]}</ReactMarkdown>
                    </Box>
                  )}
                  {textAfterThought && (
                    <ReactMarkdown>{textAfterThought}</ReactMarkdown>
                  )}
                </Box>
              </>
            );
          }
          return <ReactMarkdown>{content.text}</ReactMarkdown>;
        }
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
    },
    [expandedThoughts, toggleThought]
  );

  const renderMessage = useCallback(
    (msg: Message, index: number) => {
      return (
        <Box
          key={index}
          mb="4"
          p="3"
          borderRadius="md"
          maxW="80%"
          bg={
            msg.role === "user"
              ? "bg1"
              : msg.role === "assistant"
                ? "bg2"
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
                  {renderMessageContent(content, index, i)}
                </Box>
              ))
            : renderMessageContent(
                {
                  type: "text",
                  text: msg.content as string,
                },
                index,
                0
              )}
        </Box>
      );
    },
    [renderMessageContent]
  );

  const handleAudioChange = useCallback(
    async (audioRef: { type: "audio"; data: Uint8Array } | null) => {
      if (audioRef) {
        console.log("audioRef", audioRef);
        const messageContents: MessageContent[] = [
          {
            type: "audio",
            audio: audioRef,
          },
        ];

        sendMessage({
          type: "message",
          role: "user",
          content: messageContents,
          name: "",
          workflow_id: workflowId,
          auth_token: token,
        });
      }
    },
    [workflowId, token, sendMessage]
  );

  return (
    <Box
      h="100%"
      bg="gray.900"
      color="white"
      borderRadius="2xl"
      boxShadow="xl"
      p={4}
    >
      {/* Header with model selector */}
      <Flex gap={3} align="center" mb={3}>
        <Box flex={1} />
        <Box minW="260px">
          <SelectRoot
            collection={modelOptions}
            value={selectedModelId ? [selectedModelId] : []}
            onValueChange={(details: any) => {
              const next = Array.isArray(details?.value)
                ? details.value[0] || null
                : details?.value || null;
              setSelectedModel(next);
            }}
            disabled={isFetchingModels}
          >
            <SelectTrigger clearable onClick={handleOpenModelList}>
              <SelectValueText placeholder={
                isFetchingModels ? "Loading models…" : (selectedModelId ? "" : "Select model")
              } />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.items.length === 0 ? (
                <Box px={3} py={2} color="gray.400">
                  {isFetchingModels ? "Fetching…" : "No models available"}
                </Box>
              ) : (
                modelOptions.items.map((option) => (
                  <SelectItem item={option} key={option.value}>
                    {option.label}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </SelectRoot>
        </Box>
      </Flex>

      <Flex direction="column" h="calc(100% - 90px)" overflow="hidden">
        <Box flex="1" overflowY="auto">
          {messages.map((msg, index) => {
            return renderMessage(msg as Message, index);
          })}
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
          <Box ref={messagesEndRef} />
        </Box>

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
        handleAudioChange={handleAudioChange}
        disabled={status === "loading"}
        droppedFiles={droppedFiles}
        setDroppedFiles={setDroppedFiles}
      />
    </Box>
  );
};

// Keep FileIcon and CloseIcon if they're still needed

export default ChatInterface;
