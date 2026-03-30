# NVIDIA RTX Video SDK Integration Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate NVIDIA RTX Video Super Resolution (upscaling + artifact reduction) and RTX Video HDR (SDR → HDR10 tone mapping) as native video enhancement nodes in NodeTool, enabling real-time, GPU-accelerated video post-processing on systems with NVIDIA RTX GPUs.

**Architecture:** A new `rtx-video` package provides Node-API (N-API) native bindings to the RTX Video SDK v1.1+ CUDA backend. Three new nodes — `RTXSuperResolution`, `RTXArtifactReduction`, and `RTXVideoHDR` — are registered in the node registry and process video frame-by-frame using Tensor Cores. The Electron app's existing GPU detection (`torchruntime`) is extended to surface RTX Video SDK compatibility, and nodes gracefully degrade with clear error messages on unsupported hardware.

**Tech Stack:** C++17 (native addon), Node-API / node-addon-api, NVIDIA RTX Video SDK 1.1 (CUDA backend), TypeScript, node-gyp / cmake-js, existing `@nodetool/node-sdk` BaseNode framework.

**SDK Reference:** https://developer.nvidia.com/rtx-video-sdk/getting-started

---

## Background

### RTX Video SDK Capabilities

The NVIDIA RTX Video SDK v1.1 provides three AI-enhanced video effects powered by Tensor Cores:

| Effect | Description | Input → Output |
|--------|-------------|----------------|
| **Super Resolution** | AI upscaling with edge/texture refinement; 1080p → 4K precision | Low-res frame → high-res frame |
| **Artifact Reduction** | Detects and removes compression artifacts (banding, blockiness) | Compressed frame → clean frame |
| **HDR Tone Mapping** | Converts Rec.709 SDR → HDR10 Rec.2020 color space | SDR frame → HDR10 frame |

### SDK Requirements

- **OS:** 64-bit Windows 10+ (primary), Linux via CUDA backend (v1.1+)
- **API Support:** DX11, DX12, Vulkan, **CUDA** (new in v1.1 — our integration target)
- **GPU:** GeForce RTX 20 series (Turing) or newer, NVIDIA RTX 1000 or higher
- **CUDA Driver:** ≥ 525.60.13 (Linux) or ≥ 527.41 (Windows)

### Why CUDA Backend

SDK v1.1 introduces native CUDA support, which is ideal for NodeTool because:
1. **Cross-platform** — CUDA works on both Windows and Linux (unlike DX11/DX12)
2. **No windowing system needed** — runs headless, suitable for server/Docker deployment
3. **Existing CUDA ecosystem** — NodeTool already detects CUDA platforms (cu118–cu129) via `torchruntime`
4. **Tensor Core access** — CUDA path still leverages Tensor Cores for AI inference

---

## System Requirements & Constraints

| Constraint | Details |
|-----------|---------|
| GPU requirement | RTX 20-series (Turing) or newer; fails gracefully on older/AMD/Intel GPUs |
| Platform | Windows 10+ and Linux (CUDA backend); macOS unsupported (no NVIDIA drivers) |
| CUDA toolkit | CUDA 12.x runtime must be available (bundled or system-installed) |
| SDK license | NVIDIA RTX Video SDK license — review redistribution terms before bundling |
| Frame format | SDK operates on individual frames (NV12/ARGB); video decode/encode handled externally |
| Memory | GPU VRAM required; 4K processing needs ~2–4 GB depending on model quality setting |

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `packages/rtx-video/` | New package: native addon + TypeScript wrapper |
| Create | `packages/rtx-video/package.json` | Package manifest with native build config |
| Create | `packages/rtx-video/tsconfig.json` | TypeScript config extending root |
| Create | `packages/rtx-video/binding.gyp` | node-gyp build configuration for C++ addon |
| Create | `packages/rtx-video/src/native/rtx_video_addon.cpp` | N-API C++ bindings to RTX Video SDK |
| Create | `packages/rtx-video/src/native/rtx_video_addon.h` | C++ header with SDK wrapper class |
| Create | `packages/rtx-video/src/native/CMakeLists.txt` | Alternative cmake-js build (for CI flexibility) |
| Create | `packages/rtx-video/src/index.ts` | Package entry — exports node classes + capability check |
| Create | `packages/rtx-video/src/rtx-video-binding.ts` | TypeScript wrapper around native addon |
| Create | `packages/rtx-video/src/nodes/super-resolution.ts` | RTXSuperResolution node |
| Create | `packages/rtx-video/src/nodes/artifact-reduction.ts` | RTXArtifactReduction node |
| Create | `packages/rtx-video/src/nodes/video-hdr.ts` | RTXVideoHDR node |
| Create | `packages/rtx-video/src/nodes/rtx-enhance-video.ts` | Combined pipeline node (SR + AR + HDR) |
| Create | `packages/rtx-video/src/capability.ts` | GPU capability detection (RTX support check) |
| Create | `packages/rtx-video/tests/capability.test.ts` | Tests for capability detection (mocked) |
| Create | `packages/rtx-video/tests/nodes.test.ts` | Tests for node construction and validation |
| Create | `packages/rtx-video/README.md` | Package documentation and setup guide |
| Modify | `package.json` (root) | Add `packages/rtx-video` to workspaces |
| Modify | `electron/src/torchruntime.ts` | Extend GPU detection to report RTX Video SDK compatibility |
| Modify | `web/src/components/node_menu/` | Add RTX Video category icon/grouping (if applicable) |

