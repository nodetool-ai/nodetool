/**
 * Chat composer component with input field and send button.
 * Handles message composition and sending.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  Platform,
} from 'react-native';
import { MessageContent, ChatStatus } from '../../types';

// Send icon SVG as a simple Text (you could use a proper icon library)
const SendIcon = () => (
  <View style={styles.sendIcon}>
    <View style={styles.sendArrow} />
  </View>
);

// Stop icon
const StopIcon = () => (
  <View style={styles.stopIcon}>
    <View style={styles.stopSquare} />
  </View>
);

interface ChatComposerProps {
  status: ChatStatus;
  onSendMessage: (content: MessageContent[], text: string) => void;
  onStop?: () => void;
  disabled?: boolean;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  status,
  onSendMessage,
  onStop,
  disabled = false,
}) => {
  const [text, setText] = useState('');

  const isGenerating = status === 'loading' || status === 'streaming';
  const isDisconnected = status === 'disconnected' || status === 'connecting';
  const canSend =
    !disabled &&
    !isDisconnected &&
    text.trim().length > 0;

  const handleSend = useCallback(() => {
    if (!canSend) return;

    const trimmedText = text.trim();
    const content: MessageContent[] = [
      {
        type: 'text',
        text: trimmedText,
      } as MessageContent,
    ];

    onSendMessage(content, trimmedText);
    setText('');
    Keyboard.dismiss();
  }, [canSend, text, onSendMessage]);

  const handleStop = useCallback(() => {
    onStop?.();
  }, [onStop]);

  const getPlaceholder = () => {
    if (isDisconnected) {
      return 'Connecting...';
    }
    return 'Type a message...';
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={getPlaceholder()}
          placeholderTextColor="#808080"
          multiline
          maxLength={10000}
          editable={!isDisconnected && !disabled}
          returnKeyType="default"
          blurOnSubmit={false}
          autoCorrect={true}
          autoCapitalize="sentences"
          spellCheck={true}
        />
        
        {isGenerating && onStop ? (
          <TouchableOpacity
            style={[styles.button, styles.stopButton]}
            onPress={handleStop}
            activeOpacity={0.7}
          >
            <StopIcon />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.button,
              styles.sendButton,
              !canSend && styles.buttonDisabled,
            ]}
            onPress={handleSend}
            disabled={!canSend}
            activeOpacity={0.7}
          >
            <SendIcon />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    backgroundColor: '#1C1C1E',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 4,
    minHeight: 44,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    maxHeight: 120,
    paddingVertical: 8,
    paddingRight: 8,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendButton: {
    backgroundColor: '#0A84FF',
  },
  stopButton: {
    backgroundColor: '#FF453A',
  },
  buttonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    opacity: 0.5,
  },
  sendIcon: {
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
    transform: [{ rotate: '45deg' }],
  },
  stopIcon: {
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopSquare: {
    width: 12,
    height: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
});

export default ChatComposer;
