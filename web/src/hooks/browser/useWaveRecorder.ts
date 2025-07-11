import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import WaveSurfer from "wavesurfer.js";
import Record from "wavesurfer.js/dist/plugins/record";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { Asset } from "../../stores/ApiTypes";
import log from "loglevel";
import { useNodes } from "../../contexts/NodeContext";

export type WaveRecorderProps = {
  onChange: (asset: Asset) => void;
};

export function useWaveRecorder({ onChange }: WaveRecorderProps) {
  const defaultFileType = "webm";
  const { uploadAsset } = useAssetUpload();
  const workflow = useNodes((state) => state.workflow);
  const micRef = useRef<HTMLDivElement | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const recordRef = useRef<any | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [audioInputDevices, setAudioInputDevices] = useState<string[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<string[]>([]);

  const fetchAudioDeviceNames = useCallback(() => {
    if (!navigator.mediaDevices) {
      setError("No media devices available");
      return;
    }
    log.info("Fetching audio devices");
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
        const audioInputs = devices.filter(
          (device) => device.kind === "audioinput"
        );
        const audioOutputs = devices.filter(
          (device) => device.kind === "audiooutput"
        );

        const audioInputLabels = audioInputs.map(
          (device) => device.label || device.deviceId
        );
        const audioOutputLabels = audioOutputs.map(
          (device) => device.label || device.deviceId
        );

        setAudioInputDevices(audioInputLabels);
        setAudioOutputDevices(audioOutputLabels);
        if (audioInputLabels.length === 0) {
          setTimeout(() => {
            setError("No audio input devices found");
          }, 2000);
        }
      })
      .catch((error) => {
        if (error.name === "AbortError") {
          log.info("Fetch aborted");
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
    }
  }, [audioInputDevices, defaultFileType, onChange, uploadAsset, workflow.id]);

  const [isDeviceListVisible, setIsDeviceListVisible] =
    useState<boolean>(false);

  const toggleDeviceListVisibility = useCallback(() => {
    setIsDeviceListVisible((prevState) => !prevState);
    fetchAudioDeviceNames();
  }, [fetchAudioDeviceNames]);

  const memoizedAudioInputDevices = useMemo(
    () => audioInputDevices,
    [audioInputDevices]
  );
  const memoizedAudioOutputDevices = useMemo(
    () => audioOutputDevices,
    [audioOutputDevices]
  );

  return {
    error,
    setError,
    micRef,
    handleRecord,
    isRecording,
    isLoading,
    audioInputDevices: memoizedAudioInputDevices,
    audioOutputDevices: memoizedAudioOutputDevices,
    isDeviceListVisible,
    toggleDeviceListVisibility
  };
}
