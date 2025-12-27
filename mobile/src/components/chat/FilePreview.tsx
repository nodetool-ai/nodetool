/**
 * FilePreview component for displaying attached files before sending.
 * Adapted from web/src/components/chat/composer/FilePreview.tsx
 */

import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DroppedFile } from '../../types/chat.types';
import { useTheme } from '../../hooks/useTheme';

/**
 * Check if a data URI is a valid base64 image
 */
const isValidImageDataUri = (uri: string): boolean =>
  /^data:image\/(jpeg|jpg|png|gif|webp);base64,/.test(uri);

interface FilePreviewProps {
  file: DroppedFile;
  onRemove: () => void;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ file, onRemove }) => {
  const { colors } = useTheme();
  const isImage = file.type.startsWith('image/') && isValidImageDataUri(file.dataUri);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {isImage ? (
        <Image
          source={{ uri: file.dataUri }}
          style={styles.imagePreview}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.fileIconWrapper, { backgroundColor: colors.background }]}>
          <Ionicons
            name={getFileIcon(file.type)}
            size={24}
            color={colors.textSecondary}
          />
          <Text
            style={[styles.fileName, { color: colors.text }]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {file.name}
          </Text>
        </View>
      )}
      <TouchableOpacity
        style={styles.removeButton}
        onPress={onRemove}
        accessibilityLabel={`Remove file ${file.name}`}
        accessibilityRole="button"
      >
        <Ionicons name="close-circle" size={20} color="#FF453A" />
      </TouchableOpacity>
    </View>
  );
};

/**
 * Get appropriate icon name based on file MIME type
 */
function getFileIcon(mimeType: string): keyof typeof Ionicons.glyphMap {
  if (mimeType.startsWith('audio/')) {
    return 'musical-notes';
  } else if (mimeType.startsWith('video/')) {
    return 'videocam';
  } else if (mimeType.includes('pdf')) {
    return 'document-text';
  } else {
    return 'document';
  }
}

const styles = StyleSheet.create({
  container: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  fileIconWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
    borderRadius: 8,
  },
  fileName: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
    width: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 10,
  },
});

export default FilePreview;
