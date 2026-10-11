/**
 * Timeline viewer. View only.
 *
 * Placing a cut accurately with a thumb is not possible at phone width, so
 * nothing on this screen writes the sequence: no drag, no trim handles, no Save.
 * What the phone is good at is looking — the track lanes, the ruler, zoom, a
 * playhead, and the details of a tapped clip. Edits come from the desktop or web
 * editor, or from the server agent's own timeline tools, and the screen re-reads
 * the document every time it gets focus so those edits show up.
 *
 * The screen still registers with the agent bridge, with no edit handler, so
 * the chat turn's `ui_context` names the sequence the user has open and the
 * clip they selected.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import type { RootStackParamList } from '../navigation/types';
import { HIT_SLOP } from '../utils/tokens';
import { ErrorState, LoadingState } from '../components/ScreenState';
import { useTheme } from '../hooks/useTheme';
import DocumentStatusBanner from '../components/DocumentStatusBanner';
import {
  TimelineLanes,
  formatTime,
  sortTracks,
} from '../components/timeline/TimelineLanes';
import { documentStore } from '../documents/documentStore';
import {
  registerDocumentHandler,
  setDocumentTitle,
  setFocusedDocument,
} from '../documents/agentBridge';
import { clearUiSelection, setUiSelection } from '../documents/uiContext';
import {
  timelineDurationMs,
  type TimelineClipData,
  type TimelineDocument,
} from '../documents/timelineTypes';
import type { ThemeColors } from '../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TimelineViewer'>;

const MIN_PX_PER_SECOND = 2;
const MAX_PX_PER_SECOND = 240;
const DEFAULT_PX_PER_SECOND = 20;
const ZOOM_FACTOR = 2;

/** Width the title cannot have: the back button, the chat action, and gutters. */
const HEADER_RESERVED_WIDTH = 120;

