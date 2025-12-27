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
import { Ionicons } from '@expo/vector-icons';
import { MessageContent, ChatStatus } from '../../types';
import { useTheme } from '../../hooks/useTheme';

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
  const { colors } = useTheme();

  const isGenerating = status === 'loading' || status === 'streaming';
  const isDisconnected = status === 'disconnected' || status === 'connecting';
  const canSend = !disabled && !isDisconnected && text.trim().length > 0;

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

  const inputContainerBg = (colors.background === '#FAF7F2' || colors.background === '#FFFFFF')
    ? 'rgba(0,0,0,0.05)'
    : 'rgba(255, 255, 255, 0.08)';

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceHeader, borderTopColor: colors.border }]}>
      <View style={[styles.inputContainer, { backgroundColor: inputContainerBg }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={text}
          onChangeText={setText}
          placeholder={getPlaceholder()}
          placeholderTextColor={colors.textSecondary}
          multiline
          maxLength={10000}
          editable={!isDisconnected && !disabled}
          autoCorrect={true}
          autoCapitalize="sentences"
        />
        
        {isGenerating && onStop ? (
          <TouchableOpacity
            style={[styles.button, styles.stopButton]}
            onPress={handleStop}
            activeOpacity={0.7}
          >
            <Ionicons name="square" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: colors.primary },
              !canSend && styles.buttonDisabled,
            ]}
            onPress={handleSend}
            disabled={!canSend}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-up" size={24} color="#FFFFFF" />
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
    borderTopWidth: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 20,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 4,
    minHeight: 44,
  },
  input: {
    flex: 1,
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
  stopButton: {
    backgroundColor: '#FF453A',
  },
  buttonDisabled: {
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    opacity: 0.5,
  },
});

export default ChatComposer;
