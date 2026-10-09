import type { GameAssetMediaKind, GameRenderFrame3D } from "@nodetool-ai/protocol";

export type GameAssetBrowserTab = "assets" | "prefabs" | "scenes";

/** The type filters each dimension offers. 2D games bind images, audio and fonts; 3D games bind models instead of images. */
export const GAME_ASSET_KIND_FILTERS: Readonly<Record<"2d" | "3d", readonly GameAssetMediaKind[]>> = {
  "2d": ["image", "audio", "font"],
  "3d": ["model", "collider", "audio", "font", "hdri"]
};

/** Where an asset's bytes live: an installed asset row, or a staged file in the game's workspace. */
export type GameAssetSource =
  | { readonly kind: "asset"; readonly assetId: string }
  | { readonly kind: "workspace"; readonly workspaceId: string; readonly path: string };

export interface GameAssetCandidate {
  readonly digest: string;
  readonly extension: string;
  readonly media_kind: "image" | "audio" | "font" | "model" | "collider";
  readonly path: string;
  readonly size: number;
  readonly modified_at: string;
  readonly bound_slots: readonly string[];
  readonly slot?: string;
  readonly prompt?: string;
  readonly source?: string;
  readonly recorded: boolean;
}

export interface GameSlotRequest {
  readonly kind: string;
  readonly prompt?: string;
  readonly preparation?: Readonly<Record<string, unknown>>;
  readonly source: string;
}

/** The generation kinds the panel runs itself. The rest need a provider node chosen by the assistant. */
export type GameAssetPanelGenerationKind = "image" | "audio" | "music";

export function panelGenerationKind(request: GameSlotRequest | undefined, mediaKind: GameAssetMediaKind,
  dimension: "2d" | "3d"): GameAssetPanelGenerationKind | null {
  const kind = request?.kind ?? (mediaKind === "audio" ? "music" : mediaKind);
  if (kind === "image") { return dimension === "2d" ? "image" : null; }
  return kind === "audio" || kind === "music" ? kind : null;
}

/**
 * Staged candidates that can fill a slot of this media kind. Candidates
 * recorded for the slot come first, then the rest newest first.
 */
export function candidatesForSlot(candidates: readonly GameAssetCandidate[], slot: string,
  mediaKind: GameAssetMediaKind): GameAssetCandidate[] {
  const fitting = candidates.filter((candidate) => candidate.media_kind === mediaKind);
  return [...fitting.filter((candidate) => candidate.slot === slot), ...fitting.filter((candidate) => candidate.slot !== slot)];
}

/** Peak amplitude per bucket across every channel, scaled so the loudest bucket is 1. */
export function waveformPeaks(channels: readonly Float32Array[], buckets: number): number[] {
  const length = Math.max(0, ...channels.map((channel) => channel.length));
  const count = Math.max(1, Math.floor(buckets));
  const peaks = new Array<number>(count).fill(0);
  if (length === 0) { return peaks; }
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      const bucket = Math.min(count - 1, Math.floor((index * count) / length));
      const value = Math.abs(channel[index] ?? 0);
      if (value > (peaks[bucket] ?? 0)) { peaks[bucket] = value; }
    }
  }
  const loudest = Math.max(...peaks);
  return loudest > 0 ? peaks.map((peak) => peak / loudest) : peaks;
}

type Vector3 = { readonly x: number; readonly y: number; readonly z: number };
type Quaternion = [number, number, number, number];

const subtract = (left: Vector3, right: Vector3): Vector3 => ({ x: left.x - right.x, y: left.y - right.y, z: left.z - right.z });
const cross = (left: Vector3, right: Vector3): Vector3 => ({
  x: left.y * right.z - left.z * right.y, y: left.z * right.x - left.x * right.z, z: left.x * right.y - left.y * right.x
});
const normalize = (value: Vector3): Vector3 => {
  const length = Math.hypot(value.x, value.y, value.z) || 1;
  return { x: value.x / length, y: value.y / length, z: value.z / length };
};

