# Cropped-source plan conformance

The plan oracle must fit the kept source rectangle, matching the web
compositors' `cropRectPx` boundary. Fitting the uncropped source reports a false
matrix mismatch for Voltra's narrow photo panels.

The regression executes the actual `oraclePlan` function from the shared
script. It checks two complete Voltra layers and controls for pixel rounding,
degenerate crops and uncropped sources. Authored examples remain unchanged.

```sh
node --test native/timeline/src/motion/conformance/oracle.test.mjs
```

The correction is integrated in [plan-conformance.mjs](../../../scripts/plan-conformance.mjs).
It preserves matrix tolerances and every comparison. The corresponding
[exclusions](../../../fixtures/plan/exclusions.json) have been removed.
