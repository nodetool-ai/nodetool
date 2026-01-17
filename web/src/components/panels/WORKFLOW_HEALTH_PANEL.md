# Workflow Health Panel (Experimental)

## Overview
The Workflow Health Panel is a research feature that provides real-time validation and health scoring for workflows. It helps users identify issues in their workflows before execution, improving workflow reliability and user experience.

## Status
⚠️ **Experimental**: This is a research feature. API may change.

## Use Cases
- **Workflow Authors**: Detect disconnected nodes, cycles, and configuration issues before running workflows.
- **Debugging**: Identify why a workflow isn't working (e.g., missing required properties).
- **Optimization**: Get suggestions for refactoring workflows with many nodes of the same type.
- **Learning**: New users can see when their workflow structure is incomplete (e.g., missing inputs/outputs).

## How It Works

### Validation Checks
The panel performs the following checks:
1. **Disconnected Nodes**: Warns if a node is not connected to any other nodes (excluding input nodes and group nodes).
2. **Unused Inputs**: Info message if an input node's output is not connected.
3. **Cycles**: Error if circular dependencies are detected in the workflow graph.
4. **Configuration**: Error if required properties are missing on nodes.
5. **Missing Models**: Error if a model node does not have a model selected.
6. **Performance**: Warning if many nodes of the same type are used (>10), suggesting refactoring into sub-workflows. Info if the workflow has no input or output nodes.

### Health Score
- **100-80**: Healthy (No errors)
- **79-50**: Warning (Warnings present)
- **0-49**: Critical (Errors present)

The score is calculated as: `100 - (errors * 20) - (warnings * 5)`.

## Usage
1. Open a workflow in the Node Editor.
2. Click the "Health" icon (stethoscope) in the right toolbar.
3. The panel displays:
   - Health score (0-100)
   - List of issues with severity (Error/Warning/Info)
   - Timestamps of last validation

## Architecture

### Stores
- `WorkflowValidationStore`: Manages validation state and performs checks.
  - `validateWorkflow(nodes, edges, metadata)`: Runs all validation checks.
  - `getIssueCount()`: Returns counts of errors, warnings, and info messages.

### Components
- `WorkflowHealthPanel`: Displays validation results in the right panel.
  - Shows health score with a progress bar.
  - Lists issues with icons and messages.
  - Allows dismissing issues.

### Integration
- Validation is triggered automatically in `ReactFlowWrapper` when nodes or edges change (debounced by 500ms).
- The panel can be toggled from the right toolbar.

## Files
- `web/src/stores/WorkflowValidationStore.ts`: Core validation logic.
- `web/src/components/panels/WorkflowHealthPanel.tsx`: UI component.
- `web/src/components/panels/PanelRight.tsx`: Integration into right panel.
- `web/src/components/node/ReactFlowWrapper.tsx`: Trigger validation on changes.

## Limitations
- Validation is frontend-only and may not catch all backend issues.
- Circular dependency detection uses DFS and may be slow for very large graphs.
- "Missing Models" check relies on the `tags` property of `NodeMetadata`, which may not be available for all node types.

## Future Improvements
- Add support for auto-fixing certain issues.
- Add keyboard shortcuts to jump to issues.
- Integrate with the workflow runner to show validation status before execution.
- Persist validation state with the workflow.

## Feedback
To provide feedback on this feature, please open an issue on GitHub or contact the development team.
