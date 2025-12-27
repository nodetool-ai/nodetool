/**
 * Chat composer component with input field, send button, and file attachments.
 * Handles message composition, file attachments, and sending.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MessageContent, ChatStatus } from '../../types';
import { DroppedFile } from '../../types/chat.types';
import { useTheme } from '../../hooks/useTheme';
import { useFileHandling } from '../../hooks/useFileHandling';
import { FilePreview } from './FilePreview';

interface ChatComposerProps {
  status: ChatStatus;
  onSendMessage: (content: MessageContent[], text: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  /** Called when attachment button is pressed - parent should handle file picker */
  onAttachmentPress?: () => void;
  /** External files that were picked (allows parent to control file picking) */
  externalFiles?: DroppedFile[];
  /** Callback when external files change (for parent to clear them after send) */
  onExternalFilesChange?: (files: DroppedFile[]) => void;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  status,
  onSendMessage,
  onStop,
  disabled = false,
  onAttachmentPress,
  externalFiles,
  onExternalFilesChange,
}) => {
  const [text, setText] = useState('');
  const { colors } = useTheme();
  const { droppedFiles, addDroppedFiles, removeFile, clearFiles, getFileContents } = useFileHandling();

  // Use external files if provided, otherwise use internal state
  const files = externalFiles ?? droppedFiles;
  const hasFiles = files.length > 0;

  const isGenerating = status === 'loading' || status === 'streaming';
  const isDisconnected = status === 'disconnected' || status === 'connecting';
  const canSend = !disabled && !isDisconnected && (text.trim().length > 0 || hasFiles);

  const handleSend = useCallback(() => {
    if (!canSend) return;

    const trimmedText = text.trim();
    const content: MessageContent[] = [];

    // Add file contents first
    if (hasFiles) {
      const fileContents = getFileContents();
      content.push(...fileContents);
    }

    // Add text content if present
    if (trimmedText) {
      content.push({
        type: 'text',
        text: trimmedText,
      } as MessageContent);
    }

    onSendMessage(content, trimmedText);
    setText('');
    
    // Clear files
    if (externalFiles && onExternalFilesChange) {
      onExternalFilesChange([]);
    } else {
      clearFiles();
    }
    
    Keyboard.dismiss();
  }, [canSend, text, hasFiles, getFileContents, onSendMessage, externalFiles, onExternalFilesChange, clearFiles]);

  const handleStop = useCallback(() => {
    onStop?.();
  }, [onStop]);

  const handleRemoveFile = useCallback((index: number) => {
    if (externalFiles && onExternalFilesChange) {
      const newFiles = externalFiles.filter((_, i) => i !== index);
      onExternalFilesChange(newFiles);
    } else {
      removeFile(index);
    }
  }, [externalFiles, onExternalFilesChange, removeFile]);

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
      {/* File previews */}
      {hasFiles && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filePreviewContainer}
          contentContainerStyle={styles.filePreviewContent}
        >
          {files.map((file, index) => (
            <FilePreview
              key={`${file.name}-${index}`}
              file={file}
              onRemove={() => handleRemoveFile(index)}
            />
          ))}
        </ScrollView>
      )}

      <View style={[styles.inputContainer, { backgroundColor: inputContainerBg }]}>
        {/* Attachment button */}
        {onAttachmentPress && (
          <TouchableOpacity
            style={styles.attachButton}
            onPress={onAttachmentPress}
            disabled={isDisconnected || disabled}
            accessibilityLabel="Attach file"
            accessibilityRole="button"
          >
            <Ionicons 
              name="add-circle-outline" 
              size={24} 
              color={isDisconnected || disabled ? colors.textSecondary : colors.primary} 
            />
          </TouchableOpacity>
        )}

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
  filePreviewContainer: {
    marginBottom: 8,
  },
  filePreviewContent: {
    paddingRight: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 20,
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 4,
    minHeight: 44,
  },
  attachButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
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
