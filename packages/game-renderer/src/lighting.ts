import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { parseTint, projectedCamera } from "./frame.js";

export interface PixelBounds { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/** Conservative raster bounds for one rotated sprite, clipped to the viewport. */
export function spritePixelBounds(x: number, y: number, width: number, height: number, rotation: number,
  viewportWidth: number, viewportHeight: number): PixelBounds | null {
  const cosine = Math.abs(Math.cos(rotation));
  const sine = Math.abs(Math.sin(rotation));
  const halfWidth = (cosine * width + sine * height) / 2;
  const halfHeight = (sine * width + cosine * height) / 2;
  const left = Math.max(0, Math.floor(x - halfWidth - 1));
  const top = Math.max(0, Math.floor(y - halfHeight - 1));
  const right = Math.min(viewportWidth, Math.ceil(x + halfWidth + 1));
  const bottom = Math.min(viewportHeight, Math.ceil(y + halfHeight + 1));
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

const LINEAR_FROM_BYTE = Float32Array.from({ length: 256 }, (_, value) => {
  const color = value / 255;
  return color <= 0.04045 ? color / 12.92 : ((color + 0.055) / 1.055) ** 2.4;
});
const BYTE_FROM_LINEAR = Uint8Array.from({ length: 4097 }, (_, index) => {
  const color = index / 4096;
  return Math.round((color <= 0.0031308 ? color * 12.92 : 1.055 * color ** (1 / 2.4) - 0.055) * 255);
});

function linearColor(color: string): readonly [number, number, number] {
  const channels = parseTint(color);
  return [LINEAR_FROM_BYTE[Math.round(channels[0] * 255)],
    LINEAR_FROM_BYTE[Math.round(channels[1] * 255)],
    LINEAR_FROM_BYTE[Math.round(channels[2] * 255)]];
}

/** Multiplies world pixels by ambient and point-light irradiance without changing alpha. */
export function applyLighting(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  frame: GameRenderFrame,
  interpolation: number,
  region?: { readonly viewportWidth: number; readonly viewportHeight: number; readonly x: number; readonly y: number },
): void {
  const lighting = frame.lighting;
  if (!lighting) return;
  const camera = projectedCamera(frame, interpolation);
  const viewportWidth = region?.viewportWidth ?? width;
  const viewportHeight = region?.viewportHeight ?? height;
  const originX = region?.x ?? 0;
  const originY = region?.y ?? 0;
  const scaleX = viewportWidth / frame.width * camera.zoom;
  const scaleY = viewportHeight / frame.height * camera.zoom;
  const ambient = linearColor(lighting.ambient.color);
  const irradiance = new Float32Array(width * height * 3);
  for (let index = 0; index < irradiance.length; index += 3) {
    irradiance[index] = ambient[0] * lighting.ambient.intensity;
    irradiance[index + 1] = ambient[1] * lighting.ambient.intensity;
    irradiance[index + 2] = ambient[2] * lighting.ambient.intensity;
  }
  for (const point of lighting.points) {
    const centerX = viewportWidth / 2 + (point.x - camera.x) * scaleX;
    const centerY = viewportHeight / 2 - (point.y - camera.y) * scaleY;
    const firstX = Math.max(0, Math.ceil(centerX - point.radius * scaleX - 0.5) - originX);
    const lastX = Math.min(width - 1, Math.floor(centerX + point.radius * scaleX - 0.5) - originX);
    const firstY = Math.max(0, Math.ceil(centerY - point.radius * scaleY - 0.5) - originY);
    const lastY = Math.min(height - 1, Math.floor(centerY + point.radius * scaleY - 0.5) - originY);
    const color = linearColor(point.color);
    for (let y = firstY; y <= lastY; y += 1) {
      const dy = (y + originY + 0.5 - centerY) / scaleY;
      for (let x = firstX; x <= lastX; x += 1) {
        const dx = (x + originX + 0.5 - centerX) / scaleX;
        const distance = Math.hypot(dx, dy);
        if (distance >= point.radius) continue;
        const amount = point.intensity * (1 - distance / point.radius) ** point.falloff;
        const index = (y * width + x) * 3;
        irradiance[index] += color[0] * amount;
        irradiance[index + 1] += color[1] * amount;
        irradiance[index + 2] += color[2] * amount;
      }
    }
  }
  for (let index = 0, lightIndex = 0; index < pixels.length; index += 4, lightIndex += 3) {
    if (pixels[index + 3] === 0) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const linear = Math.min(1, LINEAR_FROM_BYTE[pixels[index + channel]] * irradiance[lightIndex + channel]);
      pixels[index + channel] = BYTE_FROM_LINEAR[Math.round(linear * 4096)];
    }
  }
}
