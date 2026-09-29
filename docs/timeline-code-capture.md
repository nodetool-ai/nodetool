# Timeline Code Capture

A timeline built with `@nodetool-ai/sandbox-timeline` stores the code that
builds it in `document.source`. This page defines what that code is and how
it is produced.

## The rule

The stored code is a **retained program**, not the script the author ran.
The retained program holds only what rebuilds the document:

- the scene callbacks, as source text
- the declarations those callbacks use, as source text, when they are pure
- the values those callbacks read from anything else, as literals

A research call, a generation, a fetch or a model call runs once, in the
author's run. Its result enters the retained program as a literal. A rebake
runs the retained program with no capabilities, so it cannot repeat a side
effect.

## Capture

`buildEntryModule` (`packages/agents/src/js-sandbox-worker/interpreter.ts`)
passes guest code that imports `@nodetool-ai/sandbox-timeline` through
`captureTimelineScenes` (`packages/agents/src/timeline-capture.ts`). Every
guest run passes through this function, so every agent path gets the same
capture.

The transform finds each `<receiver>.scene(name, seconds, fn, extra?)` call
and appends one argument: the capture record. The record adds no line
breaks, so stack lines stay correct. It holds:

| Field | Content |
|---|---|
| `src` | The source text of `fn`, or the name of the function it refers to |
| `decls` | The retained declarations that `fn` needs, with source text and source order |
| `imports` | The pack imports that `fn` and the declarations use |
| `snap` | A thunk for each value to snapshot, called when the scene is built |
| `errors` | Diagnostics for values that cannot be kept |

## Classification

The transform resolves each free variable of `fn` with `eslint-scope`, then
follows the free variables of each retained declaration in the same way.

| Variable | Result |
|---|---|
| A standard global (`Math`, `JSON`, `Number`, …) | Kept as is |
| An import from a `@nodetool-ai/sandbox-*` pack | Kept as an import |
| The `video(...)` binding | Printed from its recorded options |
| A `const` or `function` whose initializer has no `await`, is not mutated, and uses only kept variables | Kept as source text |
| Any other variable: `let`, a loop variable, a parameter, a result of `await` | Snapshot of its value when the scene is built |
| `nodetool`, `tools` or another capability global | Error |
| A snapshot value that is a function, a class instance or a cycle | Error |

A declaration that uses a snapshot is kept, but it is printed inside the
scene's own block, after the snapshot.

## The printed program

`v.save()` prints the retained program from the capture records:

```js
import { video, rad } from "@nodetool-ai/sandbox-timeline";
const v = video({"width":1920,"height":1080,"fps":30,"palette":{}});
const PAD = 120;                                // kept declaration
function title(s, text) { /* kept helper */ }
const __scene0 = (() => {
  const headline = "Rain returns to the valley"; // snapshot
  return v.scene("intro", 3, (s) => { title(s, headline); });
})();
v.series([__scene0, v.transition("fade", 0.5, {}), __scene1]);
v.__restore({ /* tracks, clips, markers and fields added after series */ });
return await v.save(nodetool.timelines, { name: "…", ops: [] });
```

Everything that `v.adjust`, `v.audio`, `v.music`, `v.midi`, `v.beats` and
`v.document` add after `v.series` is stored as data in `v.__restore`.

## The embed gate

`v.save()` passes the printed program to `nodetool.timelines.code.set` with
`require_match: true`. The host runs the program in the hermetic bake. It
attaches the program only when the bake gives exactly the saved document.
In all other cases it writes nothing and returns a warning, which `v.save()`
returns in `code.warnings`. The usual causes are `Math.random()` or
`Date.now()` in a scene callback, and a scene clip that changes after
`v.series`.

`el.react()` needs an audio decode that the bake cannot do, so a timeline
that uses it is not embedded.

## Not in this phase

- **Keys and overrides.** Clip ids come from call order in each scene. A
  `key` option, `s.each(items, {key}, fn)` and per-instance overrides come
  next. With them, a hand edit becomes an override instead of a conflict.
- **Expression editing.** Expressions are not stored as ASTs. A rebake
  runs the scene callback again, so a changed constant still moves every
  value that depends on it.
