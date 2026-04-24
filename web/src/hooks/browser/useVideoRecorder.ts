import { useEffect, useRef, useState, useCallback } from "react";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { Asset } from "../../stores/ApiTypes";
import { useNodes } from "../../contexts/NodeContext";
import { useVideoCapture } from "./useVideoCapture";

export type VideoRecorderProps = {
  onChange: (asset: Asset) => void;
};

export function useVideoRecorder({ onChange }: VideoRecorderProps) {
  const defaultFileType = "webm";
  const { uploadAsset } = useAssetUpload();
  const workflow = useNodes((state) => state.workflow);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isRecordingLoading, setIsRecordingLoading] = useState<boolean>(false);
  const {
    error,
    setError,
    videoRef,
    streamRef,
    isPreviewing,
    isLoading: isCaptureLoading,
    startPreview,
    stopPreview,
    videoInputDevices,
    audioInputDevices,
    refreshDevices,
    selectedVideoDeviceId,
    selectedAudioDeviceId,
    handleVideoDeviceChange,
    handleAudioDeviceChange
  } = useVideoCapture({ includeAudio: true });

  const handleRecord = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      // Stop recording
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }

    if (!streamRef.current) {
      setError("No video stream available. Start preview first.");
      return;
    }

    setIsRecordingLoading(true);
    setError(null);
    chunksRef.current = [];

    try {
      const preferredMimeType = `video/${defaultFileType}`;
      const actualMimeType = MediaRecorder.isTypeSupported(preferredMimeType)
        ? preferredMimeType
        : "video/webm";
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: actualMimeType
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const fileExtension = actualMimeType.split("/")[1] || "webm";
        const blob = new Blob(chunksRef.current, {
          type: actualMimeType
        });
        const file = new File([blob], `recording.${fileExtension}`, {
          type: actualMimeType
        });

        uploadAsset({
          file,
          workflow_id: workflow.id,
          onCompleted: (asset: Asset) => {
            onChange(asset);
            stopPreview();
          },
          onFailed: (uploadError) => setError(`Upload failed: ${uploadError}`)
        });

        chunksRef.current = [];
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setIsRecordingLoading(false);
    } catch (recordError) {
      const errorMessage =
        recordError instanceof Error
          ? recordError.message
          : "Failed to start recording";
      setError(errorMessage);
      setIsRecordingLoading(false);
    }
  }, [
    isRecording,
    defaultFileType,
    onChange,
    uploadAsset,
    workflow.id,
    stopPreview,
    setError,
    streamRef
  ]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        if (mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }
      stopPreview();
    };
  }, [stopPreview]);

  const [isDeviceListVisible, setIsDeviceListVisible] =
    useState<boolean>(false);

  const toggleDeviceListVisibility = useCallback(() => {
    setIsDeviceListVisible((prevState) => !prevState);
    refreshDevices();
  }, [refreshDevices]);

  return {
    error,
    setError,
    videoRef,
    handleRecord,
    isRecording,
    isPreviewing,
    isLoading: isCaptureLoading || isRecordingLoading,
    startPreview,
    stopStream: stopPreview,
    videoInputDevices,
    audioInputDevices,
    isDeviceListVisible,
    toggleDeviceListVisibility,
    selectedVideoDeviceId,
    selectedAudioDeviceId,
    handleVideoDeviceChange,
    handleAudioDeviceChange
  };
}
