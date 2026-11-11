# Windows GPU scrub cache

Question: how can backward scrubbing reuse decoded GPU frames without exhausting
FFmpeg's D3D11 decoder surfaces?

## Evidence

- F1: FFmpeg's D3D11 decoder uses an array texture. Retaining a decoded frame
  retains its pool slot. Independent frames contexts can allocate other textures.
  See the [FFmpeg 8.0.1 contract](https://github.com/FFmpeg/FFmpeg/blob/n8.0.1/libavutil/hwcontext_d3d11va.h)
  and [allocation implementation](https://github.com/FFmpeg/FFmpeg/blob/n8.0.1/libavutil/hwcontext_d3d11va.c).
- F2: `CopySubresourceRegion` copies on the GPU and queues asynchronously.
  Source and destination must have compatible formats and valid bounds.
  See [Microsoft's copy contract](https://learn.microsoft.com/en-us/windows/win32/api/d3d11/nf-d3d11-id3d11devicecontext-copysubresourceregion).
- F3: Immediate-context access needs serialization. FFmpeg exposes lock callbacks
  for its device and video contexts. Our renderer already enables D3D11
  multithread protection on the shared device context.
  See [Microsoft's threading contract](https://learn.microsoft.com/en-us/windows/win32/direct3d11/overviews-direct3d-11-render-multi-thread-intro)
  and the FFmpeg contract above.

## Design decision

Keep decoder frames in the short playback queue. Copy cache candidates to
independently owned NV12 GPU textures on the same device. Each copy owns its
frames context, so cache eviction does not leave an unaccounted reusable texture
pool alive. Copies use the existing serialized immediate context, before the
source frame can be returned to its decoder. Rendering consumes the cached
frames through the existing D3D11 import path. No CPU readback or per-frame CPU
wait belongs in the production copy path.

Device changes invalidate the shared cache. Admission and lookup also check
device identity, so retiring decoders cannot repopulate it with textures from
the previous device. Cache and device mutex acquisition must not form a cycle.

Keep the existing LRU budget and timestamp-successor rules. Reject decoder-bound
textures at the cache boundary. Allocation failure should skip caching that
frame while playback continues. Preserve visible dimensions, timestamps and
colour metadata. This is an implementation choice inferred from the contracts,
not a prescribed cache architecture from either vendor.

## Validation and limits

Test copied pixels after the source texture is overwritten and released, verify
independent ownership, and test budget eviction. Exercise backward seeks with
real hardware decoding and compare cache hits and decoder seek counts. Retain
the sustained playback check that reproduced surface exhaustion.

The existing byte budget accounts for NV12 texture dimensions, not opaque driver
allocation overhead. Per-frame texture/context creation adds overhead that must
be measured. This change does not add P010/HDR support or extend the cache to a
whole timeline. Cold seeks and evicted frames still require decoding.
