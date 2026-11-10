**TLDR:** The least trustworthy edges are broad claims inferred from names, schemas or older guides. Record the exact route and evidence behind each connection.

# Q12. Which parts of our map are least trustworthy?

**F1. Documentation drift is real.** The video-editor guide describes clip-private workflow clones. The inspected timeline binding instead stores `source.id`. Use the implementation for this route and retain the discrepancy as a documentation issue.

**F2. A type is not an integration.** A registered document type or game event schema does not prove conversion, transport, host availability or an end-to-end user journey.

**F3. Sparse mapping is not isolation.** Sparse highlighting counts mapped neighbors. An omitted edge says nothing conclusive about product support. Proposed and unverified connections must remain distinct from working paths.

**Next check:** audit high-impact edges before expanding the map. For each, record producer, consumer, payload, update behavior, supported host and a reproducible check. Downgrade broad claims when evidence only covers one route. Apply the [evidence rules](https://github.com/nodetool-ai/nodetool/blob/main/docs/plans/feature-interplay/README.md#evidence-and-interpretation) when a delivery depends on a finding.

Evidence: [older guide](../../video-editor.md), [current binding](https://github.com/nodetool-ai/nodetool/blob/main/packages/websocket/src/trpc/routers/timeline.ts), [type registry](https://github.com/nodetool-ai/nodetool/blob/main/web/src/config/data_types.ts), [map interpretation rules](README.md).
