**TLDR:** A shared description of generated dependencies could support source navigation, stale-state explanations, selective regeneration and export checks. Start with inspection, not automatic propagation.

# Q10. Which small bridge would enable several new experiences?

Timeline and sketch generation already record workflow bindings, parameters and dependency hashes. Timeline export separately collects assets and foreign references. These pieces describe overlapping parts of “what produced this?” and “what does this need?”

**Proposed connection:** expose a bounded dependency description for generated clips and layers: source reference, selected output, effective inputs, result version and update policy. Let each document adapter supply it from existing fields.

The first consumer should only explain dependencies and stale reasons. Later consumers could preview affected items, regenerate selected outputs or warn about incomplete exports.

**Next check:** change one bound input and verify the description identifies the affected item and reason. Hash helpers are reusable, but their existence does not prove every caller supplies complete input dependencies. This is a design candidate, not a measured implementation estimate.

Evidence: [timeline hashes](https://github.com/nodetool-ai/nodetool/blob/main/packages/timeline/src/dependencyHash.ts), [sketch hashes](https://github.com/nodetool-ai/nodetool/blob/main/packages/image-editor/src/dependencyHash.ts), [timeline binding](https://github.com/nodetool-ai/nodetool/blob/main/packages/websocket/src/trpc/routers/timeline.ts), [export collectors](https://github.com/nodetool-ai/nodetool/blob/main/packages/project-services/src/timeline-bundle.ts).