---

## Chunk 1: Package Scaffolding & Native Addon Foundation

### Task 1: Create package structure and build configuration

**Files:**
- Create: `packages/rtx-video/package.json`
- Create: `packages/rtx-video/tsconfig.json`
- Create: `packages/rtx-video/binding.gyp`
- Modify: root `package.json` (add workspace)

- [ ] **Step 1: Create `packages/rtx-video/package.json`**

```json
{
  "name": "@nodetool/rtx-video",
  "version": "0.1.0",
  "description": "NVIDIA RTX Video SDK integration for NodeTool — Super Resolution, Artifact Reduction, HDR",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build:native": "node-gyp rebuild",
    "build:ts": "tsc",
    "build": "npm run build:native && npm run build:ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "clean": "node-gyp clean && rm -rf dist"
  },
  "dependencies": {
    "@nodetool/node-sdk": "workspace:*",
    "@nodetool/runtime": "workspace:*",
    "node-addon-api": "^8.3.0"
  },
  "devDependencies": {
    "node-gyp": "^10.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  },
  "gypfile": true,
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create `packages/rtx-video/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["tests", "node_modules", "dist"]
}
```

- [ ] **Step 3: Create `packages/rtx-video/binding.gyp`**

```python
{
  "targets": [{
    "target_name": "rtx_video_addon",
    "sources": ["src/native/rtx_video_addon.cpp"],
    "include_dirs": [
      "<!@(node -p \"require('node-addon-api').include\")",
      "<(module_root_dir)/deps/rtx_video_sdk/include"
    ],
    "libraries": [
      "-L<(module_root_dir)/deps/rtx_video_sdk/lib",
      "-lNVCVIDEOEFFECTS"
    ],
    "defines": ["NAPI_VERSION=9", "NAPI_DISABLE_CPP_EXCEPTIONS"],
    "conditions": [
      ["OS=='win'", {
        "libraries": ["-lcuda", "-lcudart"]
      }],
      ["OS=='linux'", {
        "libraries": ["-lcuda", "-lcudart"],
        "cflags_cc": ["-std=c++17", "-fPIC"]
      }]
    ]
  }]
}
```

- [ ] **Step 4: Add to root workspaces**

Add `"packages/rtx-video"` to the `workspaces` array in root `package.json`.

- [ ] **Step 5: Verify workspace resolution**

```bash
cd /path/to/nodetool && npm install --ignore-scripts
npx tsc -p packages/rtx-video/tsconfig.json --noEmit
```

---

### Task 2: Implement native C++ addon

The native addon wraps the RTX Video SDK CUDA API, exposing three operations to JavaScript: super resolution, artifact reduction, and HDR tone mapping.

**Files:**
- Create: `packages/rtx-video/src/native/rtx_video_addon.h`
- Create: `packages/rtx-video/src/native/rtx_video_addon.cpp`

- [ ] **Step 1: Create the C++ header**

```cpp
// packages/rtx-video/src/native/rtx_video_addon.h
#pragma once
#include <napi.h>

// Forward declarations for RTX Video SDK types
struct NvVFX_Handle;

class RtxVideoEffect : public Napi::ObjectWrap<RtxVideoEffect> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  RtxVideoEffect(const Napi::CallbackInfo& info);
  ~RtxVideoEffect();

