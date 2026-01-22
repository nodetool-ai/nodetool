# Inline Arrow Function Memoization (2026-01-22)

## Summary

Fixed inline arrow functions in React components that were creating new function references on every render, causing unnecessary re-renders of child components.

## Changes Made

### 1. ImageEditorToolbar.tsx
**File**: `web/src/components/node/image_editor/ImageEditorToolbar.tsx`

**Problem**: 4 inline arrow functions creating new function references on each render:
```typescript
// Before (bad)
onClick={() => handleToolClick("select")}
onClick={() => handleToolClick("crop")}
onClick={() => handleToolClick("draw")}
onClick={() => handleToolClick("erase")}
```

**Solution**: Created memoized handlers for each tool:
```typescript
// After (good)
const handleSelectClick = useCallback(() => handleToolSelect("select"), [handleToolSelect]);
const handleCropClick = useCallback(() => handleToolSelect("crop"), [handleToolSelect]);
const handleDrawClick = useCallback(() => handleToolSelect("draw"), [handleToolSelect]);
const handleEraseClick = useCallback(() => handleToolSelect("erase"), [handleToolSelect]);

// Then use in JSX
onClick={handleSelectClick}
onClick={handleCropClick}
```

### 2. NodeExplorer.tsx
**File**: `web/src/components/node/NodeExplorer.tsx`

**Problem**: 2 inline arrow functions in list item handlers:
```typescript
// Before (bad)
onClick={() => handleNodeClick(entry.node.id)}
onClick={(event) => { event.stopPropagation(); handleNodeEdit(entry.node.id); }}
```

**Solution**: Used data attributes with memoized handler:
```typescript
// After (good)
const handleNodeItemClick = useCallback((e: React.MouseEvent) => {
  const target = e.currentTarget as HTMLElement;
  const nodeId = target.dataset.nodeId as string;
  if (nodeId) {
    handleNodeClick(nodeId);
  }
}, [handleNodeClick]);

// In JSX
<ListItemButton
  data-node-id={entry.node.id}
  onClick={handleNodeItemClick}
  ...
>
```

### 3. ProviderList.tsx
**File**: `web/src/components/model_menu/ProviderList.tsx`

**Problem**: Inline arrow function in provider selection:
```typescript
// Before (bad)
onClick={() => setSelected(p)}
```

**Solution**: Used data attribute pattern:
```typescript
// After (good)
const handleSelectProvider = useCallback((e: React.MouseEvent) => {
  const target = e.currentTarget as HTMLElement;
  const provider = target.dataset.provider;
  if (provider) {
    setSelected(provider);
  }
}, [setSelected]);

// In JSX
<ListItemButton
  data-provider={p}
  onClick={handleSelectProvider}
  ...
>
```

### 4. FavoritesList.tsx & RecentList.tsx
**Files**: 
- `web/src/components/model_menu/FavoritesList.tsx`
- `web/src/components/model_menu/RecentList.tsx`

**Problem**: Inline arrow functions in list item click handlers:
```typescript
// Before (bad)
onClick={() => available && onSelect(m)}
```

**Solution**: Used data attribute with JSON serialization:
```typescript
// After (good)
const handleItemClick = useCallback((e: React.MouseEvent) => {
  const target = e.currentTarget as HTMLElement;
  const modelJson = target.dataset.model;
  if (modelJson) {
    const model = JSON.parse(modelJson) as TModel;
    const available = availabilityMap[`${model.provider}:${model.id}`] ?? true;
    if (available) {
      onSelect(model);
    }
  }
}, [onSelect, availabilityMap]);

// In JSX
<ListItemButton
  data-model={JSON.stringify(m)}
  onClick={handleItemClick}
  ...
>
```

### 5. ProviderApiKeyWarningBanner.tsx
**File**: `web/src/components/model_menu/shared/ProviderApiKeyWarningBanner.tsx`

**Problem**: Inline arrow function for settings button:
```typescript
// Before (bad)
onClick={() => setMenuOpen(true, 1)}
```

**Solution**: Created memoized handler:
```typescript
// After (good)
const handleOpenSettings = useCallback(() => {
  setMenuOpen(true, 1);
}, [setMenuOpen]);

// In JSX
<Button onClick={handleOpenSettings}>
```

### 6. ModelMenuDialogBase.tsx
**File**: `web/src/components/model_menu/shared/ModelMenuDialogBase.tsx`

**Problem**: 2 inline arrow functions for navigation:
```typescript
// Before (bad)
onClick={() => { setCustomView("favorites"); setSelectedProvider(null); }}
onClick={() => { setCustomView("recent"); setSelectedProvider(null); }}
```

**Solution**: Created memoized handlers:
```typescript
// After (good)
const handleSelectFavorites = useCallback(() => {
  setCustomView("favorites");
  setSelectedProvider(null);
}, [setSelectedProvider]);

const handleSelectRecent = useCallback(() => {
  setCustomView("recent");
  setSelectedProvider(null);
}, [setSelectedProvider]);

// In JSX
<ListItemButton onClick={handleSelectFavorites} ...>
<ListItemButton onClick={handleSelectRecent} ...>
```

## Performance Impact

- **Reduced re-renders**: Child components now receive stable function references
- **Better memoization**: Components wrapped with `React.memo` now work effectively
- **Consistent patterns**: All click handlers now use memoized callbacks

## Pattern Used

For list items that need to access loop variables, the data attribute pattern is used:
1. Store the needed data in a `data-*` attribute on the element
2. Create a memoized callback that extracts data from `e.currentTarget.dataset`
3. Parse the data if needed (JSON for complex objects)

This avoids creating new function references on each render while still accessing the correct item data.

## Files Modified

1. `web/src/components/node/image_editor/ImageEditorToolbar.tsx`
2. `web/src/components/node/NodeExplorer.tsx`
3. `web/src/components/model_menu/ProviderList.tsx`
4. `web/src/components/model_menu/FavoritesList.tsx`
5. `web/src/components/model_menu/RecentList.tsx`
6. `web/src/components/model_menu/shared/ProviderApiKeyWarningBanner.tsx`
7. `web/src/components/model_menu/shared/ModelMenuDialogBase.tsx`

## Verification

- ✅ Lint: Passes (no new errors from changes)
- ✅ TypeScript: Compiles (no new type errors from changes)
