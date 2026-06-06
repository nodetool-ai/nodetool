# image-nodes — Image Processing & Shaders

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **image-nodes**

> Read [packages/AGENTS.md](../AGENTS.md) first (output-contract, bounds, defaults, and `finally`-cleanup rules apply). This overlay covers image-specific correctness.

## Bounds & silent-swallow

- **Clamp crop/extract boxes to image bounds before calling `sharp.extract`.** An
  oversized region makes sharp throw, and `transformImage` swallows the error and
  returns the **full uncropped image** — a silent wrong result. Clamp
  `right = min(right, imgW)`, `width = max(1, right - left)`.
- **Resolve paired optional dimensions independently** — `Affine`/`Scale` once set
  output dims only when *both* `target_width` and `target_height` were `> 0`, so
  specifying just one was dropped. Use `w > 0 ? w : src.width` per dimension.

## GPU / native handle cleanup

- **Release every acquired GPU texture, buffer, and readback buffer in a
  `finally` block** (`let h: T | undefined; … h?.destroy()` in `finally`) — a
  throw during encode/submit/`mapAsync` (device loss, validation error) otherwise
  leaks GPU memory. Don't put `.destroy()` on the trailing happy path.

## Kernel & format correctness

- **Verify a convolution kernel's sum matches its intent**: edge/Laplacian sum
  `0`, blur sum `1`, sharpen sum `1`. `Contour` used a sharpen kernel (center `9`,
  sum `+1`) with a white offset and blew flat regions to white; the fix is the
  Laplacian (center `8`, sum `0`) matching PIL `CONTOUR`/the `FindEdges` kernel.
  Cross-check against PIL and sibling kernels in the same file.
- **Validate the full magic signature *and* minimum byte length before
  indexing.** `inferImageMime` read `bytes[8]` behind a `< 4` guard; WebP needs
  `bytes.length >= 12` and all of `R I F F` (0–3) + `W E B P` (8–11).
- **Handle 3-/4-digit hex shorthand** in color parsing (`#fff`) by doubling each
  nibble — don't fall back to the default color.
- **Percentage props that cut from both ends must cap below 50** — `AutoContrast`
  `cutoff` at `max: 255` let `>= 50` silently zero the channel; `max: 49`.

## Output ports

- **Return declared port keys** — `LoadImageFolder` declares `path` but once
  emitted `name`, leaving `path` empty on both buffered and streaming paths.
- **Inline `?? default` fallbacks must match the descriptor defaults** —
  `SplitToning`'s inline `?? 30/200/0.5` disagreed with the descriptor's
  `200/40/0.3`.
