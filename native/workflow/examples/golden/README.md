# Image golden fixtures

Each graph has inputs and committed numeric outputs in [expected.json](expected.json).
Tests compile the graph and compare its output with those numbers. Tests never
rewrite the golden file. CPU tests always run. Set `NODETOOL_TEST_CUDA=1` to run
the same fixtures through the CUDA compiler and runtime.

The motion blur coefficients use fifths. Other fixtures use binary fractions
whose small sums and products are exactly representable as `f32`. The comparison
allows absolute and relative error of `1e-6` for rounding and backend variation. Values are flattened in the
layout declared below. These are numeric image tests without file decoding.

- **Motion blur** uses a `[3,7,1]` HWC image and a uniform horizontal motion kernel
  `[1/5,1/5,1/5,1/5,1/5]`. For each pixel, average the five samples
  at horizontal offsets `-2,-1,0,1,2`. Clamp sample coordinates to the image border. The three
  rows contain a left-border impulse, a center impulse, and an increasing ramp.
  The left impulse yields `[3/5,2/5,1/5,0,0,0,0]`. The center impulse yields
  `[0,1/5,1/5,1/5,1/5,1/5,0]`.
- **CNN classifier** uses an NCHW `[1,1,4,4]` image. Cross-correlate with the
  supplied OIHW `[1,1,2,2]` weights, add scalar bias, and apply ReLU.
  Apply a `2x2` maximum pool with stride one, flatten the resulting `2x2`
  map in row order, and multiply by the supplied `[4,2]` matrix. The two
  outputs are class scores. No Softmax is applied.
- **AI image filter** is a fixed-weight image-to-image CNN over an NCHW
  `[1,1,3,5]` image. Its first convolution produces two feature maps with
  zero padding of one pixel. The smoothing kernel is
  `[[0,1/8,0],[1/8,1/2,1/8],[0,1/8,0]]`. The sharpening kernel is
  `[[0,-1/4,0],[-1/4,2,-1/4],[0,-1/4,0]]`. Apply ReLU to each map,
  then a `1x1` convolution computes `3/4 * smooth + 1/4 * sharp`.
  Clamp the result to one. ReLU already supplies the lower bound.
  These explicit demonstration weights make no claim about trained quality.
- **Color grading** uses linear RGB in NCHW `[1,3,2,3]` layout. For each pixel,
  compute `L = R/4 + G/2 + B/4` and half saturation
  `s = channel/2 + L/2`. Exposure multiplies `s` by two. Contrast computes
  `(2*s - 1/2) * 5/4 + 1/2`, which equals `5*s/2 - 1/8`.
  Clamp to `[0,1]`. The `1x1` convolution implements the saturation matrix.
  Inputs include black, neutral gray, and values that reach both clamp bounds.

Golden outputs were calculated directly from these sums, pooling windows, and
channel formulas using host arithmetic, independently of generated compiler
code. Review changes to expected numbers against these formulas rather than
copying execution results.
