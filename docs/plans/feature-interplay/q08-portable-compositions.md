**TLDR:** Carrying media preserves a result, but may not preserve its ability to regenerate. Export should explain both guarantees separately.

# Q8. What survives moving, copying, or publishing a composition?

The timeline bundle collector includes current media, thumbnails, waveforms, take assets and sampler assets. It separately records workflow, storyboard, script and job IDs as foreign references. Those IDs are informational dependencies, not bundled implementations of their sources.

Game export has a different purpose: package a playable document, runtime and resolved assets. The publishing guide distinguishes that build from an editable draft and an accepted revision.

**Proposed connection:** show an export manifest grouped by what remains playable, editable and regenerable. Reuse existing asset collectors, checksums and foreign-reference reporting. Offer dependency inclusion only where ownership and resource remapping are defined.

**Next check:** import a generated timeline into a clean project. Verify playback, then attempt regeneration and inspect unresolved source references. A successful media import alone should not certify a portable recipe.

Evidence: [timeline bundle codec](https://github.com/nodetool-ai/nodetool/blob/main/packages/project-services/src/timeline-bundle.ts), [game publication and export](../../game-engine/publishing.md).
