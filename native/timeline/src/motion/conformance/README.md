# Cropped-source plan conformance

The plan oracle must fit the kept source rectangle, matching the web
compositors' `cropRectPx` boundary. Fitting the uncropped source reports a false
matrix mismatch for Voltra's narrow photo panels.

The regression executes the actual `oraclePlan` function from the shared
script. Until integration, it applies the proposed script patch to a temporary
copy. After integration, it tests the shared function directly. It checks two
complete Voltra layers and controls for pixel rounding, degenerate crops and
uncropped sources. Authored examples remain unchanged.

```sh
node --test native/timeline/src/motion/conformance/oracle.test.mjs
NT_CONFORMANCE_BASELINE=1 node --test native/timeline/src/motion/conformance/oracle.test.mjs
```

The second command reproduces the failure before integration. The patch is
[`motion-conformance-integration.patch`](../../../docs/motion-conformance-integration.patch).
It changes the reference geometry, preserving matrix tolerances and every
comparison. Exclusion cleanup remains in the separate
[`motion-parity-integration.patch`](../../../docs/motion-parity-integration.patch).
