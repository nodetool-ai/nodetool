/**
 * Canvas utility functions for the Image Editor
 */

import type { Point, CropRegion, AdjustmentSettings, ShapeSettings } from "./types";

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

/**
 * Flood fill algorithm for the fill tool
 */
export const floodFill = (
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColor: string
): void => {
  const canvas = ctx.canvas;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Parse fill color
  const fillRGB = hexToRgb(fillColor);
  if (!fillRGB) {return;}
  
  // Get the color at the starting point
  const startIdx = (startY * canvas.width + startX) * 4;
  const startR = data[startIdx];
  const startG = data[startIdx + 1];
  const startB = data[startIdx + 2];
  const startA = data[startIdx + 3];
  
  // If the start color is the same as fill color, return
  if (
    startR === fillRGB.r &&
    startG === fillRGB.g &&
    startB === fillRGB.b &&
    startA === 255
  ) {
    return;
  }
  
  // Tolerance for color matching
  const tolerance = 32;
  
  const matchesStart = (idx: number): boolean => {
    return (
      Math.abs(data[idx] - startR) <= tolerance &&
      Math.abs(data[idx + 1] - startG) <= tolerance &&
      Math.abs(data[idx + 2] - startB) <= tolerance &&
      Math.abs(data[idx + 3] - startA) <= tolerance
    );
  };
  
  // Stack-based flood fill
  const stack: [number, number][] = [[startX, startY]];
  const visited = new Set<number>();
  
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
      continue;
    }
    
    const idx = (y * canvas.width + x) * 4;
    const key = y * canvas.width + x;
    
    if (visited.has(key)) {
      continue;
    }
    
    if (!matchesStart(idx)) {
      continue;
    }
    
    visited.add(key);
    
    // Fill the pixel
    data[idx] = fillRGB.r;
    data[idx + 1] = fillRGB.g;
    data[idx + 2] = fillRGB.b;
    data[idx + 3] = 255;
    
    // Add neighbors
    stack.push([x + 1, y]);
    stack.push([x - 1, y]);
    stack.push([x, y + 1]);
    stack.push([x, y - 1]);
  }
  
  ctx.putImageData(imageData, 0, 0);
};

/**
 * Helper function to convert hex color to RGB
 */
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : null;
};

/**
 * Draws a shape preview on the overlay canvas
 */
export const drawShape = (
  ctx: CanvasRenderingContext2D,
  shapeType: "rectangle" | "ellipse" | "line" | "arrow",
  start: Point,
  end: Point,
  settings: ShapeSettings,
  zoom: number,
  pan: Point,
  canvas: HTMLCanvasElement,
  imgWidth: number,
  imgHeight: number
): void => {
  // Convert image coordinates to canvas coordinates
  const startCanvas = imageToCanvasCoords(start.x, start.y, canvas, imgWidth, imgHeight, zoom, pan);
  const endCanvas = imageToCanvasCoords(end.x, end.y, canvas, imgWidth, imgHeight, zoom, pan);
  
  ctx.save();
  ctx.strokeStyle = settings.strokeColor;
  ctx.lineWidth = settings.strokeWidth * zoom;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  
  switch (shapeType) {
    case "rectangle": {
      const x = Math.min(startCanvas.x, endCanvas.x);
      const y = Math.min(startCanvas.y, endCanvas.y);
      const w = Math.abs(endCanvas.x - startCanvas.x);
      const h = Math.abs(endCanvas.y - startCanvas.y);
      
      if (settings.filled) {
        ctx.fillStyle = settings.fillColor;
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeRect(x, y, w, h);
      break;
    }
    
    case "ellipse": {
      const cx = (startCanvas.x + endCanvas.x) / 2;
      const cy = (startCanvas.y + endCanvas.y) / 2;
      const rx = Math.abs(endCanvas.x - startCanvas.x) / 2;
      const ry = Math.abs(endCanvas.y - startCanvas.y) / 2;
      
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
      if (settings.filled) {
        ctx.fillStyle = settings.fillColor;
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    
    case "line": {
      ctx.beginPath();
      ctx.moveTo(startCanvas.x, startCanvas.y);
      ctx.lineTo(endCanvas.x, endCanvas.y);
      ctx.stroke();
      break;
    }
    
    case "arrow": {
      drawArrowOnCanvas(ctx, startCanvas, endCanvas, settings.strokeWidth * zoom);
      break;
    }
  }
  
  ctx.restore();
};

/**
 * Draws an arrow from start to end point (for canvas coordinates)
 */
const drawArrowOnCanvas = (
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  lineWidth: number
): void => {
  const headLength = Math.max(lineWidth * 3, 10);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  
  // Draw line
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  
  // Draw arrowhead
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLength * Math.cos(angle - Math.PI / 6),
    end.y - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    end.x - headLength * Math.cos(angle + Math.PI / 6),
    end.y - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
};

/**
 * Draws an arrow from start to end point (for image coordinates, used in final draw)
 */
export const drawArrow = (
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  lineWidth: number
): void => {
  const headLength = Math.max(lineWidth * 3, 10);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  
  ctx.fillStyle = ctx.strokeStyle;
  
  // Draw line
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  
  // Draw arrowhead
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLength * Math.cos(angle - Math.PI / 6),
    end.y - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    end.x - headLength * Math.cos(angle + Math.PI / 6),
    end.y - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
};
