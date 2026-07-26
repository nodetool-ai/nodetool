/**
 * Read-only timeline viewer.
 *
 * The sequence is shown, never edited: a phone cannot place a cut accurately
 * and cannot supervise a render, so `kinds.ts` opens timelines as a `viewer`
 * surface and this screen never calls `save()`. What it does offer is the two
 * things a phone is good for — looking at what a sequence contains, and asking
 * the assistant about it, which is why the header links to Chat and why the
 * screen registers an agent handler for the `ui_timeline_*` tools.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import { documentStore } from '../documents/documentStore';
import { registerDocumentHandler, setFocusedDocument } from '../documents/agentBridge';
import { clearUiSelection, setUiSelection } from '../documents/uiContext';
import {
  clipToNode,
  resolveClip,
  timelineDurationMs,
  trackToNode,
  type TimelineAgentHandler,
  type TimelineClipData,
  type TimelineClipStatus,
  type TimelineDocument,
  type TimelineMediaType,
  type TimelineTrackData,
  type TimelineTrackType,
} from '../documents/timelineTypes';
import type { ThemeColors } from '../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TimelineViewer'>;

const TRACK_HEADER_WIDTH = 108;
const RULER_HEIGHT = 34;
const LANE_HEIGHT = 56;
const MIN_PX_PER_SECOND = 2;
const MAX_PX_PER_SECOND = 240;
const DEFAULT_PX_PER_SECOND = 20;
const ZOOM_FACTOR = 2;
/** Empty room after the last clip, so the sequence end is reachable. */
const TAIL_MS = 2000;

/** Tick spacings, coarsest that still leaves ~64px between labels wins. */
const TICK_STEPS_MS = [
  250, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000,
  600_000,
];

const TRACK_ICONS: Record<TimelineTrackType, keyof typeof Ionicons.glyphMap> = {
  video: 'videocam-outline',
  audio: 'musical-notes-outline',
  overlay: 'layers-outline',
  subtitle: 'text-outline',
};

