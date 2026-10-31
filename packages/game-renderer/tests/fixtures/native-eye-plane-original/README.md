# Exact eye-plane depth diagnostic

This preserves the original common material fixture. Its box floor is 10 units
deep, with its front vertices exactly at the camera's z coordinate of 5.
The regular feature matrix uses a depth of 9.8 to avoid that exact-plane case.
This changes a test input, not a production shader or Qt depth behavior.

The retained `observed-depth.json` records the successful diagnostic capture.
At row 130, reconstructed model depth was 0.994186 and floor depth was 0.997187,
but the combined draw showed the floor. The floor's actual `gl_FragCoord.z`
was 0.973924. Moving only its front edge to z=4.9 restored model occlusion.
The behavior also reproduced in a fresh stock Three renderer. `NEVER` rejected
all fragments, the depth attachment was complete, and an independent raw WebGL
two-triangle depth control passed.

The cause remains provisional lower-level clipping or driver behavior. This
does not establish a vendor defect or behavior on other GPUs. It is a
non-gating diagnostic, separate from material conformance. Reproduce it from
the repository root under a valid software-GL display:

```bash
xvfb-run -a node --conditions=nodetool-dev --import=tsx \
  packages/game-renderer/tests/fixtures/nativeEyePlaneDepth.mjs
```

The command writes its new report under the configured `TMPDIR` and records
the graphics implementation. The fixture's GLB is closed and checked against
the document's declared digest before loading.
