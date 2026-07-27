/**
 * Video/audio playback surface backed by expo-video.
 *
 * `useVideoPlayer` is a hook, so callers that render media conditionally must
 * go through this component rather than calling it inside a branch.
 */

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

interface MediaPlayerViewProps {
  uri: string;
  style?: StyleProp<ViewStyle>;
  /** Hides the native transport controls. */
  nativeControls?: boolean;
}

export const MediaPlayerView: React.FC<MediaPlayerViewProps> = ({
  uri,
  style,
  nativeControls = true,
}) => {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });

  return (
    <VideoView
      player={player}
      style={style}
      contentFit="contain"
      nativeControls={nativeControls}
    />
  );
};

export default MediaPlayerView;
