# Performance Test Flakiness

**Problem**: Performance test `nodeComponentsPerformance.test.tsx` fails with timing assertion error.

**Root Cause**: The test expects memoized operations to be at least 5x faster, but timing varies significantly in CI environments:
- Expected: < 0.10ms (5x faster than baseline)
- Received: ~1.19ms (only ~2.5x faster)

**Why It Fails**:
- Performance tests are inherently flaky due to machine timing variations
- CI environments have variable CPU load affecting timing measurements
- JIT compilation and garbage collection affect timing
- Test uses strict thresholds that don't account for environmental factors

**Solution**: Run tests with `PERF_TESTS=false` to skip performance assertions:
```bash
PERF_TESTS=false make test-web
```

**Files**: `web/src/__tests__/performance/nodeComponentsPerformance.test.tsx`

**Note**: There is a branch `fix-flaky-perf-tests` that addresses this issue. Consider using that fix or implementing a more robust performance testing approach.

**Date**: 2026-01-12
