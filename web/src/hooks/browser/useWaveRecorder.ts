import { useEffect, useRef, useState, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import Record from "wavesurfer.js/dist/plugins/record";

import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useNodeStore } from "../../stores/NodeStore";
import { Asset } from "../../stores/ApiTypes";

export type WaveRecorderProps = {
  onChange: (asset: Asset) => void;
};

export function useWaveRecorder(props: WaveRecorderProps): {
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  micRef: React.RefObject<HTMLDivElement>;
  recordingsRef: React.RefObject<HTMLDivElement>;
  handleRecord: () => void;
  isRecording: boolean;
  isLoading: boolean;
  audioDeviceNames: string[];
  isDeviceListVisible: boolean;
  toggleDeviceListVisibility: () => void;
} {
  const defaultFileType = "webm";
  const { uploadAsset } = useAssetUpload();
  const workflow = useNodeStore((state) => state.workflow);
  const micRef = useRef<HTMLDivElement | null>(null);
  const recordingsRef = useRef<HTMLDivElement | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const recordRef = useRef<any | null>(null);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [audioDeviceNames, setAudioDeviceNames] = useState<string[]>([]);

  const handleRecord = useCallback(() => {
    if (recordRef.current) {
      if (recordRef.current.isRecording()) {
        recordRef.current.stopRecording();
        setIsRecording(false);
        return;
      }

      setIsLoading(true);

      recordRef.current
        .startRecording()
        .then(() => {
          setIsRecording(true);
          setIsLoading(false);
        })
        .catch((error: Error) => {
          console.error("Recording error:", error);
          setError(error.message);
          setIsLoading(false);
        });
    }
  }, []);

  const fetchAudioDeviceNames = () => {
    if (!navigator.mediaDevices) {
      console.error("No media devices available");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        // Stop the media stream to release it
        stream.getTracks().forEach((track) => track.stop());

        // Now that we have permissions, get the list of devices
        return navigator.mediaDevices.enumerateDevices();
      })
      .then((devices) => {
        const audioInputDevices = devices.filter(
          (device) => device.kind === "audioinput"
        );
        const audioDeviceLabels = audioInputDevices.map(
          (device) => device.label
        );
        setAudioDeviceNames(audioDeviceLabels);
      })
      .catch((error) => console.error("Error enumerating devices:", error));
  };

  useEffect(() => {
    fetchAudioDeviceNames();

    if (micRef.current) {
      const mimeType = `audio/${defaultFileType}`;
      const recordPlugin = Record.create({
        mimeType: mimeType
      });
      recordRef.current = recordPlugin;

      // create WaveSurfer
      waveSurferRef.current = WaveSurfer.create({
        container: micRef.current,
        waveColor: "#333",
        progressColor: "#111",
        height: 30,
        plugins: [recordPlugin]
      });

      if (waveSurferRef.current && recordRef.current) {
        // render recorded audio
        recordRef.current.on("record-end", (blob: Blob) => {
          const file = new File([blob], "recording.webm", {
            type: `audio/${defaultFileType}`
          });
          uploadAsset({
            file: file,
            workflow_id: workflow.id,
            onCompleted: (asset: Asset) => props.onChange(asset),
            onFailed: (error) => console.log(error)
          });
        });
      }
    }

    return () => {
      // cleanup
      if (recordRef.current) {
        recordRef.current.unAll();
      }
      if (waveSurferRef.current) {
        waveSurferRef.current.destroy();
      }
    };
  }, [workflow.id, props, uploadAsset]);

  const [isDeviceListVisible, setIsDeviceListVisible] =
    useState<boolean>(false);

  const toggleDeviceListVisibility = () => {
    setIsDeviceListVisible((prevState) => !prevState);
    fetchAudioDeviceNames();
  };

  return {
    error,
    setError,
    micRef,
    recordingsRef,
    handleRecord,
    isRecording,
    isLoading,
    audioDeviceNames,
    isDeviceListVisible,
    toggleDeviceListVisibility
  };
}