private:
  // Core operations
  Napi::Value SuperResolution(const Napi::CallbackInfo& info);
  Napi::Value ArtifactReduction(const Napi::CallbackInfo& info);
  Napi::Value HdrToneMap(const Napi::CallbackInfo& info);

  // Capability queries
  static Napi::Value IsSupported(const Napi::CallbackInfo& info);
  static Napi::Value GetGpuInfo(const Napi::CallbackInfo& info);

  // Lifecycle
  Napi::Value Destroy(const Napi::CallbackInfo& info);

  // Internal SDK handles
  NvVFX_Handle* sr_handle_ = nullptr;   // Super Resolution
  NvVFX_Handle* ar_handle_ = nullptr;   // Artifact Reduction
  NvVFX_Handle* hdr_handle_ = nullptr;  // HDR Tone Mapping
  int gpu_id_ = 0;
  bool initialized_ = false;
};
```

- [ ] **Step 2: Create the C++ implementation**

Implement the N-API wrapper with these key design decisions:
- **Async processing** — Use `Napi::AsyncWorker` for all frame processing to avoid blocking the event loop.
- **Buffer reuse** — Allocate GPU buffers once and reuse across frames for batch/video processing.
- **Error propagation** — Map SDK error codes to JavaScript exceptions with human-readable messages.
- **Frame format** — Accept RGBA `Uint8Array` input, perform colorspace conversion internally.

Key SDK calls to wrap:
```cpp
// Initialization
NvVFX_CreateEffect(NVVFX_FX_SR_UPSCALE, &sr_handle_);   // Super Resolution
NvVFX_CreateEffect(NVVFX_FX_ARTIFACT_REDUCTION, &ar_handle_);
NvVFX_CreateEffect(NVVFX_FX_SR_UPSCALE, &hdr_handle_);   // HDR uses separate config

// Configuration
NvVFX_SetU32(handle, NVVFX_STRENGTH, quality);  // 0-4 quality levels
NvVFX_SetImage(handle, NVVFX_INPUT_IMAGE, &inputImage);
NvVFX_SetImage(handle, NVVFX_OUTPUT_IMAGE, &outputImage);

// Processing
NvVFX_Run(handle);  // Execute on GPU

// Cleanup
NvVFX_DestroyEffect(handle);
```

- [ ] **Step 3: Verify native build on a machine with CUDA toolkit and RTX Video SDK installed**

```bash
cd packages/rtx-video
# Ensure deps/rtx_video_sdk/ contains SDK headers and libraries
npm run build:native
```

---

### Task 3: TypeScript binding layer

**Files:**
- Create: `packages/rtx-video/src/rtx-video-binding.ts`
- Create: `packages/rtx-video/src/capability.ts`

- [ ] **Step 1: Create the TypeScript binding wrapper**

```typescript
// packages/rtx-video/src/rtx-video-binding.ts
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

interface RtxVideoNative {
  RtxVideoEffect: new (gpuId?: number) => RtxVideoEffectInstance;
  isSupported(): boolean;
  getGpuInfo(): GpuInfo;
}

export interface GpuInfo {
  name: string;
  computeCapability: number;
  vramMB: number;
  isRtx: boolean;
  cudaVersion: string;
}

export interface RtxVideoEffectInstance {
  superResolution(
    inputBuffer: Uint8Array,
    width: number,
    height: number,
    outputWidth: number,
    outputHeight: number,
    quality: number
  ): Promise<Uint8Array>;

  artifactReduction(
    inputBuffer: Uint8Array,
    width: number,
    height: number,
    strength: number
  ): Promise<Uint8Array>;

  hdrToneMap(
    inputBuffer: Uint8Array,
    width: number,
    height: number,
    strength: number,
    saturation: number
  ): Promise<Uint8Array>;

  destroy(): void;
}

let nativeModule: RtxVideoNative | null = null;

function getNative(): RtxVideoNative {
  if (!nativeModule) {
    try {
      nativeModule = require("../build/Release/rtx_video_addon.node");
    } catch {
      throw new Error(
        "RTX Video native addon not available. " +
        "Ensure you have an NVIDIA RTX GPU (20-series or newer) and the " +
        "RTX Video SDK is installed. See: https://developer.nvidia.com/rtx-video-sdk"
      );
    }
  }
  return nativeModule;
}

export function isRtxVideoSupported(): boolean {
  try {
    return getNative().isSupported();
  } catch {
    return false;
  }
}

export function getGpuInfo(): GpuInfo | null {
  try {
    return getNative().getGpuInfo();
  } catch {
    return null;
  }
}

export function createRtxVideoEffect(gpuId = 0): RtxVideoEffectInstance {
  return new (getNative().RtxVideoEffect)(gpuId);
}
```

- [ ] **Step 2: Create capability detection module**

```typescript
// packages/rtx-video/src/capability.ts

import { isRtxVideoSupported, getGpuInfo, type GpuInfo } from "./rtx-video-binding.js";

export interface RtxCapability {
  supported: boolean;
  gpu: GpuInfo | null;
  features: {
    superResolution: boolean;
    artifactReduction: boolean;
    hdrToneMapping: boolean;
  };
  reason?: string;
}

