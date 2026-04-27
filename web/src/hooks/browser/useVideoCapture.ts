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

export type VideoCaptureResolutionPreset =
  | "qvga"
  | "vga"
  | "wide480p"
  | "hd"
  | "fhd";

export const VIDEO_CAPTURE_RESOLUTION_PRESETS: Record<
  VideoCaptureResolutionPreset,
  { label: string; width: number; height: number }
> = {
  qvga: { label: "320x240", width: 320, height: 240 },
  vga: { label: "640x480", width: 640, height: 480 },
  wide480p: { label: "832x480", width: 832, height: 480 },
  hd: { label: "1280x720", width: 1280, height: 720 },
  fhd: { label: "1920x1080", width: 1920, height: 1080 }
};

export interface UseVideoCaptureOptions {
  includeAudio?: boolean;
  autoFetchDevices?: boolean;
  initialResolution?: VideoCaptureResolutionPreset;
  warmupMs?: number;
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

const DEFAULT_VIDEO_RESOLUTION: VideoCaptureResolutionPreset = "hd";
const DEFAULT_WARMUP_MS = 2500;

const videoConstraintsForDevice = (
  deviceId: string,
  resolution: VideoCaptureResolutionPreset
): MediaTrackConstraints => ({
  width: { ideal: VIDEO_CAPTURE_RESOLUTION_PRESETS[resolution].width },
  height: { ideal: VIDEO_CAPTURE_RESOLUTION_PRESETS[resolution].height },
  frameRate: { ideal: 30, max: 30 },
  ...(deviceId ? { deviceId: { exact: deviceId } } : {})
});

const logVideoTrackDiagnostics = (
  stream: MediaStream,
  constraints: MediaStreamConstraints
): void => {
  console.info("TEMP_LOG video capture stream diagnostics", {
    constraints,
    videoTracks: stream.getVideoTracks().map((track) => ({
      id: track.id,
      label: track.label,
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      settings: track.getSettings?.(),
      capabilities: track.getCapabilities?.()
    }))
  });
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
  isWarmingUp: boolean;
  isPreviewReady: boolean;
  isLoading: boolean;
  videoInputDevices: VideoDevice[];
  audioInputDevices: VideoDevice[];
  videoTrackSettings: MediaTrackSettings | null;
  selectedVideoDeviceId: string;
  selectedAudioDeviceId: string;
  selectedVideoResolution: VideoCaptureResolutionPreset;
  startPreview: () => Promise<void>;
  stopPreview: () => void;
  refreshDevices: () => void;
  handleVideoDeviceChange: (deviceId: string) => void;
  handleAudioDeviceChange: (deviceId: string) => void;
  handleVideoResolutionChange: (resolution: VideoCaptureResolutionPreset) => void;
} {
  const {
    includeAudio = true,
    autoFetchDevices = true,
    initialResolution = DEFAULT_VIDEO_RESOLUTION,
    warmupMs = DEFAULT_WARMUP_MS
  } = options;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const warmupTimeoutRef = useRef<number | null>(null);

  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [isWarmingUp, setIsWarmingUp] = useState<boolean>(false);
  const [isPreviewReady, setIsPreviewReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [videoInputDevices, setVideoInputDevices] = useState<VideoDevice[]>([]);
  const [audioInputDevices, setAudioInputDevices] = useState<VideoDevice[]>([]);
  const [videoTrackSettings, setVideoTrackSettings] =
    useState<MediaTrackSettings | null>(null);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] =
    useState<string>("");
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] =
    useState<string>("");
  const [selectedVideoResolution, setSelectedVideoResolution] =
    useState<VideoCaptureResolutionPreset>(initialResolution);

  const clearWarmupTimeout = useCallback(() => {
    if (warmupTimeoutRef.current) {
      window.clearTimeout(warmupTimeoutRef.current);
      warmupTimeoutRef.current = null;
    }
  }, []);

  const releaseResources = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clearWarmupTimeout();
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsWarmingUp(false);
    setIsPreviewReady(false);
    setVideoTrackSettings(null);
  }, [clearWarmupTimeout]);

  const stopPreview = useCallback(() => {
    clearWarmupTimeout();
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setPreviewStream(null);
    setIsPreviewing(false);
    setIsWarmingUp(false);
    setIsPreviewReady(false);
    setVideoTrackSettings(null);
  }, [clearWarmupTimeout]);

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
      video: videoConstraintsForDevice("", selectedVideoResolution),
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
        if ((fetchError as Error | undefined)?.name === "AbortError") {
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
  }, [includeAudio, selectedVideoResolution]);

  const startPreview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    clearWarmupTimeout();
    setIsWarmingUp(false);
    setIsPreviewReady(false);

    try {
      const constraints: MediaStreamConstraints = {
        video: videoConstraintsForDevice(
          selectedVideoDeviceId,
          selectedVideoResolution
        ),
        audio: includeAudio
          ? selectedAudioDeviceId
            ? { deviceId: { exact: selectedAudioDeviceId } }
            : true
          : false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      logVideoTrackDiagnostics(stream, constraints);
      stopMediaStream(streamRef.current);
      streamRef.current = stream;
      setVideoTrackSettings(stream.getVideoTracks()[0]?.getSettings?.() ?? null);
      setPreviewStream(stream);
      setIsPreviewing(true);
      if (warmupMs > 0) {
        setIsWarmingUp(true);
        warmupTimeoutRef.current = window.setTimeout(() => {
          warmupTimeoutRef.current = null;
          setIsWarmingUp(false);
          setIsPreviewReady(true);
        }, warmupMs);
      } else {
        setIsPreviewReady(true);
      }
    } catch (previewError: unknown) {
      setError(
        getErrorMessage(previewError, "Failed to start preview")
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    clearWarmupTimeout,
    includeAudio,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    selectedVideoResolution,
    warmupMs
  ]);

  const handleVideoDeviceChange = useCallback((deviceId: string) => {
    setSelectedVideoDeviceId(deviceId);
  }, []);

  const handleAudioDeviceChange = useCallback((deviceId: string) => {
    setSelectedAudioDeviceId(deviceId);
  }, []);

  const handleVideoResolutionChange = useCallback(
    (resolution: VideoCaptureResolutionPreset) => {
      setSelectedVideoResolution(resolution);
    },
    []
  );

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
    isWarmingUp,
    isPreviewReady,
    isLoading,
    videoInputDevices,
    audioInputDevices,
    videoTrackSettings,
    selectedVideoDeviceId,
    selectedAudioDeviceId,
    selectedVideoResolution,
    startPreview,
    stopPreview,
    refreshDevices,
    handleVideoDeviceChange,
    handleAudioDeviceChange,
    handleVideoResolutionChange
  };
}
