# Workflow Version Diff (Experimental)

## Overview

A new experimental feature that provides visual comparison of workflow versions, allowing users to see exactly what changed between versions.

## Status

**Experimental**: This is a research feature. API may change.

## Use Cases

- **Track changes**: See what nodes/edges were added, removed, or modified between versions
- **Review workflow history**: Understand how a workflow evolved over time
- **Collaborate**: Review changes before restoring or sharing versions

## How It Works

The feature consists of three components:

1. **WorkflowDiffStore** (`web/src/stores/WorkflowDiffStore.ts`):
   - Manages diff state between two workflow versions
   - Tracks which versions are being compared
   - Stores computed diff data (nodes/edges with status: added/removed/modified/unchanged)

2. **computeWorkflowDiff** (`web/src/utils/workflowDiff.ts`):
   - Computes the difference between two workflow versions
   - Compares nodes by ID, type, and data
   - Compares edges by ID, source, and target
   - Returns a structured diff with summary statistics

3. **WorkflowDiffViewer** (`web/src/components/workflow/WorkflowDiffViewer.tsx`):
   - Modal-based UI showing the diff between two versions
   - Two-column layout: Nodes and Connections
   - Color-coded items: Green (added), Red (removed), Yellow (modified)
   - Summary chips showing counts

## Usage

1. Open the Version History panel
2. Hover over any version (except the oldest)
3. Click the "Compare with previous" button (history icon)
4. A modal opens showing the diff between the previous version and the selected version

## Files Created/Modified

**New Files:**
- `web/src/stores/WorkflowDiffStore.ts` - Diff state management
- `web/src/utils/workflowDiff.ts` - Diff computation logic
- `web/src/components/workflow/WorkflowDiffViewer.tsx` - Diff UI component
- `research/workflow-version-diff.md` - This documentation

**Modified Files:**
- `web/src/components/version/VersionHistoryPanel.tsx` - Added diff viewer and "Compare with Previous" button
- `web/src/components/version/VersionListItem.tsx` - Added "Compare with Previous" button and props

## Limitations

- Current implementation compares selected version with immediately previous version
- Does not support comparing arbitrary versions (planned enhancement)
- Does not show visual graph diff (only list-based)
- No inline highlighting in the actual workflow graph

## Future Improvements

- Allow selecting any two versions to compare
- Show visual diff in the workflow graph itself (highlight changed nodes)
- Add ability to revert to specific changes
- Show property-level diffs for modified nodes

## Feedback

Test the feature by:
1. Making changes to a workflow
2. Saving multiple versions
3. Using the "Compare with previous" button to see the diff
4. Reporting any issues or suggestions
