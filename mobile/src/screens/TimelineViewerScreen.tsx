/**
 * Timeline viewer, edited by the agent.
 *
 * Direct manipulation stays off: placing a cut accurately with a thumb is not
 * possible at phone width, so `kinds.ts` opens timelines as a `viewer` surface —
 * no drag, no trim handles, no clip editing by touch. What the phone is good at
 * is the other half: looking at what a sequence contains, and saying "move the
 * title card two seconds later". So this screen registers the agent handler the
 * `ui_timeline_*` tools write through, and owns the Save button for the result.
 *
 * The handler mutates the same `documentStore` the render reads, so an agent edit
 * repaints the screen the user is holding, and `ui_timeline_save` is the same
 * code path as pressing Save.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import EditorHeaderActions from '../components/EditorHeaderActions';
import { documentStore } from '../documents/documentStore';
import {
  registerDocumentHandler,
  setDocumentTitle,
  setFocusedDocument,
} from '../documents/agentBridge';
import { clearUiSelection, setUiSelection } from '../documents/uiContext';
import * as edits from '../documents/timelineEdits';
import {
  clipToNode,
  resolveClip,
  timelineDurationMs,
  trackToNode,
  type TimelineAgentHandler,
  type TimelineClipData,
  type TimelineClipNode,
  type TimelineClipStatus,
  type TimelineDocument,
  type TimelineMediaType,
  type TimelineSnapshot,
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

/**
 * Width the title cannot have: the back button plus the actions (chat bubble,
 * gap, Save) plus the gutters around them.
 */
