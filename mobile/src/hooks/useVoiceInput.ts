/**
 * On-device speech-to-text for the chat composer.
 *
 * Wraps `expo-speech-recognition` (iOS `SFSpeechRecognizer`, Android
 * `SpeechRecognizer`) behind a small state machine. Mobile's editing model is
 * "ask the assistant", so dictation is the primary input path — but a phone
 * without a recognizer, a simulator, or a denied microphone permission must
 * degrade to "the mic button is unavailable", never to a throw or a hang.
 *
 * Nothing here rejects or throws into the caller: `start()` resolves either
 * way and real failures go to {@link reportError}.
 *
 * The recognizer is released on unmount and when the app backgrounds — a live
 * recognizer holds the microphone and drains the battery.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';
import { subscribeAppLifecycle } from './useAppLifecycle';
import { reportError } from '../services/errorReporting';

/**
 * - `unavailable` — no recognizer on this device/simulator, or the recognizer
 *   refused the locale. Terminal: the UI should hide or disable the control.
 * - `denied` — microphone / speech permission was refused. Terminal until the
 *   user changes it in Settings.
 * - `idle` — ready, not listening.
 * - `starting` — permission granted, waiting for the native `start` event.
 * - `listening` — capturing audio.
 * - `error` — a recoverable failure; `start()` may be called again.
 */
export type VoiceInputStatus =
  | 'unavailable'
  | 'denied'
  | 'idle'
  | 'starting'
  | 'listening'
  | 'error';

interface UseVoiceInputOptions {
  /**
   * Called with each finalized transcript chunk. Callers append this to
   * whatever the user already typed — it is never the full composer value.
   */
  onTranscript: (transcript: string) => void;
  /** BCP-47 locale for the recognizer. Defaults to `en-US`. */
  lang?: string;
}

interface UseVoiceInputResult {
  status: VoiceInputStatus;
  /** True while audio is being captured (`starting` or `listening`). */
  isListening: boolean;
  /** False when there is no usable recognizer or permission was refused. */
  isAvailable: boolean;
  /** Best-effort transcript of the current utterance, not yet finalized. */
  interimTranscript: string;
  /** Human-readable reason for `error` / `denied` / `unavailable`, else null. */
  errorMessage: string | null;
  /** Request permission if needed and begin listening. Never rejects. */
  start: () => Promise<void>;
  /** Stop listening and flush a final result. Safe to call when idle. */
  stop: () => void;
}

const PERMISSION_DENIED_MESSAGE =
  'Microphone access is needed for voice input. Enable it in Settings.';
const UNAVAILABLE_MESSAGE = 'Voice input is not available on this device.';

/** Error codes that mean "no recognizer here", not "something went wrong". */
const UNAVAILABLE_CODES = new Set(['service-not-allowed', 'language-not-supported']);
/** Error codes that are a normal end to an utterance, not a failure. */
const BENIGN_CODES = new Set(['aborted', 'no-speech', 'speech-timeout']);

function readAvailability(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch (error) {
    reportError(error, { source: 'useVoiceInput.isRecognitionAvailable' });
    return false;
  }
}