export function checkRtxCapability(): RtxCapability {
  const gpu = getGpuInfo();
  if (!gpu) {
    return {
      supported: false,
      gpu: null,
      features: { superResolution: false, artifactReduction: false, hdrToneMapping: false },
      reason: "No NVIDIA GPU detected or CUDA driver not installed",
    };
  }
  if (!gpu.isRtx) {
    return {
      supported: false,
      gpu,
      features: { superResolution: false, artifactReduction: false, hdrToneMapping: false },
      reason: `GPU '${gpu.name}' is not an RTX-series GPU (Turing or newer required)`,
    };
  }
  const supported = isRtxVideoSupported();
  return {
    supported,
    gpu,
    features: {
      superResolution: supported,
      artifactReduction: supported,
      hdrToneMapping: supported,
    },
    reason: supported ? undefined : "RTX Video SDK runtime libraries not found",
  };
}
```

- [ ] **Step 3: Verify build and write basic tests**

```bash
cd packages/rtx-video
npx tsc --noEmit
npx vitest run
```

---

## Chunk 2: Node Implementations

### Task 4: RTX Super Resolution node

**Files:**
- Create: `packages/rtx-video/src/nodes/super-resolution.ts`

- [ ] **Step 1: Implement the node**

```typescript
// packages/rtx-video/src/nodes/super-resolution.ts
import { BaseNode, prop } from "@nodetool/node-sdk";
import { createRtxVideoEffect, isRtxVideoSupported } from "../rtx-video-binding.js";

export class RTXSuperResolutionNode extends BaseNode {
  static readonly nodeType = "nodetool.video.enhance.RTXSuperResolution";
  static readonly title = "RTX Super Resolution";
  static readonly description =
    "AI-enhanced video upscaling using NVIDIA RTX Tensor Cores. " +
    "Refines edges and textures, upscales 1080p to 4K with artifact reduction. " +
    "Requires NVIDIA RTX 20-series GPU or newer.\n" +
    "    video, upscale, super resolution, nvidia, rtx, 4k, enhance";
  static readonly metadataOutputTypes = { output: "video" };

  @prop({
    type: "video",
    default: { type: "video", uri: "", asset_id: null, data: null, metadata: null, duration: null, format: null },
    title: "Video",
    description: "Input video to upscale",
  })
  declare video: any;

  @prop({
    type: "enum",
    default: "4k",
    values: ["1440p", "4k"],
    title: "Target Resolution",
    description: "Target output resolution",
  })
  declare target_resolution: any;

  @prop({
    type: "int",
    default: 3,
    min: 0,
    max: 4,
    title: "Quality",
    description: "Quality level (0 = fastest, 4 = highest quality)",
  })
  declare quality: any;

  @prop({
    type: "bool",
    default: true,
    title: "Artifact Reduction",
    description: "Also apply artifact reduction during upscaling",
  })
  declare artifact_reduction: any;

  async process(): Promise<Record<string, unknown>> {
    if (!isRtxVideoSupported()) {
      throw new Error(
        "RTX Video Super Resolution requires an NVIDIA RTX GPU (20-series or newer). " +
        "No compatible GPU was detected on this system."
      );
    }
    // Frame extraction → GPU processing → re-encode pipeline
    // Implementation processes video frame-by-frame through RTX SDK
    // See Chunk 3 for the full frame pipeline implementation
    throw new Error("Not yet implemented — see integration plan Chunk 3");
  }
}
```

- [ ] **Step 2: Verify typecheck**

---

### Task 5: RTX Artifact Reduction node

**Files:**
- Create: `packages/rtx-video/src/nodes/artifact-reduction.ts`

- [ ] **Step 1: Implement the node**

```typescript
// packages/rtx-video/src/nodes/artifact-reduction.ts
import { BaseNode, prop } from "@nodetool/node-sdk";
import { createRtxVideoEffect, isRtxVideoSupported } from "../rtx-video-binding.js";

export class RTXArtifactReductionNode extends BaseNode {
  static readonly nodeType = "nodetool.video.enhance.RTXArtifactReduction";
  static readonly title = "RTX Artifact Reduction";
  static readonly description =
    "AI-powered compression artifact removal using NVIDIA RTX Tensor Cores. " +
    "Detects and removes color banding and blocky artifacts, restoring smooth " +
    "color gradients. Requires NVIDIA RTX 20-series GPU or newer.\n" +
    "    video, artifact, denoise, debanding, nvidia, rtx, enhance, quality";
  static readonly metadataOutputTypes = { output: "video" };

  @prop({
    type: "video",
    default: { type: "video", uri: "", asset_id: null, data: null, metadata: null, duration: null, format: null },
    title: "Video",
    description: "Input video to clean up",
  })
  declare video: any;

  @prop({
    type: "int",
    default: 2,
    min: 0,
    max: 4,
    title: "Strength",
    description: "Artifact reduction strength (0 = lightest, 4 = strongest)",
  })
  declare strength: any;

