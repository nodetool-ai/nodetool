/**
 * Sketch File Parser
 * 
 * Reads and parses .sketch files into a usable format.
 * Sketch files are ZIP archives containing JSON files.
 */

import JSZip from "jszip";
import FileFormat from "@sketch-hq/sketch-file-format-ts";
import type { SketchFileContents, SketchParseResult } from "./types";

type SketchPage = FileFormat.Page;
type SketchDocument = FileFormat.Document;
type Meta = FileFormat.Meta;
type User = FileFormat.User;

/**
 * Read a Sketch file from a File object or ArrayBuffer
 */
export async function readSketchFile(
  input: File | ArrayBuffer
): Promise<SketchParseResult> {
  try {
    const data = input instanceof File ? await input.arrayBuffer() : input;
    return await parseSketchFile(data);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to read Sketch file"
    };
  }
}

/**
 * Maximum file size for individual JSON files (10MB)
 */
const MAX_JSON_SIZE = 10 * 1024 * 1024;

/**
 * Maximum number of pages to process
 */
const MAX_PAGES = 100;

/**
 * Maximum image size (50MB per image)
 */
const MAX_IMAGE_SIZE = 50 * 1024 * 1024;

/**
 * Maximum total images
 */
const MAX_IMAGES = 500;

/**
 * Sanitize a filename to prevent path traversal attacks
 */
function sanitizeFilename(filename: string): string {
  // Remove directory separators and any path traversal attempts
  return filename.replace(/[/\\]/g, "_").replace(/\.\./g, "_");
}

/**
 * Safely parse JSON with size limit
 */
async function safeParseJson<T>(
  file: JSZip.JSZipObject,
  maxSize: number = MAX_JSON_SIZE
): Promise<T> {
  // Check file size first if available
  const content = await file.async("string");
  if (content.length > maxSize) {
    throw new Error(`File ${file.name} exceeds maximum allowed size`);
  }
  return JSON.parse(content) as T;
}

/**
 * Parse a Sketch file from binary data
 */
export async function parseSketchFile(
  data: ArrayBuffer
): Promise<SketchParseResult> {
  try {
    const zip = await JSZip.loadAsync(data);
    
    // Parse document.json
    const documentJson = zip.file("document.json");
    if (!documentJson) {
      return {
        success: false,
        error: "Invalid Sketch file: missing document.json"
      };
    }
    const document = await safeParseJson<SketchDocument>(documentJson);
    
    // Parse meta.json
    const metaJson = zip.file("meta.json");
    if (!metaJson) {
      return {
        success: false,
        error: "Invalid Sketch file: missing meta.json"
      };
    }
    const meta = await safeParseJson<Meta>(metaJson);
    
    // Parse user.json
    const userJson = zip.file("user.json");
    if (!userJson) {
      return {
        success: false,
        error: "Invalid Sketch file: missing user.json"
      };
    }
    const user = await safeParseJson<User>(userJson);
    
    // Parse pages from pages/ folder
    const pages: SketchPage[] = [];
    const pagesFolder = zip.folder("pages");
    
    if (pagesFolder) {
      const pageFiles: JSZip.JSZipObject[] = [];
      pagesFolder.forEach((_relativePath, file) => {
        if (file.name.endsWith(".json") && pageFiles.length < MAX_PAGES) {
          pageFiles.push(file);
        }
      });
      
      for (const pageFile of pageFiles) {
        const page = await safeParseJson<SketchPage>(pageFile);
        pages.push(page);
      }
    }
    
    // Extract images from images/ folder with size limits
    const images = new Map<string, Blob>();
    const imagesFolder = zip.folder("images");
    
    if (imagesFolder) {
      const imageFiles: [string, JSZip.JSZipObject][] = [];
      imagesFolder.forEach((relativePath, file) => {
        // Sanitize path and skip directories
        if (!file.dir && imageFiles.length < MAX_IMAGES) {
          const sanitizedPath = sanitizeFilename(relativePath);
          imageFiles.push([sanitizedPath, file]);
        }
      });
      
      for (const [sanitizedPath, imageFile] of imageFiles) {
        const blob = await imageFile.async("blob");
        // Skip images that are too large
        if (blob.size <= MAX_IMAGE_SIZE) {
          images.set(sanitizedPath, blob);
        }
      }
    }
    
    return {
      success: true,
      contents: {
        document,
        meta,
        user,
        pages,
        images
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to parse Sketch file"
    };
  }
}

/**
 * Extract layer information from a Sketch page
 */
export function extractLayersFromPage(page: SketchPage): SketchPage["layers"] {
  return page.layers || [];
}

/**
 * Find all artboards in a page
 */
export function findArtboards(
  page: SketchPage
): Array<SketchPage["layers"][number] & { _class: "artboard" }> {
  return page.layers.filter(
    (layer): layer is SketchPage["layers"][number] & { _class: "artboard" } =>
      layer._class === "artboard"
  );
}

/**
 * Recursively extract all layers from a page (flattened)
 */
export function flattenLayers(
  layers: SketchPage["layers"]
): SketchPage["layers"] {
  const result: SketchPage["layers"] = [];
  
  for (const layer of layers) {
    result.push(layer);
    
    // Recursively process groups and artboards
    if ("layers" in layer && Array.isArray(layer.layers)) {
      result.push(...flattenLayers(layer.layers as SketchPage["layers"]));
    }
  }
  
  return result;
}

/**
 * Get Sketch file version info
 */
export function getSketchVersion(meta: Meta): {
  version: number;
  appVersion: string;
  build: number;
} {
  return {
    version: meta.version,
    appVersion: meta.appVersion,
    build: meta.build
  };
}
