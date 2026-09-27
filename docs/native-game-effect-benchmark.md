# Native game effect baseline

`npm run benchmark:effects --workspace=packages/game-renderer` renders one
sprite at 512 × 288 through Dawn, waits for the GPU queue, and reports the
median of ten frames after three warmups. The measured device was an Apple M4
Pro with Metal 4. This is a correctness and local cost baseline, not a frame
rate promise for other devices or viewports.

| Chain | Median frame work | Effect target memory |
|---|---:|---:|
| Disabled | 0.31 ms | 0 bytes |
| One bloom | 0.77 ms | 3,481,600 bytes |
| Eight blooms | 3.96 ms | 3,481,600 bytes |

The default bloom radius is 8 output pixels, threshold 0.7, softness 0.1, and
intensity 1. Radius 8 costs less than 1 ms for one effect in this fixture while
showing a visible halo. The recipe uses 8-bit textures and reusable scratch
targets. It makes no HDR claim. The benchmark includes the viewport overscan
needed for light just outside the visible area. Target memory is the renderer's
reported effect allocation, including recipe scratch; texture assets and the
instance buffer are counted separately in renderer statistics.

## Point light baseline

The same command benchmarks a scene with 32 point lights on the Apple M4 Pro
at 512 × 288. Lights use a reusable RGBA16F texture in WebGPU so overlapping
lights retain irradiance above 1 until the sprite color is multiplied. The GPU row waits
for submitted work and reports the median of ten frames after three warmups.
The CPU row measures the light calculation over the same viewport and light
layout; its scratch allocation is released after each frame.

| Path | Median frame work | Light target or scratch memory |
|---|---:|---:|
| WebGPU | 0.57 ms | 1,179,648 bytes target |
| Canvas2D/headless CPU calculation | 18.91 ms | 1,769,472 bytes scratch |

The WebGPU timing includes the light texture pass and sprite draw. The CPU
timing excludes canvas readback, sprite drawing, and PNG encoding. These
measurements describe this fixture and device, not a frame rate guarantee.
