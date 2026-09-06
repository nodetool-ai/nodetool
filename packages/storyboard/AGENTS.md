# storyboard — Recast and Render Plans

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **storyboard**

> Read [packages/AGENTS.md](../AGENTS.md) first. This package is pure functions
> over a storyboard document plus one IO module; the agent capabilities
> (`packages/agents/src/capabilities/storyboards.ts`), the
> `nodetool.storyboard.*` nodes and the board editor all call them, so a board
> derived or rendered headlessly matches one derived or rendered in the UI.
> Design: [docs/graph-resources/design.md](../../docs/graph-resources/design.md) §3.1.

## What is here

| Module | Answers |
|---|---|
| `recast.ts` | The same board with a different cast: who replaces whom, what gets renamed, which takes survive. |
| `render-plan.ts` | What a render call would send per shot, and which shots are already current. |
| `io/render-shots.ts` | Running a plan: generate, stamp the record, write the shot. |

## Rules

- **The document type is a mirror, not an import.** `StoryboardDocument` is
  declared authoritatively in `@nodetool-ai/models`, which sits above runtime
  and cannot be imported from here. `src/document.ts` restates it field for
  field. A field added there must be added here in the same PR, or the caller's
  assignment stops compiling — which is the point.
- **Never reimplement prompt composition or hashing.** `keyframePrompt`,
  `clipPrompt`, `directClipPrompt`, `entitiesForShot`, `injectEntities`,
  `currentRenderInputs`, `isVersionStale` and `sha256Hex` all come from
  `@nodetool-ai/protocol`. Two surfaces that compose the same shot differently
  make a board impossible to reason about.
- **`fresh` is measured against the board, `renderInputs` against the call.**
  A shot is fresh when the *board* would render it the same way it already did;
  the record stamped on a version says what *this call* actually used, so a
  per-call model or style override reads stale against the board afterwards.
- **Recast invalidation has two witnesses, and they are not interchangeable.**
  A first recast compares the injected prompt of the template shot against the
  injected prompt of the derived shot — both entity sets are inputs, so an
  entity descriptor edit is visible. A reused copy compares the derived shot's
  hash against the `render_inputs.prompt_hash` the render actually wrote, which
  is the prompt that produced the take being carried; a hand edit made on the
  copy after it rendered therefore costs nothing. A take with no record (an
  upload, a flip, a legacy version) falls back to the injected comparison.
- **`RenderInputs.prompt_hash` hashes the composed prompt, not the injected
  one.** `promptHashFor` in protocol's `render-record.ts` hashes
  `keyframePrompt`/`clipPrompt`/`directClipPrompt` before `injectEntities`
  runs, so entity descriptors are outside it — as they are outside the board's
  own stale pill. That bounds the reuse path: a destination entity whose
  descriptor changed under the same id and name between two reuses is not
  detected. `tests/recast.test.ts` pins both halves, so the day the record
  hashes the injected prompt the pin fails and this rule gets rewritten.
- **Recast is order-free.** Targeting resolves explicit `replaces` first, then
  pairs a kind that has exactly one free seat with exactly one applicant.
  Feeding the same cast in a different order must produce the same `recastKey`
  and the same document — a test pins it.
- **A rename is whole-word.** `Nova` must not rewrite `Novak`. The boundaries
  are Unicode lookarounds, not `\b`; the failing case is in the suite.
- **`io/` takes a host, not a context.** The seam is four operations the caller
  implements (`runGeneration`, `getStoryboard`, `updateStoryboard`, and
  optionally `loadMedia` / `videoDurationSeconds`). Adding a runtime or models
  import here would invert the build order.
- **Writes are a CAS with one retry.** Renders run concurrently against a single
  row: on a conflicting write the board is re-read and the patch re-applied to
  the fresher document, never to the copy the render started from.

## Tests

```bash
npm run test --workspace=packages/storyboard
```

`tests/recast.test.ts` covers targeting, renaming, invalidation and the reuse
merge; `tests/render-plan.test.ts` pins `fresh` against protocol's
`staleKeyframeShots`/`staleClipShots` on the capability's own fixture shapes, so
the plan and the capability's `stale_only` cannot drift apart;
`tests/render-shots.test.ts` drives the IO half against a fake host.
