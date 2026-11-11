**TLDR:** Some transfers preserve a recipe, while “Send to workflow” transfers its current media. Make that distinction visible and offer a source-preserving option.

# Q1. Where does editable work become only a result?

Generated timeline clips and sketch layers retain workflow bindings, parameter overrides and generation history. Those bindings support regeneration. The inspected timeline binding stores the source workflow ID, rather than making a private clone.

By contrast, the shared media-transfer action creates constant nodes from the selected media. The resulting node does not express “follow this shot's selected take.” This finding concerns that action, not every typed document route.

**Proposed connection:** offer explicit choices to use the current media or reference its editable source. Show whether a reference follows changes or pins a version. Reuse the existing generated-item bindings and typed document references.

**Next check:** send a generated clip to a workflow, select a different take, and inspect which consumers change. Preserve the old result when a user chose a fixed asset.

Evidence: [media transfer](https://github.com/nodetool-ai/nodetool/blob/main/web/src/hooks/useSendMediaToWorkflow.ts), [constant creation](https://github.com/nodetool-ai/nodetool/blob/main/web/src/hooks/handlers/useGenerationToCanvas.ts), [timeline binding](https://github.com/nodetool-ai/nodetool/blob/main/packages/websocket/src/trpc/routers/timeline.ts), [sketch binding](https://github.com/nodetool-ai/nodetool/blob/main/packages/websocket/src/trpc/routers/sketch.ts).
