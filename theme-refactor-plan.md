# Theme Refactor Plan: Consolidate to Single Theme with useTheme()

## Overview

Refactor from dual theme system (ThemeNodes + ThemeNodetool) to single unified theme using proper MUI patterns with `useTheme()` hook instead of direct theme imports.

## Current State Analysis

### Problems with Current Architecture:

1. **Dual Theme Complexity**: Two themes (ThemeNodes, ThemeNodetool) causing conflicts
2. **Direct Theme Imports**: Non-standard pattern `ThemeNodes.palette.c_editor_bg_color`
3. **Hard Dependencies**: Every component imports specific theme object
4. **Testing Complexity**: Need to mock theme imports in tests
5. **No Theme Context**: Components don't respect ThemeProvider context

### Files Currently Using ThemeNodes (29 files):

- Theme providers: `PanelRight.tsx`, `TabsNodeEditor.tsx`
- Node components: `BaseNode.tsx`, `GroupNode.tsx`, `CommentNode.tsx`, etc.
- Property components: `ColorProperty.tsx`, `TextEditorModal.tsx`
- Menu components: `RenderNodes.tsx`, `RenderNodesSelectable.tsx`
- Editor components: `NodeEditor.tsx`, `ReactFlowWrapper.tsx`
- Test files with mocks

## Proposed Solution

Note: we do not delete ThemeNodes for now, as we will extract styles into components later.

### Architecture Changes:

1. **Single Theme**: Use only `ThemeNodetool` as the unified theme
2. **Standard MUI Pattern**: Replace ALL direct imports for 'ThemeNodes' AND 'ThemeNodetool' with a single `useTheme()` hook
3. **Clean Dependencies**: Remove theme imports from components
4. **Proper Context**: Let ThemeProvider inject theme context

### Pattern Change:

```typescript
// BEFORE (Direct Import Pattern)
import ThemeNodes from "../themes/ThemeNodes";
const color = ThemeNodes.palette.primary.main;

// AFTER (useTheme Hook Pattern)
import { useTheme } from "@mui/material/styles";
const theme = useTheme();
const color = theme.palette.primary.main;
```

## Task Breakdown

### Phase 1: Theme Consolidation

Note: both themes use the same paletteDark.ts already.

- [ ] **1.1** Keep ThemeNodes file (don't delete) for reference
- [ ] **1.2** Update root ThemeProvider to use ThemeNodetool only
- [ ] **1.3** Find places where cascaded ThemeProviders can be simplified

### Phase 2: Component Migration Strategy

- [ ] **2.1** Create migration helper script/checklist
- [ ] **2.2** Define component categories by complexity:
  - Simple: Direct property access only
  - Medium: Multiple theme properties
  - Complex: CSS-in-JS functions with theme parameter

### Phase 3: Simple Components (Direct Property Access)

- [ ] **3.1** `ColorProperty.tsx` - Replace import + property access
- [ ] **3.2** `NodeFooter.tsx` - Replace theme property access
- [ ] **3.3** `RenderNodes.tsx` - Replace palette access
- [ ] **3.4** `RenderNodesSelectable.tsx` - Replace palette access
- [ ] **3.5** `TextEditorModal.tsx` - Replace theme access
- [ ] **3.6** `NumberInput.tsx` - Replace font/color access
- [ ] **3.7** `FileUploadButton.tsx` - Replace theme access
- [ ] **3.8** `RecommendedModels.tsx` - Replace color access
- [ ] **3.9** `PropertyContextMenu.tsx` - Replace font size access

### Phase 4: Medium Components (Multiple Properties)

- [ ] **4.1** `ApiKeyValidation.tsx` - Multiple font/color properties
- [ ] **4.2** `PreviewNode.tsx` - Multiple palette properties
- [ ] **4.3** `NodePropertyForm.tsx` - Multiple styling properties
- [ ] **4.4** `BaseNode.tsx` - Color calculations and access

### Phase 5: Complex Components (CSS-in-JS Functions)

- [ ] **5.1** `GroupNode.tsx` - `css={styles(ThemeNodes, ...)}` pattern
- [ ] **5.2** `CommentNode.tsx` - CSS-in-JS with theme functions
- [ ] **5.3** `NodeResizer.tsx` - CSS functions with theme
- [ ] **5.4** `NodeResizeHandle.tsx` - CSS functions with theme

### Phase 6: Editor & Context Components

- [ ] **6.1** `ReactFlowWrapper.tsx` - Editor background/grid colors
- [ ] **6.2** `NodeEditor.tsx` - Editor background styling
- [ ] **6.3** `AxisMarker.tsx` - Editor visual elements
- [ ] **6.4** `useSurroundWithGroup.ts` - Default group color logic

### Phase 7: Provider & High-Level Components

- [ ] **7.1** `PanelRight.tsx` - Remove MuiThemeProvider wrapper
- [ ] **7.2** `TabsNodeEditor.tsx` - Update ThemeProvider usage
- [ ] **7.3** `MarkdownRenderer.tsx` - Handle theme access

### Phase 8: Testing & Cleanup

- [ ] **8.1** Update test mocks to not mock theme imports
- [ ] **8.2** `NonEditableProperty.test.tsx` - Remove theme mock
- [ ] **8.3** `BoolProperty.test.tsx` - Remove theme mock
- [ ] **8.4** Test all node editor functionality
- [ ] **8.5** Test theme switching (if applicable)

### Phase 9: Handle Edge Cases

- [ ] **9.1** Identify components that might need custom styled components
- [ ] **9.2** Create styled components for node editor specific styling if needed
- [ ] **9.3** Handle any CSS-in-JS functions that break with new pattern

## Benefits

### Code Quality:

- ✅ Standard MUI architecture pattern
- ✅ Cleaner component dependencies
- ✅ Better TypeScript support
- ✅ Easier testing without mocks

### Maintainability:

- ✅ Single source of truth for theming
- ✅ Automatic theme context injection
- ✅ Future-proof for theme switching
- ✅ Simpler component testing

### Performance:

- ✅ No unnecessary theme imports
- ✅ Better tree shaking
- ✅ Cleaner bundle dependencies

## Risks & Considerations

### Potential Issues:

- ⚠️ CSS-in-JS functions expecting theme object parameter
- ⚠️ Components using theme outside React component context
- ⚠️ Font size differences between themes (16px vs 15px)
- ⚠️ Node editor styling might break without ThemeNodes component overrides

### Mitigation Strategies:

- 🔧 Create custom styled components for broken UI elements
- 🔧 Keep ThemeNodes reference for recovering styles
- 🔧 Test incrementally by component category
- 🔧 Have rollback plan if major issues arise

## Success Criteria

- [ ] All ThemeNodes imports removed
- [ ] All components use useTheme() pattern
- [ ] Node editor functions correctly
- [ ] No styling regressions
- [ ] Tests pass without theme mocks
- [ ] Cleaner component dependencies