export function useVoiceInput({
  onTranscript,
  lang = 'en-US',
}: UseVoiceInputOptions): UseVoiceInputResult {
  const [status, setStatus] = useState<VoiceInputStatus>(() =>
    readAvailability() ? 'idle' : 'unavailable'
  );
  const [interimTranscript, setInterimTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    readAvailability() ? null : UNAVAILABLE_MESSAGE
  );

  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  // Mirrors `status` for callbacks that must not re-subscribe on every change.
  const statusRef = useRef<VoiceInputStatus>(status);
  statusRef.current = status;

  const isListening = status === 'starting' || status === 'listening';
  const isAvailable = status !== 'unavailable' && status !== 'denied';

  const stopNative = useCallback((mode: 'stop' | 'abort') => {
    try {
      if (mode === 'stop') {
        ExpoSpeechRecognitionModule.stop();
      } else {
        ExpoSpeechRecognitionModule.abort();
      }
    } catch (error) {
      reportError(error, { source: `useVoiceInput.${mode}` });
    }
  }, []);

  const stop = useCallback(() => {
    if (statusRef.current !== 'starting' && statusRef.current !== 'listening') {
      return;
    }
    // Optimistic: the native `end` event may never arrive if the recognizer
    // was already torn down, and the UI must not stay stuck in "recording".
    statusRef.current = 'idle';
    setStatus('idle');
    setInterimTranscript('');
    stopNative('stop');
  }, [stopNative]);

  const start = useCallback(async () => {
    if (statusRef.current === 'unavailable' || isListening) {
      return;
    }

    if (!readAvailability()) {
      statusRef.current = 'unavailable';
      setStatus('unavailable');
      setErrorMessage(UNAVAILABLE_MESSAGE);
      return;
    }

    try {
      let permission = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      if (!permission.granted) {
        permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      }
      if (!permission.granted) {
        statusRef.current = 'denied';
        setStatus('denied');
        setErrorMessage(PERMISSION_DENIED_MESSAGE);
        return;
      }

      setErrorMessage(null);
      setInterimTranscript('');
      statusRef.current = 'starting';
      setStatus('starting');

      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
      });
    } catch (error) {
      reportError(error, { source: 'useVoiceInput.start' });
      statusRef.current = 'error';
      setStatus('error');
      setErrorMessage('Voice input could not be started.');
    }
  }, [isListening, lang]);

  useSpeechRecognitionEvent('start', () => {
    statusRef.current = 'listening';
    setStatus('listening');
  });

  useSpeechRecognitionEvent('end', () => {
    setInterimTranscript('');
    if (statusRef.current === 'starting' || statusRef.current === 'listening') {
      statusRef.current = 'idle';
      setStatus('idle');
    }
  });

  useSpeechRecognitionEvent('result', (event: ExpoSpeechRecognitionResultEvent) => {
    const transcript = event.results[0]?.transcript ?? '';
    if (!event.isFinal) {
      setInterimTranscript(transcript);
      return;
    }
    setInterimTranscript('');
    const finalized = transcript.trim();
    if (finalized) {
      onTranscriptRef.current(finalized);
    }
  });

  useSpeechRecognitionEvent('error', (event: ExpoSpeechRecognitionErrorEvent) => {
    setInterimTranscript('');

    if (BENIGN_CODES.has(event.error)) {
      if (statusRef.current === 'starting' || statusRef.current === 'listening') {
        statusRef.current = 'idle';
        setStatus('idle');
      }
      return;
    }

    if (event.error === 'not-allowed') {
      statusRef.current = 'denied';
      setStatus('denied');
      setErrorMessage(PERMISSION_DENIED_MESSAGE);
      return;
    }

    if (UNAVAILABLE_CODES.has(event.error)) {
      statusRef.current = 'unavailable';
      setStatus('unavailable');
      setErrorMessage(UNAVAILABLE_MESSAGE);
      return;
    }

    reportError(new Error(`Speech recognition failed: ${event.error}`), {
      source: 'useVoiceInput.event',
      extra: { code: event.error, message: event.message },
    });
    statusRef.current = 'error';
    setStatus('error');
    setErrorMessage(event.message || 'Voice input stopped unexpectedly.');
  });

  // The recognizer must not survive backgrounding — it holds the mic.
  useEffect(() => {
    return subscribeAppLifecycle((lifecycleEvent) => {
      if (lifecycleEvent !== 'background') {
        return;
      }
      if (statusRef.current === 'starting' || statusRef.current === 'listening') {
        statusRef.current = 'idle';
        setStatus('idle');
        setInterimTranscript('');
        stopNative('abort');
      }
    });
  }, [stopNative]);

  useEffect(() => {
    return () => {
      if (statusRef.current === 'starting' || statusRef.current === 'listening') {
        stopNative('abort');
      }
    };
  }, [stopNative]);

  return {
    status,
    isListening,
    isAvailable,
    interimTranscript,
    errorMessage,
    start,
    stop,
  };
}

export default useVoiceInput;
