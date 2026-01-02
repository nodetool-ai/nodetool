/**
 * Timeline Transition Renderer
 *
 * Provides utilities for rendering transitions and fades on clips:
 * - Crossfade: blend opacity between clips
 * - Dissolve: pixel-based dissolve effect
 * - Fade in/out: opacity ramps
 *
 * Uses Canvas 2D for compositing effects.
 */

import { Clip, Transition } from "../../stores/TimelineStore";

// ============================================================================
// Types
// ============================================================================

export interface TransitionContext {
  /** Current playhead position in seconds */
  currentTime: number;
  /** Canvas 2D context for rendering */
  ctx: CanvasRenderingContext2D;
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
}

export interface ClipRenderInfo {
  clip: Clip;
  /** Image/video element to render */
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
  /** Time position within the clip (0 = start, duration = end) */
  clipTime: number;
}

// ============================================================================
// Fade Calculations
// ============================================================================

/**
 * Calculate fade in opacity based on clip time and fade duration
 */
export function calculateFadeInOpacity(clipTime: number, fadeInDuration: number): number {
  if (fadeInDuration <= 0) return 1;
  if (clipTime >= fadeInDuration) return 1;
  if (clipTime <= 0) return 0;
  return clipTime / fadeInDuration;
}

/**
 * Calculate fade out opacity based on clip time, duration, and fade duration
 */
export function calculateFadeOutOpacity(
  clipTime: number,
  clipDuration: number,
  fadeOutDuration: number
): number {
  if (fadeOutDuration <= 0) return 1;
  const fadeOutStart = clipDuration - fadeOutDuration;
  if (clipTime <= fadeOutStart) return 1;
  if (clipTime >= clipDuration) return 0;
  return (clipDuration - clipTime) / fadeOutDuration;
}

/**
 * Calculate combined opacity for a clip considering both fades
 */
export function calculateClipOpacity(clip: Clip, clipTime: number): number {
  const fadeIn = calculateFadeInOpacity(clipTime, clip.fadeIn ?? 0);
  const fadeOut = calculateFadeOutOpacity(clipTime, clip.duration, clip.fadeOut ?? 0);
  const baseOpacity = clip.opacity ?? 1;
  return baseOpacity * fadeIn * fadeOut;
}

// ============================================================================
// Transition Calculations
// ============================================================================

/**
 * Check if we're currently in a transition period between two clips
 */
export function isInTransition(
  currentTime: number,
  fromClip: Clip,
  toClip: Clip
): boolean {
  const fromEnd = fromClip.startTime + fromClip.duration;
  const toStart = toClip.startTime;

  // Clips must be adjacent or overlapping
  if (fromEnd < toStart - 0.001) return false;

  const transition = fromClip.transitions?.out || toClip.transitions?.in;
  if (!transition) return false;

  const transitionStart = Math.min(fromEnd, toStart) - transition.duration / 2;
  const transitionEnd = Math.min(fromEnd, toStart) + transition.duration / 2;

  return currentTime >= transitionStart && currentTime <= transitionEnd;
}

/**
 * Calculate transition progress (0 = start, 1 = end)
 */
export function calculateTransitionProgress(
  currentTime: number,
  fromClip: Clip,
  toClip: Clip,
  transition: Transition
): number {
  const transitionPoint = Math.min(
    fromClip.startTime + fromClip.duration,
    toClip.startTime
  );
  const transitionStart = transitionPoint - transition.duration / 2;
  const transitionEnd = transitionPoint + transition.duration / 2;

  if (currentTime <= transitionStart) return 0;
  if (currentTime >= transitionEnd) return 1;

  return (currentTime - transitionStart) / transition.duration;
}

// ============================================================================
// Rendering Functions
// ============================================================================

/**
 * Apply crossfade effect between two clips
 * Blends opacity linearly from fromClip to toClip
 */
export function applyCrossfade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fromSource: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null,
  toSource: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null,
  progress: number,
  fromOpacity: number = 1,
  toOpacity: number = 1
): void {
  // Clear the canvas
  ctx.clearRect(0, 0, width, height);

  // Draw "from" clip with decreasing opacity
  if (fromSource) {
    ctx.globalAlpha = (1 - progress) * fromOpacity;
    drawFittedSource(ctx, fromSource, width, height);
  }

  // Draw "to" clip with increasing opacity
  if (toSource) {
    ctx.globalAlpha = progress * toOpacity;
    drawFittedSource(ctx, toSource, width, height);
  }

  // Reset global alpha
  ctx.globalAlpha = 1;
}

/**
 * Apply dissolve effect between two clips
 * Creates a pixel-based dissolve pattern
 */
export function applyDissolve(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fromSource: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null,
  toSource: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null,
  progress: number,
  fromOpacity: number = 1,
  toOpacity: number = 1
): void {
  // For performance, we'll use a noise-based pattern approach
  // First, draw the "from" clip
  ctx.clearRect(0, 0, width, height);

  if (fromSource) {
    ctx.globalAlpha = fromOpacity;
    drawFittedSource(ctx, fromSource, width, height);
  }

  // Create a temporary canvas for the "to" clip
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext("2d");

  if (tempCtx && toSource) {
    // Draw "to" clip on temp canvas
    drawFittedSource(tempCtx, toSource, width, height);

    // Apply noise-based dissolve mask
    const imageData = tempCtx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Use a deterministic noise pattern based on pixel position
    for (let i = 0; i < data.length; i += 4) {
      const pixelIndex = i / 4;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);

      // Simple noise function (can be replaced with better noise)
      const noise = pseudoRandomNoise(x, y);

      // Compare noise to progress to determine visibility
      if (noise < progress) {
        // Show "to" pixel
        data[i + 3] = Math.round(data[i + 3] * toOpacity);
      } else {
        // Hide pixel (transparent)
        data[i + 3] = 0;
      }
    }

    tempCtx.putImageData(imageData, 0, 0);

    // Composite the masked "to" clip onto main canvas
    ctx.globalAlpha = 1;
    ctx.drawImage(tempCanvas, 0, 0);
  }

  ctx.globalAlpha = 1;
}

