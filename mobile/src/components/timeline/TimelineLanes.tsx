/**
 * The track-lanes drawing of a timeline: a fixed column of track headers, and
 * beside it one horizontal scroller holding the ruler, a lane per track with its
 * clips, the markers, and the playhead.
 *
 * Shared by `TimelineViewerScreen` and the inline timeline preview in chat. The
 * viewer passes `onSeek` and `onSelectClip`, which make the lanes and clips
 * tappable; the preview passes neither and gets a static drawing. Nothing here
 * edits the document: timelines are view only on mobile.
 */

import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../hooks/useTheme';
import type {
  TimelineClipData,
  TimelineClipStatus,
  TimelineMarkerData,
  TimelineMediaType,
  TimelineTrackData,
  TimelineTrackType,
} from '../../documents/timelineTypes';
import type { ThemeColors } from '../../utils/theme';

export const TRACK_HEADER_WIDTH = 108;
export const RULER_HEIGHT = 34;
export const LANE_HEIGHT = 56;
/** Empty room after the last clip, so the sequence end is reachable. */
export const TAIL_MS = 2000;

/** Tick spacings, coarsest that still leaves ~64px between labels wins. */
const TICK_STEPS_MS = [
  250, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000,
  600_000,
];

const TRACK_ICONS = {
  video: 'videocam-outline',
  audio: 'musical-notes-outline',
  overlay: 'layers-outline',
  subtitle: 'text-outline',
  midi: 'musical-notes-outline',
} satisfies Record<TimelineTrackType, keyof typeof Ionicons.glyphMap>;

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mmss = `${minutes.toString().padStart(hours > 0 ? 2 : 1, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}

function chooseTickMs(pxPerSecond: number): number {
  const step = TICK_STEPS_MS.find((candidate) => (candidate / 1000) * pxPerSecond >= 64);
  return step ?? TICK_STEPS_MS[TICK_STEPS_MS.length - 1];
}

/** The zoom that fits the whole sequence, tail included, into `width` pixels. */
export function fitPxPerSecond(
  width: number,
  durationMs: number,
  headerWidth = TRACK_HEADER_WIDTH
): number {
  const laneWidth = Math.max(width - headerWidth, 1);
  return laneWidth / (Math.max(durationMs + TAIL_MS, 1) / 1000);
}

/** Tracks in their document order. */
export function sortTracks(tracks: readonly TimelineTrackData[]): TimelineTrackData[] {
  return [...tracks].sort((a, b) => a.index - b.index);
}

function mediaColor(mediaType: TimelineMediaType, colors: ThemeColors): string {
  switch (mediaType) {
    case 'video':
      return colors.primaryMuted;
    case 'audio':
      return colors.accentMuted;
    case 'image':
      return colors.primaryLight;
    case 'text':
    case 'overlay':
    case 'shape':
    default:
      return colors.surfaceElevated;
  }
}

function statusColor(status: TimelineClipStatus, colors: ThemeColors): string {
  switch (status) {
    case 'failed':
    case 'missing':
      return colors.error;
    case 'queued':
    case 'generating':
      return colors.warning;
    case 'generated':
      return colors.success;
    case 'stale':
      return colors.info;
    default:
      return colors.border;
  }
}

export interface TimelineLanesProps {
  /** Tracks in display order (see `sortTracks`). */
  tracks: readonly TimelineTrackData[];
  clips: readonly TimelineClipData[];
  markers?: readonly TimelineMarkerData[];
  durationMs: number;
  pxPerSecond: number;
  /** Omitted: no playhead is drawn. */
  playheadMs?: number;
  selectedClipId?: string | null;
  /** Makes each lane tappable; called with the tapped time. */
  onSeek?: (ms: number) => void;
  /** Makes each clip tappable. */
  onSelectClip?: (clipId: string) => void;
  laneHeight?: number;
  headerWidth?: number;
  /** Floor for the scrolled width, so a short sequence still has room to tap. */
  minContentWidth?: number;
}

export function TimelineLanes({
  tracks,
  clips,
  markers = [],
  durationMs,
  pxPerSecond,
  playheadMs,
  selectedClipId = null,
  onSeek,
  onSelectClip,
  laneHeight = LANE_HEIGHT,
  headerWidth = TRACK_HEADER_WIDTH,
  minContentWidth = 320,
}: TimelineLanesProps) {
  const { colors } = useTheme();

  const msToPx = (ms: number): number => (ms / 1000) * pxPerSecond;
  const contentWidth = Math.max(msToPx(durationMs + TAIL_MS), minContentWidth);
  const tickMs = chooseTickMs(pxPerSecond);
  const ticks: number[] = [];
  for (let at = 0; at <= durationMs + TAIL_MS; at += tickMs) {
    ticks.push(at);
  }

  const seekAt = (event: GestureResponderEvent) => {
    const x = event.nativeEvent.locationX;
    onSeek?.(Math.max(0, Math.min((x / pxPerSecond) * 1000, durationMs)));
  };

  return (
    <View style={styles.lanesRow}>
      {/* Track headers stay put while the lanes scroll. */}
      <View
        style={[
          styles.trackHeaderColumn,
          { width: headerWidth, borderRightColor: colors.border, backgroundColor: colors.surface },
        ]}
      >
        <View style={styles.rulerSpacer} />
        {tracks.map((track) => (
          <View
            key={track.id}
            style={[
              styles.trackHeader,
              { height: laneHeight, borderTopColor: colors.borderLight },
            ]}
          >
            <Ionicons name={TRACK_ICONS[track.type]} size={15} color={colors.textSecondary} />
            <Text style={[styles.trackHeaderText, { color: colors.text }]} numberOfLines={1}>
              {track.name}
            </Text>
            {track.muted === true && (
              <Ionicons name="volume-mute-outline" size={13} color={colors.textTertiary} />
            )}
          </View>
        ))}
      </View>

      {/* Ruler and lanes share one scroller so they cannot desync. */}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ width: contentWidth }}>
          <View style={[styles.ruler, { borderBottomColor: colors.border }]}>
            {ticks.map((at) => (
              <View key={at} style={[styles.tick, { left: msToPx(at) }]}>
                <View style={[styles.tickMark, { backgroundColor: colors.border }]} />
                <Text style={[styles.tickLabel, { color: colors.textTertiary }]}>
                  {formatTime(at)}
                </Text>
              </View>
            ))}
            {markers.map((marker) => (
              <View
                key={marker.id}
                accessibilityLabel={`Marker ${marker.label} at ${formatTime(marker.timeMs)}`}
                style={[
                  styles.marker,
                  { left: msToPx(marker.timeMs), backgroundColor: marker.color ?? colors.warning },
                ]}
              />
            ))}
          </View>

          {tracks.map((track) => {
            const laneStyle = [
              styles.lane,
              { height: laneHeight, borderTopColor: colors.borderLight },
            ];
            const laneClips = clips
              .filter((clip) => clip.trackId === track.id)
              .map((clip) => {
                const selected = clip.id === selectedClipId;
                const clipStyle = [
                  styles.clip,
                  {
                    left: msToPx(clip.startMs),
                    width: Math.max(msToPx(clip.durationMs), 4),
                    backgroundColor: mediaColor(clip.mediaType, colors),
                    borderColor: selected ? colors.primary : statusColor(clip.status, colors),
                    borderWidth: selected ? 2 : 1,
                  },
                ];
                const label = `Clip ${clip.name}, ${clip.mediaType}, ${formatTime(clip.startMs)} to ${formatTime(clip.startMs + clip.durationMs)}`;
                const text = (
                  <Text style={[styles.clipText, { color: colors.text }]} numberOfLines={1}>
                    {clip.name}
                  </Text>
                );
                return onSelectClip ? (
                  <TouchableOpacity
                    key={clip.id}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    onPress={() => onSelectClip(clip.id)}
                    style={clipStyle}
                  >
                    {text}
                  </TouchableOpacity>
                ) : (
                  <View key={clip.id} accessibilityLabel={label} style={clipStyle}>
                    {text}
                  </View>
                );
              });
            return onSeek ? (
              <TouchableOpacity
                key={track.id}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Seek on track ${track.name}`}
                onPress={seekAt}
                style={laneStyle}
              >
                {laneClips}
              </TouchableOpacity>
            ) : (
              <View key={track.id} style={laneStyle}>
                {laneClips}
              </View>
            );
          })}

          {playheadMs !== undefined && (
            <View
              pointerEvents="none"
              style={[
                styles.playhead,
                {
                  left: msToPx(playheadMs),
                  height: RULER_HEIGHT + tracks.length * laneHeight,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  lanesRow: {
    flexDirection: 'row',
  },
  trackHeaderColumn: {
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  rulerSpacer: {
    height: RULER_HEIGHT,
  },
  trackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  trackHeaderText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  ruler: {
    height: RULER_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tick: {
    position: 'absolute',
    top: 0,
    alignItems: 'flex-start',
  },
  tickMark: {
    width: StyleSheet.hairlineWidth,
    height: 8,
  },
  tickLabel: {
    fontSize: 10,
    paddingLeft: 2,
  },
  marker: {
    position: 'absolute',
    bottom: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  lane: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  clip: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    borderRadius: 6,
    justifyContent: 'center',
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  clipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  playhead: {
    position: 'absolute',
    top: 0,
    width: 2,
  },
});
