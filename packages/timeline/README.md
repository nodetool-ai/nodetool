# @nodetool-ai/timeline

Core timeline types and status models for the NodeTool timeline feature for [NodeTool](https://nodetool.ai).

The canonical type layer plus pure editing math for NodeTool's video timeline: sequences, tracks, clips, markers, versions, and status values, along with framework-free helpers for splitting, trimming, snapping, placement, and staleness detection. Blend modes are re-exported from `@nodetool-ai/gpu` so the timeline preview compositor agrees with the sketch editor and Compositor node.

## Install

```bash
npm install @nodetool-ai/timeline
```

## Exported symbols

| Symbol | Kind | Description |
| --- | --- | --- |
| `TimelineSequence` | interface | Top-level sequence (tracks, clips, markers, transcript) |
| `TimelineTrack` | interface | A track within a sequence |
| `TimelineClip` | interface | A clip placed on a track |
| `TimelineMarker` | interface | A timeline marker |
| `ClipStatus` | type | `draft`, `queued`, `generating`, `generated`, `stale`, … |
| `BlendMode` | type | Re-exported from `@nodetool-ai/gpu` |
| `makeSequence` / `makeTrack` / `makeClip` / `makeMarker` | function | Factories for default sequence, track, clip, and marker |
| `makeClipVersion` / `makeTrackEffect` | function | Factories for a clip version and a track effect |
| `createTimeOrderedUuid` | function | Time-ordered UUID for stable ids |
| `splitClip` | function | Split a clip at a time into two clips |
| `trimClip` | function | Trim a clip's in/out points |
| `snap` | function | Snap a time value to nearby points |
| `sourceRate` | function | Compute a clip's source playback rate |
| `resolveSnap` / `buildSnapPoints` | function | Snapping resolution and snap-point construction |
| `resolveTrackPlacement` | function | Resolve where a clip lands across tracks |
| `computeStaleSet` | function | Determine which clips are stale |

The Node-only `computeDependencyHash` lives at the `@nodetool-ai/timeline/dependencyHash` subpath (it depends on `node:crypto`).

## Usage

```ts
import { makeSequence, makeClip, splitClip } from "@nodetool-ai/timeline";

const sequence = makeSequence({ name: "Intro", fps: 30 });
const clip = makeClip({ startMs: 0, durationMs: 5000 });

const [head, tail] = splitClip(clip, 2000);
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
