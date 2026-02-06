# CUDA GPU Detection Fix

**Problem**: Settings > About > CUDA (GPU) showed "Not Available" even when GPU worked.

**Root Cause**: Two separate functions (`checkCudaAvailable()` and `getCudaVersion()`) ran in parallel with different detection logic. One could succeed while the other failed, leading to inconsistent `cudaAvailable` state.

**Solution**: Consolidated CUDA detection into a single `getCudaInfo()` function that:
1. Uses a single `nvidia-smi` call as the primary check
2. Falls back to parsing driver version if CUDA version not found
3. Provides alternative detection methods (lspci on Linux, system_profiler on macOS)
4. Returns consistent `available` and `version` values together

**Affected File**: `electron/src/systemInfo.ts`

**Date**: 2026-01-16
