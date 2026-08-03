# A stream arriving on a list-typed input

_Status: proposal. Nothing in the kernel is changed by it. Filed as
GAP-CORR-3 in [correlation-design.md](correlation-design.md)._

## What happens today

`ImageToVideo.image` is typed `list[image]`. In `Directed Film to Timeline` it
is fed by one edge from a keyframe generator that runs once per shot. The run
produces five stills and one clip.

The kernel logs it and moves on:

```
WARN Node "animate" handle "image" received multiple values at empty scope;
     only the last is kept.
```

The mechanism is in `runner.ts`. A handle becomes a list input only when
**several edges** target it:

```ts
// packages/kernel/src/runner.ts — _multiEdgeListInputs
const typeStr = propertyTypes[handle];
if (!TypeMetadata.fromString(typeStr).isListType()) continue;
this._multiEdgeListInputs.get(nodeId)!.add(handle);
```

`actor.ts` then splits on that set:

```ts
if (isListInput(handle)) {
  emptyListEnvelopes.get(handle)!.push(envelope);   // aggregate
} else {
  emptySticky.set(handle, envelope);                // last one wins
}
```

One edge carrying many values takes the second branch. The scope was already
collapsed as if the handle would aggregate, so the values land at empty scope,
overwrite each other, and four of the five stills are discarded after being
paid for.

The first branch is not a working alternative to fall into, either: GAP-CORR-2
records that multi-edge list aggregation is unimplemented at runtime too. This
gap is about the single-edge case, which analysis does not even register.

## Why "just aggregate it" is the wrong fix

Aggregating every list-typed handle fed by a stream fixes 3 of the 9 sites in
the shipped gallery and quietly breaks the other 6.

The two groups are structurally identical and semantically opposite:

| Site | Handle type | What the author wants |
|---|---|---|
| `ForEach.input_list` | `list[any]` | the whole stream, as one list |
| `ImageToVideo.image` | `list[image]` | one invocation per item |

`ImageToVideo`'s own property description settles its case:

> Input image(s) to animate. The first image is the primary frame; additional
> images are used as references by providers that support multi-image input.

Aggregating five streamed stills there yields **one** video keyed on the first
still with the rest folded in as references. That is not five clips, and unlike
today's behaviour it produces a plausible-looking artifact instead of a warning
— silent data loss traded for a silently wrong result.

The type system cannot separate them. `list[any]` and `list[image]` differ only
in element type, and element type is not what distinguishes "collect this
stream" from "call me per item".

## Proposal

Let the handle say which it means, and make the third case an error.

**1. Declare aggregation on the property.** A prop-level flag — or a reuse of
the `collapse` field `OutputCorrelation` already carries — marks a handle that
consumes a whole stream:

```ts
@prop({ type: "list[any]", aggregatesStream: true })
declare input_list: unknown[];
```

`ForEach.input_list` and the other collectors opt in. `ImageToVideo.image` does
not.

**2. An opted-out handle invokes per item.** A stream arriving on a list-typed
handle that has not opted in runs the node once per value, each wrapped as a
one-element list. `Directed Film to Timeline` then produces one clip per shot,
which is what it has always claimed to do.

**3. Multi-edge keeps working.** Several edges into a list handle aggregate as
they do now; `fan_in` already validates that shape.

Under this rule all 9 gallery sites do what their graph says, and neither group
has to be rewritten to accommodate the other.

## Already landed

The static half of this is in `validateGraph` as `stream_into_list_input`
(error): a list-typed handle fed by exactly one edge whose source emits a value
per item. It reads `output_correlation` — the same metadata the kernel reads —
and propagates transitively, because the node in the middle is usually one like
`TextToImage` that declares no correlation of its own and streams only because
its input does.

It reports the shape; it does not change what a run does. Until the kernel
takes a position, these graphs still silently drop values — the check only
means they can no longer ship without someone seeing it.

## Affected today

Nine sites across seven shipped examples. Three want aggregation
(`ForEach.input_list` in Ad Creative Factory, Music Video Visualizer, Social
Media Calendar Filler). Six want per-item invocation:

```
Directed Film to Timeline   TextToImage.output   → ImageToVideo.image
Movie Trailer Generator     TextToImage.output   → ImageToVideo.image
Script to Screen            TextToImage.output   → ImageToImage.image
Script to Screen            ImageToImage.output  → ImageToVideo.image
Ad Creative Factory         ImageToImage.output  → ImageToVideo.image
Photo Enhancement Suite     UnsharpMask.output   → ImageToImage.image
```
