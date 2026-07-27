/**
 * Component for rendering different types of message content (text, images, videos, audio).
 * Adapted from web/src/components/chat/message/MessageContentRenderer.tsx
 */

import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { MediaPlayerView } from '../media/MediaPlayerView';
import { MessageContent } from '../../types/ApiTypes';
import { useTheme } from '../../hooks/useTheme';
import { apiService } from '../../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_MEDIA_WIDTH = SCREEN_WIDTH * 0.7;

interface MessageContentRendererProps {
  content: MessageContent;
  renderTextContent: (text: string, index: number) => React.ReactNode;
  index: number;
}

export const MessageContentRenderer: React.FC<MessageContentRendererProps> = React.memo(({
  content,
  renderTextContent,
  index,
}) => {
  const { colors } = useTheme();

  switch (content.type) {
    case 'text': {
      const textContent = content.text ?? '';
      return <>{renderTextContent(textContent, index)}</>;
    }

    case 'image_url': {
      const imageUri = getMediaUri(content.image);
      if (!imageUri) {
        return <Text style={[styles.errorText, { color: colors.textSecondary }]}>Unable to load image</Text>;
      }
      return (
        <View style={styles.mediaContainer}>
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel="Image content"
          />
        </View>
      );
    }

    case 'audio': {
      const audioUri = getMediaUri(content.audio);
      if (!audioUri) {
        return <Text style={[styles.errorText, { color: colors.textSecondary }]}>Unable to load audio</Text>;
      }
      return (
        <View style={[styles.audioContainer, { backgroundColor: colors.surface }]}>
          <AudioPlayer uri={audioUri} colors={colors} />
        </View>
      );
    }

    case 'video': {
      const videoUri = getMediaUri(content.video);
      if (!videoUri) {
        return <Text style={[styles.errorText, { color: colors.textSecondary }]}>Unable to load video</Text>;
      }
      return (
        <View style={styles.mediaContainer}>
          <MediaPlayerView uri={videoUri} style={styles.video} />
        </View>
      );
    }

    case 'document': {
      return (
        <View style={[styles.documentContainer, { backgroundColor: colors.surface }]}>
          <Text style={[styles.documentText, { color: colors.text }]}>
            📄 Document attached
          </Text>
        </View>
      );
    }

    default:
      return null;
  }
});

MessageContentRenderer.displayName = "MessageContentRenderer";

/**
 * Simple audio player component
 */
interface AudioPlayerProps {
  uri: string;
  colors: { text: string; textSecondary: string; surface: string; primary: string };
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ uri, colors }) => {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);

  const isPlaying = status.playing;
  const position = status.didJustFinish ? 0 : status.currentTime;
  const duration = status.duration;

  const togglePlayback = () => {
    if (isPlaying) {
      player.pause();
      return;
    }
    if (status.didJustFinish) {
      player.seekTo(0);
    }
    player.play();
  };

  const formatTime = (seconds: number): string => {
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const rest = totalSeconds % 60;
    return `${minutes}:${rest.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.audioPlayerContainer}>
      <TouchableOpacity 
        style={styles.playButton}
        onPress={togglePlayback}
        accessible
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause audio' : 'Play audio'}
      >
        <Text style={[styles.playButtonText, { color: colors.primary }]}>
          {isPlaying ? '⏸' : '▶'}
        </Text>
      </TouchableOpacity>
      <View style={styles.audioInfo}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: duration > 0 ? `${(position / duration) * 100}%` : '0%',
                backgroundColor: colors.primary,
              },
            ]}
          />
        </View>
        <Text style={[styles.timeText, { color: colors.textSecondary }]}>
          {formatTime(position)} / {formatTime(duration)}
        </Text>
      </View>
    </View>
  );
};

/**
 * Extract URI from media content object
 */
function getMediaUri(
  media: { uri?: string; data?: unknown; type?: string } | undefined
): string | undefined {
  if (!media) {return undefined;}
  
  // If URI exists and is not empty, resolve it against the API host
  if (media.uri && media.uri !== '') {
    return apiService.resolveUrl(media.uri) ?? undefined;
  }
  
  // For binary data, we would need to convert to base64
  // This is typically handled server-side for mobile
  return undefined;
}

const styles = StyleSheet.create({
  mediaContainer: {
    marginVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
    maxWidth: MAX_MEDIA_WIDTH,
  },
  image: {
    width: MAX_MEDIA_WIDTH,
    height: 200,
    borderRadius: 8,
  },
  video: {
    width: MAX_MEDIA_WIDTH,
    height: 200,
    borderRadius: 8,
  },
  audioContainer: {
    marginVertical: 8,
    borderRadius: 8,
    padding: 12,
    maxWidth: MAX_MEDIA_WIDTH,
  },
  audioPlayerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  playButtonText: {
    fontSize: 20,
  },
  audioInfo: {
    flex: 1,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(128, 128, 128, 0.3)',
    borderRadius: 2,
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  timeText: {
    fontSize: 11,
  },
  documentContainer: {
    marginVertical: 8,
    borderRadius: 8,
    padding: 12,
    maxWidth: MAX_MEDIA_WIDTH,
  },
  documentText: {
    fontSize: 14,
  },
  errorText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginVertical: 8,
  },
});

export default MessageContentRenderer;
