/**
 * Read-only sketch viewer.
 *
 * A sketch is layer-based, so "showing" one means compositing: stack the
 * layers bottom-to-top the way the web editor does, then list them with the
 * generation status each one carries. There is no canvas here and no editing —
 * placing a brush stroke with a thumb is not the phone's job, and there are no
 * `ui_sketch_*` tools yet either, so `kinds.ts` classifies this as a `viewer`
 * with `agentEditable: false`.
 *
 * Compositing agrees with `web/src/components/sketch/rendering/canvas2d/composite.ts`:
 * `layers` is stored bottom-first, groups are containers rather than pixels,
 * a layer is drawn only when it and every ancestor group is visible, and its
 * alpha is its own opacity times the opacity of every ancestor group. Mask
 * layers are drawn, matching web's on-screen preview (its *export* path is the
 * one that drops them).
 *
 * Pixels come from three places, in order: the layer's generated asset
 * (`layerBindings[].currentAssetId`, resolved through `assets.get` like every
 * other image in the app), a stable external `imageReference.uri`, or the
 * raster serialized into the document itself. A layer with none of those — or
 * whose generation failed — renders a labelled placeholder in its own footprint
 * rather than a broken image or an invisible gap.
 *
 * What is deliberately not reproduced: blend modes and layer rotation. React
 * Native has no compositing operator, and a read-only preview that silently
 * approximated them would be lying more quietly than one that does not.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import { documentStore } from '../documents/documentStore';
import { apiService } from '../services/api';
import { trpc } from '../trpc/client';
import type { ThemeColors } from '../utils/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SketchViewer'>;

// ── Document shape ─────────────────────────────────────────────────────────
//
// Mirrors `ImageDocumentData` from `@nodetool-ai/protocol/api-schemas/sketch`,
// narrowed to the fields a viewer reads. The protocol types the layer array as
// `unknown[]` (the full `Layer` lives in the web editor), so the fields this
// screen needs are declared here and every one of them is optional.

/** Layer generation status carried by a binding. */
export type SketchLayerStatus =
  | 'draft'
  | 'queued'
  | 'generating'
  | 'generated'
  | 'stale'
  | 'failed'
  | 'locked'
  | 'missing';

interface SketchRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SketchLayer {
  id: string;
  name?: string;
  type?: 'raster' | 'mask' | 'group';
  visible?: boolean;
  opacity?: number;
  parentId?: string | null;
  /** Serialized raster payload, or a legacy PNG data URL. */
  data?: string | null;
  /** Backing raster bounds in layer-local space. */
  contentBounds?: SketchRect;
  transform?: { kind?: string; x?: number; y?: number; scaleX?: number; scaleY?: number };
  imageReference?: { uri?: string } | null;
}

interface SketchLayerBinding {
  layerId: string;
  status: SketchLayerStatus;
  currentAssetId?: string;
  prompt?: string;
  model?: string;
  versions?: unknown[];
}

interface SketchDocumentData {
  sketch: {
    canvas: { width: number; height: number; backgroundColor?: string };
    layers: SketchLayer[];
  };
  layerBindings: SketchLayerBinding[];
}

// ── Layer data decoding ────────────────────────────────────────────────────

const SERIALIZED_LAYER_DATA_PREFIX = 'ntlayer:';

/**
 * The image URL inside a layer's `data` field, or null.
 *
 * Ported from web's `deserializeLayerData`: a payload is either a base64 blob
 * of JSON behind the `ntlayer:` prefix or, on older documents, a bare data URL.
 */
export function layerDataImageUri(data: string | null | undefined): string | null {
  if (!data) {
    return null;
  }
  if (!data.startsWith(SERIALIZED_LAYER_DATA_PREFIX)) {
    return data;
  }
  try {
    const decoded: unknown = JSON.parse(
      atob(data.slice(SERIALIZED_LAYER_DATA_PREFIX.length))
    );
    if (decoded === null || typeof decoded !== 'object') {
      return null;
    }
    const image = (decoded as { image?: unknown }).image;
    return typeof image === 'string' ? image : null;
  } catch {
    // A payload we cannot decode is not a URL either; the layer falls through
    // to its placeholder, which is the honest outcome.
    return null;
  }
}

