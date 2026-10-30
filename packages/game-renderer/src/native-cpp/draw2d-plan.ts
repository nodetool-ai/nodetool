import type {
  NativeFrame2D,
  NativeGame2dDocument
} from "@nodetool-ai/protocol/native-game";

export interface NativeImage2D {
  readonly width: number;
  readonly height: number;
  readonly image: TexImageSource;
}
interface Transform {
  readonly x: number;
  readonly y: number;
  readonly rotation?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
}
interface Sprite {
  readonly assetId: string;
  readonly width: number;
  readonly height: number;
  readonly frame?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly layer?: number;
  readonly tint?: string;
  readonly opacity?: number;
  readonly unlit?: boolean;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly sampling?: "nearest" | "linear";
  readonly blend?: "normal" | "additive";
}
interface Item {
  readonly sprite: Sprite;
  readonly transform: Transform;
  readonly order: number;
  readonly background?: boolean;
}
export interface NativeDraw2D {
  readonly assetId: string;
  readonly first: number;
  readonly linear: boolean;
  readonly additive: boolean;
}
export interface NativeDrawPlan2D {
  readonly vertices: Float32Array;
  readonly draws: readonly NativeDraw2D[];
  readonly lighting: Float32Array;
}
const MAX_VERTICES = 1_000_000;
const CORNERS = [
  [-0.5, 0.5],
  [-0.5, -0.5],
  [0.5, -0.5],
  [-0.5, 0.5],
  [0.5, -0.5],
  [0.5, 0.5]
];
const colorCanvas =
  typeof OffscreenCanvas === "undefined"
    ? undefined
    : new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
