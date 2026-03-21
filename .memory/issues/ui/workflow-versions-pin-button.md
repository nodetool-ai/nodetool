# Issue Title: Workflow versions panel - remove pin button

**Problem**: The workflow versions panel had a pin button that was not needed and should be removed from the UI.

**Solution**: Removed the pin button and related pin functionality from `VersionListItem.tsx` and `VersionHistoryPanel.tsx`:
- Removed PinIcon and PinOutlinedIcon imports
- Removed onPin prop from VersionListItemProps interface
- Removed handlePin callback function
- Removed pin icon button from action buttons area
- Removed pin indicator icon next to version number
- Removed handlePin function from VersionHistoryPanel
- Removed onPin prop from VersionListItem usage

**Date**: 2026-01-17

**Files Changed**:
- web/src/components/version/VersionListItem.tsx
- web/src/components/version/VersionHistoryPanel.tsx
