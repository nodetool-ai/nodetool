# Performance Optimization: Inline Handler Memoization (2026-01-21)

**What**: Memoized 10+ inline arrow functions in render using useCallback to prevent unnecessary re-renders.

**Components Optimized**:

1. **FloatingToolBar** (5 handlers):
   - `handleToggleTerminalAndClose` - toggles terminal and closes menu
   - `handleEditWorkflowAndClose` - opens workflow settings and closes menu
   - `handleDownloadAndClose` - downloads workflow JSON and closes menu
   - `handleRunAsAppAndClose` - runs workflow as app and closes menu
   - `handleToggleMiniMapAndClose` - toggles minimap and closes advanced menu

2. **WorkspacesManager** (3 handlers):
   - `handleUpdateWithId(id)` - updates workspace name
   - `handleStartEditWithWorkspace(workspace)` - starts editing workspace
   - `handleDeleteWorkspaceWithId(id)` - deletes workspace

3. **SettingsMenu** (1 handler):
   - `handleOpenExportFolder` - opens export folder in file explorer

4. **AppToolbar** (2 handlers):
   - `handleEditClick` - edits workflow settings
   - `cancel` handler optimization (replaced arrow function with direct reference)

**Pattern Used**:
```typescript
// Before - creates new function on every render
<MenuItem onClick={() => {
  handleAction();
  handleCloseMenu();
}}>

// After - stable function reference
const handleActionAndClose = useCallback(() => {
  handleAction();
  handleCloseMenu();
}, [handleAction, handleCloseMenu]);

<MenuItem onClick={handleActionAndClose}>
```

**Impact**:
- Reduced function allocations during renders
- Prevents unnecessary re-renders in child components that depend on stable function references
- Especially beneficial for menu items and toolbar buttons that are frequently rendered

**Files Changed**:
- `web/src/components/panels/FloatingToolBar.tsx`
- `web/src/components/workspaces/WorkspacesManager.tsx`
- `web/src/components/menus/SettingsMenu.tsx`
- `web/src/components/panels/AppToolbar.tsx`

**Verification**:
- ✅ TypeScript: Web and Electron packages pass
- ✅ ESLint: All packages pass (1 unrelated warning)
