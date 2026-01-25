# Sketch File Format Integration

This module provides support for reading and writing Sketch (.sketch) files in the canvas editor.

## Overview

Sketch files are ZIP archives containing JSON files that describe the document structure, along with embedded images and preview thumbnails.

### File Structure

A typical Sketch file contains:
- `document.json` - Root document with pages and shared styles
- `meta.json` - File metadata (version, fonts, etc.)
- `user.json` - User metadata (viewport, zoom, etc.)
- `pages/*.json` - Individual page data with artboards and layers
- `images/` - Embedded bitmap assets
- `previews/` - Thumbnail images

## Usage

### Importing Sketch Files

```typescript
import { readSketchFile, convertFromSketch } from './sketch';

// Read and parse a .sketch file
const result = await readSketchFile(file);
if (result.success && result.contents) {
  // Convert first page to canvas data
  const canvasData = convertFromSketch(result.contents.pages[0]);
}
```

### Exporting to Sketch

```typescript
import { convertToSketch, downloadSketchFile } from './sketch';

// Convert canvas data to Sketch page
const page = convertToSketch(canvasData, 'My Page');

// Download as .sketch file
await downloadSketchFile([page], 'design.sketch');
```

## Supported Layer Types

### Import (Sketch → Canvas)
- `rectangle` → Rectangle with fill, border, and border radius
- `oval` → Rectangle with circular border radius
- `text` → Text with font, size, color, and alignment
- `group` → Group (container)
- `bitmap` → Image

### Export (Canvas → Sketch)
- Rectangle → Sketch rectangle with style
- Text → Sketch text with attributed string
- Image → Sketch bitmap
- Group → Sketch group

## Security Considerations

The parser includes several security measures:
- **File size limits**: Maximum 10MB for JSON files, 50MB per image
- **Resource limits**: Maximum 100 pages, 500 images
- **Path sanitization**: Prevents directory traversal attacks
- **File type validation**: Validates .sketch extension

## API Reference

### Parser (`parser.ts`)

#### `readSketchFile(input: File | ArrayBuffer): Promise<SketchParseResult>`
Reads and parses a Sketch file from a File object or ArrayBuffer.

#### `parseSketchFile(data: ArrayBuffer): Promise<SketchParseResult>`
Parses a Sketch file from binary data.

### Writer (`writer.ts`)

#### `writeSketchFile(pages: SketchPage[], images?: Map<string, Blob>, options?: SketchWriteOptions): Promise<Blob>`
Creates a Sketch file from pages and optional images.

#### `downloadSketchFile(pages: SketchPage[], filename?: string, images?: Map<string, Blob>, options?: SketchWriteOptions): Promise<void>`
Creates and downloads a Sketch file in the browser.

### Converter (`converter.ts`)

#### `convertFromSketch(page: SketchPage, artboardIndex?: number): LayoutCanvasData`
Converts a Sketch page to our internal canvas format.

#### `convertToSketch(canvasData: LayoutCanvasData, pageName?: string): SketchPage`
Converts our canvas data to a Sketch page.

### Types (`types.ts`)

#### `hexToSketchColor(hex: string): SketchRGBA`
Converts hex color to Sketch RGBA format (0-1 range).

#### `sketchColorToHex(color: SketchRGBA): string`
Converts Sketch RGBA to hex color string.

#### `generateSketchUUID(): string`
Generates a UUID in Sketch's format.

## Dependencies

- `jszip` - For reading/writing ZIP archives
- `@sketch-hq/sketch-file-format-ts` - TypeScript types for Sketch file format

## Limitations

Current limitations:
- Only basic layer types are supported
- Gradients are not fully supported
- Symbols/components are not supported
- Boolean operations are not supported
- Effects (shadows, blurs) are not fully supported
- Vector paths (pen tool) are not supported

These may be addressed in future updates.
