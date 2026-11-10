# Realtime graph runner: implementation plan

This plan splits the [realtime design](graph-runner-realtime.md) into work
packages. One coding agent implements one work package in one pull request.
Each work package is one GitHub issue. Each delivery phase of design section 16
is one GitHub milestone.

Read the design first. This plan gives order and boundaries only. A conflict
between this plan and the design is a defect in this plan. Fix the plan.

## Rules for every work package

- Read the design sections that the issue names. Do not read the full design
  unless the issue needs it.
- Follow the [native rules](../../native/AGENTS.md) for C++ code: ownership,
  thread affinity, sanitizers.
- Add each test that the issue names under "Exit evidence". Prove a new check
  fails on invalid input, as the [harness rules](../HARNESS_FIRST.md) require.
- Run the mandatory checks of the [root AGENTS.md](../../AGENTS.md#mandatory-post-change-verification).
  For a CMake project, run `npm run test:affected:native`.
- Keep the design IDs (`RT-D4`, `RT-F44`, `RT-Q8`) in commit messages, code
  comments that need a reason, and pull request descriptions.
- A work package that answers an open question (Q1 to Q10) records the answer
  in the design, section 19, in the same pull request.
- A work package that changes a design decision updates the design in the same
  pull request and names the changed decision.
- Do not start a work package before its dependencies are merged. A package
  can start on a stub of a dependency only when the issue says so.

## Milestones

| Milestone | Design phase | Goal | Gate to the next milestone |
|---|---|---|---|
| RT M0: Spike | P0 | Measure the risky parts outside the product | WP04 report merged. R1 and R2 decided. Section 13 budgets replaced by measured values |
| RT M1: Headless core | P1 | `native/realtime` runs plans offline | Section 15 tests pass, except stall, swap state and audio parity. Q8 decided |
| RT M2: Live engine | P2 | Device, surface, clocks and params in real time | Stall test passes. `live bench` meets section 13 |
| RT M3: Editor integration | P3 | Compiler, descriptors, slots, editor picture | The example of section 1 runs in the editor. Swap state test passes |
| RT M4: Creative nodes | P4 | Custom shaders, analysis taps, feedback | Tap and feedback fixtures pass the frame goldens |
| RT M5: Browser | P5 | Browser executors | Audio parity in the browser. P1 frame fixtures meet level 2 |
| RT M6: Export and logs | P6 | Export, capture, batch taps, session log | Export plays in sync. A log replay repeats a session |
| RT M7: Data kernels | P7 | User and pack kernels in isolated mode | Loader tests pass. An endless-loop kernel causes no underrun |

## Work packages

| WP | Milestone | Title | Design sections | Depends on |
|---|---|---|---|---|
| WP01 | M0 | Spike: wgpu surface in a Qt container window, frame pacing, submit gate | 9.1, 9.2, 9.3, 13, R1, R2 | none |
| WP02 | M0 | Spike: buffered audio driver, synced param, plan swap, worker stall | 8, 10.2, 11, 13 | none |
| WP03 | M0 | Spike: built-in kernel as WebAssembly in an AudioWorklet | 10.5, 12, 15.1 | none |
| WP04 | M0 | Spike report: sound-to-picture offset and measured budgets | D7h, 13, 16, 18 | WP01, WP02, WP03 |
| WP05 | M1 | `native/realtime` project, plan IR schema, loader and validation | 6.2, 6.3, 14.4 | WP04 |
| WP06 | M1 | Control executor: register machine, analytic and stateful operations | 5.4, D12, D15, 15.1 | WP05 |
| WP07 | M1 | Audio executor, kernel ABI and first kernels | 10.1, 10.3, 12 (N6), 15.1 | WP05, WP06 |
| WP08 | M1 | Render executor: passes, dirty tracking, retention, texture presenter | 9.3, 9.4, 9.5 | WP05, WP06 |
| WP09 | M1 | Offline driver, `live` CLI, fixtures and harness entry | 14.3, 15 | WP07, WP08 |
| WP10 | M1 | `wasm32` build of the render executor and the Q8 decision | 14.5, Q8 | WP08 |
| WP11 | M2 | Extract `native/audio-io` from the timeline | 14.4, F11 to F13 | WP04 |
| WP12 | M2 | Live session core: threads, handoffs, retire queues, buffered driver | 7, 10.2, 11.2, 11.4 | WP09, WP11 |
| WP13 | M2 | Param table, sync policies and the audio-applied state | 11.1, 10.3, D7g | WP12 |
| WP14 | M2 | Surface presenter, visual clock and submit gate | 8 (D7c to D7f), 9.2, 9.7 | WP12 |
| WP15 | M2 | `live bench`, load profiles and the stall test | 13, 15 | WP13, WP14 |
| WP16 | M3 | Plan compiler in TypeScript | 5.3, 6, 11.3 | WP09 |
| WP17 | M3 | Live descriptors and generated catalog nodes | 6.1, Q2, Q5 | WP16 |
| WP18 | M3 | State store, state keys and click-free plan swap | 11.3, D9 | WP13 |
| WP19 | M3 | `LiveSession` runner API, slots and the slot-write node | 5.5, 14.1, 10.4 | WP15, WP16, WP18 |
| WP20 | M3 | Node editor picture window and transport | 14.2, Q1, Q4 | WP17, WP19 |
| WP21 | M4 | Custom shader node | 9.6, R7 | WP19 |
| WP22 | M4 | Analysis thread, taps and signal history | 10.4, D7h, 5.4 | WP19 |
| WP23 | M4 | Feedback, `FrameDelay` and `BlockDelay` nodes | 5.3, 9.4, 9.5 | WP19 |
| WP24 | M5 | Browser audio executor in an AudioWorklet | 10.5, 14.5, 15.1 | WP07, WP16 |
| WP25 | M5 | Browser render executor and render loop | 14.5, Q7, Q8 | WP10, WP16, WP24 |
| WP26 | M6 | Encoded export and capture sinks | 10.4, 15, F21 | WP19 |
| WP27 | M6 | Session log, replay and taps into batch regions | 5.3, 15.1, Q6 | WP26 |
| WP28 | M7 | Data kernel loader and desktop isolated mode | 10.6, Q9, R3 | WP19 |
| WP29 | M7 | Browser isolated mode for data kernels | 10.6, 14.5 | WP24, WP28 |

## Dependency graph

```
M0  WP01 ─┐
    WP02 ─┼─▶ WP04 ─┬─────────────────────────▶ WP11 ─┐
    WP03 ─┘         ▼                                  │
M1             WP05 ─▶ WP06 ─┬─▶ WP07 ─┐               │
                             └─▶ WP08 ─┼─▶ WP09 ───────┼─▶ WP12 ─┬─▶ WP13 ─┬─▶ WP15
                                       └─▶ WP10        │         └─▶ WP14 ─┘    │
M3                                    WP09 ─▶ WP16 ─▶ WP17           WP13 ─▶ WP18
                                       WP15, WP16, WP18 ─▶ WP19 ─▶ WP20 (with WP17)
M4                                     WP19 ─▶ WP21, WP22, WP23
M5                                     WP07 + WP16 ─▶ WP24 ─▶ WP25 (with WP10)
M6                                     WP19 ─▶ WP26 ─▶ WP27
M7                                     WP19 ─▶ WP28 ─▶ WP29 (with WP24)
```

Parallel tracks after M1:

- Engine track: WP11 to WP15, then WP18.
- Compiler track: WP16 and WP17 run beside the engine track.
- Browser track: WP24 can start when WP07 and WP16 are merged, before M3 ends.

## Open questions

| Question | Answered in |
|---|---|
| Q1. A live output always opens a session? | WP20 |
| Q2. New live output node types or existing outputs? | WP17 |
| Q3. Default session rate on a 48 kHz device | WP02, confirmed in WP12 |
| Q4. Picture size: session setting or window size | WP20 |
| Q5. Live descriptors on existing image nodes | WP17 |
| Q6. First tap policy for live-to-batch loops | WP27 |
| Q7. Browser render loop thread | WP25 |
| Q8. Browser render executor | WP10 |
| Q9. Metered mode for user kernels | WP28 |
| Q10. Editor control for the sync policy | WP20 |

## Issue index

Each issue carries the label `realtime` and the milestone of its row above.

| WP | Issue |
|---|---|
| WP01 | [#7392](https://github.com/nodetool-ai/nodetool/issues/7392) |
| WP02 | [#7393](https://github.com/nodetool-ai/nodetool/issues/7393) |
| WP03 | [#7394](https://github.com/nodetool-ai/nodetool/issues/7394) |
| WP04 | [#7395](https://github.com/nodetool-ai/nodetool/issues/7395) |
| WP05 | [#7396](https://github.com/nodetool-ai/nodetool/issues/7396) |
| WP06 | [#7397](https://github.com/nodetool-ai/nodetool/issues/7397) |
| WP07 | [#7398](https://github.com/nodetool-ai/nodetool/issues/7398) |
| WP08 | [#7399](https://github.com/nodetool-ai/nodetool/issues/7399) |
| WP09 | [#7400](https://github.com/nodetool-ai/nodetool/issues/7400) |
| WP10 | [#7401](https://github.com/nodetool-ai/nodetool/issues/7401) |
| WP11 | [#7402](https://github.com/nodetool-ai/nodetool/issues/7402) |
| WP12 | [#7403](https://github.com/nodetool-ai/nodetool/issues/7403) |
| WP13 | [#7404](https://github.com/nodetool-ai/nodetool/issues/7404) |
| WP14 | [#7405](https://github.com/nodetool-ai/nodetool/issues/7405) |
| WP15 | [#7406](https://github.com/nodetool-ai/nodetool/issues/7406) |
| WP16 | [#7407](https://github.com/nodetool-ai/nodetool/issues/7407) |
| WP17 | [#7408](https://github.com/nodetool-ai/nodetool/issues/7408) |
| WP18 | [#7409](https://github.com/nodetool-ai/nodetool/issues/7409) |
| WP19 | [#7410](https://github.com/nodetool-ai/nodetool/issues/7410) |
| WP20 | [#7411](https://github.com/nodetool-ai/nodetool/issues/7411) |
| WP21 | [#7412](https://github.com/nodetool-ai/nodetool/issues/7412) |
| WP22 | [#7413](https://github.com/nodetool-ai/nodetool/issues/7413) |
| WP23 | [#7414](https://github.com/nodetool-ai/nodetool/issues/7414) |
| WP24 | [#7415](https://github.com/nodetool-ai/nodetool/issues/7415) |
| WP25 | [#7416](https://github.com/nodetool-ai/nodetool/issues/7416) |
| WP26 | [#7417](https://github.com/nodetool-ai/nodetool/issues/7417) |
| WP27 | [#7418](https://github.com/nodetool-ai/nodetool/issues/7418) |
| WP28 | [#7419](https://github.com/nodetool-ai/nodetool/issues/7419) |
| WP29 | [#7420](https://github.com/nodetool-ai/nodetool/issues/7420) |