function formatTime(ms: number): string {
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

export default function TimelineViewerScreen({ navigation, route }: Props) {
  const { id, name } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const store = useMemo(() => documentStore<TimelineDocument>('timeline', id), [id]);
  const doc = store((state) => state.doc);
  const docName = store((state) => state.name);
  const status = store((state) => state.status);
  const error = store((state) => state.error);
  const load = store((state) => state.load);

  const [pxPerSecond, setPxPerSecond] = useState(DEFAULT_PX_PER_SECOND);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const title = docName || name || 'Timeline';

  useEffect(() => {
    // Re-read on every open: the store is cached for the app's lifetime, so a
    // sequence edited on desktop since it was last viewed here would otherwise
    // keep showing the stale cut. Nothing local can be lost — this is a viewer.
    void load();
  }, [store, load]);

  const tracks = useMemo<TimelineTrackData[]>(
    () => [...(doc?.tracks ?? [])].sort((a, b) => a.index - b.index),
    [doc]
  );
  const clips = useMemo<TimelineClipData[]>(() => doc?.clips ?? [], [doc]);
  const markers = useMemo(() => doc?.markers ?? [], [doc]);
  const durationMs = useMemo(() => timelineDurationMs(clips), [clips]);

  const trackNameOf = useCallback(
    (trackId: string): string | null =>
      tracks.find((track) => track.id === trackId)?.name ?? null,
    [tracks]
  );

  const handler = useMemo<TimelineAgentHandler>(() => {
    const selectedClipIds = selectedClipId ? [selectedClipId] : [];
    const node = (clip: TimelineClipData) => clipToNode(clip, trackNameOf(clip.trackId));
    return {
      getSnapshot: () => ({
        sequenceId: id,
        title,
        durationMs,
        trackCount: tracks.length,
        clipCount: clips.length,
        playheadMs,
        selectedClipIds,
        tracks: tracks.map((track) =>
          trackToNode(
            track,
            clips.filter((clip) => clip.trackId === track.id).length
          )
        ),
        clips: clips.map(node),
        markers: markers.map((marker) => ({
          id: marker.id,
          timeMs: marker.timeMs,
          label: marker.label,
        })),
      }),
      getClip: (target) => node(resolveClip(clips, target, selectedClipIds)),
      selectClip: (target) => {
        if (target === null || target === '') {
          setSelectedClipId(null);
          return null;
        }
        const clip = resolveClip(clips, target, selectedClipIds);
        setSelectedClipId(clip.id);
        return node(clip);
      },
      seek: (timeMs) => {
        const clamped = Math.max(0, Math.min(timeMs, durationMs));
        setPlayheadMs(clamped);
        return clamped;
      },
    };
  }, [clips, durationMs, id, markers, playheadMs, selectedClipId, title, trackNameOf, tracks]);

  useEffect(
    () => registerDocumentHandler('timeline', id, title, handler),
    [handler, id, title]
  );

  // Claim focus and publish the selection on focus, but release neither on
  // blur. Navigating to Chat blurs this screen, and the chat turn is the one
  // moment `ui_context` is read — clearing here would drop both the focused
  // document and the selected clip exactly when the user asks about them.
  useFocusEffect(
    useCallback(() => {
      setFocusedDocument('timeline', id);
      setUiSelection({ clipIds: selectedClipId ? [selectedClipId] : [] });
    }, [id, selectedClipId])
  );

  // Unmount is what makes the claim stale, so the release belongs here.
  useEffect(() => clearUiSelection, []);

  const openChat = useCallback(() => navigation.navigate('Chat'), [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerRight: () => (
        <TouchableOpacity
          onPress={openChat}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Ask the assistant about this sequence"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.headerButton}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      ),
    });
  }, [colors.text, navigation, openChat, title]);

  const msToPx = useCallback(
    (ms: number): number => (ms / 1000) * pxPerSecond,
    [pxPerSecond]
  );

  const contentWidth = Math.max(msToPx(durationMs + TAIL_MS), 320);
  const tickMs = chooseTickMs(pxPerSecond);
  const ticks = useMemo(() => {
    const out: number[] = [];
    const end = durationMs + TAIL_MS;
    for (let at = 0; at <= end; at += tickMs) {
      out.push(at);
    }
    return out;
  }, [durationMs, tickMs]);

  const seekAt = useCallback(
    (event: GestureResponderEvent) => {
      const x = event.nativeEvent.locationX;
      setPlayheadMs(Math.max(0, Math.min((x / pxPerSecond) * 1000, durationMs)));
    },
    [durationMs, pxPerSecond]
  );

  const zoomOut = useCallback(
    () => setPxPerSecond((current) => Math.max(current / ZOOM_FACTOR, MIN_PX_PER_SECOND)),
    []
  );
  const zoomIn = useCallback(
    () => setPxPerSecond((current) => Math.min(current * ZOOM_FACTOR, MAX_PX_PER_SECOND)),
    []
  );

  const selectedClip = clips.find((clip) => clip.id === selectedClipId) ?? null;

  if (doc === null && status === 'loading') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.centeredText, { color: colors.textSecondary }]}>
          Loading timeline…
        </Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.error} />
        <Text style={[styles.centeredText, { color: colors.text }]}>
          {error ?? 'Failed to load this timeline.'}
        </Text>
        <TouchableOpacity
          onPress={() => void load()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Retry loading timeline"
          style={[styles.retryButton, { backgroundColor: colors.primaryMuted }]}
        >
          <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingBottom: insets.bottom },
      ]}
    >
      <View style={[styles.toolbar, { borderBottomColor: colors.borderLight }]}>
        <Text style={[styles.toolbarText, { color: colors.textSecondary }]}>
          {`${formatTime(durationMs)} · ${tracks.length} tracks · ${clips.length} clips`}
        </Text>
        <View style={styles.toolbarActions}>
          <Text style={[styles.playheadReadout, { color: colors.text }]}>
            {formatTime(playheadMs)}
          </Text>
          <TouchableOpacity
            onPress={zoomOut}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Zoom out"
            style={styles.zoomButton}
          >
            <Ionicons name="remove-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={zoomIn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Zoom in"
            style={styles.zoomButton}
          >
            <Ionicons name="add-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {clips.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="film-outline" size={36} color={colors.textTertiary} />
          <Text style={[styles.centeredText, { color: colors.textSecondary }]}>
            This sequence has no clips yet.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.verticalContent}>
          <View style={styles.lanesRow}>
            {/* Track headers stay put while the lanes scroll. */}
            <View
              style={[
                styles.trackHeaderColumn,
                { borderRightColor: colors.border, backgroundColor: colors.surface },
              ]}
            >
              <View style={styles.rulerSpacer} />
              {tracks.map((track) => (
                <View
                  key={track.id}
                  style={[styles.trackHeader, { borderTopColor: colors.borderLight }]}
                >
                  <Ionicons
                    name={TRACK_ICONS[track.type]}
                    size={15}
                    color={colors.textSecondary}
                  />
                  <Text
                    style={[styles.trackHeaderText, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {track.name}
                  </Text>
                  {track.muted === true && (
                    <Ionicons
                      name="volume-mute-outline"
                      size={13}
                      color={colors.textTertiary}
                    />
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

                {tracks.map((track) => (
                  <TouchableOpacity
                    key={track.id}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Seek on track ${track.name}`}
                    onPress={seekAt}
                    style={[styles.lane, { borderTopColor: colors.borderLight }]}
                  >
                    {clips
                      .filter((clip) => clip.trackId === track.id)
                      .map((clip) => (
                        <TouchableOpacity
                          key={clip.id}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={`Clip ${clip.name}, ${clip.mediaType}, ${formatTime(clip.startMs)} to ${formatTime(clip.startMs + clip.durationMs)}`}
                          onPress={() => setSelectedClipId(clip.id)}
                          style={[
                            styles.clip,
                            {
                              left: msToPx(clip.startMs),
                              width: Math.max(msToPx(clip.durationMs), 8),
                              backgroundColor: mediaColor(clip.mediaType, colors),
                              borderColor:
                                clip.id === selectedClipId
                                  ? colors.primary
                                  : statusColor(clip.status, colors),
                              borderWidth: clip.id === selectedClipId ? 2 : 1,
                            },
                          ]}
                        >
                          <Text
                            style={[styles.clipText, { color: colors.text }]}
                            numberOfLines={1}
                          >
                            {clip.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                  </TouchableOpacity>
                ))}

                <View
                  pointerEvents="none"
                  style={[
                    styles.playhead,
                    {
                      left: msToPx(playheadMs),
                      height: RULER_HEIGHT + tracks.length * LANE_HEIGHT,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      )}

      {selectedClip && (
        <View
          style={[
            styles.detailPanel,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
          ]}
        >
          <View style={styles.detailHeader}>
            <Text style={[styles.detailTitle, { color: colors.text }]} numberOfLines={1}>
              {selectedClip.name}
            </Text>
            <TouchableOpacity
              onPress={() => setSelectedClipId(null)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close clip details"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <DetailRow
            label="Time"
            value={`${formatTime(selectedClip.startMs)} – ${formatTime(
              selectedClip.startMs + selectedClip.durationMs
            )} (${formatTime(selectedClip.durationMs)})`}
            colors={colors}
          />
          <DetailRow label="Media" value={selectedClip.mediaType} colors={colors} />
          <DetailRow label="Status" value={selectedClip.status} colors={colors} />
          <DetailRow
            label="Track"
            value={trackNameOf(selectedClip.trackId) ?? selectedClip.trackId}
            colors={colors}
          />
          {selectedClip.model !== undefined && (
            <DetailRow
              label="Model"
              value={
                selectedClip.provider !== undefined
                  ? `${selectedClip.provider} / ${selectedClip.model}`
                  : selectedClip.model
              }
              colors={colors}
            />
          )}
          {selectedClip.prompt !== undefined && (
            <DetailRow label="Prompt" value={selectedClip.prompt} colors={colors} />
          )}
          <DetailRow
            label="Versions"
            value={String(selectedClip.versions.length)}
            colors={colors}
          />
        </View>
      )}
    </View>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
  colors: ThemeColors;
}

function DetailRow({ label, value, colors }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  centeredText: {
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  headerButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarText: {
    fontSize: 12,
  },
  toolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playheadReadout: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    marginRight: 4,
  },
  zoomButton: {
    padding: 6,
  },
  verticalContent: {
    paddingBottom: 12,
  },
  lanesRow: {
    flexDirection: 'row',
  },
  trackHeaderColumn: {
    width: TRACK_HEADER_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  rulerSpacer: {
    height: RULER_HEIGHT,
  },
  trackHeader: {
    height: LANE_HEIGHT,
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
    height: LANE_HEIGHT,
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
  detailPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  detailTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  detailRow: {
    flexDirection: 'row',
    gap: 8,
  },
  detailLabel: {
    width: 72,
    fontSize: 12,
  },
  detailValue: {
    flex: 1,
    fontSize: 12,
  },
});
