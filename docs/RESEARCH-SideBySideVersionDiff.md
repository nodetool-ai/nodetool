# Side-by-Side Version Comparison View (Experimental)

## Overview

The **Side-by-Side Version Comparison View** is an experimental enhancement to the existing Workflow Version History system that allows users to compare two workflow versions side by side for detailed visual analysis.

## Status

⚠️ **Experimental**: This is a research feature. API may change.

## Use Cases

- **Users**: Compare workflow changes over time to understand evolution
- **Developers**: Debug workflow issues by comparing working vs broken versions
- **Researchers**: Compare experiment iterations to identify what changed

## How It Works

The feature extends the existing `VersionHistoryPanel` with a new "Split View" mode that displays:

1. **Left Panel**: Older version graph visualization
2. **Right Panel**: Newer version graph visualization
3. **Synchronized Controls**: Version selectors, zoom controls, and swap button
4. **Change Summary**: Statistics showing nodes added/removed/modified
5. **Color Coding**: 
   - Green: Added nodes
   - Red: Removed nodes
   - Orange: Modified nodes
   - Gray: Unchanged nodes

## Usage

1. Open a workflow's version history panel
2. Click "Compare" to enter compare mode
3. Select two versions to compare
4. Click "Split View" to see side-by-side comparison

## Components

### SideBySideVersionDiff (`web/src/components/version/SideBySideVersionDiff.tsx`)

Main component that renders the split view with:
- `MiniGraphView`: Individual graph visualization with zoom controls
- Version selectors with dropdown menus
- Swap button to exchange left/right versions
- Change summary statistics

### Integration Points

- Updated `VersionHistoryPanel` to include split view toggle
- Updated `index.ts` to export new component
- Added comprehensive test suite

## Limitations

- Mini graphs use simplified layout (grid-based), not exact node positions
- Zoom is independent for each panel (not synchronized)
- Comparison limited to two versions at a time

## Future Improvements

- Synchronized zoom/pan between panels
- Exact position preservation
- Connection highlighting between corresponding nodes
- Export diff as image or JSON

## Files Modified/Created

- `web/src/components/version/SideBySideVersionDiff.tsx` (new)
- `web/src/components/version/__tests__/SideBySideVersionDiff.test.tsx` (new)
- `web/src/components/version/VersionHistoryPanel.tsx` (modified)
- `web/src/components/version/index.ts` (modified)

## Feedback

Provide feedback via GitHub issues or OpenCode workflows.
