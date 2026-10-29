# Motion pixel differential

Run with Node from `.nvmrc`, built backend packages, local fixture media,
FFmpeg and a native application binary:

```sh
node --test native/timeline/src/motion/pixels/oracle.test.mjs
xvfb-run -a env QT_QPA_PLATFORM=xcb QSG_RHI_BACKEND=vulkan \
  node native/timeline/src/motion/pixels/oracle.mjs native/timeline/build-f11/nodetool-timeline
```

The oracle clones complete existing effect fixtures, resolves their local media
paths and adds repeated cropped images and capped video copies with a moving
luma source, plus repeated generated-matte secondary decoders. It retains
effects, mattes, group opacity and crop fields. The production web exporter
provides reference frames. Native renders the requested nonmonotonic order,
then renders the final requested frame in a fresh process. The fresh capture
must match the seek capture exactly. Web rendering sorts its requests, so this
checks native seeking against web pixels, not web backward seeking.

Every reference/native pair must reach 40 dB RGB PSNR. The repeated-secondary
cases also require both renderers to produce different pictures at the first
two requested times. The capped-video case requires identical expanded layer IDs in both scene
models and accepts only the exact skipped-copy set that their video cap
predicts. Other import failures fail the comparison. Contract tests reject
empty coverage, absent images, unexpected skipped IDs and a deliberately
negated image. Reports and full input documents remain under
`native/timeline/build/motion-pixels-*`.

The comparison is synthetic fixture coverage. It does not establish complete
shipped-document, encoded-export, border-radius or cross-platform equality.
The integrated [scene evaluator](../../preview/SceneEval.cpp) retains expanded clip
records for exact decoder and provider lookup rather than parsing copy IDs.

The generated-matte importer stages a temporary `generating` record while it
imports local videos into the scratch asset store. Before the measured render,
it restores the original `ready` matte and replaces local `mediaPath` values
with scratch asset locators. The oracle compares the entire imported document
with its original after only these locator replacements. This requires every
matte setting, source range, invert flag, feather value, effect and crop field
to survive. Contract regressions reject a lingering `generating` status and a
removed feather value.
