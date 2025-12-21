import { useCallback, useEffect, useRef, useState } from "react";
import { useInputStream } from "./useInputStream";
import { useWebsocketRunner } from "../stores/WorkflowRunner";

type UseRealtimeAudioStream = {
  isStreaming: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  stream: MediaStream | null;
  version: number;
};

export const useRealtimeAudioStream = (
  inputNodeName?: string
): UseRealtimeAudioStream => {
  const [isStreaming, setIsStreaming] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const [version, setVersion] = useState(0);

  const { send, end } = useInputStream(inputNodeName || "");
  const runnerState = useWebsocketRunner((s) => s.state);

  const stop = useCallback(() => {
    setIsStreaming(false);
    try {
      mediaRecorderRef.current?.stop();
    } catch (e) {
      // noop
    }
    mediaRecorderRef.current = null;
    try {
      processorNodeRef.current?.disconnect();
      sourceNodeRef.current?.disconnect();
    } catch (e) {
      // noop
    }
    processorNodeRef.current = null;
    sourceNodeRef.current = null;
    try {
      audioContextRef.current?.close();
    } catch (e) {
      // noop
    }
    audioContextRef.current = null;
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    audioStreamRef.current = null;
    // signal end-of-stream
    try {
      send(
        { type: "chunk", content: "", done: true, content_type: "audio" },
        "chunk"
      );
      end("chunk");
    } catch (e) {
      // noop
    }
    setVersion((v) => v + 1);
  }, [send, end]);

  const start = useCallback(() => {
    setIsStreaming(true);
  }, []);

  const toggle = useCallback(() => {
    setIsStreaming((s) => !s);
  }, []);

  useEffect(() => {
    if (!isStreaming) {return;}
    let activeStream: MediaStream | null = null;
    const targetSampleRate = 22000; // 22 kHz per updated realtime session config
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: targetSampleRate
        } as MediaTrackConstraints
      })
      .then(async (stream) => {
        activeStream = stream;
        audioStreamRef.current = stream;
        setVersion((v) => v + 1);

        const AudioContextCtor =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        const audioContext: AudioContext = new AudioContextCtor({
          sampleRate: targetSampleRate
        });
        audioContextRef.current = audioContext;

        const sourceNode = audioContext.createMediaStreamSource(stream);
        sourceNodeRef.current = sourceNode;

        const bufferSize = 4096;
        const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
        processorNodeRef.current = processor;

        processor.onaudioprocess = (event) => {
          const input = event.inputBuffer.getChannelData(0);

          // Convert Float32 [-1,1] to PCM16LE
          const pcmBuffer = new ArrayBuffer(input.length * 2);
          const view = new DataView(pcmBuffer);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
          }

          // Encode to base64 without FileReader to reduce overhead
          const bytes = new Uint8Array(pcmBuffer);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          send(
            {
              type: "chunk",
              content: base64,
              done: false,
              content_type: "audio",
              content_metadata: {
                encoding: "pcm16le",
                sample_rate_hz: targetSampleRate,
                channels: 1
              }
            },
            "chunk"
          );
        };

        sourceNode.connect(processor);
        processor.connect(audioContext.destination);
      })
      .catch(() => {
        setIsStreaming(false);
      });
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch (e) {
        // noop
      }
      mediaRecorderRef.current = null;
      try {
        processorNodeRef.current?.disconnect();
        sourceNodeRef.current?.disconnect();
      } catch (e) {
        // noop
      }
      processorNodeRef.current = null;
      sourceNodeRef.current = null;
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
      try {
        audioContextRef.current?.close();
      } catch (e) {
        // noop
      }
      audioContextRef.current = null;
      audioStreamRef.current = null;
      try {
        send(
          { type: "chunk", content: "", done: true, content_type: "audio" },
          "chunk"
        );
        end("chunk");
      } catch (e) {
        // noop
      }
      setVersion((v) => v + 1);
    };
  }, [isStreaming, send, end]);

  // Stop streaming automatically when workflow stops/cancels/errors
  useEffect(() => {
    if (isStreaming && runnerState !== "running") {
      stop();
    }
  }, [runnerState, isStreaming, stop]);

  return {
    isStreaming,
    start,
    stop,
    toggle,
    stream: audioStreamRef.current,
    version
  };
};
