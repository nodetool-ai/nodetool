# SDK v1 Phase 8 release candidate

This is the review record for the first publishable HTTP plus execution-
WebSocket SDK v1 contract. It is a candidate until a NodeTool release tag and
release asset exist.

## Producer identity

- NodeTool candidate commit: `bdf19bb57d33986fc323a8a51ac7a7d3d11c0a26`
- Protocol version: `1`
- Bundle format: `1`
- Contract digest: `b9297a9cddb7778fcadbd7ef288a82761f64afe75369f54fd3ad3bcdccab9554`
- Deterministic tar SHA-256: `50a1bfe3ebbb9a85329406b911074ec917f3e5ea54cc72679824018888b8bb8c`
- Minimum matching SDK server version: `0.7.0-rc.36`
- Bundle contents: 23 files

Two independent bundle generations produced the same contract digest and tar
SHA-256. The matching `nodetool-sdk` candidate pins the contract digest above.

## Semantic operation change from the previous candidate

Added execution declarations:

- `execution.cancel_job`
- `execution.chunk`
- `execution.end_input_stream`
- `execution.execution_target`
- `execution.job_resumed`
- `execution.job_update`
- `execution.node_progress`
- `execution.node_update`
- `execution.output_update`
- `execution.protocol_rejection`
- `execution.reconnect_job`
- `execution.run_job`
- `execution.stream_input`
- `execution.update_node_properties`

Removed compatibility and discovery-WebSocket declarations:

- `cancelJob`
- `getJobSnapshot`
- `lifecycleRpc.cancel_job`
- `lifecycleRpc.get_capabilities`
- `lifecycleRpc.get_job_snapshot`
- `lifecycleRpc.preflight_workflow`
- `lifecycleRpc.submit_job`
- `lifecycleRpc.subscribe_job`
- `receiveJobEvent`
- `sdkRpc.get_node_type_inventory`
- `sdkRpc.get_workflow_interface`
- `sdkRpc.get_workflow_interfaces`
- `sdkRpc.list_workflow_summaries`
- `submitJob`

Changed HTTP declarations:

- `cancelModelDownload`
- `getNodeTypeInventory`
- `getWorkflowInterface`
- `getWorkflowInterfaces`
- `listModelDownloads`
- `listModels`
- `listWorkflowSummaries`
- `preflightWorkflow`
- `startModelDownload`
- `uploadTemporaryAsset`

The public boundary is now HTTP for discovery and control, and MessagePack
WebSocket for execution and live events. No SDK-specific tRPC procedure or
discovery WebSocket command remains.

## Release procedure

1. Merge the NodeTool candidate and publish a NodeTool release.
2. Attach the deterministic contract bundle and this semantic operation list.
3. Update `nodetool-sdk` from the released bundle so its lock records the
   release tag rather than `source_kind: candidate_commit`.
4. Publish the matching C# and VL packages only after their clean-package and
   live-server gates pass.