/** The rotation that points an object's -Z axis from `from` at `to`, the way a camera or light looks. */
export function lookAtQuaternion(from: Vector3, to: Vector3): Quaternion {
  const back = normalize(subtract(from, to));
  const right = normalize(cross({ x: 0, y: 1, z: 0 }, back));
  const up = cross(back, right);
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = [right.x, up.x, back.x, right.y, up.y, back.y, right.z, up.z, back.z];
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const scale = 0.5 / Math.sqrt(trace + 1);
    return [(m21 - m12) * scale, (m02 - m20) * scale, (m10 - m01) * scale, 0.25 / scale];
  }
  if (m00 > m11 && m00 > m22) {
    const scale = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return [0.25 * scale, (m01 + m10) / scale, (m02 + m20) / scale, (m21 - m12) / scale];
  }
  if (m11 > m22) {
    const scale = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return [(m01 + m10) / scale, 0.25 * scale, (m12 + m21) / scale, (m02 - m20) / scale];
  }
  const scale = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return [(m02 + m20) / scale, (m12 + m21) / scale, 0.25 * scale, (m10 - m01) / scale];
}

export interface ModelThumbnailColors {
  readonly background: string;
  readonly light: string;
}

const FIELD_OF_VIEW = 35;
const IDENTITY = { position: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1] as Quaternion, scale: { x: 1, y: 1, z: 1 } };

/**
 * One frame for the game renderer that shows a whole model from a
 * three-quarter view. The camera distance fits the bounds' sphere into the
 * field of view, so a crate and a castle fill the thumbnail alike.
 */
export function modelThumbnailFrame(modelId: string, bounds: { readonly min: Vector3; readonly max: Vector3 },
  colors: ModelThumbnailColors): GameRenderFrame3D {
  const center = { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2, z: (bounds.min.z + bounds.max.z) / 2 };
  const radius = Math.max(0.01, Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z) / 2);
  const distance = (radius / Math.sin((FIELD_OF_VIEW * Math.PI) / 360)) * 1.05;
  const direction = normalize({ x: 1, y: 0.7, z: 1 });
  const eye = { x: center.x + direction.x * distance, y: center.y + direction.y * distance, z: center.z + direction.z * distance };
  const lightFrom = { x: center.x + radius * 2, y: center.y + radius * 4, z: center.z + radius };
  const camera = { position: eye, rotation: lookAtQuaternion(eye, center), scale: IDENTITY.scale };
  return {
    dimension: "3d", gameId: "asset-thumbnail", sceneId: "thumbnail", tick: 0,
    presentation: { aspectRatio: 1, hudWidth: 256, hudHeight: 256 },
    camera: { entityId: "camera", transform: camera,
      projection: { kind: "perspective", fov: FIELD_OF_VIEW, near: Math.max(0.001, distance - radius * 2), far: distance + radius * 2 } },
    entities: [{ entityId: "model", transform: IDENTITY, previousTransform: IDENTITY,
      model: { assetId: modelId, castShadow: false, receiveShadow: false } }],
    lights: [{ entityId: "key", transform: { position: lightFrom, rotation: lookAtQuaternion(lightFrom, center), scale: IDENTITY.scale },
      light: { kind: "directional", color: colors.light, intensity: 2.5, castShadow: false } }],
    environment: { background: colors.background, ambient: { color: colors.light, intensity: 0.7 },
      shadows: { enabled: false, mapSize: 512, extent: radius * 4 } },
    hud: []
  };
}

export function shortDigest(digest: string): string {
  return digest.slice(0, 12);
}

/**
 * A promise cache with a size bound. A load that fails or answers `null` is
 * dropped, so the next caller retries it, and past `limit` entries the least
 * recently used one goes first. `onEvict` releases what an evicted load held.
 */
export class BoundedPromiseCache<T> {
  private readonly entries = new Map<string, Promise<T | null>>();

  constructor(private readonly limit: number, private readonly onEvict?: (value: T) => void) {}

  get size(): number { return this.entries.size; }

  get(key: string, load: () => Promise<T | null>): Promise<T | null> {
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
    }
    const pending: Promise<T | null> = load().catch(() => null).then((value) => {
      if (value === null && this.entries.get(key) === pending) { this.entries.delete(key); }
      return value;
    });
    this.entries.set(key, pending);
    for (const [oldest, evicted] of this.entries) {
      if (this.entries.size <= this.limit) { break; }
      this.entries.delete(oldest);
      const release = this.onEvict;
      if (release) { void evicted.then((value) => { if (value !== null) { release(value); } }); }
    }
    return pending;
  }
}
