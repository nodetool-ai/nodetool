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
    const document = JSON.parse(await documentJson.async("string")) as SketchDocument;
    
    // Parse meta.json
    const metaJson = zip.file("meta.json");
    if (!metaJson) {
      return {
        success: false,
        error: "Invalid Sketch file: missing meta.json"
      };
    }
    const meta = JSON.parse(await metaJson.async("string")) as Meta;
    
    // Parse user.json
    const userJson = zip.file("user.json");
    if (!userJson) {
      return {
        success: false,
        error: "Invalid Sketch file: missing user.json"
      };
    }
    const user = JSON.parse(await userJson.async("string")) as User;
    
    // Parse pages from pages/ folder
    const pages: SketchPage[] = [];
    const pagesFolder = zip.folder("pages");
    
    if (pagesFolder) {
      const pageFiles: JSZip.JSZipObject[] = [];
      pagesFolder.forEach((_relativePath, file) => {
        if (file.name.endsWith(".json")) {
          pageFiles.push(file);
        }
      });
      
      for (const pageFile of pageFiles) {
        const pageContent = await pageFile.async("string");
        const page = JSON.parse(pageContent) as SketchPage;
        pages.push(page);
      }
    }
    
    // Extract images from images/ folder
    const images = new Map<string, Blob>();
    const imagesFolder = zip.folder("images");
    
    if (imagesFolder) {
      const imageFiles: [string, JSZip.JSZipObject][] = [];
      imagesFolder.forEach((relativePath, file) => {
        if (!file.dir) {
          imageFiles.push([relativePath, file]);
        }
      });
      
      for (const [relativePath, imageFile] of imageFiles) {
        const blob = await imageFile.async("blob");
        images.set(relativePath, blob);
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
