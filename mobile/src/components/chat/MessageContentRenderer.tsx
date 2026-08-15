/**
 * Component for rendering different types of message content (text, images, videos, audio).
 * Adapted from web/src/components/chat/message/MessageContentRenderer.tsx
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { MediaPlayerView } from '../media/MediaPlayerView';
import { MessageContent } from '../../types/ApiTypes';
import { useTheme } from '../../hooks/useTheme';
import { useResolvedMediaUri } from '../../hooks/useResolvedMediaUri';

/**
 * Media is sized to the bubble's content box, derived from the live window width
 * (`useWindowDimensions` re-renders on rotation and split view — a module-level
 * `Dimensions.get` does not) using the same geometry MessageView lays the bubble
 * out with: the row's horizontal padding, the bubble's 85% cap, and the bubble's
 * own horizontal padding. The old `screenWidth * 0.7` ignored all three and was
 * wider than the bubble's content box on narrow phones.
 */
const ROW_HORIZONTAL_PADDING = 28; // MessageView styles.container paddingHorizontal 14 * 2
const BUBBLE_MAX_WIDTH_RATIO = 0.85; // MessageView styles.bubble maxWidth
const BUBBLE_HORIZONTAL_PADDING = 28; // MessageView styles.bubble paddingHorizontal 14 * 2
const MAX_MEDIA_HEIGHT = 360;
const FALLBACK_ASPECT_RATIO = 4 / 3;
const VIDEO_ASPECT_RATIO = 16 / 9;

const mediaWidthFor = (windowWidth: number): number =>
  Math.max(
    120,
    Math.floor(
      (windowWidth - ROW_HORIZONTAL_PADDING) * BUBBLE_MAX_WIDTH_RATIO -
        BUBBLE_HORIZONTAL_PADDING
    )
  );

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
  const { width: windowWidth } = useWindowDimensions();
  const mediaWidth = mediaWidthFor(windowWidth);
  // Persisted chat media is sanitized to `asset://<asset_id>`, which no native
  // loader can fetch — each branch's ref resolves through the asset's own
  // `get_url`. Hooks run unconditionally, so all three resolve here.
  const media = content as Partial<
    Record<'image' | 'audio' | 'video', { uri?: string; asset_id?: string }>
  >;
  const imageUri = useResolvedMediaUri(media.image);
  const audioUri = useResolvedMediaUri(media.audio);
  const videoUri = useResolvedMediaUri(media.video);

  switch (content.type) {
    case 'text': {
      const textContent = content.text ?? '';
      return <>{renderTextContent(textContent, index)}</>;
    }

    case 'image_url': {
      if (!imageUri) {
        return <Text style={[styles.errorText, { color: colors.textSecondary }]}>Unable to load image</Text>;
      }
      return (
        <View style={[styles.mediaContainer, { maxWidth: mediaWidth }]}>
          <MessageImage uri={imageUri} maxWidth={mediaWidth} />
        </View>
      );
    }

    case 'audio': {
      if (!audioUri) {
        return <Text style={[styles.errorText, { color: colors.textSecondary }]}>Unable to load audio</Text>;
      }
      return (
        <View style={[styles.audioContainer, { width: mediaWidth, backgroundColor: colors.surface }]}>
          <AudioPlayer uri={audioUri} colors={colors} />
        </View>
      );
    }

    case 'video': {
      if (!videoUri) {
        return <Text style={[styles.errorText, { color: colors.textSecondary }]}>Unable to load video</Text>;
      }
      return (
        <View style={[styles.mediaContainer, { width: mediaWidth }]}>
          <MediaPlayerView uri={videoUri} style={[styles.video, { width: mediaWidth }]} />
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
 * Image sized to its own aspect ratio inside the width the bubble allows, with
 * the height capped. Both edges are computed from the ratio, so a portrait image
 * gets a portrait box instead of being letterboxed inside a landscape one. The
 * ratio is only known once the source reports its dimensions, so it starts on a
 * landscape fallback and settles on load.
 */
const MessageImage: React.FC<{ uri: string; maxWidth: number }> = ({ uri, maxWidth }) => {
  const [aspectRatio, setAspectRatio] = useState(FALLBACK_ASPECT_RATIO);

  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      uri,
      (naturalWidth, naturalHeight) => {
        if (!cancelled && naturalWidth > 0 && naturalHeight > 0) {
          setAspectRatio(naturalWidth / naturalHeight);
        }
      },
      // A source that cannot be measured keeps the fallback ratio; the <Image>
      // below reports its own failure.
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const width = Math.min(maxWidth, MAX_MEDIA_HEIGHT * aspectRatio);
  const height = width / aspectRatio;

  return (
    <Image
      source={{ uri }}
      style={[styles.image, { width, height }]}
      resizeMode="contain"
      accessibilityLabel="Image content"
    />
  );
};

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

const styles = StyleSheet.create({
  mediaContainer: {
    maxWidth: '100%',
    marginVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  image: {
    borderRadius: 8,
  },
  video: {
    maxWidth: '100%',
    aspectRatio: VIDEO_ASPECT_RATIO,
    maxHeight: MAX_MEDIA_HEIGHT,
    borderRadius: 8,
  },
  audioContainer: {
    maxWidth: '100%',
    marginVertical: 8,
    borderRadius: 8,
    padding: 12,
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
    maxWidth: '100%',
    marginVertical: 8,
    borderRadius: 8,
    padding: 12,
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