// ── Compositing ────────────────────────────────────────────────────────────

/** One layer, resolved into everything the composite and the list need. */
interface ResolvedLayer {
  id: string;
  name: string;
  type: 'raster' | 'mask' | 'group';
  /** True when this layer and every ancestor group is visible. */
  composited: boolean;
  /** Own opacity times every ancestor group's opacity. */
  opacity: number;
  /** Footprint in document pixels. */
  rect: SketchRect;
  /** A ready-to-render URI (data URL or absolute http URL), if one is known. */
  directUri: string | null;
  /** The generated asset to look up when there is no direct URI. */
  assetId: string | null;
  status: SketchLayerStatus | null;
  prompt: string | null;
  model: string | null;
  versionCount: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Statuses that mean "these pixels do not exist", whatever else is set. */
function statusHasNoPixels(status: SketchLayerStatus | null): boolean {
  return status === 'failed' || status === 'missing';
}

function ancestorChain(
  layers: SketchLayer[],
  layer: SketchLayer
): SketchLayer[] {
  const byId = new Map(layers.map((entry) => [entry.id, entry]));
  const chain: SketchLayer[] = [];
  const seen = new Set<string>([layer.id]);
  let parentId = layer.parentId;
  while (parentId) {
    if (seen.has(parentId)) {
      throw new Error(`Sketch layer "${layer.id}" has a cyclic parent chain.`);
    }
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) {
      break;
    }
    chain.push(parent);
    parentId = parent.parentId;
  }
  return chain;
}

export function resolveLayers(doc: SketchDocumentData): ResolvedLayer[] {
  const layers = doc.sketch.layers;
  const canvas = doc.sketch.canvas;
  const bindings = new Map(
    doc.layerBindings.map((binding) => [binding.layerId, binding])
  );

  return layers.map((layer) => {
    const ancestors = ancestorChain(layers, layer);
    const visible = layer.visible !== false;
    const composited =
      visible && ancestors.every((ancestor) => ancestor.visible !== false);
    const ownOpacity = clamp01(layer.opacity ?? 1);
    const groupOpacity = ancestors.reduce(
      (product, ancestor) =>
        ancestor.type === 'group' ? product * clamp01(ancestor.opacity ?? 1) : product,
      1
    );

    const bounds = layer.contentBounds ?? {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
    };
    // Only the translation and scale of an affine transform are honored;
    // rotation and quad transforms are not reproducible as a plain <Image>.
    const transform = layer.transform?.kind === 'affine' ? layer.transform : undefined;
    const rect: SketchRect = {
      x: bounds.x + (transform?.x ?? 0),
      y: bounds.y + (transform?.y ?? 0),
      width: bounds.width * (transform?.scaleX ?? 1),
      height: bounds.height * (transform?.scaleY ?? 1),
    };

    const binding = bindings.get(layer.id) ?? null;
    const status = binding?.status ?? null;
    const inlineUri = layerDataImageUri(layer.data);
    const referenceUri = apiService.resolveUrl(layer.imageReference?.uri);
    const hasPixels = !statusHasNoPixels(status);

    return {
      id: layer.id,
      name: layer.name ?? 'Untitled layer',
      type: layer.type ?? 'raster',
      composited,
      opacity: ownOpacity * groupOpacity,
      rect,
      directUri: hasPixels ? (referenceUri ?? inlineUri) : null,
      assetId: hasPixels ? (binding?.currentAssetId ?? null) : null,
      status,
      prompt: binding?.prompt ?? null,
      model: binding?.model ?? null,
      versionCount: binding?.versions?.length ?? 0,
    };
  });
}

// ── Status presentation ────────────────────────────────────────────────────

const STATUS_LABEL: Record<SketchLayerStatus, string> = {
  draft: 'Draft',
  queued: 'Queued',
  generating: 'Generating',
  generated: 'Generated',
  stale: 'Stale',
  failed: 'Failed',
  locked: 'Locked',
  missing: 'Missing',
};

function statusColor(status: SketchLayerStatus, colors: ThemeColors): string {
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
      return colors.textTertiary;
  }
}

