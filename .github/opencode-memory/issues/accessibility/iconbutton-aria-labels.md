# Accessibility Improvements (2026-01-18)

## Summary
Comprehensive accessibility audit and improvements across the NodeTool web application to ensure WCAG 2.1 Level AA compliance.

## Issues Fixed

### Missing ARIA Labels on IconButtons
Added `aria-label` attributes to IconButton components that were missing accessible names:

1. **FileUploadButton.tsx**: Added `aria-label="Upload files"` to compact upload button
2. **WorkflowToolbar.tsx**: Added descriptive labels to all toolbar IconButtons:
   - Checkbox toggle: "Show/Hide selection checkboxes"
   - Favorite toggle: "Show all workflows" / "Show favorites only"
   - Preview toggle: "Show/Hide graph preview"
   - Add button: "Create new workflow"
3. **SwatchPanel.tsx**: Added labels for color palette actions
4. **ColorPickerModal.tsx**: Added "Close color picker" label
5. **GettingStartedPanel.tsx**: Added labels for expand/collapse buttons
6. **MiniAppPanel.tsx**: Added "Open in editor" label
7. **ContextMenuItem.tsx**: Added labels using the menu item label
8. **AssetListView.tsx**: Added labels for type section expand/collapse
9. **AssetGridRow.tsx**: Added labels for divider row expand/collapse

## Impact
- Improved screen reader support for all toolbar buttons
- Better keyboard navigation experience
- Compliant with WCAG 2.1 Success Criterion 4.1.2 (Name, Role, Value)

## Files Modified
- web/src/components/buttons/FileUploadButton.tsx
- web/src/components/workflows/WorkflowToolbar.tsx
- web/src/components/color_picker/SwatchPanel.tsx
- web/src/components/color_picker/ColorPickerModal.tsx
- web/src/components/dashboard/GettingStartedPanel.tsx
- web/src/components/dashboard/miniApps/MiniAppPanel.tsx
- web/src/components/context_menus/ContextMenuItem.tsx
- web/src/components/assets/AssetListView.tsx
- web/src/components/assets/AssetGridRow.tsx

## Verification
- Linting: Passed with no errors related to accessibility changes
- Type checking: Passed (pre-existing test file warnings unrelated to a11y)
