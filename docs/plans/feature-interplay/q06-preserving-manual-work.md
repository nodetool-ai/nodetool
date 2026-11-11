**TLDR:** Game construction already offers a strong pattern: preview generated changes, preserve overrides and reject stale application. Extend the pattern where regeneration threatens edits.

# Q6. Where can manual and generated work coexist safely?

Game authoring reconciliation compares retained construction state with a candidate, accounts for overrides and reports conflicts. Applying a candidate checks that the draft still matches the expected state.

Timeline shot refill offers narrower preservation: it retains placement, trims and transforms while replacing generated media. These are related guarantees, but not interchangeable implementations.

**Proposed connection:** use a consistent review flow across generated documents: preview changes, identify preserved edits, resolve conflicts, apply and retain a recoverable version. Keep reconciliation specific to each document's semantics.

**Next check:** generate a candidate, manually edit the same object, then apply the old candidate. It should require reconciliation rather than silently replace the newer edit. Repeat with a deleted or detached generated object.

Evidence: [construction behavior](../../game-engine/construction.md), [reconciliation](https://github.com/nodetool-ai/nodetool/blob/main/packages/game-runtime/src/authoring-reconcile.ts), [checked game persistence](https://github.com/nodetool-ai/nodetool/blob/main/packages/models/src/game.ts), [timeline preservation](https://github.com/nodetool-ai/nodetool/blob/main/packages/timeline/src/reassemble.ts).
