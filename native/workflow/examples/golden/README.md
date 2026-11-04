# Torch golden fixtures

Each graph has inputs and committed numeric outputs in [expected.json](expected.json).
The [test runner](../../tests/check.py) compares eager Torch and packaged AOTInductor
artifacts executed by the C++ runtime with those numbers. It never rewrites the
golden file. Run `npm run test:torch-workflow` for CPU or
`npm run test:torch-workflow:cuda` for CUDA on a GPU host.

Weights are immutable Constant buffers in the graphs. The CNN fixture retains
its original weight arrays under `inputs` in the expected-data file for provenance.
Only graph-declared Input nodes are runtime arguments.

The motion blur coefficients use fifths. Other fixtures use binary fractions
whose small sums and products are exactly representable as `float32`. The comparison
allows absolute and relative error of `1e-6` for rounding and backend variation.
Values are flattened in the layout declared below. These are numeric image tests without file decoding.

- **G1 — Motion blur** uses a `[1,1,3,7]` NCHW image, converted from the original
  `[3,7,1]` HWC input, and a uniform horizontal motion kernel
  `[1/5,1/5,1/5,1/5,1/5]`. For each pixel, average the five samples
  at horizontal offsets `-2,-1,0,1,2`. Replicate padding of two columns preserves
  the image border. The three
  rows contain a left-border impulse, a center impulse, and an increasing ramp.
  The left impulse yields `[3/5,2/5,1/5,0,0,0,0]`. The center impulse yields
  `[0,1/5,1/5,1/5,1/5,1/5,0]`.
- **G2 — CNN classifier** uses an NCHW `[1,1,4,4]` image. Cross-correlate with the
  supplied OIHW `[1,1,2,2]` weights, add scalar bias, and apply ReLU.
  Apply a `2x2` maximum pool with stride one, flatten the resulting `2x2`
  map in row order, and multiply by the supplied `[4,2]` matrix. The two
  outputs are class scores. No Softmax is applied.
- **G3 — AI image filter** is a fixed-weight image-to-image CNN over an NCHW
  `[1,1,3,5]` image. Its first convolution produces two feature maps with
  zero padding of one pixel. The smoothing kernel is
  `[[0,1/8,0],[1/8,1/2,1/8],[0,1/8,0]]`. The sharpening kernel is
  `[[0,-1/4,0],[-1/4,2,-1/4],[0,-1/4,0]]`. Apply ReLU to each map,
  then a `1x1` convolution computes `3/4 * smooth + 1/4 * sharp`.
  Clamp the result to one. ReLU already supplies the lower bound.
  These explicit demonstration weights make no claim about trained quality.
- **G4 — Color grading** uses linear RGB in NCHW `[1,3,2,3]` layout. For each pixel,
  compute `L = R/4 + G/2 + B/4` and half saturation
  `s = channel/2 + L/2`. Exposure multiplies `s` by two. Contrast computes
  `(2*s - 1/2) * 5/4 + 1/2`, which equals `5*s/2 - 1/8`.
  Clamp to `[0,1]`. The `1x1` convolution implements the saturation matrix.
  Inputs include black, neutral gray, and values that reach both clamp bounds.

Golden outputs were calculated directly from these sums, pooling windows, and
channel formulas using host arithmetic, independently of generated compiler
code. Review changes to expected numbers against these formulas rather than
copying execution results.

Golden runs set float32 matrix multiplication precision to `highest` and disable
TF32 for CUDA matrix multiplication and cuDNN. Manifest compiler options record
these settings. The suite separately verifies NaN, positive and negative infinity,
and signed zero through a compiled multiply graph.

The runner prints measurements and saves `measurements.json` when passed
`--artifacts <directory>`. It separates compilation, package loading, first and
warm execution, host/device transfer, and eager execution. Compilation can use
PyTorch's compiler cache. Peak host RSS includes the runtime. GPU peak memory
is not measured.
