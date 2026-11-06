**TLDR:** Some separation protects predictable behavior. Connect through explicit contracts while preserving clock, permission, version and document boundaries.

# Q11. Which apparent gaps should remain boundaries?

| Boundary | Preserve | Useful connection |
| --- | --- | --- |
| Game tick → AI job | Synchronous simulation and bounded commands | Validated asynchronous request/completion adapter |
| Audio stream → stored media | Chunk timing versus finite assets | Explicit collect, convert and playback operations |
| Generated source → accepted result | Stable selected output | Preview and explicit update policy |
| Shared editor saving → document semantics | Document-specific merge rules | Shared synchronization lifecycle |

Game scripts intentionally exclude asynchronous and unrestricted host behavior. Audio already has chunk-to-asset and asset-to-chunk operations. Document synchronization shares lifecycle machinery while leaving conversion and merge behavior to each editor.

**Next check:** evaluate a proposed edge by asking what crosses it, who authorizes it, when it takes effect and whether it can be reversed. Reject a generic connection that cannot answer those questions. More edges alone would not demonstrate a better system.

Evidence: [game script boundaries](../../game-engine/scripts.md), [audio adapters](https://github.com/nodetool-ai/nodetool/blob/main/packages/audio-nodes/src/nodes/realtime-audio.ts), [take selection](https://github.com/nodetool-ai/nodetool/blob/main/packages/timeline/src/takes.ts), [document synchronization](../../document-sync.md).
