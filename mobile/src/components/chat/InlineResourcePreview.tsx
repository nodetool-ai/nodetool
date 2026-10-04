/**
 * A sketch or timeline drawn inline in chat prose, with a chip beneath it that
 * opens the document's viewer.
 *
 * `ChatMarkdown` routes every resource reference here: image syntax, a bare
 * URI, and a URI alone in a code span. A sketch draws with `SketchRenderer` and
 * a timeline with the same `TimelineLanes` drawing the timeline viewer uses,
 * both at a fixed height. Any other kind, and a load that fails, shows the chip
 * alone. Timelines preview as lanes, not video: mobile has no compositor.
 *
 * The behavior is web's `InlineResourcePreview`; the controls are native.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { parseResourceUri } from '@nodetool-ai/protocol/resource-uri';

import { useTheme } from '../../hooks/useTheme';
import { trpc } from '../../trpc/client';
import { SketchRenderer, asSketchDocument } from '../sketch/SketchRenderer';
import {
  TimelineLanes,
  fitPxPerSecond,
  formatTime,
  sortTracks,
} from '../timeline/TimelineLanes';
import { OPENS_ON_DESKTOP_MESSAGE, useOpenResource } from '../app_runtime/useOpenResource';
import { timelineDurationMs } from '../../documents/timelineTypes';
import type { ThemeColors } from '../../utils/theme';

/** Height the drawn preview is capped at, for both kinds. */
export const PREVIEW_HEIGHT = 200;
const PREVIEW_LANE_HEIGHT = 32;
const PREVIEW_HEADER_WIDTH = 84;
/** The lanes block the title row and the ruler leave room for. */
const TIMELINE_TITLE_HEIGHT = 24;

const KIND_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  sketch: 'brush-outline',
  timeline: 'film-outline',
  storyboard: 'albums-outline',
  asset: 'image-outline',
};

const SketchPreview: React.FC<{ id: string; onFailed: () => void }> = ({ id, onFailed }) => {
  const { colors } = useTheme();
  const query = trpc.sketch.get.useQuery({ id }, { staleTime: 30_000, retry: false });
  const doc = useMemo(() => asSketchDocument(query.data?.document), [query.data]);
  const unusable = !query.isLoading && doc === null;
  useEffect(() => {
    if (unusable) {
      onFailed();
    }
  }, [onFailed, unusable]);

  if (query.isLoading) {
    return <ActivityIndicator color={colors.primary} accessibilityLabel="Loading sketch preview" />;
  }
  if (doc === null) {
    return null;
  }
  return (
    <SketchRenderer
      doc={doc}
      maxHeight={PREVIEW_HEIGHT}
      accessibilityLabel={`Sketch preview: ${query.data?.name ?? id}`}
    />
  );
};

const TimelinePreview: React.FC<{ id: string; onFailed: () => void }> = ({ id, onFailed }) => {
  const { colors } = useTheme();
  const query = trpc.timeline.get.useQuery({ id }, { staleTime: 30_000, retry: false });
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const sequence = query.data;
  const unusable = !query.isLoading && !sequence;
  useEffect(() => {
    if (unusable) {
      onFailed();
    }
  }, [onFailed, unusable]);

  if (query.isLoading) {
    return <ActivityIndicator color={colors.primary} accessibilityLabel="Loading timeline preview" />;
  }
  if (!sequence) {
    return null;
  }
  const tracks = sortTracks(sequence.tracks);
  const durationMs = timelineDurationMs(sequence.clips);

  return (
    <View
      style={[styles.timelineFrame, { borderColor: colors.borderLight }]}
      onLayout={onLayout}
      accessibilityLabel={`Timeline preview: ${sequence.name}`}
    >
      <View style={styles.timelineTitleRow}>
        <Text style={[styles.timelineTitle, { color: colors.text }]} numberOfLines={1}>
          {sequence.name}
        </Text>
        <Text style={[styles.timelineMeta, { color: colors.textSecondary }]}>
          {formatTime(durationMs)}
        </Text>
      </View>
      {width > 0 && (
        <TimelineLanes
          tracks={tracks}
          clips={sequence.clips}
          markers={sequence.markers}
          durationMs={durationMs}
          pxPerSecond={fitPxPerSecond(width, durationMs, PREVIEW_HEADER_WIDTH)}
          laneHeight={PREVIEW_LANE_HEIGHT}
          headerWidth={PREVIEW_HEADER_WIDTH}
          minContentWidth={0}
        />
      )}
    </View>
  );
};

interface ResourceChipProps {
  kind: string;
  label: string;
  onPress: () => void;
  colors: ThemeColors;
}

const ResourceChip: React.FC<ResourceChipProps> = ({ kind, label, onPress, colors }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityLabel={`Open ${kind} ${label}`}
    style={[styles.chip, { backgroundColor: colors.primaryMuted, borderColor: colors.border }]}
  >
    <Ionicons name={KIND_ICONS[kind] ?? 'document-outline'} size={14} color={colors.primary} />
    <Text style={[styles.chipText, { color: colors.primary }]} numberOfLines={1}>
      {label}
    </Text>
  </TouchableOpacity>
);

interface InlineResourcePreviewProps {
  uri: string;
  label: string;
}

export const InlineResourcePreview: React.FC<InlineResourcePreviewProps> = ({ uri, label }) => {
  const { colors } = useTheme();
  const openResource = useOpenResource();
  const ref = useMemo(() => parseResourceUri(uri), [uri]);
  const [failed, setFailed] = useState(false);
  const [opensElsewhere, setOpensElsewhere] = useState(false);
  const markFailed = useCallback(() => setFailed(true), []);

  if (ref === null) {
    return null;
  }
  const chipLabel = label || uri;
  const showPreview = !failed && (ref.kind === 'sketch' || ref.kind === 'timeline');

  return (
    <View style={styles.container} testID="inline-resource-preview">
      {showPreview && ref.kind === 'sketch' && <SketchPreview id={ref.id} onFailed={markFailed} />}
      {showPreview && ref.kind === 'timeline' && (
        <TimelinePreview id={ref.id} onFailed={markFailed} />
      )}
      <ResourceChip
        kind={ref.kind}
        label={chipLabel}
        colors={colors}
        onPress={() => setOpensElsewhere(!openResource(ref, chipLabel))}
      />
      {opensElsewhere && (
        <Text style={[styles.note, { color: colors.textSecondary }]}>{OPENS_ON_DESKTOP_MESSAGE}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    alignItems: 'flex-start',
    gap: 6,
    marginVertical: 6,
  },
  timelineFrame: {
    alignSelf: 'stretch',
    maxHeight: PREVIEW_HEIGHT,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  timelineTitleRow: {
    height: TIMELINE_TITLE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 8,
  },
  timelineTitle: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  timelineMeta: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  note: {
    fontSize: 12,
  },
});
