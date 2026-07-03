# @nodetool-ai/gpu

Canonical blend-mode catalog and shared WGSL blend functions for NodeTool compositors (sketch, timeline, Compositor node) for [NodeTool](https://nodetool.ai).

The single source of truth for the `BlendMode` union, its stable numeric GPU ids, the Canvas2D and Sharp/libvips mappings, and the shared WGSL `applyBlendMode` shader math. The package root is pure — no WebGPU runtime — so Node consumers can pull in the catalog without the GPU stack. The TypeGPU shader pool lives behind `./pool` and the browser layer-compositing engine behind `./webgpu`.

## Install

```bash
npm install @nodetool-ai/gpu
```

## Exported symbols

| Symbol | Kind | Description |
| --- | --- | --- |
| `BlendMode` | type | Union of the 13 canonical blend modes (`normal`, `multiply`, `add`, …) |
| `BLEND_MODE_TUPLE` | const | Ordered `const` tuple of mode names — drives the union and Zod enums |
| `BLEND_MODE_INFOS` | const | Full table: value, label, `gpuId`, Canvas2D op, Sharp blend |
| `BLEND_MODES` | const | `{ value, label }[]` for UI dropdowns |
| `BLEND_MODE_VALUES` | const | Alias of `BLEND_MODE_TUPLE` |
| `BlendModeInfo` | interface | One catalog row |
| `CanvasCompositeOp` | type | Literal union of the Canvas2D `globalCompositeOperation` values used |
| `coerceBlendMode` | function | Coerce unknown input to a valid `BlendMode` (falls back to `normal`) |
| `blendModeGpuId` | function | Map a mode to its stable numeric shader id |
| `blendModeToCanvasOp` | function | Map a mode to its Canvas2D composite op |
| `blendModeToSharpBlend` | function | Map a mode to its Sharp/libvips `blend` string |
| `WGSL_BLEND_FUNCTIONS` | const | WGSL source for `applyBlendMode(src, dst, mode)`, injected into fragment shaders |

## Usage

```ts
import {
  BLEND_MODES,
  blendModeToCanvasOp,
  WGSL_BLEND_FUNCTIONS
} from "@nodetool-ai/gpu";

// Populate a UI dropdown
BLEND_MODES.forEach(({ value, label }) => addOption(value, label));

// Canvas2D compositing
ctx.globalCompositeOperation = blendModeToCanvasOp("multiply") as GlobalCompositeOperation;

// Inject the shared blend math into a WGSL fragment shader
const fragment = `${WGSL_BLEND_FUNCTIONS}\n@fragment fn fs(...) { ... }`;
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
