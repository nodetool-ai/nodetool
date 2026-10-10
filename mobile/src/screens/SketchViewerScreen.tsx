/**
 * Read-only sketch viewer.
 *
 * The canvas itself is `components/sketch/SketchRenderer` — the same compositor
 * the app-runtime `Sketch` widget draws with. This screen adds what only a
 * document screen needs: loading the document, and listing every layer with the
 * generation status it carries.
 *
 * There is no editing here: placing a brush stroke with a thumb is not the
 * phone's job, and there are no `ui_sketch_*` tools, so `kinds.ts` classifies
 * this as a `viewer` with `agentEditable: false`. The screen registers with the
 * agent bridge, with no edit handler, only so the chat turn's `ui_context`
 * names the sketch the user has open.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import type { RootStackParamList } from '../navigation/types';
import { ErrorState, LoadingState } from '../components/ScreenState';
import { useTheme } from '../hooks/useTheme';
import { documentStore } from '../documents/documentStore';
import {
  registerDocumentHandler,
  setDocumentTitle,
  setFocusedDocument,
} from '../documents/agentBridge';
import {
  SketchRenderer,
  resolveLayers,
  STATUS_LABEL,
  statusColor,
  type SketchDocumentData,
} from '../components/sketch/SketchRenderer';

type Props = NativeStackScreenProps<RootStackParamList, 'SketchViewer'>;

const LAYER_ICONS = {
  raster: 'image-outline',
  mask: 'contrast-outline',
  group: 'folder-outline',
} satisfies Record<'raster' | 'mask' | 'group', keyof typeof Ionicons.glyphMap>;

// ── Screen ─────────────────────────────────────────────────────────────────

export default function SketchViewerScreen({ navigation, route }: Props) {
  const { id, name } = route.params;
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  const store = useMemo(() => documentStore<SketchDocumentData>('sketch', id), [id]);
  const { doc, docName, status, error } = store(
    useShallow((state) => ({
      doc: state.doc,
      docName: state.name,
      status: state.status,
      error: state.error,
    }))
  );

  const runLoad = useCallback(() => void store.getState().load(), [store]);

  // Re-read on every open: the store is cached for the app's lifetime, so a
  // sketch painted on desktop since it was last viewed here would otherwise
  // keep showing stale pixels. Nothing local can be lost — this screen never
  // writes.
  useEffect(runLoad, [runLoad]);

  const title = docName || name || 'Sketch';

  // Named in `ui_context` while mounted, so the agent knows which sketch is open.
  useEffect(
    () => registerDocumentHandler('sketch', id, title, {}),
    // `title` is excluded: `setDocumentTitle` below keeps it current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id]
  );
  useEffect(() => {
    if (docName) {
      setDocumentTitle('sketch', id, docName);
    }
  }, [docName, id]);
  useFocusEffect(
    useCallback(() => {
      setFocusedDocument('sketch', id);
    }, [id])
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  const layers = useMemo(() => (doc === null ? [] : resolveLayers(doc)), [doc]);

  if (doc === null && status === 'loading') {
    return <LoadingState label="Loading sketch…" />;
  }

  if (doc === null) {
    return (
      <ErrorState
        title="Could not load this sketch"
        message={error}
        onRetry={runLoad}
        retryLabel="Retry loading sketch"
      />
    );
  }

  const canvas = doc.sketch.canvas;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <SketchRenderer doc={doc} layers={layers} />

      <View style={styles.headerSection}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {`${canvas.width} × ${canvas.height} · ${layers.length} ${
            layers.length === 1 ? 'layer' : 'layers'
          }`}
        </Text>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Layers</Text>

      <View
        style={[
          styles.card,
          shadows.small,
          { backgroundColor: colors.cardBg, borderColor: colors.borderLight },
        ]}
      >
        {layers.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            This sketch has no layers yet.
          </Text>
        ) : (
          // Top layer first, the way a layers panel reads.
          [...layers].reverse().map((layer, index) => (
            <View
              key={layer.id}
              style={[
                styles.layerRow,
                index < layers.length - 1 && {
                  borderBottomColor: colors.borderLight,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <Ionicons
                name={LAYER_ICONS[layer.type]}
                size={18}
                color={layer.composited ? colors.textSecondary : colors.textTertiary}
              />
              <View style={styles.layerText}>
                <Text
                  style={[
                    styles.layerName,
                    { color: layer.composited ? colors.text : colors.textTertiary },
                  ]}
                  numberOfLines={1}
                >
                  {layer.name}
                </Text>
                <Text style={[styles.layerMeta, { color: colors.textTertiary }]}>
                  {[
                    layer.type,
                    layer.composited ? null : 'hidden',
                    layer.opacity < 1 ? `${Math.round(layer.opacity * 100)}%` : null,
                    layer.model,
                  ]
                    .filter((part): part is string => part !== null)
                    .join(' · ')}
                </Text>
              </View>
              {layer.status !== null && (
                <View
                  accessibilityLabel={`${layer.name} status: ${STATUS_LABEL[layer.status]}`}
                  style={[
                    styles.statusPill,
                    { borderColor: statusColor(layer.status, colors) },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: statusColor(layer.status, colors) },
                    ]}
                  >
                    {STATUS_LABEL[layer.status]}
                  </Text>
                </View>
              )}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  meta: {
    fontSize: 14,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    marginHorizontal: 16,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyText: {
    fontSize: 14,
    paddingVertical: 16,
    textAlign: 'center',
  },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  layerText: {
    flex: 1,
    gap: 2,
  },
  layerName: {
    fontSize: 14,
    fontWeight: '600',
  },
  layerMeta: {
    fontSize: 12,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