export default function TimelineViewerScreen({ navigation, route }: Props) {
  const { id, name } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const store = useMemo(() => documentStore<TimelineDocument>('timeline', id), [id]);
  const { doc, docName, status, error } = store(
    useShallow((state) => ({
      doc: state.doc,
      docName: state.name,
      status: state.status,
      error: state.error,
    }))
  );

  const [pxPerSecond, setPxPerSecond] = useState(DEFAULT_PX_PER_SECOND);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const runLoad = useCallback(() => void store.getState().load(), [store]);

  const title = docName || name || 'Timeline';

  const tracks = useMemo(() => sortTracks(doc?.tracks ?? []), [doc]);
  const clips = useMemo<TimelineClipData[]>(() => doc?.clips ?? [], [doc]);
  const markers = useMemo(() => doc?.markers ?? [], [doc]);
  const durationMs = useMemo(() => timelineDurationMs(clips), [clips]);

  // Named in `ui_context` while mounted. No edit handler: nothing on the phone
  // writes a timeline.
  useEffect(
    () => registerDocumentHandler('timeline', id, title, {}),
    // `title` is excluded: `setDocumentTitle` below keeps it current without
    // re-registering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id]
  );

  useEffect(() => {
    if (docName) {
      setDocumentTitle('timeline', id, docName);
    }
  }, [docName, id]);

  // Re-read on every focus. The store is cached for the app's lifetime, and a
  // sequence edited on desktop or by the server agent since it was last shown
  // would otherwise keep showing a stale cut. Coming back from Chat is the
  // common case: the user asked for an edit, and wants to see it.
  useFocusEffect(
    useCallback(() => {
      runLoad();
    }, [runLoad])
  );

  // Claim focus and publish the selection on focus, but release neither on
  // blur. Navigating to Chat blurs this screen, and the chat turn is the one
  // moment `ui_context` is read.
  useFocusEffect(
    useCallback(() => {
      setFocusedDocument('timeline', id);
      setUiSelection({ clipIds: selectedClipId ? [selectedClipId] : [] });
    }, [id, selectedClipId])
  );

  // Unmount is what makes the claim stale, so the release belongs here.
  useEffect(() => clearUiSelection, []);

  // A reload can drop the selected clip; close its panel rather than showing
  // nothing under a stale id.
  useEffect(() => {
    if (selectedClipId !== null && !clips.some((clip) => clip.id === selectedClipId)) {
      setSelectedClipId(null);
    }
  }, [clips, selectedClipId]);

  const openChat = useCallback(() => navigation.navigate('Main', { screen: 'Chat' }), [navigation]);

  // The header lays the title out at its natural width and never shrinks it, so
  // cap it, leaving room for the chat action and the back button.
  const { width: windowWidth } = useWindowDimensions();
  const titleMaxWidth = Math.max(96, windowWidth - HEADER_RESERVED_WIDTH);

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerTitle: ({ children, tintColor }) => (
        <Text
          numberOfLines={1}
          style={[styles.headerTitle, { maxWidth: titleMaxWidth, color: tintColor ?? colors.text }]}
        >
          {children}
        </Text>
      ),
      headerRight: () => (
        <TouchableOpacity
          onPress={openChat}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Ask the assistant about this sequence"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.headerAction}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [colors.primary, colors.text, navigation, openChat, title, titleMaxWidth]);

  const zoomOut = useCallback(
    () => setPxPerSecond((current) => Math.max(current / ZOOM_FACTOR, MIN_PX_PER_SECOND)),
    []
  );
  const zoomIn = useCallback(
    () => setPxPerSecond((current) => Math.min(current * ZOOM_FACTOR, MAX_PX_PER_SECOND)),
    []
  );

  const selectedClip = clips.find((clip) => clip.id === selectedClipId) ?? null;
  const trackNameOf = (trackId: string): string =>
    tracks.find((track) => track.id === trackId)?.name ?? trackId;

  if (doc === null && (status === 'loading' || status === 'idle')) {
    return <LoadingState label="Loading timeline" />;
  }

  if (doc === null && status === 'error') {
    return (
      <ErrorState
        title="Couldn't load this timeline"
        message={error}
        onRetry={runLoad}
        retryLabel="Retry loading timeline"
      />
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}
    >
      <DocumentStatusBanner
        status={status}
        error={error}
        documentLabel="Timeline"
        reloadNoun="timeline"
        conflictNoun="sequence"
        onReload={runLoad}
      />

      <View style={[styles.toolbar, { borderBottomColor: colors.borderLight }]}>
        <Text style={[styles.toolbarText, { color: colors.textSecondary }]} numberOfLines={1}>
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
            hitSlop={HIT_SLOP}
          >
            <Ionicons name="remove-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={zoomIn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Zoom in"
            style={styles.zoomButton}
            hitSlop={HIT_SLOP}
          >
            <Ionicons name="add-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {clips.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="film-outline" size={36} color={colors.textTertiary} />
          <Text style={[styles.centeredText, { color: colors.textSecondary }]}>
            This sequence has no clips yet. Timelines are edited in the desktop or
            web app, or by the assistant. Edits show up here when you come back.
          </Text>
          <TouchableOpacity
            onPress={openChat}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Ask the assistant"
            style={[styles.retryButton, { backgroundColor: colors.primaryMuted }]}
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>Ask the assistant</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.verticalContent}>
          <TimelineLanes
            tracks={tracks}
            clips={clips}
            markers={markers}
            durationMs={durationMs}
            pxPerSecond={pxPerSecond}
            playheadMs={playheadMs}
            selectedClipId={selectedClipId}
            onSeek={setPlayheadMs}
            onSelectClip={setSelectedClipId}
          />
        </ScrollView>
      )}

      {selectedClip && (
        <View
          style={[styles.detailPanel, { backgroundColor: colors.surface, borderTopColor: colors.border }]}
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
          <DetailRow label="Track" value={trackNameOf(selectedClip.trackId)} colors={colors} />
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
          <DetailRow label="Versions" value={String(selectedClip.versions.length)} colors={colors} />
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
  headerAction: {
    // Native headers inset their own items; the web header does not.
    paddingRight: Platform.OS === 'web' ? 12 : 0,
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
