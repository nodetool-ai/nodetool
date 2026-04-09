# KIE Nodes

Dynamic node factory generating ~93 nodes from `kie-manifest.json`.

## Architecture

- `kie-manifest.json` - Node definitions with model IDs, input/output schemas
- `kie-factory.ts` - Runtime node class generator from manifest (reference implementation)
- `kie-base.ts` - Shared API utilities (execute task, upload, asset conversion)

## AssetRef Type Rules (Reference Implementation)

KIE nodes have the canonical `defaultForType()` function that other packages should follow:

```typescript
function defaultForType(type: string): unknown {
  switch (type) {
    case "image":
      return { type: "image", uri: "", asset_id: null, data: null, metadata: null };
    case "audio":
      return { type: "audio", uri: "", asset_id: null, data: null, metadata: null };
    case "video":
      return { type: "video", uri: "", asset_id: null, data: null, metadata: null, duration: null, format: null };
    case "list[image]":
      return [];
    // ...
  }
}
```

## Output Type Metadata

All nodes correctly use `metadataOutputTypes` set from `spec.outputType`.

## Data Conversion Flow

### Input: AssetRef -> API URL
- `uploadImageInput()` / `uploadAudioInput()` / `uploadVideoInput()` - Upload asset to KIE CDN
- Supports grouped uploads (multiple fields -> single array parameter)
- Supports list uploads (list[image] -> array of URLs)

### Output: API Response -> AssetRef
- `kieImageRef()` - Converts base64 to ImageRef with sharp metadata (width, height, mimeType)
- Audio/video outputs: `{ type: outputType, data: base64 }`

## Upload Configuration

- **Single uploads**: Field -> single URL parameter
- **List uploads**: `isList: true` -> array parameter
- **Grouped uploads**: `groupKey` collects multiple fields into one array (e.g., image1 + image2 + image3 -> image_urls)

## Special Features

- Suno music nodes use separate `kieExecuteSunoTask()` API path
- Validation rules (not_empty) checked before API calls
- Conditional fields (gte_zero, truthy, not_default) for optional parameters
