# Replicate Nodes

Dynamic node factory generating ~378 nodes from `replicate-manifest.json`.

## Architecture

- `replicate-manifest.json` - Node definitions with model IDs, input/output schemas
- `replicate-factory.ts` - Runtime node class generator from manifest
- `replicate-base.ts` - Shared API utilities (submit, upload, asset conversion)

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

The `defaultForPropType()` function in `replicate-factory.ts` handles this. Reference the KIE nodes `defaultForType()` as the canonical implementation.

## Output Type Metadata

All nodes correctly use `metadataOutputTypes` for output type declarations. Dict outputs map to `"any"`.

## Data Conversion Flow

### Input: AssetRef -> API URL
1. `assetToUrl()` - Converts AssetRef to Replicate-accessible URL
   - Passes through Replicate-hosted URLs and data URIs
   - Fetches and uploads external URLs to Replicate files API
2. `isRefSet()` - Checks if an AssetRef has meaningful content

### Output: API Response -> AssetRef
1. `outputToImageRef()` / `outputToVideoRef()` / `outputToAudioRef()` - Extracts URL from Replicate output, returns `{type, uri}`
2. `extractUrl()` - Handles string, FileOutput, array, and object output formats

## Common Pitfalls

- Never default asset inputs to `""` - always use proper AssetRef objects
- `dict[...]` props default to `null`, **not** `""` (an empty string is an invalid empty default for a dict).
- Replicate output can be string, array, FileOutput (with .url() method), or object (asset wrapped under a named key) - `extractUrl()` handles all cases. It recursively scans object/array shapes but only accepts a **nested** string when it matches `URL_LIKE = /^(https?:|data:)/` — a bare top-level string is still returned verbatim (model contract). Don't assume the URL sits under a fixed key.
- `assetToUrl()` returns `null` for an asset it can't turn into a publicly reachable URL or data URI (e.g. an upload failure leaving only a relative path). Returning the original relative `uri` hands Replicate a path it can't fetch; returning `null` lets `removeNulls()` drop the arg.
- The `removeNulls()` function strips only **top-level** `null`/`undefined`/empty-string keys. It does NOT recurse (so pass-through `dict[...]` inputs keep their shape) and does NOT strip `0`/`false`.
- Numeric enums (e.g. SD `width`/`height`): the manifest stores enum values as strings, so the factory detects all-numeric enums and registers numeric `values`/`default` and coerces the API arg back to a number. A plain `String()` cast would send `"768"` and fail the model's integer schema.
