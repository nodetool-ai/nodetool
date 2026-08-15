/**
 * Read-only sketch renderer.
 *
 * A sketch is layer-based, so "showing" one means compositing: stack the layers
 * bottom-to-top the way the web editor does. This component is the mobile
 * counterpart of `web/src/components/sketch/SketchRenderer.tsx`, shared by the
 * sketch viewer screen and the app-runtime `Sketch` widget.
 *
 * Compositing agrees with `web/src/components/sketch/rendering/canvas2d/composite.ts`:
 * `layers` is stored bottom-first, groups are containers rather than pixels, a
 * layer is drawn only when it and every ancestor group is visible, and its alpha
 * is its own opacity times the opacity of every ancestor group. Mask layers are
 * drawn, matching web's on-screen preview (its *export* path is the one that
 * drops them).
 *
 * Pixels come from three places, in order: the layer's generated asset
 * (`layerBindings[].currentAssetId`, resolved through `assets.get` like every
 * other image in the app), a stable external `imageReference.uri`, or the raster
 * serialized into the document itself. A layer with none of those — or whose
 * generation failed — renders a labelled placeholder in its own footprint rather
 * than a broken image or an invisible gap.
 *
 * What is deliberately not reproduced: blend modes and layer rotation. React
 * Native has no compositing operator, and a preview that silently approximated
 * them would be lying more quietly than one that does not.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../hooks/useTheme';
import { apiService } from '../../services/api';
import { trpc } from '../../trpc/client';
import { assetIdFromLocator } from '../../hooks/useResolvedMediaUri';
import type { ThemeColors } from '../../utils/theme';

// ── Document shape ─────────────────────────────────────────────────────────
//
// Mirrors `ImageDocumentData` from `@nodetool-ai/protocol/api-schemas/sketch`,
// narrowed to the fields a renderer reads. The protocol types the layer array
// as `unknown[]` (the full `Layer` lives in the web editor), so the fields this
// file needs are declared here and every one of them is optional.

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

export interface SketchRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SketchCanvas {
  width: number;
  height: number;
  backgroundColor?: string;
}

export interface SketchLayer {
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

export interface SketchLayerBinding {
  layerId: string;
  status: SketchLayerStatus;
  currentAssetId?: string;
  prompt?: string;
  model?: string;
  versions?: unknown[];
}

/** The persisted body of a sketch document. */
export interface SketchDocumentData {
  sketch: {
    canvas: SketchCanvas;
    layers: SketchLayer[];
  };
  layerBindings: SketchLayerBinding[];
}

// ── Reading a value as a sketch ────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A value read as a sketch document, or null.
 *
 * Two shapes arrive: the persisted `{ sketch, layerBindings }` envelope a
 * document read returns, and the bare `{ canvas, layers }` editor state a node
 * emits inline. The second carries no bindings, so its generated layers fall
 * back to whatever raster the document itself holds.
 */
export function asSketchDocument(value: unknown): SketchDocumentData | null {
  if (!isRecord(value)) {
    return null;
  }
  if (isRecord(value.sketch)) {
    const inner = asSketchDocument(value.sketch);
    if (inner === null) {
      return null;
    }
    return {
      sketch: inner.sketch,
      layerBindings: Array.isArray(value.layerBindings)
        ? (value.layerBindings as SketchLayerBinding[])
        : [],
    };
  }
  const canvas = value.canvas;
  if (
    !isRecord(canvas) ||
    typeof canvas.width !== 'number' ||
    typeof canvas.height !== 'number' ||
    !Array.isArray(value.layers)
  ) {
    return null;
  }
  return {
    sketch: {
      canvas: canvas as unknown as SketchCanvas,
      layers: value.layers as SketchLayer[],
    },
    layerBindings: Array.isArray(value.layerBindings)
      ? (value.layerBindings as SketchLayerBinding[])
      : [],
  };
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

/** One layer, resolved into everything the composite and a layer list need. */
export interface ResolvedLayer {
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
export function statusHasNoPixels(status: SketchLayerStatus | null): boolean {
  return status === 'failed' || status === 'missing';
}

function ancestorChain(layers: SketchLayer[], layer: SketchLayer): SketchLayer[] {
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
    // `resolveUrl` returns null for an `asset://` reference — that one resolves
    // through the asset lookup below, so route its id there rather than
    // dropping the layer's only image.
    const referenceUri = apiService.resolveUrl(layer.imageReference?.uri);
    const referenceAssetId = assetIdFromLocator(layer.imageReference?.uri);
    const hasPixels = !statusHasNoPixels(status);

    return {
      id: layer.id,
      name: layer.name ?? 'Untitled layer',
      type: layer.type ?? 'raster',
      composited,
      opacity: ownOpacity * groupOpacity,
      rect,
      directUri: hasPixels ? (referenceUri ?? inlineUri) : null,
      assetId: hasPixels
        ? (binding?.currentAssetId ?? referenceAssetId ?? null)
        : null,
      status,
      prompt: binding?.prompt ?? null,
      model: binding?.model ?? null,
      versionCount: binding?.versions?.length ?? 0,
    };
  });
}