  async process(): Promise<Record<string, unknown>> {
    if (!isRtxVideoSupported()) {
      throw new Error(
        "RTX Artifact Reduction requires an NVIDIA RTX GPU (20-series or newer). " +
        "No compatible GPU was detected on this system."
      );
    }
    throw new Error("Not yet implemented — see integration plan Chunk 3");
  }
}
```

---

### Task 6: RTX Video HDR node

**Files:**
- Create: `packages/rtx-video/src/nodes/video-hdr.ts`

- [ ] **Step 1: Implement the node**

```typescript
// packages/rtx-video/src/nodes/video-hdr.ts
import { BaseNode, prop } from "@nodetool/node-sdk";
import { createRtxVideoEffect, isRtxVideoSupported } from "../rtx-video-binding.js";

export class RTXVideoHDRNode extends BaseNode {
  static readonly nodeType = "nodetool.video.enhance.RTXVideoHDR";
  static readonly title = "RTX Video HDR";
  static readonly description =
    "AI-enhanced SDR to HDR10 tone mapping using NVIDIA RTX Tensor Cores. " +
    "Converts Rec.709 SDR video to HDR10 Rec.2020 with expanded color space, " +
    "deeper darks, and vibrant colors. Requires NVIDIA RTX 20-series GPU or newer.\n" +
    "    video, hdr, hdr10, sdr, tone mapping, nvidia, rtx, color, enhance";
  static readonly metadataOutputTypes = { output: "video" };

  @prop({
    type: "video",
    default: { type: "video", uri: "", asset_id: null, data: null, metadata: null, duration: null, format: null },
    title: "Video",
    description: "SDR video to convert to HDR10",
  })
  declare video: any;

  @prop({
    type: "float",
    default: 1.0,
    min: 0.0,
    max: 2.0,
    title: "Strength",
    description: "HDR conversion strength (0.0 = subtle, 2.0 = maximum expansion)",
  })
  declare strength: any;

  @prop({
    type: "float",
    default: 1.0,
    min: 0.0,
    max: 2.0,
    title: "Saturation",
    description: "Color saturation boost for HDR output",
  })
  declare saturation: any;

  @prop({
    type: "enum",
    default: "hdr10",
    values: ["hdr10", "hlg"],
    title: "Output Format",
    description: "HDR output format standard",
  })
  declare output_format: any;

  async process(): Promise<Record<string, unknown>> {
    if (!isRtxVideoSupported()) {
      throw new Error(
        "RTX Video HDR requires an NVIDIA RTX GPU (20-series or newer). " +
        "No compatible GPU was detected on this system."
      );
    }
    throw new Error("Not yet implemented — see integration plan Chunk 3");
  }
}
```

---

### Task 7: Combined RTX Enhance Video node

A convenience node that chains all three effects in a single pass for maximum quality.

**Files:**
- Create: `packages/rtx-video/src/nodes/rtx-enhance-video.ts`

- [ ] **Step 1: Implement the combined node**

```typescript
// packages/rtx-video/src/nodes/rtx-enhance-video.ts
import { BaseNode, prop } from "@nodetool/node-sdk";
import { isRtxVideoSupported } from "../rtx-video-binding.js";

