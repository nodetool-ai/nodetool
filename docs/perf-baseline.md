# Canvas Layout Performance Baseline

This document captures baseline performance metrics for the Layout Canvas editor prior to PixiJS v8 migration.

## Perf Harness Setup

- Route: `/canvas` (Standalone Canvas Editor)
- Enable perf mode (1k/5k/10k dataset)
- Overlay shows frame time (instant, average, P95), element count, and snap time

## Baseline Capture

Use Chrome Performance and React Profiler with the perf harness datasets:

- **1k elements**: _TBD_
- **5k elements**: _TBD_
- **10k elements**: _TBD_

Record:

- Average frame time (ms)
- P95 frame time (ms)
- Snap time (ms)
- React commit durations
- Any dropped frames

## Notes

- Measurements should be captured on a consistent hardware profile.
- Export screenshots of the overlay and attach profiler flame charts.
- Konva is currently retained only for interaction handling (selection/transform). Dropping it requires Pixi hit
  testing, drag/resize handles, and selection tooling parity.