const LAYER_ICONS: Record<'raster' | 'mask' | 'group', keyof typeof Ionicons.glyphMap> = {
  raster: 'image-outline',
  mask: 'contrast-outline',
  group: 'folder-outline',
};

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
  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  const [frameWidth, setFrameWidth] = useState(0);
  const onFrameLayout = useCallback((event: LayoutChangeEvent) => {
    setFrameWidth(event.nativeEvent.layout.width);
  }, []);

  const layers = useMemo(() => (doc === null ? [] : resolveLayers(doc)), [doc]);

  if (doc === null && status === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.centerText, { color: colors.textSecondary }]}>
          Loading sketch…
        </Text>
      </View>
    );
  }

  if (doc === null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={36} color={colors.error} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>
          Could not load this sketch
        </Text>
        {error !== null && (
          <Text style={[styles.centerText, { color: colors.textSecondary }]}>{error}</Text>
        )}
        <TouchableOpacity
          onPress={runLoad}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Retry loading sketch"
          style={[styles.retryButton, shadows.small, { backgroundColor: colors.primary }]}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.textOnPrimary} />
          <Text style={[styles.retryText, { color: colors.textOnPrimary }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const canvas = doc.sketch.canvas;
  const scale = frameWidth > 0 && canvas.width > 0 ? frameWidth / canvas.width : 0;
  const composited = layers.filter(
    (layer) => layer.composited && layer.type !== 'group'
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <View
        onLayout={onFrameLayout}
        accessibilityLabel={`Sketch preview, ${composited.length} visible ${
          composited.length === 1 ? 'layer' : 'layers'
        }`}
        style={[
          styles.canvas,
          {
            height: scale > 0 ? canvas.height * scale : undefined,
            aspectRatio: scale > 0 ? undefined : 1,
            backgroundColor: canvas.backgroundColor ?? colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}
      >
        {scale > 0 &&
          composited.map((layer) => (
            <CompositedLayer key={layer.id} layer={layer} scale={scale} colors={colors} />
          ))}
      </View>

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

// ── One composited layer ───────────────────────────────────────────────────

interface CompositedLayerProps {
  layer: ResolvedLayer;
  /** Document pixels → screen points. */
  scale: number;
  colors: ThemeColors;
}

/**
 * A single stacked layer image.
 *
 * The asset lookup lives here rather than in the parent so each layer resolves
 * its own URL through the same `assets.get` + `resolveUrl` path the asset
 * viewer uses, and so a layer that already carries a URI costs no request.
 */
function CompositedLayer({ layer, scale, colors }: CompositedLayerProps) {
  const [failed, setFailed] = useState(false);
  const needsAsset = layer.directUri === null && layer.assetId !== null;
  const assetQuery = trpc.assets.get.useQuery(
    { id: layer.assetId ?? '' },
    { enabled: needsAsset }
  );

  const uri =
    layer.directUri ?? apiService.resolveUrl(assetQuery.data?.get_url ?? null);

  const frame = {
    left: layer.rect.x * scale,
    top: layer.rect.y * scale,
    width: layer.rect.width * scale,
    height: layer.rect.height * scale,
  };

  const onError = useCallback(() => setFailed(true), []);

  if (needsAsset && assetQuery.isLoading) {
    return (
      <View style={[styles.layerFrame, frame]} pointerEvents="none">
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (uri === null || failed) {
    const reason =
      layer.status !== null && statusHasNoPixels(layer.status)
        ? STATUS_LABEL[layer.status]
        : 'No image';
    return (
      <View
        pointerEvents="none"
        accessibilityLabel={`Layer ${layer.name} has no image: ${reason}`}
        style={[
          styles.layerFrame,
          styles.placeholder,
          frame,
          { borderColor: colors.error, backgroundColor: colors.surfaceElevated },
        ]}
      >
        <Ionicons name="image-outline" size={20} color={colors.error} />
        <Text style={[styles.placeholderText, { color: colors.error }]} numberOfLines={2}>
          {`${layer.name} · ${reason}`}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      onError={onError}
      resizeMode="contain"
      accessibilityLabel={`Layer ${layer.name}`}
      style={[styles.layerFrame, frame, { opacity: layer.opacity }]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  centerText: {
    fontSize: 14,
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
  },
  canvas: {
    width: '100%',
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  layerFrame: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    gap: 4,
    padding: 6,
  },
  placeholderText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
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
