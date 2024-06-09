import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import WaveSurfer from "wavesurfer.js";
import Record from "wavesurfer.js/dist/plugins/record";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useNodeStore } from "../../stores/NodeStore";
import { Asset } from "../../stores/ApiTypes";

export type WaveRecorderProps = {
  onChange: (asset: Asset) => void;
};

export function useWaveRecorder({ onChange }: WaveRecorderProps) {
  const defaultFileType = "webm";
  const { uploadAsset } = useAssetUpload();
  const workflow = useNodeStore((state) => state.workflow);
  const micRef = useRef<HTMLDivElement | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const recordRef = useRef<any | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [audioDeviceNames, setAudioDeviceNames] = useState<string[]>([]);

  const fetchAudioDeviceNames = useCallback(() => {
    if (!navigator.mediaDevices) {
      setError("No media devices available");
      return;
    }
    console.log("Fetching audio devices");
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (abortCtrl.signal.aborted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.getTracks().forEach((track) => track.stop());
        setError(null);
        return navigator.mediaDevices.enumerateDevices();
      })
      .then((devices) => {
        if (!devices) {
          setError("No devices found");
          return;
        }
        const audioInputDevices = devices.filter(
          (device) => device.kind === "audioinput"
        );
        const audioDeviceLabels = audioInputDevices.map(
          (device) => device.label
        );
        setAudioDeviceNames(audioDeviceLabels);
        if (audioDeviceLabels.length === 0) {
          setTimeout(() => {
            setError("No audio input devices found");
          }, 2000);
        }
      })
      .catch((error) => {
        if (error.name === "AbortError") {
          console.log("Fetch aborted");
        } else {
          setError(`Error enumerating devices: ${error.message}`);
        }
      });
  }, []);

  const handleRecord = useCallback(() => {
    if (recordRef.current) {
      if (recordRef.current.isRecording()) {
        recordRef.current.stopRecording();
        setIsRecording(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      recordRef.current
        .startRecording()
        .then(() => {
          setIsRecording(true);
          setIsLoading(false);
        })
        .catch((error: Error) => {
          setError(error.message);
          setIsLoading(false);
        });
    }
  }, []);

  useEffect(() => {
    fetchAudioDeviceNames();

    return () => {
      if (recordRef.current) {
        recordRef.current.unAll();
        recordRef.current = null;
      }
      if (waveSurferRef.current) {
        waveSurferRef.current.destroy();
        waveSurferRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [fetchAudioDeviceNames]);

  useEffect(() => {
    if (micRef.current && waveSurferRef.current === null) {
      const mimeType = `audio/${defaultFileType}`;
      const recordPlugin = Record.create({ mimeType });
      recordRef.current = recordPlugin;

      waveSurferRef.current = WaveSurfer.create({
        container: micRef.current,
        waveColor: "#333",
        progressColor: "#111",
        height: 30,
        plugins: [recordPlugin]
      });

      recordRef.current.on("record-end", (blob: Blob) => {
        const file = new File([blob], "recording.webm", {
          type: `audio/${defaultFileType}`
        });
        uploadAsset({
          file,
          workflow_id: workflow.id,
          onCompleted: (asset: Asset) => {
            onChange(asset);
          },
          onFailed: (error) => setError(`Upload failed: ${error}`)
        });
      });

      recordRef.current.on("ready", () => {
        console.log("Recorder ready");
      });

      recordRef.current.on("start", () => {
        console.log("Recording started");
      });
    }
  }, [audioDeviceNames, defaultFileType, onChange, uploadAsset, workflow.id]);

  const [isDeviceListVisible, setIsDeviceListVisible] =
    useState<boolean>(false);

  const toggleDeviceListVisibility = useCallback(() => {
    setIsDeviceListVisible((prevState) => !prevState);
    fetchAudioDeviceNames();
  }, [fetchAudioDeviceNames]);

  const memoizedAudioDeviceNames = useMemo(
    () => audioDeviceNames,
    [audioDeviceNames]
  );

  return {
    error,
    setError,
    micRef,
    handleRecord,
    isRecording,
    isLoading,
    audioDeviceNames: memoizedAudioDeviceNames,
    isDeviceListVisible,
    toggleDeviceListVisibility
  };
}
