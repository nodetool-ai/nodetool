import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { ProgressRoot, ProgressBar, ProgressValueText } from "./ui/progress";
import styled from "@emotion/styled";
import ReactMarkdown from "react-markdown";
// Legacy CSS removed in favor of Chakra theming

// import { useColorModeValue } from "./ui/color-mode";
import useChatStore from "../stores/ChatStore";
import { Button } from "./ui/button";
import { Message, MessageContent, ToolCall } from "../types/workflow";
import { ImageDisplay } from "./ImageDisplay";
import { AudioPlayer } from "./AudioPlayer";
import { VideoPlayer } from "./VideoPlayer";
import { Composer } from "./Composer";
// model selector moved into Composer

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
  // Use semantic tokens from theme for color-mode aware styling

  const {
    status,
    statusMessage,
    messages,
    droppedFiles,
    progress,
    sendMessage,
    setDroppedFiles,
    selectedTools,
  } = useChatStore();

  // Advanced scroll handling (ported from ChatThreadView)
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userHasScrolledUpRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const lastUserScrollTimeRef = useRef<number>(0);
  const SCROLL_THRESHOLD = 50;

  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false);

  useEffect(() => {
    lastUserScrollTimeRef.current = Date.now();
  }, []);

  const handleScroll = useCallback(() => {
    lastUserScrollTimeRef.current = Date.now();
    const element = scrollRef.current;
    if (!element) return;

    const calculatedIsNearBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < SCROLL_THRESHOLD;

    const previousUserHasScrolledUp = userHasScrolledUpRef.current;
    if (!calculatedIsNearBottom && !userHasScrolledUpRef.current) {
      userHasScrolledUpRef.current = true;
    } else if (calculatedIsNearBottom && userHasScrolledUpRef.current) {
      userHasScrolledUpRef.current = false;
    }

    if (userHasScrolledUpRef.current !== previousUserHasScrolledUp) {
      const shouldBeVisible = !isNearBottomRef.current && userHasScrolledUpRef.current;
      if (shouldBeVisible !== showScrollToBottomButton) {
        setShowScrollToBottomButton(shouldBeVisible);
      }
    }
  }, [SCROLL_THRESHOLD, showScrollToBottomButton]);

  const scrollToBottom = useCallback(() => {
    const el = bottomRef.current;
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      userHasScrolledUpRef.current = false;
    }
  }, []);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    const bottomElement = bottomRef.current;
    if (!scrollElement || !bottomElement) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const wasNearBottom = isNearBottomRef.current;
        isNearBottomRef.current = entry.isIntersecting;

        if (isNearBottomRef.current !== wasNearBottom) {
          const shouldBeVisible = !isNearBottomRef.current && userHasScrolledUpRef.current;
          if (shouldBeVisible !== showScrollToBottomButton) {
            setShowScrollToBottomButton(shouldBeVisible);
          }
        }
      },
      { root: scrollElement, threshold: 0.1 }
    );

    observer.observe(bottomElement);
    return () => {
      observer.disconnect();
    };
  }, [showScrollToBottomButton]);

  const findLastMessageWithRole = useCallback((arr: (Message | ToolCall)[]) => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      const candidate = arr[i] as any;
      if (candidate && typeof candidate === "object" && "role" in candidate) {
        return candidate as Message;
      }
    }
    return null;
  }, []);

  useEffect(() => {
    const lastMessage = findLastMessageWithRole(messages);

    if (lastMessage?.role === "user") {
      scrollToBottom();
      return;
    }

    if (status === "loading" || (lastMessage && lastMessage.role !== "user")) {
      if (isNearBottomRef.current) {
        scrollToBottom();
      }
    }
  }, [messages, status, scrollToBottom, findLastMessageWithRole]);

  // model selector moved into Composer

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
                    variant="ghost"
                    size="xs"
                    onClick={() => toggleThought(messageIndex, contentIndex)}
                    color="textGray"
                    fontSize="xs"
                    fontWeight="normal"
                    px={2}
                    py={1}
                    h="auto"
                    minH="auto"
                    _hover={{ 
                      textDecoration: "underline",
                      color: "text"
                    }}
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
          p={{ base: 3, md: 4 }}
          borderRadius="2xl"
          maxW="80%"
          bg={msg.role === "user" ? "bg1" : "transparent"}
          ml={msg.role === "user" ? "auto" : undefined}
          mr={msg.role === "assistant" ? "auto" : undefined}
          mx={msg.role === "system" ? "auto" : undefined}
          opacity={msg.role === "system" ? 0.7 : 1}
          border="none"
          borderColor="transparent"
          boxShadow="none"
          backdropFilter={msg.role === "user" ? "saturate(140%) blur(6px)" : "none"}
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
      height="100vh"
      maxH="100vh"
      display="flex"
      flexDirection="column"
      overflow="hidden"
    >
      {/* Main Chat Area */}
      <Box
        position="relative"
        flex={1}
        display="flex"
        flexDirection="column"
        height="100%"
        maxH="100%"
      >
        <Box 
          className="chat-container"
          minH={0}
          flex={1}
          overflow="hidden"
        >
          <Flex 
            direction="column" 
            h="100%" 
            maxH="100%" 
            overflow="hidden"
            color="text"
            px={{ base: 3, md: 6 }}
            pt={{ base: 4, md: 6 }}
          >
            <Box
              ref={scrollRef}
              onScroll={handleScroll}
              flex="1"
              overflowY="auto"
              pr={1}
              pb={{ base: 28, md: 32 }}
            >
              {messages.map((msg, index) => {
                return renderMessage(msg as Message, index);
              })}
              {status === "loading" && (
                <Box textAlign="center" py={2} maxW="48" mx="auto">
                  <LoadingDots>
                    <span></span>
                    <span></span>
                    <span></span>
                  </LoadingDots>
                  <Text>{statusMessage}</Text>
                </Box>
              )}
              <Box ref={bottomRef} h="1px" />
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

          <Box position="sticky" bottom={0} zIndex={1} bg="bg0" px={{ base: 3, md: 6 }} pt={2} pb={{ base: 2, md: 3 }} borderTop="1px solid" borderColor="borderSubtle">
            <Composer
              onSubmit={handleSubmit}
              handleAudioChange={handleAudioChange}
              disabled={status === "loading"}
              droppedFiles={droppedFiles}
              setDroppedFiles={setDroppedFiles}
            />
          </Box>
          {showScrollToBottomButton && (
            <Button
              onClick={scrollToBottom}
              position="absolute"
              right={{ base: 3, md: 6 }}
              bottom={{ base: 32, md: 40 }}
              size="sm"
              borderRadius="full"
              boxShadow="md"
              variant="solid"
            >
              ↓
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
};

// Keep FileIcon and CloseIcon if they're still needed

export default ChatInterface;
