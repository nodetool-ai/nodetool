import React, { useEffect, useRef, useState, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import Record from "wavesurfer.js/dist/plugins/record";
import { Button } from "./ui/button";
import { Box, HStack, Text } from "@chakra-ui/react";
import { FaMicrophone, FaStop, FaPlay, FaPause, FaCog } from "react-icons/fa";
import { Alert } from "./ui/alert";

const AudioInput: React.FC<{ onChange: (data: any) => void }> = ({
  onChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const recordRef = useRef<Record | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [isDeviceListVisible, setIsDeviceListVisible] = useState(false);
  const [audioDeviceNames, setAudioDeviceNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices) {
      setError("No media devices available");
      return;
    }

    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (abortCtrl.signal.aborted) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      stream.getTracks().forEach((track) => track.stop());
      setError(null);

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices
        .filter((device) => device.kind === "audioinput")
        .map((device) => device.label || "Unnamed Device");

      setAudioDeviceNames(audioDevices);
      if (audioDevices.length === 0) {
        setTimeout(() => {
          setError("No audio input devices found");
        }, 2000);
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          console.log("Fetch aborted");
        } else {
          setError(`Error enumerating devices: ${err.message}`);
        }
      }
    }
  }, []);

  const handleRecord = useCallback(async () => {
    if (!recordRef.current) return;

    if (isRecording) {
      recordRef.current.stopRecording();
      setIsRecording(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      await recordRef.current.startRecording();
      setIsRecording(true);
    } catch (err) {
      setError("Could not access microphone. Please check permissions.");
    } finally {
      setIsLoading(false);
    }
  }, [isRecording]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize WaveSurfer
    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#4A5568",
      progressColor: "#2B6CB0",
      height: 100,
      cursorWidth: 1,
      cursorColor: "#4A5568",
      normalize: true,
    });

    // Initialize Record plugin
    const record = wavesurfer.registerPlugin(
      Record.create({ mimeType: "audio/webm" })
    );

    wavesurferRef.current = wavesurfer;
    recordRef.current = record;

    // Event listeners
    record.on("record-end", (blob) => {
      setIsRecording(false);
      setHasRecording(true);

      // Here you can handle the blob data
      // For example, convert to base64 or send to server
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        onChange({
          type: "audio",
          uri: reader.result,
        });
      };
    });

    wavesurfer.on("play", () => setIsPlaying(true));
    wavesurfer.on("pause", () => setIsPlaying(false));
    wavesurfer.on("finish", () => setIsPlaying(false));

    return () => {
      wavesurfer.destroy();
    };
  }, []);

  useEffect(() => {
    fetchAudioDevices();

    return () => {
      if (recordRef.current) {
        recordRef.current.destroy();
        recordRef.current = null;
      }
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [fetchAudioDevices]);

  const toggleDeviceListVisibility = useCallback(() => {
    setIsDeviceListVisible((prev) => !prev);
    fetchAudioDevices();
  }, [fetchAudioDevices]);

  const handlePlayPause = () => {
    if (!wavesurferRef.current) return;

    if (isPlaying) {
      wavesurferRef.current.pause();
    } else {
      wavesurferRef.current.play();
    }
  };

  return (
    <Box>
      <div ref={containerRef} />
      <HStack mt={4}>
        <Button
          colorScheme={isRecording ? "red" : "blue"}
          onClick={handleRecord}
          disabled={isLoading}
          size="sm"
        >
          {isRecording ? <FaStop /> : <FaMicrophone />}
          {isLoading && <Text ml={2}>Loading...</Text>}
        </Button>

        <Button
          onClick={toggleDeviceListVisibility}
          size="sm"
          variant="ghost"
          opacity={isDeviceListVisible ? 1 : 0.6}
        >
          <FaCog />
        </Button>

        {hasRecording && (
          <Button onClick={handlePlayPause} size="sm">
            {isPlaying ? <FaPause /> : <FaPlay />}
          </Button>
        )}
      </HStack>

      {error && (
        <Alert status="error" mt={2} size="sm">
          {error}
        </Alert>
      )}

      {isDeviceListVisible && (
        <Box mt={2} maxW="200px" fontSize="sm">
          {audioDeviceNames.length > 0 ? (
            audioDeviceNames.map((deviceName, index) => (
              <Text key={index} fontSize="xs" color="gray.600">
                {deviceName}
              </Text>
            ))
          ) : (
            <Alert status="info" size="sm">
              No devices found.
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
};

export default AudioInput;
