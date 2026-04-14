/**
 * Chat composer component with input field, send button, file attachments,
 * and a mode selector for chat / image / video generation.
 */

import React, { useState, useCallback, useMemo } from 'react';
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
import {
  useMediaGenerationStore,
  resolveImageSize,
  IMAGE_ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  IMAGE_VARIATIONS,
  VIDEO_ASPECT_RATIOS,
  VIDEO_RESOLUTIONS,
  VIDEO_DURATIONS,
} from '../../stores/MediaGenerationStore';
import type {
  MediaMode,
  MediaGenerationRequest,
} from '../../stores/MediaGenerationStore';

interface ChatComposerProps {
  status: ChatStatus;
  onSendMessage: (content: MessageContent[], text: string, mediaGeneration?: MediaGenerationRequest) => void;
  onStop?: () => void;
  disabled?: boolean;
  onAttachmentPress?: () => void;
  externalFiles?: DroppedFile[];
  onExternalFilesChange?: (files: DroppedFile[]) => void;
}

const MODE_CONFIG: { mode: MediaMode; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { mode: 'chat', icon: 'chatbubble-outline', label: 'Chat' },
  { mode: 'image', icon: 'image-outline', label: 'Image' },
  { mode: 'video', icon: 'videocam-outline', label: 'Video' },
];

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
  const [showParamMenu, setShowParamMenu] = useState<string | null>(null);
  const { colors, shadows } = useTheme();
  const { droppedFiles, addDroppedFiles, removeFile, clearFiles, getFileContents } = useFileHandling();

  const mode = useMediaGenerationStore((s) => s.mode);
  const setMode = useMediaGenerationStore((s) => s.setMode);
  const imageParams = useMediaGenerationStore((s) => s.image);
  const setImageParams = useMediaGenerationStore((s) => s.setImageParams);
  const videoParams = useMediaGenerationStore((s) => s.video);
  const setVideoParams = useMediaGenerationStore((s) => s.setVideoParams);

  const files = externalFiles ?? droppedFiles;
  const hasFiles = files.length > 0;

  const isGenerating = status === 'loading' || status === 'streaming';
  const isMediaMode = mode === 'image' || mode === 'video';
  const canSend = !disabled && (text.trim().length > 0 || hasFiles);

  const placeholder = useMemo(() => {
    if (mode === 'image') return 'Describe the image you want to generate...';
    if (mode === 'video') return 'Describe the video you want to create...';
    return 'Type a message...';
  }, [mode]);

  const buildMediaGeneration = useCallback((): MediaGenerationRequest | undefined => {
    if (mode === 'chat') return undefined;
    if (mode === 'image') {
      const { width, height } = resolveImageSize(imageParams.resolution, imageParams.aspectRatio);
      return {
        mode: 'image',
        width,
        height,
        aspect_ratio: imageParams.aspectRatio,
        resolution: imageParams.resolution,
        variations: imageParams.variations,
      };
    }
    if (mode === 'video') {
      return {
        mode: 'video',
        aspect_ratio: videoParams.aspectRatio,
        resolution: videoParams.resolution,
        duration: videoParams.duration,
      };
    }
    return undefined;
  }, [mode, imageParams, videoParams]);

  const handleSend = useCallback(() => {
    if (!canSend) return;

    const trimmedText = text.trim();
    const content: MessageContent[] = [];

    if (hasFiles) {
      const fileContents = getFileContents();
      content.push(...fileContents);
    }

    if (trimmedText) {
      content.push({ type: 'text', text: trimmedText } as MessageContent);
    }

    onSendMessage(content, trimmedText, buildMediaGeneration());
    setText('');

    if (externalFiles && onExternalFilesChange) {
      onExternalFilesChange([]);
    } else {
      clearFiles();
    }

    Keyboard.dismiss();
  }, [canSend, text, hasFiles, getFileContents, onSendMessage, buildMediaGeneration, externalFiles, onExternalFilesChange, clearFiles]);

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
      addFilesToState([{
        name: asset.fileName || `photo_${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
        size: asset.fileSize || 0,
        uri: asset.uri,
      }]);
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
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const newFiles: DroppedFile[] = result.assets.map((asset: ImagePicker.ImagePickerAsset) => {
          const mimeType = asset.mimeType || 'image/jpeg';
          return {
            name: asset.fileName || `media_${Date.now()}.${mimeType.split('/')[1] || 'jpg'}`,
            type: mimeType,
            size: asset.fileSize || 0,
            uri: asset.uri,
            dataUri: asset.base64 ? `data:${mimeType};base64,${asset.base64}` : undefined,
          };
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
      const newFiles: DroppedFile[] = result.assets.map((asset: DocumentPicker.DocumentPickerAsset) => ({
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

  const renderParamChip = (
    label: string,
    value: string,
    paramKey: string,
  ) => (
    <TouchableOpacity
      key={paramKey}
      style={[
        styles.paramChip,
        { backgroundColor: colors.primaryLight, borderColor: colors.border },
      ]}
      onPress={() => setShowParamMenu(paramKey)}
      activeOpacity={0.7}
    >
      <Text style={[styles.paramChipLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.paramChipValue, { color: colors.text }]}>{value}</Text>
      <Ionicons name="chevron-down" size={12} color={colors.textTertiary} />
    </TouchableOpacity>
  );

  const renderParamPicker = (
    paramKey: string,
    title: string,
    options: { label: string; value: string | number }[],
    currentValue: string | number,
    onSelect: (value: string | number) => void,
  ) => (
    <Modal
      visible={showParamMenu === paramKey}
      transparent
      animationType="fade"
      onRequestClose={() => setShowParamMenu(null)}
    >
      <View style={styles.paramModalContainer}>
        <TouchableOpacity
          style={styles.paramModalBackdrop}
          activeOpacity={1}
          onPress={() => setShowParamMenu(null)}
        />
        <View style={[styles.paramModalContent, shadows.large, { backgroundColor: colors.surface }]}>
          <Text style={[styles.paramModalTitle, { color: colors.text }]}>{title}</Text>
          <ScrollView style={styles.paramModalScroll}>
            {options.map((opt) => {
              const isSelected = opt.value === currentValue;
              return (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[
                    styles.paramModalOption,
                    isSelected && { backgroundColor: colors.primaryLight },
                  ]}
                  onPress={() => {
                    onSelect(opt.value);
                    setShowParamMenu(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.paramModalOptionText,
                    { color: isSelected ? colors.primary : colors.text },
                    isSelected && { fontWeight: '600' },
                  ]}>
                    {opt.label}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceHeader, borderTopColor: colors.borderLight }]}>
      {/* Mode selector tabs */}
      <View style={styles.modeRow}>
        {MODE_CONFIG.map(({ mode: m, icon, label }) => {
          const isActive = mode === m;
          return (
            <TouchableOpacity
              key={m}
              style={[
                styles.modeTab,
                isActive && { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                !isActive && { borderColor: 'transparent' },
              ]}
              onPress={() => setMode(m)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${label} mode`}
            >
              <Ionicons
                name={icon}
                size={16}
                color={isActive ? colors.primary : colors.textTertiary}
              />
              <Text style={[
                styles.modeTabText,
                { color: isActive ? colors.primary : colors.textTertiary },
                isActive && { fontWeight: '600' },
              ]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Media parameter chips */}
      {mode === 'image' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.paramRow}
          contentContainerStyle={styles.paramRowContent}
        >
          {renderParamChip('Ratio', imageParams.aspectRatio, 'imageAspect')}
          {renderParamChip('Res', imageParams.resolution, 'imageRes')}
          {renderParamChip('Count', String(imageParams.variations), 'imageVariations')}
        </ScrollView>
      )}

      {mode === 'video' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.paramRow}
          contentContainerStyle={styles.paramRowContent}
        >
          {renderParamChip('Ratio', videoParams.aspectRatio, 'videoAspect')}
          {renderParamChip('Res', videoParams.resolution, 'videoRes')}
          {renderParamChip('Duration', `${videoParams.duration}s`, 'videoDuration')}
        </ScrollView>
      )}

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
          placeholder={placeholder}
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
              { backgroundColor: isMediaMode ? '#8B5CF6' : colors.primary },
              !canSend && styles.buttonDisabled,
            ]}
            onPress={handleSend}
            disabled={!canSend}
            activeOpacity={0.7}
            testID="send-button"
          >
            {isMediaMode ? (
              <Ionicons name="sparkles" size={18} color="#FFFFFF" />
            ) : (
              <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Parameter picker modals */}
      {renderParamPicker(
        'imageAspect',
        'Aspect Ratio',
        IMAGE_ASPECT_RATIOS.map((a) => ({ label: a.label, value: a.id })),
        imageParams.aspectRatio,
        (v) => setImageParams({ aspectRatio: v as string }),
      )}
      {renderParamPicker(
        'imageRes',
        'Resolution',
        IMAGE_RESOLUTIONS.map((r) => ({ label: r, value: r })),
        imageParams.resolution,
        (v) => setImageParams({ resolution: v as typeof imageParams.resolution }),
      )}
      {renderParamPicker(
        'imageVariations',
        'Variations',
        IMAGE_VARIATIONS.map((n) => ({ label: `${n}`, value: n })),
        imageParams.variations,
        (v) => setImageParams({ variations: v as number }),
      )}
      {renderParamPicker(
        'videoAspect',
        'Aspect Ratio',
        VIDEO_ASPECT_RATIOS.map((a) => ({ label: a.label, value: a.id })),
        videoParams.aspectRatio,
        (v) => setVideoParams({ aspectRatio: v as string }),
      )}
      {renderParamPicker(
        'videoRes',
        'Resolution',
        VIDEO_RESOLUTIONS.map((r) => ({ label: r, value: r })),
        videoParams.resolution,
        (v) => setVideoParams({ resolution: v as typeof videoParams.resolution }),
      )}
      {renderParamPicker(
        'videoDuration',
        'Duration',
        VIDEO_DURATIONS.map((d) => ({ label: `${d} seconds`, value: d })),
        videoParams.duration,
        (v) => setVideoParams({ duration: v as number }),
      )}

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
  modeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  modeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  paramRow: {
    marginBottom: 8,
  },
  paramRowContent: {
    gap: 6,
  },
  paramChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  paramChipLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  paramChipValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  paramModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paramModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  paramModalContent: {
    width: 260,
    maxHeight: 360,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  paramModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  paramModalScroll: {
    maxHeight: 280,
  },
  paramModalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    marginHorizontal: 4,
    marginVertical: 1,
  },
  paramModalOptionText: {
    fontSize: 15,
    fontWeight: '400',
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
