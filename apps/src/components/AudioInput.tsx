import React, { useEffect, useRef, useState, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import Record from "wavesurfer.js/dist/plugins/record";
import { Button } from "./ui/button";
import { Box, HStack, Text } from "@chakra-ui/react";
import { FaMicrophone, FaStop, FaPlay, FaPause, FaCog } from "react-icons/fa";
import { Alert } from "./ui/alert";
import {
  FileUploadDropzone,
  FileUploadList,
  FileUploadRoot,
  FileUploadTrigger,
} from "./ui/file-upload";
import { HiUpload } from "react-icons/hi";
import { LuX } from "react-icons/lu";

interface AudioRef {
  type: "audio";
  data: Uint8Array;
}

interface AudioInputProps {
  onChange: (data: AudioRef | null) => void;
  className?: string;
}

const AudioInput: React.FC<AudioInputProps> = ({ onChange, className }) => {
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
  const [audioFile, setAudioFile] = useState<File | null>(null);

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

  const handleFileChange = useCallback(
    async (changes: any) => {
      const selectedFile = changes.acceptedFiles[0] || null;
      setAudioFile(selectedFile);

      if (selectedFile && wavesurferRef.current) {
        const url = URL.createObjectURL(selectedFile);
        await wavesurferRef.current.load(url);
        setHasRecording(true);

        const reader = new FileReader();
        reader.readAsArrayBuffer(selectedFile);
        reader.onloadend = () => {
          onChange({
            type: "audio",
            data: new Uint8Array(reader.result as ArrayBuffer),
          });
        };
      }
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    setAudioFile(null);
    setHasRecording(false);
    if (wavesurferRef.current) {
      wavesurferRef.current.empty();
    }
    onChange(null);
  }, [onChange]);

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
      reader.readAsArrayBuffer(blob);
      reader.onloadend = () => {
        onChange({
          type: "audio",
          data: new Uint8Array(reader.result as ArrayBuffer),
        });
      };
    });

    wavesurfer.on("play", () => setIsPlaying(true));
    wavesurfer.on("pause", () => setIsPlaying(false));
    wavesurfer.on("finish", () => setIsPlaying(false));

    return () => {
      wavesurfer.destroy();
    };
  }, [onChange]);

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
    <Box
      className={
        className ? `audio-input-root ${className}` : "audio-input-root"
      }
    >
      <FileUploadRoot
        className="audio-input__upload"
        onFileChange={handleFileChange}
        maxFiles={1}
        accept={{ "audio/*": [".mp3", ".wav", ".ogg", ".m4a"] }}
      >
        <HStack className="audio-input__controls">
          <FileUploadTrigger asChild>
            <Button
              className="audio-input__upload-btn"
              size="sm"
              variant="ghost"
            >
              <HiUpload />
            </Button>
          </FileUploadTrigger>
          {!audioFile && !hasRecording && (
            <FileUploadDropzone
              className="audio-input__dropzone"
              label="Drop your audio file here"
            />
          )}
        </HStack>
      </FileUploadRoot>

      <div className="audio-input__waveform" ref={containerRef} />

      <HStack className="audio-input__actions">
        <Button
          className={`audio-input__record-btn ${isRecording ? "is-recording" : ""}`}
          onClick={handleRecord}
          disabled={isLoading}
          size="sm"
        >
          {isRecording ? <FaStop /> : <FaMicrophone />}
          {isLoading && <Text>Loading...</Text>}
        </Button>

        {hasRecording && (
          <>
            <Button
              className="audio-input__playback-btn"
              size="sm"
              variant="ghost"
              onClick={handlePlayPause}
            >
              {isPlaying ? <FaPause /> : <FaPlay />}
            </Button>
            <Button
              className="audio-input__clear-btn"
              size="sm"
              variant="ghost"
              onClick={handleClear}
            >
              <LuX />
            </Button>
          </>
        )}

        <Button
          className={`audio-input__settings-btn ${isDeviceListVisible ? "is-active" : ""}`}
          onClick={toggleDeviceListVisibility}
          size="sm"
          variant="ghost"
        >
          <FaCog />
        </Button>
      </HStack>

      {error && (
        <Alert className="audio-input__error" status="error" mt={2} size="sm">
          {error}
        </Alert>
      )}

      {isDeviceListVisible && (
        <Box className="audio-input__device-list">
          {audioDeviceNames.length > 0 ? (
            audioDeviceNames.map((deviceName, index) => (
              <Text key={index} className="audio-input__device-name">
                {deviceName}
              </Text>
            ))
          ) : (
            <Alert className="audio-input__no-devices" status="info" size="sm">
              No devices found.
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
};

export default AudioInput;
