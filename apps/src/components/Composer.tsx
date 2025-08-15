import React, { useCallback, useRef, useState } from "react";
import {
  Box,
  Flex,
  Textarea,
  IconButton,
  HStack,
  VStack,
  useDisclosure,
  Portal,
  Text,
} from "@chakra-ui/react";
import { createListCollection } from "@chakra-ui/react";
import {
  FaMicrophone,
  FaStop,
  FaEnvelope,
  FaGlobe,
  FaSearch,
  FaNewspaper,
  FaImage,
  FaCamera,
  FaMap,
  FaShoppingCart,
  FaChartLine,
  FaBriefcase,
  FaLanguage,
  FaDatabase,
  FaVolumeUp,
  FaTools,
} from "react-icons/fa";
import { FaTimes } from "react-icons/fa";
import useChatStore from "../stores/ChatStore";
import { Tooltip } from "./ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
} from "./ui/select";

interface ComposerProps {
  handleAudioChange: (
    audioRef: { type: "audio"; data: Uint8Array } | null
  ) => void;
  onSubmit: (message: string) => void;
  disabled?: boolean;
  droppedFiles: File[];
  setDroppedFiles: (files: File[]) => void;
}

const SendIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24">
    <path
      fill="currentColor"
      d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"
    />
  </svg>
);

const TOOL_DESCRIPTIONS: Record<string, string> = {
  search_email: "Search for emails",
  google_search: "Search Google",
  google_news: "Search Google News",
  google_images: "Search Google Images",
  google_lens: "Search Google Lens",
  google_maps: "Search Google Maps",
  google_shopping: "Search Google Shopping",
  google_finance: "Search Google Finance",
  google_jobs: "Search Google Jobs",
  browser: "Browse the web",
  chroma_hybrid_search: "Search for documents in the Chroma database",
  google_image_generation: "Generate images using Google's Gemini API",
  openai_image_generation:
    "Generate images using OpenAI's Image Generation API",
  openai_text_to_speech:
    "Convert text into spoken audio using OpenAI's Text-to-Speech API",
};

const tools = [
  { id: "search_email", icon: FaEnvelope, label: "Search Email" },
  { id: "google_search", icon: FaSearch, label: "Google Search" },
  { id: "google_news", icon: FaNewspaper, label: "Google News" },
  { id: "google_images", icon: FaImage, label: "Google Images" },
  { id: "google_lens", icon: FaCamera, label: "Google Lens" },
  { id: "google_maps", icon: FaMap, label: "Google Maps" },
  { id: "google_shopping", icon: FaShoppingCart, label: "Google Shopping" },
  { id: "google_finance", icon: FaChartLine, label: "Google Finance" },
  { id: "google_jobs", icon: FaBriefcase, label: "Google Jobs" },
  { id: "browser", icon: FaGlobe, label: "Browser" },
  { id: "chroma_hybrid_search", icon: FaDatabase, label: "Chroma Search" },
  { id: "google_image_generation", icon: FaImage, label: "Google Image Gen" },
  { id: "openai_image_generation", icon: FaImage, label: "OpenAI Image Gen" },
  { id: "openai_text_to_speech", icon: FaVolumeUp, label: "Text to Speech" },
];

