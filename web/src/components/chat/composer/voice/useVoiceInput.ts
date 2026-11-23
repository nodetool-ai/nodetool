import { useCallback, useEffect, useRef, useState } from "react";
import type { ASRModel, Asset } from "../../../../stores/ApiTypes";
import { useAssetUpload } from "../../../../serverState/useAssetUpload";
import useModelPreferencesStore from "../../../../stores/ModelPreferencesStore";
import { useNotificationStore } from "../../../../stores/NotificationStore";
import { promptForMissingRuntimePackage } from "../../../../stores/RuntimePackagePromptStore";
import { rpcRequest } from "../../../../lib/websocket/rpcRequest";
import { trpcClient } from "../../../../trpc/client";
import { isString } from "../../../../utils/typePredicates";
import { useMicrophoneRecorder } from "../../../../hooks/browser/useMicrophoneRecorder";
import {
  WHISPER_CPP_PACKAGE,
  WHISPER_CPP_PROVIDER,
  isWhisperCppInstalled,
  resolveDesktopAsrDefault,
  type DesktopAsrDefault
} from "./desktopAsrDefault";

/** The `defaults` key holding the speech-to-text model (Settings → Default Models). */
export const ASR_MODEL_PREFERENCE = "asr_model";

const MIME_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav"
};

function recordingFileName(mimeType: string): string {
  const base = mimeType.split(";")[0];
  return `voice-message-${Date.now()}.${MIME_EXTENSIONS[base] ?? "webm"}`;
}

function uploadRecording(blob: Blob): Promise<Asset> {
  const mimeType = blob.type || "audio/webm";
  const file = new File([blob], recordingFileName(mimeType), {
    type: mimeType
  });
  return new Promise((resolve, reject) => {
    useAssetUpload.getState().uploadAsset({
      file,
      onCompleted: resolve,
      onFailed: (error: string) => reject(new Error(error))
    });
  });
}

function deleteOrphanedRecording(assetId: string): void {
  try {
    const result = trpcClient?.assets?.delete?.mutate?.({ id: assetId });
    void Promise.resolve(result).catch(() => undefined);
  } catch {
    // Best-effort cleanup; never throw or surface notifications on cancel/unmount.
  }
}

export type VoiceInputPhase = "idle" | "recording" | "transcribing";

export interface UseVoiceInputOptions {
  /** Receives the transcript once the recording is accepted and transcribed. */
  onTranscript: (text: string) => void;
  /**
   * Receives the transcript when the user triggered Send before transcription
   * finished. Falls back to `onTranscript` when omitted.
   */
  onSubmitTranscript?: (text: string) => void;
}

export interface UseVoiceInputReturn {
  phase: VoiceInputPhase;
  durationMs: number;
  levelsRef: React.MutableRefObject<Float32Array>;
  /** True once the user requested send while recording or transcribing. */
  pendingSend: boolean;
  /**
   * Starts recording. With no default set, the desktop app falls back to
   * whisper.cpp (offering its install); anything else asks for a model.
   */
  startRecording: () => void;
  /** Toggles dictation: starts when idle, stops and begins transcribing when recording. */
  toggleRecording: () => void;
  /** Stops recording, transcribes, and hands the text to the composer as a draft. */
  confirmRecording: () => void;
  /**
   * Requests submission as soon as transcription resolves.
   * - Recording: stops recording, starts transcribing, and marks pending send.
   * - Transcribing: marks pending send.
   * - Idle: no-op, returns false.
   */
  requestSend: () => boolean;
  /** Discards an active recording or aborts an in-flight transcription without sending. */
  cancelRecording: () => void;
  isConfigOpen: boolean;
  closeConfig: () => void;
  selectModel: (model: ASRModel) => void;
}

/**
 * The chat composer's voice input: record → transcribe with the default
 * speech-to-text model → land in draft (or submit if send was requested while
 * recording or transcribing).
 *
 * The model is the one pinned in Settings → Default Models. With none pinned,
 * the desktop app defaults to a downloaded whisper.cpp model and pins it. When
 * whisper.cpp is not installed it offers the install. Otherwise there is
 * nothing to transcribe with, so the mic opens the model picker instead of
 * recording, and what the user picks becomes the default.
 */
