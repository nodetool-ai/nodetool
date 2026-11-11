**TLDR:** Reuse the existing run inspection service. The next question is whether a failed cross-feature handoff keeps enough identity to reach the relevant run and source.

# Q9. Which connections expose enough information to understand failures?

Web and agent run readers share execution services for results, traces and logs. The harness guide documents CLI readers and a UI run picker, so a proposal for a separate tracing system would duplicate existing work.

Game replay answers a different question: whether recorded inputs reproduce simulation state and events. It does not prove that pixels or audio match, or explain an external model request by itself.

**Proposed connection:** carry source, revision, run and request identities through cross-feature operations. Let an affected clip, layer or game request open its producing run, while preserving owner-scoped access.

**Next check:** deliberately fail one generated-item operation and trace it from the document to the failed run. Repeat after reopening the document. Cross-feature coverage remains unverified in this reading.

Evidence: [web readers](https://github.com/nodetool-ai/nodetool/blob/main/packages/websocket/src/trpc/routers/runs.ts), [agent readers](https://github.com/nodetool-ai/nodetool/blob/main/packages/agents/src/capabilities/runs.ts), [inspection harnesses](../../harnesses.md), [game replay](../../game-engine/saves-replay.md).
