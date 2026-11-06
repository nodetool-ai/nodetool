**TLDR:** Reusable workflows and scripts already exist. Their update policies need to become as understandable as their inputs and outputs.

# Q3. Can something built in one place become a reusable tool elsewhere?

The Workflow node exposes dynamic ports and executes an embedded graph. Its runtime does not itself fetch the latest graph using the stored workflow ID. The editor loader supplies and synchronizes the embedded graph when the selected workflow is available in its store.

Saved JavaScript scripts use an explicit copied version with an update-to-latest action. Mini-apps provide another consumer of workflow and script operations.

**Proposed connection:** present reusable operations with a consistent interface: typed ports, selected version, update policy and required capabilities. Reuse these consumers rather than introducing another execution system.

**Next check:** change a reusable workflow after embedding it, then compare editor and headless execution. The code establishes snapshot execution, but does not alone establish every host's refresh behavior.

Evidence: [Workflow node](https://github.com/nodetool-ai/nodetool/blob/main/packages/core-nodes/src/nodes/workflow.ts), [editor loader](https://github.com/nodetool-ai/nodetool/blob/main/web/src/components/node/WorkflowNode/WorkflowLoader.tsx), [saved scripts](../../js-scripts.md), [mini-apps](../../mini-apps.md).