// ── Status presentation ────────────────────────────────────────────────────

export const STATUS_LABEL: Record<SketchLayerStatus, string> = {
  draft: 'Draft',
  queued: 'Queued',
  generating: 'Generating',
  generated: 'Generated',
  stale: 'Stale',
  failed: 'Failed',
  locked: 'Locked',
  missing: 'Missing',
};

export function statusColor(status: SketchLayerStatus, colors: ThemeColors): string {
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

// ── Renderer ───────────────────────────────────────────────────────────────

export interface SketchRendererProps {
  doc: SketchDocumentData;
  /** Pre-resolved layers, when the caller already computed them. */
  layers?: ResolvedLayer[];
  /** Caps the drawn canvas; the composite shrinks to fit rather than cropping. */
  maxHeight?: number;
  /** Draws a `w × h` badge in the corner, the way the web renderer does. */
  showDimensions?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The composited canvas.
 *
 * Nothing draws until the frame reports a width: document pixels only become
 * layout once the scale between them and the screen is known.
 */
export const SketchRenderer: React.FC<SketchRendererProps> = ({
  doc,
  layers,
  maxHeight,
  showDimensions = false,
  accessibilityLabel,
  style,
}) => {
  const { colors } = useTheme();
  const [frameWidth, setFrameWidth] = useState(0);
  const onFrameLayout = useCallback((event: LayoutChangeEvent) => {
    setFrameWidth(event.nativeEvent.layout.width);
  }, []);

  const resolved = useMemo(() => layers ?? resolveLayers(doc), [doc, layers]);
  const composited = useMemo(
    () => resolved.filter((layer) => layer.composited && layer.type !== 'group'),
    [resolved]
  );

  const canvas = doc.sketch.canvas;
  const widthScale = frameWidth > 0 && canvas.width > 0 ? frameWidth / canvas.width : 0;
  const heightScale =
    maxHeight !== undefined && canvas.height > 0 ? maxHeight / canvas.height : Infinity;
  const scale = Math.min(widthScale, heightScale);

  const label =
    accessibilityLabel ??
    `Sketch preview, ${composited.length} visible ${
      composited.length === 1 ? 'layer' : 'layers'
    }`;

  return (
    <View onLayout={onFrameLayout} style={[styles.frame, style]}>
      <View
        accessibilityLabel={label}
        style={[
          styles.canvas,
          {
            width: scale > 0 ? canvas.width * scale : '100%',
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
        {showDimensions && (
          <View
            pointerEvents="none"
            style={[
              styles.dimensions,
              { backgroundColor: colors.cardBg, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.dimensionsText, { color: colors.textSecondary }]}>
              {`${canvas.width} × ${canvas.height}`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

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

  const uri = layer.directUri ?? apiService.resolveUrl(assetQuery.data?.get_url ?? null);

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
  frame: {
    width: '100%',
    alignItems: 'center',
  },
  canvas: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
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
  dimensions: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dimensionsText: {
    fontSize: 11,
    fontWeight: '600',
  },
});

export default SketchRenderer;
