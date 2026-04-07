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
  Modal,
  Text,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
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
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const { colors, shadows } = useTheme();
  const { droppedFiles, addDroppedFiles, removeFile, clearFiles, getFileContents } = useFileHandling();

  const files = externalFiles ?? droppedFiles;
  const hasFiles = files.length > 0;

  const isGenerating = status === 'loading' || status === 'streaming';
  const canSend = !disabled && (text.trim().length > 0 || hasFiles);

  const handleSend = useCallback(() => {
    if (!canSend) {return;}

    const trimmedText = text.trim();
    const content: MessageContent[] = [];

    if (hasFiles) {
      const fileContents = getFileContents();
      content.push(...fileContents);
    }

    if (trimmedText) {
      content.push({
        type: 'text',
        text: trimmedText,
      } as MessageContent);
    }

    onSendMessage(content, trimmedText);
    setText('');

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

  const addFilesToState = useCallback((newFiles: DroppedFile[]) => {
    if (externalFiles && onExternalFilesChange) {
      onExternalFilesChange([...externalFiles, ...newFiles]);
    } else {
      addDroppedFiles(newFiles);
    }
  }, [externalFiles, onExternalFilesChange, addDroppedFiles]);

  const handleAttachmentPress = useCallback(() => {
    if (onAttachmentPress) {
      onAttachmentPress();
    } else {
      setShowAttachmentMenu(true);
    }
  }, [onAttachmentPress]);

  const handleTakePhoto = useCallback(async () => {
    setShowAttachmentMenu(false);

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is needed to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const fileName = asset.fileName || `photo_${Date.now()}.jpg`;
      const droppedFile: DroppedFile = {
        name: fileName,
        type: asset.mimeType || 'image/jpeg',
        size: asset.fileSize || 0,
        uri: asset.uri,
      };
      addFilesToState([droppedFile]);
    }
  }, [addFilesToState]);

  const handlePickImage = useCallback(async () => {
    setShowAttachmentMenu(false);

    await new Promise(resolve => setTimeout(resolve, 300));

    let { status } = await ImagePicker.getMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
      status = result.status;
    }

    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Photo library access is needed to select photos.');
      return;
    }

    if (Platform.OS === 'ios' && __DEV__) {
      console.warn('[handlePickImage] iOS Simulator detected - image picker may hang without photos');
    }
    try {
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 0.8,
        base64: true,
      };
      const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (!result.canceled && result.assets.length > 0) {
        const newFiles: DroppedFile[] = result.assets.map((asset) => {
          const mimeType = asset.mimeType || 'image/jpeg';
          const dataUri = asset.base64
            ? `data:${mimeType};base64,${asset.base64}`
            : undefined;

          const file: DroppedFile = {
            name: asset.fileName || `media_${Date.now()}.${mimeType.split('/')[1] || 'jpg'}`,
            type: mimeType,
            size: asset.fileSize || 0,
            uri: asset.uri,
            dataUri: dataUri,
          };
          return file;
        });
        addFilesToState(newFiles);
      }
    } catch (error) {
      console.error('[handlePickImage] Error launching picker:', error);
    }
  }, [addFilesToState]);

  const handlePickDocument = useCallback(async () => {
    setShowAttachmentMenu(false);

    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newFiles: DroppedFile[] = result.assets.map((asset) => ({
        name: asset.name,
        type: asset.mimeType || 'application/octet-stream',
        size: asset.size || 0,
        uri: asset.uri,
      }));
      addFilesToState(newFiles);
    }
  }, [addFilesToState]);

  const inputContainerBg = (colors.background === '#F8F6F3' || colors.background === '#FFFFFF')
    ? 'rgba(0,0,0,0.04)'
    : 'rgba(255, 255, 255, 0.06)';

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceHeader, borderTopColor: colors.borderLight }]}>
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
        <TouchableOpacity
          style={styles.attachButton}
          onPress={handleAttachmentPress}
          disabled={disabled}
          accessibilityLabel="Attach file"
          accessibilityRole="button"
        >
          <Ionicons
            name="add-circle-outline"
            size={24}
            color={disabled ? colors.textTertiary : colors.textSecondary}
          />
        </TouchableOpacity>

        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={10000}
          editable={!disabled}
          autoCorrect={true}
          autoCapitalize="sentences"
        />

        {isGenerating && onStop ? (
          <TouchableOpacity
            style={[styles.button, styles.stopButton]}
            onPress={handleStop}
            activeOpacity={0.7}
            testID="stop-button"
          >
            <Ionicons name="square" size={14} color="#FFFFFF" />
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
            testID="send-button"
          >
            <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Attachment Menu Modal */}
      <Modal
        visible={showAttachmentMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAttachmentMenu(false)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowAttachmentMenu(false)}
          />

          <View style={[styles.attachmentMenu, shadows.large, { backgroundColor: colors.surface }]}>
            <View style={[styles.menuHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.attachmentMenuTitle, { color: colors.text }]}>
              Add Attachment
            </Text>

            <TouchableOpacity
              style={[styles.attachmentMenuItem, { backgroundColor: colors.primaryLight }]}
              onPress={handleTakePhoto}
              activeOpacity={0.7}
            >
              <View style={[styles.attachmentMenuIcon, { backgroundColor: colors.primaryMuted }]}>
                <Ionicons name="camera" size={22} color={colors.primary} />
              </View>
              <Text style={[styles.attachmentMenuText, { color: colors.text }]}>
                Take Photo
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.attachmentMenuItem, { backgroundColor: colors.primaryLight }]}
              onPress={handlePickImage}
              activeOpacity={0.7}
            >
              <View style={[styles.attachmentMenuIcon, { backgroundColor: colors.primaryMuted }]}>
                <Ionicons name="images" size={22} color={colors.primary} />
              </View>
              <Text style={[styles.attachmentMenuText, { color: colors.text }]}>
                Photo Library
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.attachmentMenuItem, { backgroundColor: colors.primaryLight }]}
              onPress={handlePickDocument}
              activeOpacity={0.7}
            >
              <View style={[styles.attachmentMenuIcon, { backgroundColor: colors.primaryMuted }]}>
                <Ionicons name="document" size={22} color={colors.primary} />
              </View>
              <Text style={[styles.attachmentMenuText, { color: colors.text }]}>
                Choose File
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.attachmentMenuCancel, { backgroundColor: colors.background }]}
              onPress={() => setShowAttachmentMenu(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.attachmentMenuCancelText, { color: colors.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  filePreviewContainer: {
    marginBottom: 8,
  },
  filePreviewContent: {
    paddingRight: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    paddingLeft: 6,
    paddingRight: 4,
    paddingVertical: 4,
    minHeight: 44,
  },
  attachButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    maxHeight: 120,
    minHeight: 42,
    paddingVertical: 8,
    paddingRight: 8,
  },
  button: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#FF453A',
  },
  buttonDisabled: {
    backgroundColor: 'rgba(128, 128, 128, 0.15)',
    opacity: 0.5,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  attachmentMenu: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  attachmentMenuTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  attachmentMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 6,
  },
  attachmentMenuIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  attachmentMenuText: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  attachmentMenuCancel: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  attachmentMenuCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ChatComposer;
