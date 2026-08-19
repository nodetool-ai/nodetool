---
name: sandbox-diff
description: Unified text diffs in a Code node or CodeAct action, with the diff library running on the host
---

# Text diffs in the sandbox

Specifier: `@nodetool-ai/sandbox-diff`. Import it at the top of the body.

The `diff` library schedules with `setTimeout`, and the guest has no timers, so
it cannot be compiled in. This pack is a **host module**: the import resolves to
a generated facade over NodeTool's own implementation.

## unified — a unified diff of two texts

```js
import { unified } from "@nodetool-ai/sandbox-diff";

const patch = await unified(inputs.before, inputs.after, {
  oldName: "before.md",
  newName: "after.md",
  context: 5
});
return { patch, changed: patch.includes("@@") };
```

Options: `context` (lines of context, 0–100, default 3), `oldName`, `newName`.
Identical inputs produce a header with no hunks, so `includes("@@")` is the
cheap "did anything change" test — handy in a verify loop.

## Gotchas

- **`unified` is async.**
- **5 MB per side.** Larger input is refused by name.
- **Line-oriented.** Two texts that differ only in trailing whitespace still
  diff; normalize first if that is noise.
