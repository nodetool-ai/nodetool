# Prism source regression

`chroma-444.jpg` is a 64 × 64 full-range BT.601 JPEG with alternating red and
blue pixels. Its full-resolution chroma exposes the colour detail lost when
MJPEG 4:4:4 is converted to I420. The decoder test compares its RGB pixels with
Qt's JPEG decoder at a 40 dB threshold and requires opaque alpha.

The complete-document oracle imports all six original package JPEGs into an
isolated store. Its `one-sample` case changes only the shoe's motion blur sample
count from eight to one, isolating source decoding from temporal accumulation.
Its `original` case preserves every authored field and compares eight frames.
Both cases record and verify the executable hash and reject lost treatments.

```sh
node native/timeline/src/motion/prism/oracle.mjs /path/to/immutable/nodetool-timeline one-sample
node native/timeline/src/motion/prism/oracle.mjs /path/to/immutable/nodetool-timeline original
```

The shared decoder change is integrated in
[FfmpegSource.cpp](../../preview/FfmpegSource.cpp).

The placement regression uses the same full-chroma fixture with keying and edge
highlighting over purple. It covers fractional transforms, a grouped keyed
leaf, a colored luma matte with partial alpha, and a cropped shadow outset.
It compares through the production web renderer rather than assuming a
resampling kernel.

```sh
node native/timeline/src/motion/prism/placement-oracle.mjs /path/to/immutable/nodetool-timeline
```

The private leaf-placement bridge is integrated in
[PreviewCompositor.cpp](../../preview/PreviewCompositor.cpp).
Leaf pixels reach the web placement shader as straight RGBA8. Native stages
retain their premultiplied contract and convert each sampled texel before
placement interpolation. Container surfaces keep premultiplied placement.

Cropped effects use their kept picture as the sampler domain at every pass and
at final placement. Physical output padding remains available to the native
pipeline. The regression includes radius-free crops and quarter-pixel shadow
offsets with partial shadow opacity.

Crop domain and placement corrections are integrated in the
[effect shader](../../../shaders/effects/clip.frag) and
[composite shader](../../../shaders/composite.frag).

The decoder-dependent native test and pure reference contracts are registered
by the owned module.
