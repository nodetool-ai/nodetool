import { useCallback, useRef, useState } from "react";
import type { ASRModel, Asset } from "../../../../stores/ApiTypes";
import { useAssetUpload } from "../../../../serverState/useAssetUpload";
import useModelPreferencesStore from "../../../../stores/ModelPreferencesStore";
import { useNotificationStore } from "../../../../stores/NotificationStore";
import { rpcRequest } from "../../../../lib/websocket/rpcRequest";
import { isString } from "../../../../utils/typePredicates";
import { useMicrophoneRecorder } from "../../../../hooks/browser/useMicrophoneRecorder";

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

export type VoiceInputPhase = "idle" | "recording" | "transcribing";

interface UseVoiceInputOptions {
  /** Receives the transcript once the recording is accepted and transcribed. */
  onTranscript: (text: string) => void;
}

interface UseVoiceInputReturn {
  phase: VoiceInputPhase;
  durationMs: number;
  levelsRef: React.MutableRefObject<Float32Array>;
  /** Mic button: starts recording, or asks for a model when none is set. */
  startRecording: () => void;
  /** Accept: stop, transcribe, hand the text to the composer. */
  confirmRecording: () => void;
  /** Discard: stop and throw the audio away. */
  cancelRecording: () => void;
  isConfigOpen: boolean;
  closeConfig: () => void;
  selectModel: (model: ASRModel) => void;
}

/**
 * The chat composer's voice input: record → confirm → transcribe with the
 * default speech-to-text model.
 *
 * The model is the one pinned in Settings → Default Models. With none pinned
 * there is nothing to transcribe with, so the mic opens the model picker
 * instead of recording, and what the user picks becomes the default.
 */
export function useVoiceInput({
  onTranscript
}: UseVoiceInputOptions): Readonly<UseVoiceInputReturn> {
  const recorder = useMicrophoneRecorder();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const pendingBlobRef = useRef<Blob | null>(null);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const setDefault = useModelPreferencesStore((state) => state.setDefault);
  const asrDefault = useModelPreferencesStore(
    (state) => state.defaults[ASR_MODEL_PREFERENCE]
  );

  const reportError = useCallback(
    (message: string) => {
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
    async (blob: Blob, model: { provider: string; id: string }) => {
      setIsTranscribing(true);
      try {
        const asset = await uploadRecording(blob);
        const result = await rpcRequest("transcribe_audio", {
          provider: model.provider,
          model: model.id,
          asset_id: asset.id
        });
        const text = isString(result.text) ? result.text.trim() : "";
        if (text.length === 0) {
          reportError("Nothing was transcribed from that recording.");
          return;
        }
        onTranscript(text);
      } catch (err) {
        reportError(
          `Transcription failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      } finally {
        setIsTranscribing(false);
      }
    },
    [onTranscript, reportError]
  );

  const startRecording = useCallback(() => {
    // Recording without a model would only strand the audio at the confirm
    // step, so the picker comes first.
    if (!asrDefault) {
      setIsConfigOpen(true);
      return;
    }
    void recorder.start().then((failure) => {
      if (failure) {
        reportError(failure);
      }
    });
  }, [asrDefault, recorder, reportError]);

  const confirmRecording = useCallback(() => {
    void recorder.confirm().then((blob) => {
      if (!blob) {
        return;
      }
      const model = useModelPreferencesStore.getState().defaults[
        ASR_MODEL_PREFERENCE
      ];
      if (!model) {
        // The default was cleared while recording; hold the take and ask.
        pendingBlobRef.current = blob;
        setIsConfigOpen(true);
        return;
      }
      void transcribe(blob, model);
    });
  }, [recorder, transcribe]);

  const cancelRecording = useCallback(() => {
    pendingBlobRef.current = null;
    recorder.cancel();
  }, [recorder]);

  const closeConfig = useCallback(() => {
    setIsConfigOpen(false);
    pendingBlobRef.current = null;
  }, []);

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
        void transcribe(pending, chosen);
        return;
      }
      void recorder.start().then((failure) => {
        if (failure) {
          reportError(failure);
        }
      });
    },
    [recorder, reportError, setDefault, transcribe]
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
    startRecording,
    confirmRecording,
    cancelRecording,
    isConfigOpen,
    closeConfig,
    selectModel
  };
}
