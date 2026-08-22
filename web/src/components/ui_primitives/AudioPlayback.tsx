/**
 * AudioPlayback
 *
 * The audio half of the media-locator rendering boundary, next to
 * `ResponsiveImage` and `VideoPlayer`. A plain `<audio controls>` — the
 * waveform player in `components/audio/AudioPlayer` is a different thing, for
 * surfaces that need scrubbing over a rendered waveform.
 *
 * Pass `locator` and it resolves the stored locator (`asset://<id>`, an
 * `AudioRef`, any other scheme) before setting `src`; pass `src` and it must
 * already be a `ResolvedMediaUrl`.
 */

import React from "react";
import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import {
  useResolvedMediaUri,
  type MediaLocator
} from "../../hooks/useResolvedMediaUri";
import type { ResolvedMediaUrl } from "../../utils/resolveMediaUri";

export interface AudioPlaybackProps {
  /**
   * A resolved audio URL. Only media resolution mints this type — an
   * `asset://` locator is not one, so pass `locator` instead.
   */
  src?: ResolvedMediaUrl | "";
  /**
   * A stored media locator. Resolved before `src` is set, so a caller never
   * has to. Mutually exclusive with `src`.
   */
  locator?: MediaLocator;
  /** Accessible name for the player. */
  label?: string;
  /** Start playback as soon as the media can play. */
  autoPlay?: boolean;
  /** Loop playback. */
  loop?: boolean;
  className?: string;
  sx?: SxProps<Theme>;
}

/** The rendering half: `src` is already resolved. */
const ResolvedAudio: React.FC<Omit<AudioPlaybackProps, "locator">> = ({
  src,
  label = "Audio player",
  autoPlay = false,
  loop = false,
  className,
  sx
}) => (
  <Box
    component="audio"
    className={className}
    src={src || undefined}
    controls
    preload="metadata"
    autoPlay={autoPlay}
    loop={loop}
    aria-label={label}
    sx={{ width: "100%", ...sx }}
  />
);

ResolvedAudio.displayName = "ResolvedAudio";

/**
 * The locator branch. Split into its own component so plain-URL callers never
 * mount the asset query — the hook needs a `QueryClientProvider`, and a
 * `src`-only caller has nothing to look up.
 */
const LocatorAudio: React.FC<
  Omit<AudioPlaybackProps, "src"> & { locator: MediaLocator }
> = ({ locator, ...rest }) => (
  <ResolvedAudio {...rest} src={useResolvedMediaUri(locator) ?? ""} />
);

LocatorAudio.displayName = "LocatorAudio";

/**
 * @example
 * <AudioPlayback locator={message.audio} label="Generated audio" />
 *
 * @example
 * <AudioPlayback src={resolvedUrl} label="Preview" />
 */
export const AudioPlayback: React.FC<AudioPlaybackProps> = ({
  locator,
  ...rest
}) =>
  locator === undefined ? (
    <ResolvedAudio {...rest} />
  ) : (
    <LocatorAudio {...rest} locator={locator} />
  );

AudioPlayback.displayName = "AudioPlayback";

export default AudioPlayback;