const colorCache = new Map<string, readonly number[]>();
function color(value: string): readonly number[] {
  const cached = colorCache.get(value);
  if (cached) {
    return cached;
  }
  if (/^#[0-9a-f]+$/i.test(value)) {
    const hex = value.slice(1);
    const digits =
      hex.length === 3
        ? 1
        : hex.length === 6 || hex.length === 8
          ? 2
          : hex.length === 9
            ? 3
            : hex.length === 12
              ? 4
              : 0;
    if (digits) {
      const start = hex.length === 8 ? 2 : 0,
        divisor = 16 ** digits - 1;
      const result = [0, 1, 2].map(
        (index) =>
          Number.parseInt(
            hex.slice(start + index * digits, start + (index + 1) * digits),
            16
          ) / divisor
      );
      result.push(start ? Number.parseInt(hex.slice(0, 2), 16) / 255 : 1);
      if (colorCache.size >= 256) {
        colorCache.clear();
      }
      colorCache.set(value, result);
      return result;
    }
  }
  if (!colorCanvas) {
    throw new Error("Native color parser unavailable");
  }
  colorCanvas.clearRect(0, 0, 1, 1);
  colorCanvas.fillStyle = "white";
  if (/^[a-z]+$/i.test(value)) {
    colorCanvas.fillStyle = value;
  }
  colorCanvas.fillRect(0, 0, 1, 1);
  const p = colorCanvas.getImageData(0, 0, 1, 1).data;
  const result = Array.from(p, (n) => n / 255);
  if (colorCache.size >= 256) {
    colorCache.clear();
  }
  colorCache.set(value, result);
  return result;
}
/** Builds geometry solely from committed native presentation state. */
export function nativeDrawPlan2D(
  document: NativeGame2dDocument,
  frame: NativeFrame2D,
  images: ReadonlyMap<string, NativeImage2D>,
  pixelWidth: number,
  pixelHeight: number
): NativeDrawPlan2D {
  const camera = frame.camera,
    cx = camera.x,
    cy = camera.y,
    aspect = pixelWidth / pixelHeight;
  const vw = camera.width / camera.zoom,
    vh = camera.height / camera.zoom;
  const width = Math.max(vw, vh * aspect),
    height = Math.max(vh, vw / aspect);
  const metadata = new Map(document.assets.map((a) => [a.id, a]));
  const items: Item[] = [];
  const append = (item: Item): void => {
    if (items.length >= Math.floor(MAX_VERTICES / 6) - 1) {
      throw new Error("2D visible item budget exceeded");
    }
    items.push(item);
  };
  for (const entity of frame.entities) {
    const transform = frame.worldTransforms[entity.id];
    if (!transform) {
      throw new Error(`Missing native world transform: ${entity.id}`);
    }
    const order = frame.authoredOrder[entity.id];
    if (order === undefined) {
      throw new Error(`Missing native authored order: ${entity.id}`);
    }
    if (entity.sprite) {
      append({ sprite: entity.sprite, transform, order });
    }
    if (entity.tilemap) {
      const map = entity.tilemap;
      const angle = transform.rotation ?? 0,
        c = Math.cos(angle),
        s = Math.sin(angle);
      for (const tile of map.tiles) {
        const x = tile.x * (transform.scaleX ?? 1),
          y = tile.y * (transform.scaleY ?? 1);
        const worldX = transform.x + c * x - s * y,
          worldY = transform.y + s * x + c * y;
        const radius =
          Math.hypot(
            tile.width * (transform.scaleX ?? 1),
            tile.height * (transform.scaleY ?? 1)
          ) / 2;
        if (
          Math.abs(worldX - cx) > width / 2 + radius ||
          Math.abs(worldY - cy) > height / 2 + radius
        ) {
          continue;
        }
        append({
          sprite: {
            ...tile,
            assetId: map.assetId,
            layer: map.layer,
            unlit: false
          },
          transform: {
            ...transform,
            x: worldX,
            y: worldY
          },
          order
        });
      }
    }
  }
  let backgroundOrder = 0;
  for (const b of frame.backgrounds) {
    const seconds = frame.tick / 60;
    const x = b.origin.x + (1 - b.parallax.x) * cx + b.scrollRate.x * seconds,
      y = b.origin.y + (1 - b.parallax.y) * cy + b.scrollRate.y * seconds;
    const rx = b.mode !== "none",
      ry = b.mode === "repeat" || b.mode === "mirror";
    const minx = rx ? Math.floor((cx - width / 2 - x) / b.width) : 0,
      maxx = rx ? Math.ceil((cx + width / 2 - x) / b.width) : 0;
    const miny = ry ? Math.floor((cy - height / 2 - y) / b.height) : 0,
      maxy = ry ? Math.ceil((cy + height / 2 - y) / b.height) : 0;
    if (
      ![minx, maxx, miny, maxy].every(
        (n) => Number.isFinite(n) && Math.abs(n) <= 1e9
      ) ||
      (maxx - minx + 1) * (maxy - miny + 1) > 100000
    ) {
      throw new Error("Background repeat budget exceeded");
    }
    for (let iy = miny; iy <= maxy; iy++) {
      for (let ix = minx; ix <= maxx; ix++) {
        append({
          sprite: {
            ...b,
            unlit: true,
            flipX: b.mode === "mirror" && ix % 2 !== 0,
            flipY: b.mode === "mirror" && iy % 2 !== 0
          },
          transform: { x: x + ix * b.width, y: y + iy * b.height },
          order: backgroundOrder,
          background: true
        });
      }
    }
    backgroundOrder++;
  }
  items.sort(
    (a, b) => (a.sprite.layer ?? 0) - (b.sprite.layer ?? 0) || a.order - b.order
  );
  const vertices: number[] = [],
    draws: NativeDraw2D[] = [];
  for (const item of items) {
    const sprite = item.sprite,
      t = item.transform,
      id = sprite.assetId,
      image = images.get(id),
      asset = metadata.get(id);
    if (!image || !asset) {
      throw new Error(`2D image not prepared: ${id}`);
    }
    const f = sprite.frame ?? {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height
    };
    if (
      f.x < 0 ||
      f.y < 0 ||
      f.width <= 0 ||
      f.height <= 0 ||
      f.x + f.width > image.width ||
      f.y + f.height > image.height
    ) {
      throw new Error(`Sprite atlas frame outside image: ${id}`);
    }
    let sx = (t.scaleX ?? 1) * sprite.width,
      sy = (t.scaleY ?? 1) * sprite.height,
      x = t.x,
      y = t.y;
    const angle = t.rotation ?? 0,
      c = Math.cos(angle),
      s = Math.sin(angle);
    if (!item.background) {
      const pivot = asset.pivot ?? { x: 0.5, y: 0.5 },
        trim = asset.trim;
      const sw = sprite.frame ? f.width : (trim?.sourceWidth ?? image.width),
        sh = sprite.frame ? f.height : (trim?.sourceHeight ?? image.height);
      const ox =
        (((sprite.frame ? 0 : (trim?.x ?? 0)) + f.width / 2) / sw - pivot.x) *
        sx;
      const oy =
        (pivot.y - ((sprite.frame ? 0 : (trim?.y ?? 0)) + f.height / 2) / sh) *
        sy;
      x += c * ox - s * oy;
      y += s * ox + c * oy;
      sx *= f.width / sw;
      sy *= f.height / sh;
    }
    const radius = Math.hypot(sx, sy) / 2;
    if (
      Math.abs(x - cx) > width / 2 + radius ||
      Math.abs(y - cy) > height / 2 + radius
    ) {
      continue;
    }
    if (vertices.length / 11 + 6 > MAX_VERTICES) {
      throw new Error("2D vertex budget exceeded");
    }
    const tint = color(sprite.tint ?? "white"),
      opacity = (sprite.opacity ?? 1) * (tint[3] ?? 1),
      first = vertices.length / 11;
    for (const p of CORNERS) {
      const px = p[0] ?? 0,
        py = p[1] ?? 0,
        wx = x + c * px * sx - s * py * sy,
        wy = y + s * px * sx + c * py * sy,
        u = px + 0.5,
        v = 0.5 - py;
      vertices.push(
        ((wx - cx) * 2) / width,
        ((wy - cy) * 2) / height,
        (f.x + (sprite.flipX ? 1 - u : u) * f.width) / image.width,
        (f.y + (sprite.flipY ? 1 - v : v) * f.height) / image.height,
        tint[0] ?? 1,
        tint[1] ?? 1,
        tint[2] ?? 1,
        opacity,
        wx,
        wy,
        sprite.unlit ? 1 : 0
      );
    }
    draws.push({
      assetId: id,
      first,
      linear: (sprite.sampling ?? asset.sampling) === "linear",
      additive: sprite.blend === "additive"
    });
  }
  const lighting = new Float32Array(260),
    ambient =
      "ambient" in frame.lighting
        ? frame.lighting.ambient
        : { color: "#ffffff", intensity: 1 };
  const ac = color(ambient.color);
  for (let i = 0; i < 3; i++) {
    lighting[i] = (ac[i] ?? 1) * ambient.intensity;
  }
  const points = "points" in frame.lighting ? [...frame.lighting.points] : [];
  const entityLights = frame.entities.flatMap((e) => {
    if (!e.light2d) {
      return [];
    }
    const t = frame.worldTransforms[e.id];
    if (!t) {
      throw new Error("Missing light world transform");
    }
    const l = e.light2d,
      o = l.offset ?? { x: 0, y: 0 },
      c = Math.cos(t.rotation ?? 0),
      s = Math.sin(t.rotation ?? 0),
      ox = o.x * (t.scaleX ?? 1),
      oy = o.y * (t.scaleY ?? 1);
    return [{ ...l, x: t.x + c * ox - s * oy, y: t.y + s * ox + c * oy }];
  });
  entityLights.sort(
    (a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)
  );
  points.push(...entityLights.slice(0, 32 - points.length));
  lighting[3] = points.length;
  points.forEach((p, i) => {
    const c = color(p.color),
      o = 4 + i * 8;
    lighting.set(
      [
        p.x,
        p.y,
        p.radius,
        p.falloff ?? 1,
        c[0] ?? 1,
        c[1] ?? 1,
        c[2] ?? 1,
        p.intensity
      ],
      o
    );
  });
  return { vertices: new Float32Array(vertices), draws, lighting };
}
