# FAL Nodes

Dynamic node factory generating ~1,087 nodes from `fal-manifest.json`.

## Architecture

- `fal-manifest.json` - Node definitions with endpoint IDs, input/output schemas
- `fal-factory.ts` - Runtime node class generator from manifest
- `fal-base.ts` - Shared API utilities (submit, upload, asset conversion)
- `fal-dynamic.ts` - Schema-driven dynamic nodes (FalRawNode, FalDynamicNode)
- `fal-provider.ts` - High-level provider for text-to-image, image-to-image, TTS

## AssetRef Type Rules

All asset input properties MUST use proper AssetRef default objects, not empty strings:

```typescript
// Image inputs
{ type: "image", uri: "", asset_id: null, data: null, metadata: null }

// Audio inputs
{ type: "audio", uri: "", asset_id: null, data: null, metadata: null }

// Video inputs
{ type: "video", uri: "", asset_id: null, data: null, metadata: null, duration: null, format: null }

// List types
[]  // empty array is correct
```

The `defaultForPropType()` function in `fal-factory.ts` handles this. Reference the KIE nodes `defaultForType()` as the canonical implementation.

## Output Type Metadata

All nodes with asset outputs MUST set `metadataOutputTypes` (not `outputTypes`) for image, audio, video, and model_3d output types. This enables the UI to render previews correctly.

Image output nodes also set `isStreamingOutput: true` for genProcess() streaming.

## Data Conversion Flow

### Input: AssetRef -> API URL
1. `imageToDataUrl()` - Converts image AssetRef to data URI (preferred for images)
2. `assetToFalUrl()` - Uploads asset to FAL CDN, returns CDN URL
3. `isRefSet()` - Checks if an AssetRef has meaningful content

### Output: API Response -> AssetRef
1. `falImageToRef()` - Converts FAL image result `{url, width, height}` to ImageRef
2. `mapOutput()` - Routes by output type, creates `{type, uri}` for audio/video

## Common Pitfalls

- Never default asset inputs to `""` - always use proper AssetRef objects
- Audio/video outputs must use `metadataOutputTypes`, not `outputTypes`
- `outputTypes: { output: "dict" }` is wrong for audio/video - they need metadata types
- The `isStreamingOutput` flag enables genProcess() for image nodes
