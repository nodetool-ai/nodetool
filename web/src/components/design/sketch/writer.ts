/**
 * Sketch File Writer
 * 
 * Creates and writes .sketch files from our internal format.
 * Sketch files are ZIP archives containing JSON files.
 */

import JSZip from "jszip";
import FileFormat from "@sketch-hq/sketch-file-format-ts";
import type { SketchWriteOptions } from "./types";
import { generateSketchUUID } from "./types";

// Type aliases
type SketchDocument = FileFormat.Document;
type SketchPage = FileFormat.Page;
type Meta = FileFormat.Meta;
type User = FileFormat.User;

// Enum values
const ColorSpace = FileFormat.ColorSpace;
const NumericalBool = FileFormat.NumericalBool;
const BundleId = FileFormat.BundleId;

/**
 * Sanitize a filename to prevent path traversal attacks
 */
function sanitizeFilename(filename: string): string {
  // Remove directory separators and any path traversal attempts
  return filename.replace(/[/\\]/g, "_").replace(/\.\./g, "_");
}

/**
 * Default Sketch document template
 */
function createDefaultDocument(pages: SketchPage[]): SketchDocument {
  return {
    _class: "document",
    do_objectID: generateSketchUUID(),
    assets: {
      _class: "assetCollection",
      do_objectID: generateSketchUUID(),
      colorAssets: [],
      gradientAssets: [],
      images: [],
      colors: [],
      gradients: [],
      exportPresets: []
    },
    colorSpace: ColorSpace.SRGB,
    currentPageIndex: 0,
    foreignLayerStyles: [],
    foreignSymbols: [],
    foreignTextStyles: [],
    layerStyles: {
      _class: "sharedStyleContainer",
      do_objectID: generateSketchUUID(),
      objects: []
    },
    layerTextStyles: {
      _class: "sharedTextStyleContainer",
      do_objectID: generateSketchUUID(),
      objects: []
    },
    perDocumentLibraries: [],
    pages: pages.map((page) => ({
      _class: "MSJSONFileReference" as const,
      _ref_class: "MSImmutablePage" as const,
      _ref: `pages/${page.do_objectID}`
    }))
  };
}

/**
 * Default meta.json content
 */
function createDefaultMeta(
  pages: SketchPage[],
  options: SketchWriteOptions = {}
): Meta {
  const version = options.version ?? 146;
  const appVersion = options.appVersion ?? "99.0";
  
  // Build pagesAndArtboards structure
  const pagesAndArtboards: Meta["pagesAndArtboards"] = {};
  for (const page of pages) {
    const artboards: { [key: string]: { name: string } } = {};
    for (const layer of page.layers) {
      if (layer._class === "artboard") {
        artboards[layer.do_objectID] = { name: layer.name };
      }
    }
    pagesAndArtboards[page.do_objectID] = {
      name: page.name,
      artboards
    };
  }
  
  return {
    commit: "",
    pagesAndArtboards,
    version: version as Meta["version"],
    compatibilityVersion: 99,
    app: BundleId.PublicRelease,
    autosaved: NumericalBool.True,
    variant: "NONAPPSTORE",
    created: {
      commit: "",
      appVersion,
      build: 0,
      app: BundleId.PublicRelease,
      compatibilityVersion: 99,
      version,
      variant: "NONAPPSTORE"
    },
    saveHistory: [],
    appVersion,
    build: 0
  };
}

/**
 * Default user.json content
 */
function createDefaultUser(pages: SketchPage[]): User {
  const user: User = {
    document: {
      pageListHeight: 200,
      pageListCollapsed: NumericalBool.True
    }
  };
  
  // Add page viewport info
  for (const page of pages) {
    user[page.do_objectID] = {
      scrollOrigin: "{0, 0}",
      zoomValue: 1
    };
  }
  
  return user;
}

/**
 * Write a Sketch file from pages
 */
export async function writeSketchFile(
  pages: SketchPage[],
  images: Map<string, Blob> = new Map(),
  options: SketchWriteOptions = {}
): Promise<Blob> {
  const zip = new JSZip();
  
  // Create document.json
  const document = createDefaultDocument(pages);
  zip.file("document.json", JSON.stringify(document, null, 2));
  
  // Create meta.json
  const meta = createDefaultMeta(pages, options);
  zip.file("meta.json", JSON.stringify(meta, null, 2));
  
  // Create user.json
  const user = createDefaultUser(pages);
  zip.file("user.json", JSON.stringify(user, null, 2));
  
  // Create pages folder and add page files
  const pagesFolder = zip.folder("pages");
  if (pagesFolder) {
    for (const page of pages) {
      pagesFolder.file(`${page.do_objectID}.json`, JSON.stringify(page, null, 2));
    }
  }
  
  // Create images folder and add images
  if (images.size > 0) {
    const imagesFolder = zip.folder("images");
    if (imagesFolder) {
      for (const [name, blob] of images) {
        // Sanitize filename to prevent path traversal
        const sanitizedName = sanitizeFilename(name);
        imagesFolder.file(sanitizedName, blob);
      }
    }
  }
  
  // Create preview if requested
  if (options.includePreview) {
    const previewsFolder = zip.folder("previews");
    if (previewsFolder) {
      // Create a simple placeholder preview (1x1 white pixel PNG)
      // In a real implementation, you'd generate an actual preview
      const placeholderPreview = createPlaceholderPreview();
      previewsFolder.file("preview.png", placeholderPreview);
    }
  }
  
  // Generate the ZIP file
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/zip",
    compression: "DEFLATE",
    compressionOptions: { level: 9 }
  });
}

/**
 * Create a Sketch file from a single page (convenience function)
 */
export async function createSketchFile(
  page: SketchPage,
  images: Map<string, Blob> = new Map(),
  options: SketchWriteOptions = {}
): Promise<Blob> {
  return writeSketchFile([page], images, options);
}

/**
 * Create a placeholder preview image
 * Returns a 1x1 white pixel PNG as a base64 blob
 */
function createPlaceholderPreview(): Blob {
  // Minimal 1x1 white PNG
  const pngData = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit RGB
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0xff,
    0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59,
    0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
    0x44, 0xae, 0x42, 0x60, 0x82
  ]);
  return new Blob([pngData], { type: "image/png" });
}

/**
 * Download a Sketch file (browser helper)
 */
export async function downloadSketchFile(
  pages: SketchPage[],
  filename: string = "document.sketch",
  images: Map<string, Blob> = new Map(),
  options: SketchWriteOptions = {}
): Promise<void> {
  const blob = await writeSketchFile(pages, images, options);
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".sketch") ? filename : `${filename}.sketch`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
