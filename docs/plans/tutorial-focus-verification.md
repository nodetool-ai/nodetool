# Tutorial focus verification

The [focus plan](tutorial-focus-animation.md) is implemented across T1–T17. Shot/event decisions are recorded in the [graph audit](tutorial-focus-graph-audit.md) and [fixed-surface audit](tutorial-focus-fixed-audit.md).

| Check | Evidence |
| --- | --- |
| V1 Framing | Camera tests cover target height, small controls, groups, edges, overlay exclusions, and composition dimensions. |
| V2 Timing | Tests cover interval boundaries, invalid ordering, short windows, holds, backward seeks, action alignment, and result reading budgets. |
| V3 Targets | Every catalog entry rendered with required target validation. Browser tests deliberately request a missing DOM target and assert render failure. |
| V4 Determinism | Browser fixtures compare direct, sequential, and backward-seek frames with changing text, scroll, and media. The real chat composition's frame 584 also matched a sequential render byte for byte. |
| V5 Visual review | Inspection frames cover shot starts, midpoints, settlement, actions, and results. Encoded videos were reviewed through frame sequences at 920px, with denser transition samples. This was frame-based review, not realtime playback. |
| V6 Fidelity | Cast tests preserve correction on the existing layer, clarification before planning, and failure before repair. CSV fixtures reproduce the displayed clean sum, NaN failure, and repaired sum. |
| V7 Shared consumers | Representative `Cookbook-image-enhancement` and `Workflow-transcribe-audio` frames rendered through the retained legacy camera path. |
| V8 Repository | `npm run test:affected`, `npm run typecheck`, `npm run lint`, and `npm run dev:nodetool -- harness gate --base origin/main` passed. Typechecking used Node's 8GB heap setting. |
| V9 Assets | All 17 MP4s fully decoded. Each is H.264, 1920×1080, 30fps, with the catalog frame count. Encoded durations match app labels. All 17 posters match their app copies byte for byte. No MP4 is bundled under `web/public/tutorials/`. |

Videos and posters are in [docs/assets/tutorials](../assets/tutorials/). The complete render command is `npm run render:tutorials:all` from `demo/`, followed by `npm run sync:posters`. It derives filenames, inspection frames, posters, and durations from the complete catalog.

The casts remain synthetic demonstrations using production components. T2 traces an existing graph, T9 represents the recorded trim without a fabricated drag, and T14 ends on the assembled app without claiming a workflow run. Publication is separate from these committed assets.
