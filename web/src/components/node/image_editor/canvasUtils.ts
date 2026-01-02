/**
 * Canvas utility functions for the Image Editor
 */

import type { Point, CropRegion, AdjustmentSettings } from "./types";

/**
 * Loads an image from a URL
 */
export const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const isBlobUrl = url.startsWith("blob:");
    const isDataUrl = url.startsWith("data:");
    const isLocalApi = url.includes("localhost:7777/api/");

    if (isBlobUrl || isDataUrl) {
      img.src = url;
    } else if (isLocalApi) {
      const proxyUrl = url.replace("http://localhost:7777", "");
      img.src = proxyUrl;
    } else {
      img.crossOrigin = "anonymous";
      img.src = url;
    }
    img.onload = () => resolve(img);
    img.onerror = reject;
  });
};

/**
 * Checks if a URL is a blob URI
 */
export const isBlobUrl = (url: string): boolean => {
  return url.startsWith("blob:");
};

/**
 * Fetches a blob from a URL (useful for blob URIs)
 */
export const fetchBlob = async (url: string): Promise<Blob> => {
  if (!isBlobUrl(url)) {
    throw new Error("URL is not a blob URL");
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch blob: ${response.statusText}`);
  }
  return response.blob();
};

/**
 * Draws an image centered on a canvas with zoom and pan
 */
export const drawImageOnCanvas = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
  zoom: number,
  pan: Point
): void => {
  // Clear canvas
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Calculate centered position
  const scaledWidth = img.width * zoom;
  const scaledHeight = img.height * zoom;
  const x = (canvas.width - scaledWidth) / 2 + pan.x;
  const y = (canvas.height - scaledHeight) / 2 + pan.y;

  // Draw image
  ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
};

/**
 * Converts canvas coordinates to image coordinates
 */
export const canvasToImageCoords = (
  canvasX: number,
  canvasY: number,
  canvas: HTMLCanvasElement,
  imgWidth: number,
  imgHeight: number,
  zoom: number,
  pan: Point
): Point => {
  const scaledWidth = imgWidth * zoom;
  const scaledHeight = imgHeight * zoom;
  const imgX = (canvas.width - scaledWidth) / 2 + pan.x;
  const imgY = (canvas.height - scaledHeight) / 2 + pan.y;

  return {
    x: (canvasX - imgX) / zoom,
    y: (canvasY - imgY) / zoom
  };
};

/**
 * Converts image coordinates to canvas coordinates
 */
export const imageToCanvasCoords = (
  imgX: number,
  imgY: number,
  canvas: HTMLCanvasElement,
  imgWidth: number,
  imgHeight: number,
  zoom: number,
  pan: Point
): Point => {
  const scaledWidth = imgWidth * zoom;
  const scaledHeight = imgHeight * zoom;
  const offsetX = (canvas.width - scaledWidth) / 2 + pan.x;
  const offsetY = (canvas.height - scaledHeight) / 2 + pan.y;

  return {
    x: imgX * zoom + offsetX,
    y: imgY * zoom + offsetY
  };
};

/**
 * Draws the crop overlay on the canvas
 */
export const drawCropOverlay = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  cropRegion: CropRegion,
  imgWidth: number,
  imgHeight: number,
  zoom: number,
  pan: Point
): void => {
  // Draw semi-transparent overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Convert crop region to canvas coordinates
  const topLeft = imageToCanvasCoords(
    cropRegion.x,
    cropRegion.y,
    canvas,
    imgWidth,
    imgHeight,
    zoom,
    pan
  );
  const bottomRight = imageToCanvasCoords(
    cropRegion.x + cropRegion.width,
    cropRegion.y + cropRegion.height,
    canvas,
    imgWidth,
    imgHeight,
    zoom,
    pan
  );

  const cropWidth = bottomRight.x - topLeft.x;
  const cropHeight = bottomRight.y - topLeft.y;

  // Clear the crop area to show the image
  ctx.clearRect(topLeft.x, topLeft.y, cropWidth, cropHeight);

  // Draw crop border
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(topLeft.x, topLeft.y, cropWidth, cropHeight);
  ctx.setLineDash([]);

  // Draw rule of thirds lines
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 1;

  // Vertical lines
  for (let i = 1; i < 3; i++) {
    const x = topLeft.x + (cropWidth * i) / 3;
    ctx.beginPath();
    ctx.moveTo(x, topLeft.y);
    ctx.lineTo(x, topLeft.y + cropHeight);
    ctx.stroke();
  }

  // Horizontal lines
  for (let i = 1; i < 3; i++) {
    const y = topLeft.y + (cropHeight * i) / 3;
    ctx.beginPath();
    ctx.moveTo(topLeft.x, y);
    ctx.lineTo(topLeft.x + cropWidth, y);
    ctx.stroke();
  }

  // Draw corner handles
  const handleSize = 10;
  ctx.fillStyle = "#ffffff";

  // Top-left
  ctx.fillRect(topLeft.x - handleSize / 2, topLeft.y - handleSize / 2, handleSize, handleSize);
  // Top-right
  ctx.fillRect(bottomRight.x - handleSize / 2, topLeft.y - handleSize / 2, handleSize, handleSize);
  // Bottom-left
  ctx.fillRect(topLeft.x - handleSize / 2, bottomRight.y - handleSize / 2, handleSize, handleSize);
  // Bottom-right
  ctx.fillRect(bottomRight.x - handleSize / 2, bottomRight.y - handleSize / 2, handleSize, handleSize);
};

/**
 * Applies adjustments to image data
 */
export const applyAdjustments = (
  imageData: ImageData,
  adjustments: AdjustmentSettings
): ImageData => {
  const data = imageData.data;
  const { brightness, contrast, saturation } = adjustments;

  // Pre-calculate factors
  const brightnessFactor = brightness / 100;
  const contrastFactor = (100 + contrast) / 100;
  const saturationFactor = 1 + saturation / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Apply brightness
    r = Math.min(255, Math.max(0, r + 255 * brightnessFactor));
    g = Math.min(255, Math.max(0, g + 255 * brightnessFactor));
    b = Math.min(255, Math.max(0, b + 255 * brightnessFactor));

    // Apply contrast
    r = Math.min(255, Math.max(0, (r - 128) * contrastFactor + 128));
    g = Math.min(255, Math.max(0, (g - 128) * contrastFactor + 128));
    b = Math.min(255, Math.max(0, (b - 128) * contrastFactor + 128));

    // Apply saturation
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = Math.min(255, Math.max(0, gray + (r - gray) * saturationFactor));
    g = Math.min(255, Math.max(0, gray + (g - gray) * saturationFactor));
    b = Math.min(255, Math.max(0, gray + (b - gray) * saturationFactor));

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  return imageData;
};

/**
 * Creates a new canvas with the image rotated
 */
export const rotateImage = (
  source: HTMLCanvasElement | HTMLImageElement,
  degrees: number
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  const radians = (degrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));

  const sourceWidth = source.width;
  const sourceHeight = source.height;

  canvas.width = sourceWidth * cos + sourceHeight * sin;
  canvas.height = sourceWidth * sin + sourceHeight * cos;

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(source, -sourceWidth / 2, -sourceHeight / 2);

  return canvas;
};

/**
 * Creates a new canvas with the image flipped
 */
export const flipImage = (
  source: HTMLCanvasElement | HTMLImageElement,
  horizontal: boolean
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  const sourceWidth = source.width;
  const sourceHeight = source.height;

  canvas.width = sourceWidth;
  canvas.height = sourceHeight;

  if (horizontal) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(0, canvas.height);
    ctx.scale(1, -1);
  }

  ctx.drawImage(source, 0, 0);

  return canvas;
};

/**
 * Crops the canvas to the specified region
 */
export const cropCanvas = (
  source: HTMLCanvasElement,
  region: CropRegion
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  canvas.width = region.width;
  canvas.height = region.height;

  ctx.drawImage(
    source,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height
  );

  return canvas;
};

/**
 * Exports canvas to Blob
 */
export const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality = 0.92
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to create blob"));
        }
      },
      type,
      quality
    );
  });
};

/**
 * Exports canvas to data URL
 */
export const canvasToDataUrl = (
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality = 0.92
): string => {
  return canvas.toDataURL(type, quality);
};

/**
 * Creates a drawing canvas element with specified dimensions
 */
export const createDrawingCanvas = (
  width: number,
  height: number
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

/**
 * Merges drawing canvas with image canvas
 */
export const mergeCanvases = (
  imageCanvas: HTMLCanvasElement,
  drawingCanvas: HTMLCanvasElement
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  canvas.width = imageCanvas.width;
  canvas.height = imageCanvas.height;

  ctx.drawImage(imageCanvas, 0, 0);
  ctx.drawImage(drawingCanvas, 0, 0);

  return canvas;
};