const HEADER_RESERVED_WIDTH = 164;

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
} satisfies Record<TimelineTrackType, keyof typeof Ionicons.glyphMap>;

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
  const { doc, docName, dirty, status, error } = store(
    useShallow((state) => ({
      doc: state.doc,
      docName: state.name,
      dirty: state.dirty,
      status: state.status,
      error: state.error,
    }))
  );

  const [pxPerSecond, setPxPerSecond] = useState(DEFAULT_PX_PER_SECOND);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  // The agent handler runs outside React, so it reads live selection and
  // playhead from refs rather than a stale render closure.
  const selectedRef = useRef<string | null>(null);
  const playheadRef = useRef(0);
  const select = useCallback((next: string | null) => {
    selectedRef.current = next;
    setSelectedClipId(next);
  }, []);
  const movePlayhead = useCallback((next: number) => {
    playheadRef.current = next;
    setPlayheadMs(next);
  }, []);

  // The store's actions live in its state, so every caller goes through
  // getState() — including the agent handler.
  const runLoad = useCallback(() => void store.getState().load(), [store]);
  const runSave = useCallback(() => store.getState().save(), [store]);
  const runRevert = useCallback(() => void store.getState().revert(), [store]);

  const title = docName || name || 'Timeline';

  useEffect(() => {
    // Re-read on every open: the store is cached for the app's lifetime, so a
    // sequence edited on desktop since it was last viewed here would otherwise
    // keep showing a stale cut. Unsaved agent edits are the one thing worth
    // keeping over a fresh read.
    if (!store.getState().dirty) {
      runLoad();
    }
  }, [store, runLoad]);

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

  // ── Agent handler ────────────────────────────────────────────────────────
  useEffect(() => {
    /** The live document. Reading it per call keeps a batch of edits coherent. */
    const requireDoc = (): TimelineDocument => {
      const current = store.getState().doc;
      if (current === null) {
        throw new Error(
          `Timeline "${id}" has not finished loading. Retry in a moment.`
        );
      }
      return current;
    };

    const selectedIds = (): string[] =>
      selectedRef.current ? [selectedRef.current] : [];

    const trackNameIn = (
      current: TimelineDocument,
      trackId: string
    ): string | null =>
      current.tracks.find((track) => track.id === trackId)?.name ?? null;

    const node = (
      current: TimelineDocument,
      clip: TimelineClipData
    ): TimelineClipNode => clipToNode(clip, trackNameIn(current, clip.trackId));

    /** Apply a pure edit, write it to the store, and project the result. */
    const apply = <T,>(
      run: (current: TimelineDocument) => {
        doc: TimelineDocument;
        result: T;
      }
    ): T => {
      const outcome = run(requireDoc());
      store.getState().edit(() => outcome.doc);
      return outcome.result;
    };

    const applyClips = (
      run: (current: TimelineDocument) => {
        doc: TimelineDocument;
        clips: TimelineClipData[];
      }
    ): TimelineClipNode[] =>
      apply((current) => {
        const next = run(current);
        return {
          doc: next.doc,
          result: next.clips.map((clip) => node(next.doc, clip)),
        };
      });

    const snapshot = (): TimelineSnapshot => {
      const state = store.getState();
      const current = state.doc;
      const currentTracks = [...(current?.tracks ?? [])].sort(
        (a, b) => a.index - b.index
      );
      const currentClips = current?.clips ?? [];
      // The agent snapshots after every tool call, and a full sequence is
      // hundreds of clips over dozens of tracks — so index both lists once
      // instead of scanning one per element of the other.
      const clipCountByTrack = new Map<string, number>();
      for (const clip of currentClips) {
        clipCountByTrack.set(
          clip.trackId,
          (clipCountByTrack.get(clip.trackId) ?? 0) + 1
        );
      }
      const trackNameById = new Map(
        currentTracks.map((track) => [track.id, track.name])
      );
      return {
        sequenceId: id,
        title: state.name || name || 'Timeline',
        durationMs: timelineDurationMs(currentClips),
        trackCount: currentTracks.length,
        clipCount: currentClips.length,
        playheadMs: playheadRef.current,
        selectedClipIds: selectedIds(),
        dirty: state.dirty,
        tracks: currentTracks.map((track) =>
          trackToNode(track, clipCountByTrack.get(track.id) ?? 0)
        ),
        clips: currentClips.map((clip) =>
          clipToNode(clip, trackNameById.get(clip.trackId) ?? null)
        ),
        markers: (current?.markers ?? []).map((marker) => ({
          id: marker.id,
          timeMs: marker.timeMs,
          label: marker.label,
        })),
        transcript: (current?.transcript ?? []).map((line) => ({
          id: line.id,
          text: line.text,
          clipIds: line.clipIds,
        })),
      };
    };

    const handler: TimelineAgentHandler = {
      getSnapshot: snapshot,

      getClip: (target) => {
        const current = requireDoc();
        return node(current, resolveClip(current.clips, target, selectedIds()));
      },

      selectClip: (target) => {
        if (target === null || target === '') {
          select(null);
          return null;
        }
        const current = requireDoc();
        const clip = resolveClip(current.clips, target, selectedIds());
        select(clip.id);
        return node(current, clip);
      },

      seek: (timeMs) => {
        const clamped = Math.max(
          0,
          Math.min(timeMs, timelineDurationMs(requireDoc().clips))
        );
        movePlayhead(clamped);
        return clamped;
      },

      addTrack: (type, trackName) =>
        apply((current) => {
          const next = edits.addTrack(current, type, trackName);
          return { doc: next.doc, result: trackToNode(next.track, 0) };
        }),

      addTextClip: (input) =>
        apply((current) => {
          const next = edits.addTextClip(current, input);
          return { doc: next.doc, result: node(next.doc, next.clip) };
        }),

      addShapeClip: (input) =>
        apply((current) => {
          const next = edits.addShapeClip(current, input);
          return { doc: next.doc, result: node(next.doc, next.clip) };
        }),

      moveClip: (target, patch) =>
        applyClips((current) => edits.moveClip(current, target, patch, selectedIds())),

      trimClip: (target, patch) =>
        applyClips((current) => edits.trimClip(current, target, patch, selectedIds())),

      splitClip: (target, atMs) =>
        applyClips((current) =>
          edits.splitClipAt(
            current,
            target,
            atMs ?? Math.round(playheadRef.current),
            selectedIds()
          )
        ),

      deleteClip: (target) =>
        apply((current) => {
          const next = edits.deleteClip(current, target, selectedIds());
          if (selectedRef.current === next.deleted.id) {
            select(null);
          }
          return { doc: next.doc, result: node(next.doc, next.deleted) };
        }),

      duplicateClip: (target, gapMs) =>
        applyClips((current) =>
          edits.duplicateClip(current, target, gapMs ?? 0, selectedIds())
        ),

      setClipParams: (target, patch) =>
        apply((current) => {
          const next = edits.setClipParams(current, target, patch, selectedIds());
          return { doc: next.doc, result: node(next.doc, next.clip) };
        }),

      addMarker: (input) =>
        apply((current) => {
          const next = edits.addMarker(current, input);
          return { doc: next.doc, result: next.marker };
        }),

      deleteMarker: (target) =>
        apply((current) => {
          const next = edits.deleteMarker(current, target);
          return { doc: next.doc, result: next.deleted };
        }),

      rename: (nextName) => {
        store.getState().rename(nextName);
        return { title: nextName };
      },

      save: async () => {
        await runSave();
        const state = store.getState();
        if (state.status === 'conflict' || state.status === 'error') {
          throw new Error(state.error ?? 'Failed to save the timeline.');
        }
        return { ok: true, updatedAt: state.updatedAt };
      },
    };

    return registerDocumentHandler('timeline', id, title, handler);
    // `title` is intentionally excluded: it changes on rename, and
    // re-registering the handler mid-turn is churn the bridge does not need.
    // `setDocumentTitle` below keeps the agent-visible title current instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, id, name, select, movePlayhead, runSave]);

  useEffect(() => {
    if (docName) {
      setDocumentTitle('timeline', id, docName);
    }
  }, [docName, id]);

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
  const handleSave = useCallback(() => void runSave(), [runSave]);

  // The header lays the title out at its natural width and never shrinks it, so
  // a long sequence name runs under the actions and pushes Save off the screen.
  // Cap the title instead, leaving room for the actions and the back button.
  const { width: windowWidth } = useWindowDimensions();
  const titleMaxWidth = Math.max(96, windowWidth - HEADER_RESERVED_WIDTH);

  useLayoutEffect(() => {
    const saving = status === 'saving';
    navigation.setOptions({
      title,
      headerTitle: ({ children, tintColor }) => (
        <Text
          numberOfLines={1}
          style={[
            styles.headerTitle,
            { maxWidth: titleMaxWidth, color: tintColor ?? colors.text },
          ]}
        >
          {children}
        </Text>
      ),
      headerRight: () => (
        <EditorHeaderActions
          onChat={openChat}
          chatLabel="Ask the assistant to change this sequence"
          onSave={handleSave}
          saveLabel="Save timeline"
          dirty={dirty}
          saving={saving}
        />
      ),
    });
  }, [
    colors.text,
    dirty,
    handleSave,
    navigation,
    openChat,
    status,
    title,
    titleMaxWidth,
  ]);

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
      movePlayhead(Math.max(0, Math.min((x / pxPerSecond) * 1000, durationMs)));
    },
    [durationMs, movePlayhead, pxPerSecond]
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

  // A failure with nothing loaded blocks the screen; a failure with a document
  // in hand (a rejected save) must not hide the edits it failed to persist, so
  // that case falls through to the banner below.
  if (doc === null && status === 'error') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={32} color={colors.error} />
        <Text style={[styles.centeredText, { color: colors.text }]}>
          {error ?? 'Failed to load this timeline.'}
        </Text>
        <TouchableOpacity
          onPress={runLoad}
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
      {status === 'conflict' && (
        <View
          style={[styles.banner, { backgroundColor: colors.warning + '22' }]}
          accessibilityLabel="Timeline changed elsewhere"
        >
          <Ionicons name="git-compare-outline" size={16} color={colors.warning} />
          <Text style={[styles.bannerText, { color: colors.text }]}>
            Someone else saved this sequence. Reload to get their version — the
            unsaved edits here will be lost.
          </Text>
          <TouchableOpacity
            onPress={runRevert}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Reload timeline"
            style={[styles.bannerButton, { backgroundColor: colors.warning }]}
          >
            <Text style={styles.bannerButtonText}>Reload</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'error' && error !== null && (
        <View style={[styles.banner, { backgroundColor: colors.error + '18' }]}>
          <Ionicons name="warning-outline" size={16} color={colors.error} />
          <Text style={[styles.bannerText, { color: colors.error }]}>{error}</Text>
        </View>
      )}

      <View style={[styles.toolbar, { borderBottomColor: colors.borderLight }]}>
        <Text
          style={[styles.toolbarText, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {`${formatTime(durationMs)} · ${tracks.length} tracks · ${clips.length} clips`}
        </Text>
        <View style={styles.toolbarActions}>
          {dirty && (
            <View style={styles.dirtyRow} accessibilityLabel="Unsaved changes">
              <View style={[styles.dirtyDot, { backgroundColor: colors.warning }]} />
              <Text style={[styles.dirtyText, { color: colors.textSecondary }]}>
                Unsaved
              </Text>
            </View>
          )}
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
            This sequence has no clips yet. Clips cannot be arranged by touch at
            this width — ask the assistant to change the sequence, then save.
          </Text>
          <TouchableOpacity
            onPress={openChat}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Ask the assistant"
            style={[styles.retryButton, { backgroundColor: colors.primaryMuted }]}
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>
              Ask the assistant
            </Text>
          </TouchableOpacity>
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
                          onPress={() => select(clip.id)}
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
              onPress={() => select(null)}
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
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
  },
  bannerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  bannerButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  dirtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 6,
  },
  dirtyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dirtyText: {
    fontSize: 11,
    fontWeight: '600',
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
    // Shrinks and truncates so the zoom controls and the playhead readout keep
    // their width on a narrow phone.
    flexShrink: 1,
    marginRight: 8,
    fontSize: 12,
  },
  toolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
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
