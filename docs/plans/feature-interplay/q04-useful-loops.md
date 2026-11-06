**TLDR:** Prioritize revision loops where users can generate, edit, regenerate and compare without rebuilding their manual work.

# Q4. Which useful loops can we complete?

Storyboard-to-timeline already has a useful foundation. Shot refill matches shot identities, replaces media and preserves existing placement, trims and transforms. Take selection provides a separate way to compare generated alternatives.

The next useful loop is: change a source, identify affected outputs, regenerate selected items, then compare before accepting. Existing dependency hashes and stale-layer regeneration cover parts of this loop. They do not establish a complete cross-editor dependency index.

**Proposed connection:** add a read-only “affected by this change” view first. Follow it with selective regeneration and explicit acceptance. Start with a storyboard shot and its timeline clip.

**Next check:** regenerate a shot with shorter footage after trimming its clip. Verify preserved edits remain valid, since preserving a trim does not guarantee it fits the replacement media.

Evidence: [shot refill](https://github.com/nodetool-ai/nodetool/blob/main/packages/timeline/src/reassemble.ts), [takes](https://github.com/nodetool-ai/nodetool/blob/main/packages/timeline/src/takes.ts), [dependency hash](https://github.com/nodetool-ai/nodetool/blob/main/packages/timeline/src/dependencyHash.ts), [stale-layer regeneration](https://github.com/nodetool-ai/nodetool/blob/main/web/src/hooks/sketch/useRegenerateStaleLayers.ts).
