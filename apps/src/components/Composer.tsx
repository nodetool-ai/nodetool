import React, { useCallback, useRef, useState } from "react";
import { Box, Flex, Textarea, IconButton, HStack } from "@chakra-ui/react";
import { FaMicrophone, FaStop, FaEnvelope, FaGlobe } from "react-icons/fa";
import { FaTimes } from "react-icons/fa";
import useChatStore from "../stores/ChatStore";
import { Tooltip } from "./ui/tooltip";

interface ComposerProps {
  handleAudioChange: (
    audioRef: { type: "audio"; data: Uint8Array } | null
  ) => void;
  onSubmit: (message: string) => void;
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
  handleAudioChange,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const {
    status,
    selectedTools,
    setSelectedTools,
    droppedFiles,
    setDroppedFiles,
  } = useChatStore();
  const handleSubmit = useCallback(() => {
    if (!textareaRef.current) return;
    const message = textareaRef.current.value.trim();
    if (message || droppedFiles.length > 0) {
      onSubmit(message);
      textareaRef.current.value = "";
      setDroppedFiles([]);
      setSelectedTools([]);
    }
  }, [onSubmit, droppedFiles, setDroppedFiles, setSelectedTools]);

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
      console.log(changes);
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

  const tools = [
    { id: "search_email", icon: FaEnvelope, label: "Search Email" },
    { id: "browser", icon: FaGlobe, label: "Browser" },
  ];

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

  return (
    <Box position="fixed" bottom={0} left={0} right={0} p={6}>
      <Flex
        maxW="48rem"
        mx="auto"
        bg="gray.800"
        borderRadius="30px"
        border="1px solid"
        borderColor="gray.700"
        position="relative"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        {droppedFiles.length > 0 && (
          <HStack position="absolute" top={-12} left={0} overflowX="auto" p={2}>
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
          color="white"
          fontSize="sm"
          resize="none"
          minH="24px"
          maxH="200px"
          py={4}
          px={6}
          _placeholder={{
            color: "gray.400",
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          css={{
            "&::-webkit-scrollbar": {
              display: "none",
            },
          }}
        />

        <HStack position="absolute" right={3} bottom={3}>
          {tools.map((tool) => (
            <Tooltip
              key={tool.id}
              content={tool.label}
              contentProps={{
                bg: "gray.800",
                color: "white",
                borderColor: "gray.700",
              }}
            >
              <IconButton
                key={tool.id}
                aria-label={tool.label}
                onClick={() => toggleTool(tool.id)}
                variant="ghost"
                size="xs"
                borderRadius="full"
                bg={
                  selectedTools.includes(tool.id) ? "blue.500" : "transparent"
                }
                _hover={{
                  bg: selectedTools.includes(tool.id)
                    ? "blue.600"
                    : "whiteAlpha.200",
                }}
              >
                <tool.icon />
              </IconButton>
            </Tooltip>
          ))}
          <Tooltip
            content={isRecording ? "Stop recording" : "Start recording"}
            contentProps={{
              bg: "gray.800",
              color: "white",
              borderColor: "gray.700",
            }}
          >
            <IconButton
              aria-label={isRecording ? "Stop recording" : "Start recording"}
              onClick={isRecording ? stopRecording : startRecording}
              variant="ghost"
              size="xs"
              bg={isRecording ? "red.500" : "transparent"}
              borderRadius="full"
            >
              {isRecording ? <FaStop color="red" /> : <FaMicrophone />}
            </IconButton>
          </Tooltip>
          <Tooltip
            content="Send message"
            contentProps={{
              bg: "gray.800",
              color: "white",
              borderColor: "gray.700",
            }}
          >
            <IconButton
              aria-label="Send message"
              onClick={handleSubmit}
              disabled={status === "loading"}
              variant="ghost"
              bg={status === "loading" ? "gray.500" : "transparent"}
              size="xs"
              borderRadius="full"
            >
              <SendIcon />
            </IconButton>
          </Tooltip>
        </HStack>
      </Flex>
    </Box>
  );
};
