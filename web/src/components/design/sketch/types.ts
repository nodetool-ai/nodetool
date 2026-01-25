/**
 * Types for Sketch file format integration
 * 
 * These types represent the internal representation of a Sketch document
 * that bridges between our LayoutCanvas format and the native Sketch format.
 */

import FileFormat from "@sketch-hq/sketch-file-format-ts";

// Re-export Sketch types for convenience
export type SketchPage = FileFormat.Page;
export type SketchArtboard = FileFormat.Artboard;
export type SketchRectangle = FileFormat.Rectangle;
export type SketchOval = FileFormat.Oval;
export type SketchText = FileFormat.Text;
export type SketchGroup = FileFormat.Group;
export type SketchBitmap = FileFormat.Bitmap;
export type Meta = FileFormat.Meta;
export type SketchDocument = FileFormat.Document;
export type User = FileFormat.User;
export type Style = FileFormat.Style;
export type SketchColor = FileFormat.Color;

/**
 * Represents the parsed contents of a Sketch file
 */
export interface SketchFileContents {
  document: SketchDocument;
  meta: Meta;
  user: User;
  pages: SketchPage[];
  images: Map<string, Blob>;
}

/**
 * Result of parsing a Sketch file
 */
export interface SketchParseResult {
  success: boolean;
  contents?: SketchFileContents;
  error?: string;
}

/**
 * Options for writing a Sketch file
 */
export interface SketchWriteOptions {
  /** Include preview thumbnail */
  includePreview?: boolean;
  /** Sketch version to target (default: 146) */
  version?: number;
  /** App version string (default: "99.0") */
  appVersion?: string;
}

/**
 * Layer types supported in our editor that map to Sketch
 */
export type SupportedLayerType = 
  | "rectangle" 
  | "oval" 
  | "text" 
  | "group" 
  | "bitmap";

/**
 * Union of all Sketch layer types we support
 */
export type SketchLayer = 
  | SketchRectangle 
  | SketchOval 
  | SketchText 
  | SketchGroup 
  | SketchBitmap;

/**
 * Common properties shared by all layers
 */
export interface CommonLayerProps {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  locked: boolean;
}

/**
 * Sketch color in RGBA format (0-1 range)
 */
export interface SketchRGBA {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

/**
 * Helper to convert hex color to Sketch RGBA
 */
export function hexToSketchColor(hex: string): SketchRGBA {
  // Remove # if present
  hex = hex.replace(/^#/, "");
  
  // Handle shorthand hex
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1;
  
  return { red: r, green: g, blue: b, alpha: a };
}

/**
 * Helper to convert Sketch RGBA to hex color
 */
export function sketchColorToHex(color: SketchRGBA): string {
  const toHex = (n: number) => {
    const hex = Math.round(n * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  
  return `#${toHex(color.red)}${toHex(color.green)}${toHex(color.blue)}`;
}

/**
 * Generate a UUID in Sketch's format
 */
export function generateSketchUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

/**
 * Format a point as Sketch's PointString format
 */
export function formatPointString(x: number, y: number): string {
  return `{${x}, ${y}}`;
}

/**
 * Parse a Sketch PointString format
 */
export function parsePointString(pointString: string): { x: number; y: number } {
  const match = pointString.match(/\{([^,]+),\s*([^}]+)\}/);
  if (!match) {
    return { x: 0, y: 0 };
  }
  return {
    x: parseFloat(match[1]),
    y: parseFloat(match[2])
  };
}
