**TLDR:** Similar names hide different behavior, especially “variable.” Share terminology and controls without pretending values, events and streams are interchangeable.

# Q2. Which concepts must someone relearn between features?

Workflow variable channels retain a history: `first()` returns the first publication and `stream()` replays buffered values before following new ones. Mini-app state instead holds current values and rejects late results from superseded invocations. A shared “variable” label does not explain this difference.

Data types also need behavioral explanations. A compatible socket does not establish whether a value is a snapshot, a resource reference or a continuing stream.

**Proposed connection:** describe bindings using type, scope, lifetime and update policy. Use explicit actions such as “read current,” “watch changes” and “replay.” The shared-input proposal already separates these behaviors, but remains a proposal.

**Tracked check: [SV-A5](../shared-variables-input-bindings.md#delivery-plan).** The shared-variables implementation owns the finite app/workflow proof: one control feeds two inputs, a run captures both once, and a late result cannot overwrite a newer edit. Realtime subscribers remain a research question for a later adapter.

Evidence: [variable channel](https://github.com/nodetool-ai/nodetool/blob/main/packages/runtime/src/variable-channel.ts), [app state](https://github.com/nodetool-ai/nodetool/blob/main/packages/app-runtime/src/state.ts), [data types](../../data-types.md), [shared-input proposal](../shared-variables-input-bindings.md).
