import React, { useCallback, useRef, useState } from "react";
import {
  Box,
  Flex,
  Textarea,
  IconButton,
  Button,
  HStack,
} from "@chakra-ui/react";
import { HiUpload } from "react-icons/hi";
import { FaMicrophone, FaStop } from "react-icons/fa";

interface ComposerProps {
  handleAudioChange: (
    audioRef: { type: "audio"; data: Uint8Array } | null
  ) => void;
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
  handleAudioChange,
  className,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showAudioInput, setShowAudioInput] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const handleSubmit = useCallback(() => {
    if (!textareaRef.current) return;
    const message = textareaRef.current.value.trim();
    if (message || droppedFiles.length > 0) {
      onSubmit(message);
      textareaRef.current.value = "";
    }
  }, [onSubmit, droppedFiles]);

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
      >
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
          <IconButton
            aria-label={isRecording ? "Stop recording" : "Start recording"}
            onClick={isRecording ? stopRecording : startRecording}
            variant="ghost"
            size="xs"
            borderRadius="30px"
          >
            {isRecording ? <FaStop color="red" /> : <FaMicrophone />}
          </IconButton>
          <IconButton
            aria-label="Send message"
            onClick={handleSubmit}
            disabled={disabled}
            variant="ghost"
            size="xs"
            borderRadius="30px"
          >
            <SendIcon />
          </IconButton>
        </HStack>
      </Flex>
    </Box>
  );
};