/**
 * Simple pseudo-random noise function for dissolve effect
 * Returns value between 0 and 1
 */
function pseudoRandomNoise(x: number, y: number): number {
  // Use a simple hash function for deterministic noise
  const seed = x * 12.9898 + y * 78.233;
  const noise = Math.sin(seed) * 43758.5453;
  return noise - Math.floor(noise);
}

/**
 * Draw source element fitted to canvas dimensions
 */
export function drawFittedSource(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  canvasWidth: number,
  canvasHeight: number
): void {
  let sourceWidth: number;
  let sourceHeight: number;

  if (source instanceof HTMLVideoElement) {
    sourceWidth = source.videoWidth || source.width;
    sourceHeight = source.videoHeight || source.height;
  } else if (source instanceof HTMLImageElement) {
    sourceWidth = source.naturalWidth || source.width;
    sourceHeight = source.naturalHeight || source.height;
  } else {
    sourceWidth = source.width;
    sourceHeight = source.height;
  }

  if (sourceWidth === 0 || sourceHeight === 0) {
    // Source not loaded yet
    return;
  }

  // Calculate fit dimensions (contain mode)
  const sourceAspect = sourceWidth / sourceHeight;
  const canvasAspect = canvasWidth / canvasHeight;

  let drawWidth: number;
  let drawHeight: number;
  let drawX: number;
  let drawY: number;

  if (sourceAspect > canvasAspect) {
    // Source is wider - fit to width
    drawWidth = canvasWidth;
    drawHeight = canvasWidth / sourceAspect;
    drawX = 0;
    drawY = (canvasHeight - drawHeight) / 2;
  } else {
    // Source is taller - fit to height
    drawHeight = canvasHeight;
    drawWidth = canvasHeight * sourceAspect;
    drawX = (canvasWidth - drawWidth) / 2;
    drawY = 0;
  }

  ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
}

/**
 * Render a single clip with its fade effects applied
 */
export function renderClipWithFades(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  clip: Clip,
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null,
  clipTime: number
): void {
  if (!source) {
    // Draw placeholder for missing source
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#666";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No source", width / 2, height / 2);
    return;
  }

  // Calculate combined opacity with fades
  const opacity = calculateClipOpacity(clip, clipTime);

  ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = opacity;
  drawFittedSource(ctx, source, width, height);
  ctx.globalAlpha = 1;
}

/**
 * Render clips with transition between them
 */
export function renderWithTransition(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fromClip: Clip,
  toClip: Clip,
  fromSource: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null,
  toSource: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null,
  currentTime: number
): void {
  const transition = fromClip.transitions?.out || toClip.transitions?.in;

  if (!transition || transition.type === "cut") {
    // No transition or cut - just render current clip
    const inFromClip =
      currentTime >= fromClip.startTime &&
      currentTime < fromClip.startTime + fromClip.duration;

    if (inFromClip && fromSource) {
      const clipTime = currentTime - fromClip.startTime;
      renderClipWithFades(ctx, width, height, fromClip, fromSource, clipTime);
    } else if (toSource) {
      const clipTime = currentTime - toClip.startTime;
      renderClipWithFades(ctx, width, height, toClip, toSource, clipTime);
    }
    return;
  }

  // Calculate transition progress
  const progress = calculateTransitionProgress(
    currentTime,
    fromClip,
    toClip,
    transition
  );

  // Calculate individual clip opacities (for fades)
  const fromClipTime = currentTime - fromClip.startTime;
  const toClipTime = currentTime - toClip.startTime;
  const fromOpacity = calculateClipOpacity(fromClip, fromClipTime);
  const toOpacity = calculateClipOpacity(toClip, toClipTime);

  // Apply transition effect
  switch (transition.type) {
    case "crossfade":
      applyCrossfade(
        ctx,
        width,
        height,
        fromSource,
        toSource,
        progress,
        fromOpacity,
        toOpacity
      );
      break;
    case "dissolve":
      applyDissolve(
        ctx,
        width,
        height,
        fromSource,
        toSource,
        progress,
        fromOpacity,
        toOpacity
      );
      break;
    default:
      // Fallback to crossfade
      applyCrossfade(
        ctx,
        width,
        height,
        fromSource,
        toSource,
        progress,
        fromOpacity,
        toOpacity
      );
  }
}

// ============================================================================
// Audio Fade Calculation (for audio playback)
// ============================================================================

/**
 * Calculate audio volume multiplier considering fade in/out
 */
export function calculateAudioVolume(clip: Clip, clipTime: number): number {
  const fadeIn = calculateFadeInOpacity(clipTime, clip.fadeIn ?? 0);
  const fadeOut = calculateFadeOutOpacity(clipTime, clip.duration, clip.fadeOut ?? 0);
  const baseVolume = clip.volume ?? 1;
  return baseVolume * fadeIn * fadeOut;
}