export const Composer: React.FC<ComposerProps> = ({
  onSubmit,
  handleAudioChange,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { open, onOpen, onClose, onToggle } = useDisclosure();
  const {
    status,
    selectedTools,
    setSelectedTools,
    droppedFiles,
    setDroppedFiles,
    isFetchingModels,
    fetchModels,
    models,
    selectedModelId,
    setSelectedModel,
  } = useChatStore();
  const shellBg = "bg1";
  const shellBorder = "border";
  const hoverBg = "buttonHover";
  const handleSubmit = useCallback(() => {
    if (!textareaRef.current) return;
    const message = textareaRef.current.value.trim();
    if (message || droppedFiles.length > 0) {
      onSubmit(message);
      textareaRef.current.value = "";
      setDroppedFiles([]);
      // Don't clear selected tools - they should persist
    }
  }, [onSubmit, droppedFiles, setDroppedFiles]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleFileChange = useCallback(
    (changes: any) => {
      setDroppedFiles(changes.acceptedFiles);
    },
    [setDroppedFiles]
  );

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.readAsArrayBuffer(blob);
        reader.onloadend = () => {
          handleAudioChange({
            type: "audio",
            data: new Uint8Array(reader.result as ArrayBuffer),
          });
        };
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  }, [handleAudioChange]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith("image/")
      );
      setDroppedFiles([...droppedFiles, ...files]);
    },
    [droppedFiles, setDroppedFiles]
  );

  const toggleTool = useCallback(
    (toolId: string) => {
      setSelectedTools(
        selectedTools.includes(toolId)
          ? selectedTools.filter((id: string) => id !== toolId)
          : [...selectedTools, toolId]
      );
    },
    [selectedTools, setSelectedTools]
  );

  const openModelsIfNeeded = useCallback(async () => {
    if (!isFetchingModels && (!models || models.length === 0)) {
      const result = await fetchModels(false);
      if (
        (!selectedModelId || selectedModelId.length === 0) &&
        result &&
        result.length > 0
      ) {
        setSelectedModel(result[0].id);
      }
    }
  }, [
    fetchModels,
    isFetchingModels,
    models,
    selectedModelId,
    setSelectedModel,
  ]);

  const modelOptions = React.useMemo(() => {
    return createListCollection({
      items: (models || []).map((m) => ({
        label: m.provider ? `${m.name} · ${m.provider}` : m.name,
        value: m.id,
      })),
    });
  }, [models]);

  return (
    <Box position="fixed" bottom={0} left={0} right={0} p={{ base: 6, md: 8 }}>
      <Flex
        maxW={{ base: "48rem", md: "64rem" }}
        mx="auto"
        bg={shellBg}
        color="text"
        borderRadius="2xl"
        boxShadow="0 18px 60px rgba(0,0,0,0.35)"
        border="1px solid"
        borderColor={shellBorder}
        position="relative"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        backdropFilter="saturate(140%) blur(10px)"
      >
        {droppedFiles.length > 0 && (
          <HStack
            position="absolute"
            top={-12}
            right={0}
            overflowX="auto"
            p={2}
          >
            {droppedFiles.map((file, index) => (
              <Box key={index} position="relative">
                <img
                  src={URL.createObjectURL(file)}
                  alt="preview"
                  style={{
                    height: "40px",
                    width: "40px",
                    objectFit: "cover",
                    borderRadius: "4px",
                  }}
                />
                <IconButton
                  aria-label="Remove image"
                  size="xs"
                  position="absolute"
                  top={-2}
                  right={-2}
                  borderRadius="full"
                  variant="ghost"
                  onClick={() =>
                    setDroppedFiles(droppedFiles.filter((_, i) => i !== index))
                  }
                >
                  <FaTimes />
                </IconButton>
              </Box>
            ))}
          </HStack>
        )}

        <Textarea
          ref={textareaRef}
          placeholder="Write a message..."
          flex="1"
          bg="transparent"
          border="none"
          color="text"
          fontSize="md"
          resize="none"
          minH="40px"
          maxH="200px"
          py={5}
          px={7}
          _placeholder={{ color: "textGray" }}
          onKeyDown={handleKeyDown}
          rows={1}
          css={{
            "&::-webkit-scrollbar": {
              display: "none",
            },
          }}
        />

        <HStack position="absolute" right={3} bottom={3} gap={2} align="center">
          {/* Model selector inline with buttons, minimal UI */}
          <Box minW="160px" maxW="260px">
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
              positioning={{ sameWidth: true, gutter: 6 }}
            >
              <SelectTrigger
                onClick={openModelsIfNeeded}
                bg="transparent"
                borderRadius="full"
                px={3}
                py={1}
                border="1px solid"
                borderColor="border"
                _hover={{ bg: hoverBg }}
                _focus={{ boxShadow: "none" }}
                height="36px"
                display="flex"
                alignItems="center"
                css={{
                  "[data-scope=select][data-part=trigger]": {
                    background: "transparent",
                    display: "flex",
                    alignItems: "center",
                  },
                  "[data-scope=select][data-part=indicator-group]": {
                    background: "transparent",
                    borderLeft: "none",
                    display: "flex",
                    alignItems: "center",
                  },
                  "[data-scope=select][data-part=indicator]": {
                    background: "transparent",
                  },
                }}
              >
                <SelectValueText
                  style={{
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "200px",
                    lineHeight: "1",
                  }}
                  placeholder={
                    isFetchingModels
                      ? "Loading models…"
                      : selectedModelId
                        ? ""
                        : "Select model"
                  }
                />
              </SelectTrigger>
              <SelectContent
                bg="bg1"
                color="text"
                borderRadius="lg"
                border="1px solid"
                borderColor="border"
                boxShadow="none"
                p={1}
              >
                {(modelOptions.items || []).length === 0 ? (
                  <Box px={3} py={2} color="textGray">
                    {isFetchingModels ? "Fetching…" : "No models available"}
                  </Box>
                ) : (
                  modelOptions.items.map((option) => (
                    <SelectItem
                      key={option.value}
                      item={option}
                      borderRadius="md"
                      _hover={{ bg: hoverBg }}
                    >
                      {option.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </SelectRoot>
          </Box>

          <Tooltip
            content="Tools"
            contentProps={{
              bg: "bg1",
              color: "text",
              borderColor: shellBorder,
            }}
          >
            <IconButton
              tabIndex={-1}
              aria-label="Toggle tools"
              onClick={onToggle}
              variant="ghost"
              size="sm"
              minW="36px"
              h="36px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              bg={open ? "blue.500" : "transparent"}
              borderRadius="full"
              _hover={{
                bg: open ? "blue.600" : hoverBg,
              }}
            >
              <FaTools />
            </IconButton>
          </Tooltip>
          <Tooltip
            content={isRecording ? "Stop recording" : "Start recording"}
            contentProps={{
              bg: "bg1",
              color: "text",
              borderColor: shellBorder,
            }}
          >
            <IconButton
              aria-label={isRecording ? "Stop recording" : "Start recording"}
              onClick={isRecording ? stopRecording : startRecording}
              variant="ghost"
              size="sm"
              minW="36px"
              h="36px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              bg={isRecording ? "red.500" : "transparent"}
              borderRadius="full"
            >
              {isRecording ? <FaStop color="red" /> : <FaMicrophone />}
            </IconButton>
          </Tooltip>
          <Tooltip
            content="Send message"
            contentProps={{
              bg: "bg1",
              color: "text",
              borderColor: shellBorder,
            }}
          >
            <IconButton
              aria-label="Send message"
              onClick={handleSubmit}
              disabled={status === "loading"}
              variant="ghost"
              size="sm"
              minW="36px"
              h="36px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              bg={status === "loading" ? "gray400" : "transparent"}
              borderRadius="full"
            >
              <SendIcon />
            </IconButton>
          </Tooltip>
        </HStack>
      </Flex>

      <Portal>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              style={{
                position: "fixed",
                bottom: "100px",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 1000,
              }}
            >
              <Box
                bg={shellBg}
                borderRadius="xl"
                p={4}
                boxShadow="0 10px 40px rgba(0,0,0,0.35)"
                border="1px solid"
                borderColor={shellBorder}
                maxW="48rem"
                w="100%"
                mx="auto"
                backdropFilter="saturate(140%) blur(10px)"
              >
                <VStack gap={2} align="stretch" maxW="480px">
                  <Flex wrap="wrap" gap={2}>
                    {tools.map((tool) => (
                      <Tooltip
                        key={tool.id}
                        content={TOOL_DESCRIPTIONS[tool.id] || tool.label}
                        contentProps={{
                          bg: "bg1",
                          color: "text",
                          borderColor: shellBorder,
                        }}
                      >
                        <HStack
                          as="button"
                          onClick={() => {
                            toggleTool(tool.id);
                          }}
                          bg={
                            selectedTools.includes(tool.id)
                              ? "blue.500"
                              : "transparent"
                          }
                          _hover={{
                            bg: selectedTools.includes(tool.id)
                              ? "blue.600"
                              : hoverBg,
                          }}
                          borderRadius="md"
                          px={3}
                          py={2}
                          gap={2}
                          transition="all 0.2s"
                          cursor="pointer"
                          color={
                            selectedTools.includes(tool.id) ? "white" : "text"
                          }
                        >
                          <tool.icon size={16} />
                          <Text fontSize="sm" fontWeight="medium">
                            {tool.label}
                          </Text>
                        </HStack>
                      </Tooltip>
                    ))}
                  </Flex>
                </VStack>
              </Box>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </Box>
  );
};