export class RTXEnhanceVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.enhance.RTXEnhanceVideo";
  static readonly title = "RTX Enhance Video";
  static readonly description =
    "All-in-one NVIDIA RTX video enhancement: Super Resolution upscaling + " +
    "Artifact Reduction + optional HDR tone mapping in a single optimized pass. " +
    "Produces the highest quality output by chaining effects with shared GPU buffers. " +
    "Requires NVIDIA RTX 20-series GPU or newer.\n" +
    "    video, enhance, upscale, hdr, artifact, nvidia, rtx, 4k, quality";
  static readonly metadataOutputTypes = { output: "video" };

  @prop({
    type: "video",
    default: { type: "video", uri: "", asset_id: null, data: null, metadata: null, duration: null, format: null },
    title: "Video",
    description: "Input video to enhance",
  })
  declare video: any;

  @prop({ type: "bool", default: true, title: "Super Resolution", description: "Enable AI upscaling" })
  declare enable_super_resolution: any;

  @prop({ type: "bool", default: true, title: "Artifact Reduction", description: "Enable artifact cleanup" })
  declare enable_artifact_reduction: any;

  @prop({ type: "bool", default: false, title: "HDR Tone Mapping", description: "Enable SDR → HDR10 conversion" })
  declare enable_hdr: any;

  @prop({
    type: "enum",
    default: "4k",
    values: ["1440p", "4k"],
    title: "Target Resolution",
    description: "Target output resolution (when Super Resolution is enabled)",
  })
  declare target_resolution: any;

  @prop({
    type: "int",
    default: 3,
    min: 0,
    max: 4,
    title: "Quality",
    description: "Processing quality (0 = fastest, 4 = highest)",
  })
  declare quality: any;

  async process(): Promise<Record<string, unknown>> {
    if (!isRtxVideoSupported()) {
      throw new Error(
        "RTX Enhance Video requires an NVIDIA RTX GPU (20-series or newer). " +
        "No compatible GPU was detected on this system."
      );
    }
    throw new Error("Not yet implemented — see integration plan Chunk 3");
  }
}
```

---

### Task 8: Package entry point and node registration

**Files:**
- Create: `packages/rtx-video/src/index.ts`

- [ ] **Step 1: Create package entry point**

```typescript
// packages/rtx-video/src/index.ts
export { RTXSuperResolutionNode } from "./nodes/super-resolution.js";
export { RTXArtifactReductionNode } from "./nodes/artifact-reduction.js";
export { RTXVideoHDRNode } from "./nodes/video-hdr.js";
export { RTXEnhanceVideoNode } from "./nodes/rtx-enhance-video.js";
export { isRtxVideoSupported, getGpuInfo } from "./rtx-video-binding.js";
export { checkRtxCapability } from "./capability.js";
export type { RtxCapability } from "./capability.js";
export type { GpuInfo, RtxVideoEffectInstance } from "./rtx-video-binding.js";
```

- [ ] **Step 2: Register nodes in the node registry**

Add the RTX Video nodes to the kernel's node registry alongside existing `base-nodes` and `kie-nodes`. This depends on how the registry is loaded — likely via the `nodeType` static field and automatic scanning of exports.

---

## Chunk 3: Frame Processing Pipeline

### Task 9: Implement frame extraction, GPU processing, and re-encoding

The core pipeline decodes video → extracts frames → processes each frame on GPU → re-encodes to video. This is the most performance-critical path.

- [ ] **Step 1: Design the pipeline architecture**

```
Input Video (MP4/MOV)
    │
    ▼
┌──────────────────┐
│ FFmpeg Decode     │  Extract frames as raw RGBA buffers
│ (ffmpeg -f rawvideo)
└──────────────────┘
    │
    ▼ (frame stream)
┌──────────────────┐
│ RTX Video SDK    │  Process each frame on GPU via CUDA
│ (Super Res /     │  - Upload frame to GPU memory
│  Artifact Red /  │  - Run AI model on Tensor Cores
│  HDR Tonemap)    │  - Download result to CPU memory
└──────────────────┘
    │
    ▼ (enhanced frames)
┌──────────────────┐
│ FFmpeg Encode     │  Re-encode frames to output video
│ (ffmpeg -c:v ...) │  - Preserve audio stream
│                   │  - HDR: use libx265 + HDR10 metadata
└──────────────────┘
    │
    ▼
Output Video (MP4)
```

- [ ] **Step 2: Implement frame extraction using FFmpeg**

Use FFmpeg to decode input video to raw frames:
```bash
ffmpeg -i input.mp4 -f rawvideo -pix_fmt rgba -v quiet pipe:1
```

For HDR output, use 10-bit pixel format:
```bash
ffmpeg -i input.mp4 -f rawvideo -pix_fmt rgba64le -v quiet pipe:1
```

- [ ] **Step 3: Implement GPU frame processing loop**

```typescript
// Pseudocode for the processing loop
const effect = createRtxVideoEffect(gpuId);
const decoder = spawnFFmpegDecoder(inputVideo);
const encoder = spawnFFmpegEncoder(outputPath, outputConfig);

for await (const frame of decoder.frames()) {
  const enhanced = await effect.superResolution(
    frame.data, frame.width, frame.height,
    targetWidth, targetHeight, quality
  );
  encoder.writeFrame(enhanced);
}

effect.destroy();
await encoder.finalize();
```

- [ ] **Step 4: Handle audio passthrough**

Extract and re-mux audio stream without re-encoding:
```bash
# Extract audio
ffmpeg -i input.mp4 -vn -acodec copy audio.aac
# Mux with enhanced video
ffmpeg -i enhanced_video.mp4 -i audio.aac -c copy output.mp4
```

- [ ] **Step 5: Handle HDR metadata for HDR output**

When HDR tone mapping is enabled, encode with proper HDR10 metadata:
```bash
ffmpeg -i enhanced_frames.raw \
  -c:v libx265 -pix_fmt yuv420p10le \
  -x265-params "hdr-opt=1:repeat-headers=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400" \
  -colorspace bt2020nc -color_trc smpte2084 -color_primaries bt2020 \
  output_hdr.mp4
