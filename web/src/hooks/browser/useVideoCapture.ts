import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from "react";
import log from "loglevel";

export type VideoDevice = {
  deviceId: string;
  label: string;
};

export interface UseVideoCaptureOptions {
  includeAudio?: boolean;
  autoFetchDevices?: boolean;
}

const uniqueDevices = (devices: VideoDevice[]): VideoDevice[] => {
  return devices.filter((device, index, allDevices) => {
    return (
      index ===
      allDevices.findIndex((candidate) => candidate.deviceId === device.deviceId)
    );
  });
};

const mapDevices = (
  devices: MediaDeviceInfo[],
  kind: MediaDeviceKind,
  defaultLabel: string,
  fallbackPrefix: string
): VideoDevice[] => {
  return uniqueDevices(
    devices
      .filter((device) => device.kind === kind)
      .map((device, index) => {
        const normalizedDeviceId =
          device.deviceId === "default" ? "" : device.deviceId;
        const fallbackDeviceLabel =
          device.label ||
          (device.deviceId === "default"
            ? defaultLabel
            : `${fallbackPrefix} ${index + 1}`);

        return {
          deviceId: normalizedDeviceId,
          label: fallbackDeviceLabel
        };
      })
  );
};

const getErrorMessage = (
  error: unknown,
  fallbackMessage: string
): string => {
  return error instanceof Error ? error.message : fallbackMessage;
};

const stopMediaStream = (stream: MediaStream | null): void => {
  stream?.getTracks().forEach((track) => track.stop());
};

export function useVideoCapture(
  options: UseVideoCaptureOptions = {}
): {
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  videoRef: RefObject<HTMLVideoElement | null>;
  streamRef: RefObject<MediaStream | null>;
  previewStream: MediaStream | null;
  isPreviewing: boolean;
  isLoading: boolean;
  videoInputDevices: VideoDevice[];
  audioInputDevices: VideoDevice[];
  selectedVideoDeviceId: string;
  selectedAudioDeviceId: string;
  startPreview: () => Promise<void>;
  stopPreview: () => void;
  refreshDevices: () => void;
  handleVideoDeviceChange: (deviceId: string) => void;
  handleAudioDeviceChange: (deviceId: string) => void;
} {
  const { includeAudio = true, autoFetchDevices = true } = options;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [videoInputDevices, setVideoInputDevices] = useState<VideoDevice[]>([]);
  const [audioInputDevices, setAudioInputDevices] = useState<VideoDevice[]>([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] =
    useState<string>("");
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] =
    useState<string>("");

  const releaseResources = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const stopPreview = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setPreviewStream(null);
    setIsPreviewing(false);
  }, []);

  const refreshDevices = useCallback(() => {
    if (!navigator.mediaDevices) {
      setError("No media devices available");
      return;
    }

    log.info("Fetching video/audio devices");
    abortControllerRef.current?.abort();
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    const permissionConstraints: MediaStreamConstraints = {
      video: true,
      audio: includeAudio
    };

    navigator.mediaDevices
      .getUserMedia(permissionConstraints)
      .then((stream) => {
        if (abortCtrl.signal.aborted) {
          stopMediaStream(stream);
          return;
        }

        stopMediaStream(stream);
        setError(null);
        return navigator.mediaDevices.enumerateDevices();
      })
      .then((devices) => {
        if (!devices) {
          setError("No devices found");
          return;
        }

        const nextVideoInputs = mapDevices(
          devices,
          "videoinput",
          "System default camera",
          "Camera"
        );
        const nextAudioInputs = includeAudio
          ? mapDevices(
              devices,
              "audioinput",
              "System default input",
              "Microphone"
            )
          : [];

        setVideoInputDevices(nextVideoInputs);
        setAudioInputDevices(nextAudioInputs);

        setSelectedVideoDeviceId((currentSelection) => {
          if (
            nextVideoInputs.some((device) => device.deviceId === currentSelection)
          ) {
            return currentSelection;
          }

          if (nextVideoInputs.some((device) => device.deviceId.length === 0)) {
            return "";
          }

          return nextVideoInputs[0]?.deviceId ?? "";
        });

        setSelectedAudioDeviceId((currentSelection) => {
          if (
            nextAudioInputs.some((device) => device.deviceId === currentSelection)
          ) {
            return currentSelection;
          }

          if (nextAudioInputs.some((device) => device.deviceId.length === 0)) {
            return "";
          }

          return nextAudioInputs[0]?.deviceId ?? "";
        });

        if (nextVideoInputs.length === 0) {
          setTimeout(() => {
            setError("No video input devices found");
          }, 2000);
        }
      })
      .catch((fetchError: unknown) => {
        if (
          fetchError instanceof DOMException &&
          fetchError.name === "AbortError"
        ) {
          log.info("Fetch aborted");
          return;
        }

        setError(
          `Error enumerating devices: ${getErrorMessage(
            fetchError,
            "Unknown device enumeration error"
          )}`
        );
      });
  }, [includeAudio]);

  const startPreview = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: selectedVideoDeviceId
          ? { deviceId: { exact: selectedVideoDeviceId } }
          : true,
        audio: includeAudio
          ? selectedAudioDeviceId
            ? { deviceId: { exact: selectedAudioDeviceId } }
            : true
          : false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stopMediaStream(streamRef.current);
      streamRef.current = stream;
      setPreviewStream(stream);
      setIsPreviewing(true);
    } catch (previewError: unknown) {
      setError(
        getErrorMessage(previewError, "Failed to start preview")
      );
    } finally {
      setIsLoading(false);
    }
  }, [includeAudio, selectedAudioDeviceId, selectedVideoDeviceId]);

  const handleVideoDeviceChange = useCallback((deviceId: string) => {
    setSelectedVideoDeviceId(deviceId);
  }, []);

  const handleAudioDeviceChange = useCallback((deviceId: string) => {
    setSelectedAudioDeviceId(deviceId);
  }, []);

  useEffect(() => {
    if (!autoFetchDevices) {
      return;
    }

    refreshDevices();
  }, [autoFetchDevices, refreshDevices]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    videoElement.srcObject = previewStream;
    if (!previewStream) {
      return;
    }

    videoElement.muted = true;
    void videoElement.play().catch((playError: unknown) => {
      log.warn("Failed to play video preview", playError);
    });

    return () => {
      videoElement.srcObject = null;
    };
  }, [previewStream]);

  useEffect(() => {
    return () => {
      releaseResources();
    };
  }, [releaseResources]);

  return {
    error,
    setError,
    videoRef,
    streamRef,
    previewStream,
    isPreviewing,
    isLoading,
    videoInputDevices,
    audioInputDevices,
    selectedVideoDeviceId,
    selectedAudioDeviceId,
    startPreview,
    stopPreview,
    refreshDevices,
    handleVideoDeviceChange,
    handleAudioDeviceChange
  };
}
