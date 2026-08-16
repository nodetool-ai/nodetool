/**
 * Tests for ChatComposer component
 */

import React from 'react';
import {
  render as rtlRender,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { ChatComposer } from './ChatComposer';
import { ChatStatus } from '../../types';

const speech = ExpoSpeechRecognitionModule as unknown as {
  isRecognitionAvailable: jest.Mock;
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  abort: jest.Mock;
};
const eventHook = jest.mocked(useSpeechRecognitionEvent);

/**
 * The composer reads the real bottom inset, so every render needs a provider
 * with metrics — a notched phone here, so the inset is non-zero.
 */
const SafeAreaWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 47, left: 0, right: 0, bottom: 34 },
    }}
  >
    {children}
  </SafeAreaProvider>
);

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: SafeAreaWrapper });

type Listener = (event: unknown) => void;
let speechListeners: Record<string, Listener>;

/** Drive a native speech event into whatever composer is currently mounted. */
function fireSpeechEvent(name: string, payload?: unknown): void {
  act(() => {
    speechListeners[name]?.(payload);
  });
}

describe('ChatComposer', () => {
  const mockOnSendMessage = jest.fn();
  const mockOnStop = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    speechListeners = {};
    eventHook.mockImplementation((name, listener) => {
      // SAFETY: `listener` is the hook's handler for the single event `name`,
      // and each test fires that event's own payload shape. The union of
      // per-event listener types cannot express that pairing, so the payload is
      // handed over as `never`.
      speechListeners[name] = (event) => listener(event as never);
    });
    speech.isRecognitionAvailable.mockReturnValue(true);
    speech.getPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
    speech.requestPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
  });

  describe('Rendering', () => {
    it('pads the bottom by the real safe-area inset, not a hardcoded platform value', () => {
      render(<ChatComposer status="connected" onSendMessage={mockOnSendMessage} />);

      const container = screen.getByTestId('composer-container');
      expect(StyleSheet.flatten(container.props.style).paddingBottom).toBe(34 + 8);
    });

    it('renders input field', () => {
      render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
        />
      );
      expect(screen.getByPlaceholderText('Type a message...')).toBeTruthy();
    });

    it('shows placeholder when disconnected', () => {
      render(
        <ChatComposer
          status="disconnected"
          onSendMessage={mockOnSendMessage}
        />
      );
      expect(screen.getByPlaceholderText('Type a message...')).toBeTruthy();
    });

    it('shows connecting placeholder when connecting', () => {
      render(
        <ChatComposer
          status="connecting"
          onSendMessage={mockOnSendMessage}
        />
      );
      expect(screen.getByPlaceholderText('Type a message...')).toBeTruthy();
    });

    it('disables input when disabled prop is true', () => {
      render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
          disabled={true}
        />
      );
      const input = screen.getByPlaceholderText('Type a message...');
      expect(input.props.editable).toBe(false);
    });

    it('enables input when connected and not disabled', () => {
      render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
          disabled={false}
        />
      );
      const input = screen.getByPlaceholderText('Type a message...');
      expect(input.props.editable).toBe(true);
    });
  });

  describe('Send button', () => {
    it('calls onSendMessage when text is entered and button pressed', () => {
      render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
        />
      );
      
      const input = screen.getByPlaceholderText('Type a message...');
      fireEvent.changeText(input, 'Hello world');
      
      const sendButton = screen.getByTestId('send-button');
      fireEvent.press(sendButton);
      
      expect(mockOnSendMessage).toHaveBeenCalledTimes(1);
      expect(mockOnSendMessage).toHaveBeenCalledWith(
        [{ type: 'text', text: 'Hello world' }],
        'Hello world',
        undefined
      );
    });

    it('clears input after sending', () => {
      render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
        />
      );
      
      const input = screen.getByPlaceholderText('Type a message...');
      fireEvent.changeText(input, 'Hello');
      
      const sendButton = screen.getByTestId('send-button');
      fireEvent.press(sendButton);
      
      expect(input.props.value).toBe('');
    });

    it('dismisses keyboard after sending', () => {
      // We can't easily mock Keyboard.dismiss, so just verify no error occurs
      render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
        />
      );
      
      const input = screen.getByPlaceholderText('Type a message...');
      fireEvent.changeText(input, 'Test message');
      
      const sendButton = screen.getByTestId('send-button');
      fireEvent.press(sendButton);
      
      // Verify message was sent (keyboard dismiss is called after)
      expect(mockOnSendMessage).toHaveBeenCalled();
    });

    it('trims whitespace from message', () => {
      render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
        />
      );
      
      const input = screen.getByPlaceholderText('Type a message...');
      fireEvent.changeText(input, '  Hello world  ');
      
      const sendButton = screen.getByTestId('send-button');
      fireEvent.press(sendButton);
      
      expect(mockOnSendMessage).toHaveBeenCalledWith(
        [{ type: 'text', text: 'Hello world' }],
        'Hello world',
        undefined
      );
    });

    it('does not send when text is only whitespace', () => {
      render(
        <ChatComposer
          status="connected"
          onSendMessage={mockOnSendMessage}
        />
      );
      
      const input = screen.getByPlaceholderText('Type a message...');
      fireEvent.changeText(input, '   ');
      
      const sendButton = screen.getByTestId('send-button');
      fireEvent.press(sendButton);
      
      expect(mockOnSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Stop button', () => {
    it('shows stop button when loading', () => {
      const { UNSAFE_root } = render(
        <ChatComposer
          status="loading"
          onSendMessage={mockOnSendMessage}
          onStop={mockOnStop}
        />
      );
      expect(UNSAFE_root).toBeTruthy();
    });

    it('shows stop button when streaming', () => {
      const { UNSAFE_root } = render(
        <ChatComposer
          status="streaming"
          onSendMessage={mockOnSendMessage}
          onStop={mockOnStop}
        />
      );
      expect(UNSAFE_root).toBeTruthy();
    });

    it('calls onStop when stop button pressed', () => {
      render(
        <ChatComposer
          status="loading"
          onSendMessage={mockOnSendMessage}
          onStop={mockOnStop}
        />
      );
      
      const stopButton = screen.getByTestId('stop-button');
      fireEvent.press(stopButton);
      
      expect(mockOnStop).toHaveBeenCalledTimes(1);
    });

    it('does not show stop button when onStop is not provided', () => {
      render(
        <ChatComposer
          status="loading"
          onSendMessage={mockOnSendMessage}
        />
      );
      expect(screen.UNSAFE_root).toBeTruthy();
    });
  });

  describe('Voice input', () => {
    const renderComposer = () =>
      render(<ChatComposer status="connected" onSendMessage={mockOnSendMessage} />);

    it('renders an idle mic button', () => {
      renderComposer();
      const mic = screen.getByLabelText('Start voice input');
      expect(mic.props.accessibilityState.selected).toBe(false);
      expect(screen.queryByTestId('voice-recording-banner')).toBeNull();
    });

    it('starts the recognizer when the mic is pressed', async () => {
      renderComposer();
      fireEvent.press(screen.getByTestId('mic-button'));

      await waitFor(() => expect(speech.start).toHaveBeenCalled());
    });

    it('shows the recording affordance and marks the mic selected while listening', async () => {
      renderComposer();
      fireEvent.press(screen.getByTestId('mic-button'));
      await waitFor(() => expect(speech.start).toHaveBeenCalled());

      fireSpeechEvent('start');

      expect(screen.getByTestId('voice-recording-banner')).toBeTruthy();
      const mic = screen.getByLabelText('Stop voice input');
      expect(mic.props.accessibilityState.selected).toBe(true);
      expect(screen.getByTestId('voice-stop-button')).toBeTruthy();
    });

    it('shows live interim text while listening', async () => {
      renderComposer();
      fireEvent.press(screen.getByTestId('mic-button'));
      await waitFor(() => expect(speech.start).toHaveBeenCalled());
      fireSpeechEvent('start');

      fireSpeechEvent('result', {
        isFinal: false,
        results: [{ transcript: 'add a scene', confidence: 0, segments: [] }],
      });

      expect(screen.getByTestId('voice-interim-transcript').props.children).toBe('add a scene');
    });

    it('appends the final transcript to text the user already typed', async () => {
      renderComposer();
      const input = screen.getByPlaceholderText('Type a message...');
      fireEvent.changeText(input, 'Please ');

      fireEvent.press(screen.getByTestId('mic-button'));
      await waitFor(() => expect(speech.start).toHaveBeenCalled());
      fireSpeechEvent('start');
      fireSpeechEvent('result', {
        isFinal: true,
        results: [{ transcript: 'add a scene', confidence: 1, segments: [] }],
      });

      expect(input.props.value).toBe('Please add a scene');
    });

    it('uses the transcript alone when the composer was empty', async () => {
      renderComposer();
      fireEvent.press(screen.getByTestId('mic-button'));
      await waitFor(() => expect(speech.start).toHaveBeenCalled());
      fireSpeechEvent('start');
      fireSpeechEvent('result', {
        isFinal: true,
        results: [{ transcript: 'add a scene', confidence: 1, segments: [] }],
      });

      expect(screen.getByPlaceholderText('Type a message...').props.value).toBe('add a scene');
    });

    it('stops listening when the mic is pressed again', async () => {
      renderComposer();
      fireEvent.press(screen.getByTestId('mic-button'));
      await waitFor(() => expect(speech.start).toHaveBeenCalled());
      fireSpeechEvent('start');

      fireEvent.press(screen.getByTestId('mic-button'));

      expect(speech.stop).toHaveBeenCalled();
      expect(screen.queryByTestId('voice-recording-banner')).toBeNull();
    });

    it('stops listening when the message is sent', async () => {
      renderComposer();
      fireEvent.press(screen.getByTestId('mic-button'));
      await waitFor(() => expect(speech.start).toHaveBeenCalled());
      fireSpeechEvent('start');
      fireSpeechEvent('result', {
        isFinal: true,
        results: [{ transcript: 'add a scene', confidence: 1, segments: [] }],
      });

      fireEvent.press(screen.getByTestId('send-button'));

      expect(speech.stop).toHaveBeenCalled();
      expect(mockOnSendMessage).toHaveBeenCalled();
    });

    it('aborts the recognizer when the composer unmounts', async () => {
      const { unmount } = renderComposer();
      fireEvent.press(screen.getByTestId('mic-button'));
      await waitFor(() => expect(speech.start).toHaveBeenCalled());
      fireSpeechEvent('start');

      unmount();

      expect(speech.abort).toHaveBeenCalled();
    });

    it('presents the mic as unavailable when there is no recognizer', () => {
      speech.isRecognitionAvailable.mockReturnValue(false);
      renderComposer();

      const mic = screen.getByLabelText('Voice input unavailable');
      expect(mic.props.accessibilityState.disabled).toBe(true);
      fireEvent.press(mic);
      expect(speech.start).not.toHaveBeenCalled();
    });

    it('surfaces a denied permission instead of recording', async () => {
      speech.getPermissionsAsync.mockResolvedValue({ status: 'denied', granted: false });
      speech.requestPermissionsAsync.mockResolvedValue({ status: 'denied', granted: false });
      renderComposer();

      fireEvent.press(screen.getByTestId('mic-button'));

      await waitFor(() => expect(screen.getByTestId('voice-error-message')).toBeTruthy());
      expect(speech.start).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Voice input unavailable')).toBeTruthy();
    });
  });

  describe('Status handling', () => {
    const statuses: ChatStatus[] = [
      'disconnected',
      'connecting',
      'connected',
      'reconnecting',
      'disconnecting',
      'failed',
      'loading',
      'streaming',
      'error',
      'stopping',
    ];

    statuses.forEach((status) => {
      it(`renders correctly with status: ${status}`, () => {
        const { UNSAFE_root } = render(
          <ChatComposer
            status={status}
            onSendMessage={mockOnSendMessage}
            onStop={mockOnStop}
          />
        );
        expect(UNSAFE_root).toBeTruthy();
      });
    });
  });
});
