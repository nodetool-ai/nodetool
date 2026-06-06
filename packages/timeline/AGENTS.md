# timeline — Clip Editing Math

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **timeline**

> Read [packages/AGENTS.md](../AGENTS.md) first (the bounds/float-math rules apply here). This package is pure functions over clips; the web store `web/src/stores/timeline/TimelineStore.ts` calls them, so forward and inverse ops must stay consistent.

## Timeline-space vs. source-space

- **Never conflate timeline duration with source duration.** A clip with an
  unbaked `speedMultiplier` consumes `rate` source-ms per timeline-ms. Convert
  through one shared `sourceRate(clip)` helper
  (`speedBaked ? 1 : max(0.0001, speedMultiplier ?? 1)`, guarding zero/negative)
  used by split, trim, merge, **and** the preview compositor — so they can't
  diverge. Source points scale (`inPointMs + leftDurationMs * rate`); timeline
  duration uses the raw delta.
- **An inverse op must use the same rate-aware quantity the forward op wrote.**
  Merge undoing split compares `outPointMs ?? (inPointMs + durationMs)` for
  contiguity — the `+ durationMs` reconstruction is only correct at 1× speed.

## Splitting / cloning entities

- **When you split or clone by spreading `...clip`, explicitly clear the
  properties that belong only to the original outer boundary** — `delete
  leftClip.fadeOutMs`, `delete rightClip.fadeInMs`/`transitionIn`. A full spread
  duplicates boundary fades/crossfades onto the new interior hard cut.
- **Partition time-positioned children, don't copy them to both halves.**
  `splitClip` must assign each caption word to exactly one side (clamping the
  straddling word) and **rebase** the moved side's local timings
  (`startMs - splitMs`), not copy the whole `words` array to both.

## Snapping & placement

- **Generate snap-point ticks as `i * interval`, never `t += interval`** —
  fractional intervals (`1000/30`) drift under accumulation and stop deduping
  against integer boundaries.
- **Track `snapped` as an explicit boolean set when a within-threshold candidate
  is adopted**, not `closest !== timeMs` — the latter is wrong when the snap target
  lands exactly on the input.
- **Exclude the moving entity's own footprint from overlap/collision checks**
  (`excludeClipIds`) — otherwise a dragged clip reports overlapping itself.