```

- [ ] **Step 6: Implement progress reporting**

Report frame processing progress back to the workflow engine for UI display:
```typescript
const totalFrames = await getFrameCount(inputVideo);
let processed = 0;
for await (const frame of decoder.frames()) {
  // ... process frame ...
  processed++;
  // Report progress to NodeTool engine
  context?.reportProgress?.(processed / totalFrames);
}
```

---

## Chunk 4: GPU Detection & Electron Integration

### Task 10: Extend GPU detection for RTX Video SDK compatibility

**Files:**
- Modify: `electron/src/torchruntime.ts`

- [ ] **Step 1: Add RTX capability reporting to GPU detection**

Extend the existing `detectTorchPlatform()` function to also report whether the detected GPU supports RTX Video effects:

```typescript
export interface GpuCapabilities {
  platform: TorchPlatform;
  rtxVideo: {
    supported: boolean;
    gpuName: string;
    computeCapability: number;
    reason?: string;
  };
}
```

The RTX Video SDK requires Turing architecture (compute capability ≥ 7.5):
- **Turing** (RTX 20xx): compute 7.5
- **Ampere** (RTX 30xx): compute 8.6
- **Ada Lovelace** (RTX 40xx): compute 8.9
- **Blackwell** (RTX 50xx): compute 10.0+

- [ ] **Step 2: Surface RTX Video status in Electron boot messages**

Add RTX Video capability to the existing GPU detection boot messages so the user can see whether RTX Video enhancement is available.

---

### Task 11: Graceful degradation and user messaging

- [ ] **Step 1: Node-level error handling**

Every RTX Video node must check `isRtxVideoSupported()` at the start of `process()` and throw a descriptive error if unsupported. The error message must include:
- The specific requirement (RTX 20-series or newer)
- What was detected (or not detected)
- A link to the SDK documentation

- [ ] **Step 2: UI indication for RTX-only nodes**

Add a visual indicator (badge or tooltip) in the node menu for nodes that require RTX hardware, similar to how `requiredSettings` shows API key requirements.

- [ ] **Step 3: Fallback suggestions**

When RTX Video is unavailable, suggest alternative nodes:
- Super Resolution → Crystal Video Upscaler (replicate) or Topaz Video Upscale
- Artifact Reduction → DenoiseVideo (ffmpeg-based, CPU)
- HDR → ColorBalanceVideo (manual adjustment)

---

## Chunk 5: Testing

### Task 12: Unit tests

**Files:**
- Create: `packages/rtx-video/tests/capability.test.ts`
- Create: `packages/rtx-video/tests/nodes.test.ts`

- [ ] **Step 1: Capability detection tests (mocked)**

```typescript
// packages/rtx-video/tests/capability.test.ts
import { describe, it, expect, vi } from "vitest";

describe("RTX Video Capability Detection", () => {
  it("returns unsupported when no GPU is detected", () => {
    // Mock native module to return null GPU info
    // Verify capability check returns supported: false
  });

  it("returns unsupported for non-RTX GPUs", () => {
    // Mock GTX 1080 Ti (compute 6.1)
    // Verify isRtx: false
  });

  it("returns supported for RTX 3080", () => {
    // Mock RTX 3080 (compute 8.6)
    // Verify all features enabled
  });

  it("returns supported for RTX 4090", () => {
    // Mock RTX 4090 (compute 8.9)
  });

  it("returns supported for RTX 5090 (Blackwell)", () => {
    // Mock RTX 5090 (compute 10.0)
  });
});
```

- [ ] **Step 2: Node construction and validation tests**

```typescript
// packages/rtx-video/tests/nodes.test.ts
import { describe, it, expect } from "vitest";
import {
  RTXSuperResolutionNode,
  RTXArtifactReductionNode,
  RTXVideoHDRNode,
  RTXEnhanceVideoNode,
} from "../src/index.js";