export function useVoiceInput({
  onTranscript,
  onSubmitTranscript
}: UseVoiceInputOptions): Readonly<UseVoiceInputReturn> {
  const recorder = useMicrophoneRecorder();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [pendingSend, setPendingSend] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const isMountedRef = useRef(true);
  const pendingBlobRef = useRef<Blob | null>(null);
  const pendingSendRef = useRef(false);
  const requestIdRef = useRef(0);
  const uploadedAssetIdRef = useRef<string | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onSubmitTranscriptRef = useRef(onSubmitTranscript);
  onSubmitTranscriptRef.current = onSubmitTranscript;
  const recorderCancelRef = useRef(recorder.cancel);
  recorderCancelRef.current = recorder.cancel;

  const addNotification = useNotificationStore((state) => state.addNotification);
  const setDefault = useModelPreferencesStore((state) => state.setDefault);
  const asrDefault = useModelPreferencesStore(
    (state) => state.defaults[ASR_MODEL_PREFERENCE]
  );

  const isActiveRequest = useCallback(
    (requestId: number): boolean =>
      isMountedRef.current && requestId === requestIdRef.current,
    []
  );

  const discardUploadedAsset = useCallback(() => {
    const assetId = uploadedAssetIdRef.current;
    uploadedAssetIdRef.current = null;
    if (assetId) {
      deleteOrphanedRecording(assetId);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
      pendingBlobRef.current = null;
      pendingSendRef.current = false;
      discardUploadedAsset();
      recorderCancelRef.current();
    };
  }, [discardUploadedAsset]);

  const clearPendingSend = useCallback(() => {
    pendingSendRef.current = false;
    setPendingSend(false);
  }, []);

  const reportError = useCallback(
    (message: string) => {
      if (!isMountedRef.current) {
        return;
      }
      addNotification({
        type: "error",
        alert: true,
        content: message,
        dedupeKey: "voice-input-error",
        replaceExisting: true
      });
    },
    [addNotification]
  );

  const transcribe = useCallback(
    async (
      blob: Blob,
      model: { provider: string; id: string },
      requestId: number
    ) => {
      setIsTranscribing(true);
      let uploadedAssetId: string | null = null;
      try {
        const asset = await uploadRecording(blob);
        if (!isActiveRequest(requestId)) {
          deleteOrphanedRecording(asset.id);
          return;
        }
        uploadedAssetId = asset.id;
        uploadedAssetIdRef.current = asset.id;
        const result = await rpcRequest("transcribe_audio", {
          provider: model.provider,
          model: model.id,
          asset_id: asset.id
        });
        if (!isActiveRequest(requestId)) {
          if (uploadedAssetIdRef.current === uploadedAssetId) {
            uploadedAssetIdRef.current = null;
            deleteOrphanedRecording(uploadedAssetId);
          }
          return;
        }
        uploadedAssetIdRef.current = null;
        const text = isString(result.text) ? result.text.trim() : "";
        if (text.length === 0) {
          clearPendingSend();
          reportError("Nothing was transcribed from that recording.");
          return;
        }
        const shouldSend = pendingSendRef.current;
        clearPendingSend();
        setIsTranscribing(false);
        if (shouldSend && onSubmitTranscriptRef.current) {
          onSubmitTranscriptRef.current(text);
        } else {
          onTranscriptRef.current(text);
        }
      } catch (err) {
        if (!isActiveRequest(requestId)) {
          if (uploadedAssetId && uploadedAssetIdRef.current === uploadedAssetId) {
            uploadedAssetIdRef.current = null;
            deleteOrphanedRecording(uploadedAssetId);
          }
          return;
        }
        uploadedAssetIdRef.current = null;
        clearPendingSend();
        if (
          model.provider === WHISPER_CPP_PROVIDER &&
          (await isWhisperCppInstalled()) === false
        ) {
          if (!isActiveRequest(requestId)) {
            return;
          }
          promptForMissingRuntimePackage(WHISPER_CPP_PACKAGE);
          return;
        }
        if (!isActiveRequest(requestId)) {
          return;
        }
        reportError(
          `Transcription failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      } finally {
        if (isActiveRequest(requestId)) {
          setIsTranscribing(false);
        }
      }
    },
    [clearPendingSend, isActiveRequest, reportError]
  );

  const beginRecording = useCallback(() => {
    const requestId = ++requestIdRef.current;
    clearPendingSend();
    void recorder.start().then((failure) => {
      if (!isActiveRequest(requestId)) {
        return;
      }
      if (failure) {
        reportError(failure);
      }
    });
  }, [clearPendingSend, isActiveRequest, recorder, reportError]);

  const startRecording = useCallback(() => {
    if (asrDefault) {
      beginRecording();
      return;
    }
    // Recording without a model would only strand the audio at the confirm
    // step, so the model is settled first.
    const requestId = ++requestIdRef.current;
    void resolveDesktopAsrDefault()
      .catch((): DesktopAsrDefault => ({ kind: "unavailable" }))
      .then((resolved) => {
        if (!isActiveRequest(requestId)) {
          return;
        }
        if (resolved.kind === "model") {
          setDefault(ASR_MODEL_PREFERENCE, resolved.model);
          beginRecording();
        } else if (resolved.kind === "missing") {
          promptForMissingRuntimePackage(WHISPER_CPP_PACKAGE);
        } else {
          setIsConfigOpen(true);
        }
      });
  }, [asrDefault, beginRecording, isActiveRequest, setDefault]);

  const confirmRecording = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setIsTranscribing(true);
    void (async () => {
      try {
        const blob = await recorder.confirm();
        if (!isActiveRequest(requestId)) {
          return;
        }
        if (!blob) {
          clearPendingSend();
          setIsTranscribing(false);
          return;
        }
        const model = useModelPreferencesStore.getState().defaults[
          ASR_MODEL_PREFERENCE
        ];
        if (!model) {
          // The default was cleared while recording; hold the take and ask.
          pendingBlobRef.current = blob;
          setIsTranscribing(false);
          setIsConfigOpen(true);
          return;
        }
        await transcribe(blob, model, requestId);
      } catch {
        if (isActiveRequest(requestId)) {
          clearPendingSend();
          setIsTranscribing(false);
        }
      }
    })();
  }, [clearPendingSend, isActiveRequest, recorder, transcribe]);

  const toggleRecording = useCallback(() => {
    if (isTranscribing) {
      return;
    }
    if (recorder.isRecording) {
      confirmRecording();
      return;
    }
    startRecording();
  }, [confirmRecording, isTranscribing, recorder.isRecording, startRecording]);

  const requestSend = useCallback((): boolean => {
    if (isTranscribing) {
      pendingSendRef.current = true;
      setPendingSend(true);
      return true;
    }
    if (recorder.isRecording) {
      pendingSendRef.current = true;
      setPendingSend(true);
      confirmRecording();
      return true;
    }
    return false;
  }, [confirmRecording, isTranscribing, recorder.isRecording]);

  const cancelRecording = useCallback(() => {
    requestIdRef.current += 1;
    pendingBlobRef.current = null;
    discardUploadedAsset();
    clearPendingSend();
    setIsTranscribing(false);
    recorder.cancel();
  }, [clearPendingSend, discardUploadedAsset, recorder]);

  const closeConfig = useCallback(() => {
    setIsConfigOpen(false);
    pendingBlobRef.current = null;
    clearPendingSend();
  }, [clearPendingSend]);

  const selectModel = useCallback(
    (model: ASRModel) => {
      const chosen = {
        provider: model.provider,
        id: model.id,
        name: model.name || model.id
      };
      setDefault(ASR_MODEL_PREFERENCE, chosen);
      setIsConfigOpen(false);
      const pending = pendingBlobRef.current;
      pendingBlobRef.current = null;
      if (pending) {
        const requestId = ++requestIdRef.current;
        void transcribe(pending, chosen, requestId);
        return;
      }
      beginRecording();
    },
    [beginRecording, setDefault, transcribe]
  );

  const phase: VoiceInputPhase = isTranscribing
    ? "transcribing"
    : recorder.isRecording
      ? "recording"
      : "idle";

  return {
    phase,
    durationMs: recorder.durationMs,
    levelsRef: recorder.levelsRef,
    pendingSend,
    startRecording,
    toggleRecording,
    confirmRecording,
    requestSend,
    cancelRecording,
    isConfigOpen,
    closeConfig,
    selectModel
  };
}
