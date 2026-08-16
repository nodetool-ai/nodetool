/**
 * Tests for the speech-recognition wrapper.
 *
 * `expo-speech-recognition` is mocked globally in jest.setup.js. Here the
 * `useSpeechRecognitionEvent` mock is given an implementation that captures the
 * hook's listeners so native events can be fired directly.
 */

import { AppState, type AppStateStatus } from 'react-native';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { reportError } from '../services/errorReporting';
import { useVoiceInput } from './useVoiceInput';

jest.mock('../services/errorReporting', () => ({
  reportError: jest.fn(),
}));

const speech = ExpoSpeechRecognitionModule as unknown as {
  isRecognitionAvailable: jest.Mock;
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  abort: jest.Mock;
};
const eventHook = jest.mocked(useSpeechRecognitionEvent);
const reportErrorMock = reportError as jest.Mock;

type Listener = (event: unknown) => void;
let listeners: Record<string, Listener>;
let appStateHandlers: ((state: AppStateStatus) => void)[];

function fireEvent(name: string, payload?: unknown): void {
  act(() => {
    listeners[name]?.(payload);
  });
}

const GRANTED = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' };
const DENIED = { status: 'denied', granted: false, canAskAgain: false, expires: 'never' };

beforeEach(() => {
  jest.clearAllMocks();
  listeners = {};
  appStateHandlers = [];
  // useAppLifecycle only emits 'background' when it believes the app was active.
  (AppState as { currentState: AppStateStatus }).currentState = 'active';

  eventHook.mockImplementation((name, listener) => {
    // SAFETY: `listener` is the hook's handler for the single event `name`, and
    // each test fires that event's own payload shape. The union of per-event
    // listener types cannot express that pairing, so the payload is handed over
    // as `never`.
    listeners[name] = (event) => listener(event as never);
  });
  speech.isRecognitionAvailable.mockReturnValue(true);
  speech.getPermissionsAsync.mockResolvedValue(GRANTED);
  speech.requestPermissionsAsync.mockResolvedValue(GRANTED);

  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((type: string, handler: (state: AppStateStatus) => void) => {
      if (type === 'change') {
        appStateHandlers.push(handler);
      }
      return {
        remove: () => {
          appStateHandlers = appStateHandlers.filter((h) => h !== handler);
        },
      } as ReturnType<typeof AppState.addEventListener>;
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function renderVoiceInput(onTranscript = jest.fn()) {
  const view = renderHook(() => useVoiceInput({ onTranscript }));
  return { ...view, onTranscript };
}

describe('useVoiceInput', () => {
  describe('availability', () => {
    it('starts idle and available when a recognizer exists', () => {
      const { result } = renderVoiceInput();
      expect(result.current.status).toBe('idle');
      expect(result.current.isAvailable).toBe(true);
      expect(result.current.errorMessage).toBeNull();
    });

    it('reports unavailable without starting when no recognizer exists', async () => {
      speech.isRecognitionAvailable.mockReturnValue(false);
      const { result } = renderVoiceInput();

      expect(result.current.status).toBe('unavailable');
      expect(result.current.isAvailable).toBe(false);
      expect(result.current.errorMessage).toMatch(/not available/i);

      await act(async () => {
        await result.current.start();
      });

      expect(speech.start).not.toHaveBeenCalled();
      expect(result.current.isListening).toBe(false);
    });

    it('treats a throwing availability check as unavailable and reports it', () => {
      speech.isRecognitionAvailable.mockImplementation(() => {
        throw new Error('no native module');
      });
      const { result } = renderVoiceInput();

      expect(result.current.status).toBe('unavailable');
      expect(reportErrorMock).toHaveBeenCalled();
    });
  });

  describe('permissions', () => {
    it('requests permission only when it is not already granted', async () => {
      const { result } = renderVoiceInput();
      await act(async () => {
        await result.current.start();
      });

      expect(speech.getPermissionsAsync).toHaveBeenCalled();
      expect(speech.requestPermissionsAsync).not.toHaveBeenCalled();
      expect(speech.start).toHaveBeenCalledWith(
        expect.objectContaining({ interimResults: true, lang: 'en-US' })
      );
    });

    it('marks itself denied and does not start when permission is refused', async () => {
      speech.getPermissionsAsync.mockResolvedValue(DENIED);
      speech.requestPermissionsAsync.mockResolvedValue(DENIED);
      const { result } = renderVoiceInput();

      await act(async () => {
        await result.current.start();
      });

      expect(speech.requestPermissionsAsync).toHaveBeenCalled();
      expect(speech.start).not.toHaveBeenCalled();
      expect(result.current.status).toBe('denied');
      expect(result.current.isAvailable).toBe(false);
      expect(result.current.errorMessage).toMatch(/settings/i);
    });

    it('does not throw when the permission call rejects', async () => {
      speech.getPermissionsAsync.mockRejectedValue(new Error('permission bridge died'));
      const { result } = renderVoiceInput();

      await act(async () => {
        await expect(result.current.start()).resolves.toBeUndefined();
      });

      expect(result.current.status).toBe('error');
      expect(reportErrorMock).toHaveBeenCalled();
    });
  });

  describe('transcripts', () => {
    it('exposes interim text and emits only the final transcript', async () => {
      const { result, onTranscript } = renderVoiceInput();
      await act(async () => {
        await result.current.start();
      });

      fireEvent('start');
      expect(result.current.isListening).toBe(true);
      expect(result.current.status).toBe('listening');

      fireEvent('result', { isFinal: false, results: [{ transcript: 'add a scene', confidence: 0, segments: [] }] });
      expect(result.current.interimTranscript).toBe('add a scene');
      expect(onTranscript).not.toHaveBeenCalled();

      fireEvent('result', { isFinal: true, results: [{ transcript: '  add a scene at the end  ', confidence: 1, segments: [] }] });
      expect(onTranscript).toHaveBeenCalledWith('add a scene at the end');
      expect(result.current.interimTranscript).toBe('');
    });

    it('ignores an empty final result', async () => {
      const { result, onTranscript } = renderVoiceInput();
      await act(async () => {
        await result.current.start();
      });
      fireEvent('start');
      fireEvent('result', { isFinal: true, results: [{ transcript: '   ', confidence: 0, segments: [] }] });

      expect(onTranscript).not.toHaveBeenCalled();
    });

    it('returns to idle on the native end event', async () => {
      const { result } = renderVoiceInput();
      await act(async () => {
        await result.current.start();
      });
      fireEvent('start');
      fireEvent('end');

      expect(result.current.status).toBe('idle');
      expect(result.current.isListening).toBe(false);
    });
  });

  describe('errors', () => {
    it('maps not-allowed to denied', async () => {
      const { result } = renderVoiceInput();
      await act(async () => {
        await result.current.start();
      });
      fireEvent('start');
      fireEvent('error', { error: 'not-allowed', message: 'denied' });

      expect(result.current.status).toBe('denied');
      expect(result.current.isAvailable).toBe(false);
    });

    it('maps service-not-allowed to unavailable', async () => {
      const { result } = renderVoiceInput();
      await act(async () => {
        await result.current.start();
      });
      fireEvent('start');
      fireEvent('error', { error: 'service-not-allowed', message: 'no service' });

      expect(result.current.status).toBe('unavailable');
    });

    it('treats no-speech as a normal end without reporting', async () => {
      const { result } = renderVoiceInput();
      await act(async () => {
        await result.current.start();
      });
      fireEvent('start');
      fireEvent('error', { error: 'no-speech', message: 'nothing heard' });

      expect(result.current.status).toBe('idle');
      expect(result.current.errorMessage).toBeNull();
      expect(reportErrorMock).not.toHaveBeenCalled();
    });

    it('reports a genuine failure and surfaces its message', async () => {
      const { result } = renderVoiceInput();
      await act(async () => {
        await result.current.start();
      });
      fireEvent('start');
      fireEvent('error', { error: 'network', message: 'network is down' });

      expect(result.current.status).toBe('error');
      expect(result.current.errorMessage).toBe('network is down');
      expect(reportErrorMock).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ source: 'useVoiceInput.event' })
      );
    });
  });

  describe('teardown', () => {
    it('stops on request and clears the recording state immediately', async () => {
      const { result } = renderVoiceInput();
      await act(async () => {
        await result.current.start();
      });
      fireEvent('start');

      act(() => {
        result.current.stop();
      });

      expect(speech.stop).toHaveBeenCalled();
      expect(result.current.isListening).toBe(false);
      expect(result.current.interimTranscript).toBe('');
    });

    it('does nothing when stop is called while idle', () => {
      const { result } = renderVoiceInput();
      act(() => {
        result.current.stop();
      });
      expect(speech.stop).not.toHaveBeenCalled();
    });

    it('aborts when the app goes to the background', async () => {
      const { result } = renderVoiceInput();
      await act(async () => {
        await result.current.start();
      });
      fireEvent('start');

      await waitFor(() => expect(appStateHandlers.length).toBeGreaterThan(0));
      act(() => {
        appStateHandlers.forEach((handler) => handler('background'));
      });

      expect(speech.abort).toHaveBeenCalled();
      expect(result.current.isListening).toBe(false);
    });

    it('aborts when the consumer unmounts while listening', async () => {
      const { result, unmount } = renderVoiceInput();
      await act(async () => {
        await result.current.start();
      });
      fireEvent('start');

      unmount();

      expect(speech.abort).toHaveBeenCalled();
    });

    it('does not abort on unmount when it was never listening', () => {
      const { unmount } = renderVoiceInput();
      unmount();
      expect(speech.abort).not.toHaveBeenCalled();
    });
  });
});