describe("RTX Video Nodes", () => {
  it("RTXSuperResolutionNode has correct metadata", () => {
    expect(RTXSuperResolutionNode.nodeType).toBe("nodetool.video.enhance.RTXSuperResolution");
    expect(RTXSuperResolutionNode.title).toBe("RTX Super Resolution");
    expect(RTXSuperResolutionNode.metadataOutputTypes).toEqual({ output: "video" });
  });

  it("RTXVideoHDRNode has correct metadata", () => {
    expect(RTXVideoHDRNode.nodeType).toBe("nodetool.video.enhance.RTXVideoHDR");
    expect(RTXVideoHDRNode.title).toBe("RTX Video HDR");
  });

  it("RTXEnhanceVideoNode has correct metadata", () => {
    expect(RTXEnhanceVideoNode.nodeType).toBe("nodetool.video.enhance.RTXEnhanceVideo");
  });

  it("nodes throw descriptive error on unsupported hardware", async () => {
    const node = new RTXSuperResolutionNode();
    await expect(node.process()).rejects.toThrow(/RTX GPU/);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd packages/rtx-video && npx vitest run
```

---

### Task 13: Integration tests (requires RTX hardware)

- [ ] **Step 1: Create integration test suite (skipped on CI without GPU)**

```typescript
// packages/rtx-video/tests/integration.test.ts
import { describe, it, expect } from "vitest";
import { isRtxVideoSupported } from "../src/rtx-video-binding.js";

const SKIP = !isRtxVideoSupported();

describe.skipIf(SKIP)("RTX Video Integration (requires RTX GPU)", () => {
  it("upscales a 720p test frame to 1080p", async () => { /* ... */ });
  it("reduces artifacts in a compressed test frame", async () => { /* ... */ });
  it("converts an SDR test frame to HDR10", async () => { /* ... */ });
  it("processes a short video end-to-end", async () => { /* ... */ });
});
```

---

## Chunk 6: Documentation & Packaging

### Task 14: Package documentation

**Files:**
- Create: `packages/rtx-video/README.md`

- [ ] **Step 1: Write README with setup instructions**

Document:
- Prerequisites (NVIDIA RTX GPU, CUDA toolkit, RTX Video SDK)
- Installation steps (downloading SDK, placing in `deps/`)
- Build instructions (`npm run build`)
- Usage examples
- Troubleshooting (common errors, driver requirements)

---

### Task 15: User-facing documentation

**Files:**
- Modify: `docs/` (add RTX Video documentation page)

- [ ] **Step 1: Create RTX Video enhancement guide**

Add a documentation page covering:
- What RTX Video Super Resolution and HDR do
- Hardware requirements
- How to use the nodes in workflows
- Example workflows (upscale 1080p → 4K, convert SDR → HDR)
- Performance expectations (frames per second by GPU tier)
- Troubleshooting

---

## Chunk 7: Build & CI Integration

### Task 16: CI/CD pipeline

- [ ] **Step 1: Add conditional native build to CI**

The RTX Video package has a native C++ component that requires:
- CUDA Toolkit
- RTX Video SDK headers/libraries

CI should:
1. Build TypeScript unconditionally
2. Build native addon only when CUDA toolkit is available
3. Skip integration tests on runners without RTX GPUs
4. Provide prebuilt binaries for common platforms via `prebuild`/`prebuildify`

- [ ] **Step 2: Add prebuild support**

Use `prebuildify` to ship prebuilt native binaries, avoiding end-user build requirements:

```json
{
  "scripts": {
    "prebuild": "prebuildify --napi --strip",
    "install": "prebuild-install || node-gyp rebuild"
  }
}
```

---

## Dependency Matrix

| Dependency | Version | Purpose | Ecosystem |
|-----------|---------|---------|-----------|
| `node-addon-api` | ^8.3.0 | N-API C++ wrapper | npm |
| `node-gyp` | ^10.0.0 | Native build tool | npm (dev) |
| `prebuildify` | ^6.0.0 | Prebuilt binary packaging | npm (dev) |
| `prebuild-install` | ^7.0.0 | Prebuilt binary installer | npm |
| NVIDIA RTX Video SDK | 1.1.0 | GPU video effects | Native (C/C++) |
| CUDA Toolkit | 12.x | GPU compute runtime | System |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SDK license restricts redistribution | Medium | High | Review NVIDIA EULA before bundling; may need end-user download |
| Native addon build fails on some systems | High | Medium | Use prebuildify for prebuilt binaries; graceful fallback |
| GPU memory pressure with 4K frames | Medium | Medium | Implement streaming frame processing; expose VRAM limit config |
| SDK only supports Windows | Low (v1.1 adds CUDA) | High | Target CUDA backend first; test on both Windows and Linux |
| Performance bottleneck on frame decode/encode | Medium | Low | Use FFmpeg hardware decode (NVDEC) when available |
| RTX Video SDK deprecated/changed | Low | Medium | Pin to SDK v1.1; abstract behind TypeScript interface |

---

## Success Criteria

- [ ] `RTXSuperResolutionNode` upscales 1080p video to 4K with visible quality improvement
- [ ] `RTXArtifactReductionNode` removes visible compression artifacts from low-bitrate video
- [ ] `RTXVideoHDRNode` converts SDR video to HDR10 with correct Rec.2020 metadata
- [ ] `RTXEnhanceVideoNode` chains all effects in a single pass with shared GPU memory
- [ ] All nodes fail gracefully with actionable error messages on unsupported hardware
- [ ] Native addon builds successfully on Windows and Linux with CUDA toolkit
- [ ] Prebuilt binaries available for Windows x64 and Linux x64
- [ ] Unit tests pass on all platforms (mocked GPU for CI)
- [ ] Integration tests pass on hardware with RTX GPU
- [ ] Processing achieves at least 10 fps for 1080p → 4K upscaling on RTX 3060+
- [ ] Documentation covers setup, usage, and troubleshooting
