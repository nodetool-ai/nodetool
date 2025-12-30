# Button Standardization Specification

This document provides a comprehensive audit of button implementations in the NodeTool web application and proposes a standardized button system for consistent UI/UX.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Button Inventory](#button-inventory)
3. [Current Implementation Analysis](#current-implementation-analysis)
4. [Proposed Button System](#proposed-button-system)
5. [Migration Plan](#migration-plan)
6. [Implementation Guidelines](#implementation-guidelines)

---

## Executive Summary

### Current State

The NodeTool web application uses various button implementations across 100+ files:

| Component Type | Count | Files Using |
|---------------|-------|-------------|
| MUI Button | ~150+ | 90+ files |
| MUI IconButton | ~120+ | 85+ files |
| MUI Fab | ~15 | 8 files |
| MUI ToggleButton | ~25 | 8 files |
| Custom Button Components | 4 | - |

### Key Findings

1. **Inconsistent styling approaches**: Mix of `sx` prop, `css` (Emotion), `className`, and inline styles
2. **Duplicate patterns**: Similar button styles repeated across components
3. **Theme underutilization**: Many hardcoded colors instead of theme variables
4. **Missing standardization**: No consistent size, variant, or color mapping
5. **Existing custom components**: `CloseButton`, `DeleteButton`, `FileUploadButton`, `GoogleAuthButton`

### Recommendations

1. Create a standardized button component library
2. Define clear variant taxonomy (primary, secondary, tertiary, destructive, ghost)
3. Establish consistent sizing system (small, medium, large)
4. Centralize button styles in theme configuration
5. Migrate progressively with backward compatibility

---

## Button Inventory

### MUI Button Usage by File

| File Path | Current Implementation | Variant | Size | Intent | Migration Complexity |
|-----------|----------------------|---------|------|--------|---------------------|
| `components/dialogs/ConfirmDialog.tsx` | Button with className | text | default | confirm/cancel | Low |
| `components/dialogs/OpenOrCreateDialog.tsx` | Button with sx | outlined/contained | small | action | Medium |
| `components/buttons/CloseButton.tsx` | Button + Emotion css | text | default | close | Low (already abstracted) |
| `components/buttons/DeleteButton.tsx` | Button + Emotion css | text | default | destructive | Low (already abstracted) |
| `components/buttons/FileUploadButton.tsx` | Button/IconButton | outlined | small | upload | Low (already abstracted) |
| `components/chat/composer/SendMessageButton.tsx` | IconButton with sx | - | small | primary action | Medium |
| `components/chat/composer/StopGenerationButton.tsx` | IconButton | - | small | stop | Medium |
| `components/chat/controls/ResetButton.tsx` | IconButton | - | medium | reset | Low |
| `components/chat/controls/MinimizeButton.tsx` | IconButton | - | small | minimize | Low |
| `components/chat/controls/ScrollToBottomButton.tsx` | IconButton with sx | - | medium | scroll | Medium |
| `components/node/RunGroupButton.tsx` | Button with className | - | large | run action | Medium |
| `components/node/NodeToolButtons.tsx` | IconButton toolbar | - | default | node actions | Medium |
| `components/panels/QuickActions.tsx` | IconButton with complex sx | - | custom 56px | quick actions | High |
| `components/panels/FloatingToolBar.tsx` | Fab with className | - | medium | toolbar | High |
| `components/panels/AppToolbar.tsx` | Button with className | - | default | toolbar | Medium |
| `components/panels/AppHeader.tsx` | IconButton + Button | text | small | navigation | Medium |
| `components/common/CopyToClipboardButton.tsx` | IconButton with sx | - | small | copy | Low |
| `components/common/ReasoningToggle.tsx` | IconButton | - | small | toggle | Low |
| `components/workflows/WorkflowToolbar.tsx` | Button with className | outlined | - | toolbar | Medium |
| `components/workflows/WorkflowListItem.tsx` | IconButton | - | small | actions | Low |
| `components/workflows/WorkflowTile.tsx` | Button/IconButton | text | small | actions | Medium |
| `components/workflows/TagFilter.tsx` | ToggleButton | - | small | filter | Low |
| `components/hugging_face/ModelsButton.tsx` | IconButton + span | - | small | navigation | Medium |
| `components/hugging_face/model_card/ModelCardActions.tsx` | Button | contained/outlined | small | download/delete | Medium |
| `components/hugging_face/model_list/ModelListItemActions.tsx` | Button with sx | contained/outlined | small | download | Medium |
| `components/hugging_face/DownloadProgress.tsx` | Button/IconButton | text | small | cancel | Medium |
| `components/assets/AssetViewer.tsx` | IconButton with className | - | small | actions | Medium |
| `components/assets/AssetActions.tsx` | ButtonGroup + IconButton | - | small | asset actions | Medium |
| `components/node_menu/NodeMenu.tsx` | IconButton | - | small | close | Low |
| `components/node_menu/NamespaceList.tsx` | Button | contained | small | action | Low |
| `components/textEditor/EditorToolbar.tsx` | IconButton with className | - | small | toolbar | Medium |
| `components/textEditor/FindReplaceBar.tsx` | IconButton with className | - | small | actions | Medium |
| `components/menus/SettingsMenu.tsx` | Button with className | contained | small | navigation | Low |
| `components/menus/SecretsMenu.tsx` | IconButton + Button | contained/outlined | small | actions | Medium |
| `components/collections/CollectionList.tsx` | Fab extended | - | medium | create | Low |
| `components/collections/CollectionForm.tsx` | Button | contained/text | medium | save/cancel | Low |
| `components/dashboard/GettingStartedPanel.tsx` | Button with startIcon | outlined/contained | small | action | Medium |
| `components/dashboard/WorkflowsList.tsx` | IconButton + Button | text | small | create | Medium |
| `components/miniapps/components/MiniAppInputsForm.tsx` | Button | contained | large | generate | Low |
| `components/Inspector.tsx` | IconButton | - | small | close | Low |
| `ErrorBoundary.tsx` | Button | contained | medium | refresh | Low |
| `components/Login.tsx` | Button | text | default | login options | Low |

### IconButton Patterns Identified

1. **Close buttons**: Used in modals, panels, popups
2. **Action buttons**: Copy, delete, edit, download
3. **Navigation buttons**: Back, forward, expand/collapse
4. **Toggle buttons**: Visibility, mode switches
5. **Toolbar buttons**: Editor actions, formatting

### Fab (Floating Action Button) Usage

| File | Purpose | Variant | Size |
|------|---------|---------|------|
| `panels/FloatingToolBar.tsx` | Workflow actions | circular | medium |
| `node_editor/RunAsAppFab.tsx` | Run as app | circular | medium |
| `chat/thread/NewChatButton.tsx` | New chat | extended | medium |
| `collections/CollectionList.tsx` | Create collection | extended | medium |
| `workflows/WorkflowList.tsx` | New workflow | extended | medium |
| `miniapps/MiniAppPage.tsx` | Open in editor | circular | medium |
| `themes/Inputs.tsx` | Demo only | circular | medium |

### ToggleButton/ToggleButtonGroup Usage

| File | Purpose | Exclusive |
|------|---------|-----------|
| `dialogs/OpenOrCreateDialog.tsx` | Tab selection | Yes |
| `content/Help/KeyboardShortcutsView.tsx` | View toggle | Yes |
| `hugging_face/model_list/ModelListHeader.tsx` | View mode | Yes |
| `dashboard/WorkflowsList.tsx` | View mode | Yes |
| `themes/Inputs.tsx` | Demo | Yes |
| `themes/ThemeNodes.tsx` | Theme toggle | Yes |

---

## Current Implementation Analysis

### Styling Approaches Used

#### 1. Emotion CSS (css prop)
```tsx
// components/buttons/CloseButton.tsx
const styles = (theme: Theme) =>
  css({
    button: {
      position: "absolute",
      top: "0.5em",
      right: "0.5em",
      color: theme.vars.palette.grey[200]
    }
  });
```

#### 2. MUI sx prop
```tsx
// components/chat/composer/SendMessageButton.tsx
<IconButton
  sx={(theme) => ({
    width: 36,
    height: 36,
    transition: "background-color 0.15s ease",
    "&:hover": {
      backgroundColor: theme.vars.palette.grey[600]
    }
  })}
>
```

#### 3. className with external CSS/Emotion
```tsx
// components/dialogs/ConfirmDialog.tsx
<Button className="button-confirm" onClick={handleConfirm}>
```

#### 4. Inline styles
```tsx
// Various files
style={{ fontSize: "var(--fontSizeTiny)" }}
```

### Theme Configuration (Current)

```tsx
// ThemeNodetool.tsx
components: {
  MuiButton: {
    styleOverrides: {
      root: {
        minWidth: 36
      }
    }
  }
}
```

**Issues identified:**
- Minimal button theming
- No variant-specific overrides
- No size standardization
- Missing color definitions for custom intents

### Common Button Patterns

#### Pattern 1: Dialog Actions
```tsx
<DialogActions>
  <Button className="button-cancel" onClick={onClose}>Cancel</Button>
  <Button className="button-confirm" onClick={handleConfirm}>Confirm</Button>
</DialogActions>
```

#### Pattern 2: Icon-Only Buttons with Tooltip
```tsx
<Tooltip title="Action" enterDelay={TOOLTIP_ENTER_DELAY}>
  <IconButton onClick={handler} tabIndex={-1} size="small">
    <Icon />
  </IconButton>
</Tooltip>
```

#### Pattern 3: Action Button with Loading State
```tsx
<Button
  disabled={isLoading}
  startIcon={isLoading ? <CircularProgress size={16} /> : <Icon />}
>
  {isLoading ? "Loading..." : "Action"}
</Button>
```

---

## Proposed Button System

### Variant Taxonomy

| Variant | Use Case | Visual Style |
|---------|----------|--------------|
| `primary` | Main CTA, important actions | Filled, primary color |
| `secondary` | Secondary actions | Outlined, primary color |
| `tertiary` | Low-emphasis actions | Text only, subtle hover |
| `ghost` | Minimal visual footprint | Transparent, hover reveals |
| `destructive` | Delete, remove, danger | Error color, outlined/filled |
| `success` | Confirm, complete | Success color |

### Size System

| Size | Height | Padding | Font Size | Icon Size | Use Case |
|------|--------|---------|-----------|-----------|----------|
| `xs` | 24px | 4px 8px | 12px | 14px | Compact toolbars |
| `sm` | 32px | 6px 12px | 13px | 16px | Default for most UI |
| `md` | 40px | 8px 16px | 14px | 20px | Prominent actions |
| `lg` | 48px | 10px 24px | 16px | 24px | Hero/CTA buttons |

### Intent Colors

```tsx
// Extend palette for button-specific colors
buttonColors: {
  primary: {
    main: 'var(--palette-primary-main)',
    hover: 'var(--palette-primary-dark)',
    active: 'var(--palette-primary-dark)',
    disabled: 'var(--palette-action-disabled)',
  },
  destructive: {
    main: 'var(--palette-error-main)',
    hover: 'var(--palette-error-dark)',
    active: 'var(--palette-error-dark)',
  },
  success: {
    main: 'var(--palette-success-main)',
    hover: 'var(--palette-success-dark)',
  },
}
```

### Component Architecture

```
src/components/buttons/
├── index.ts                    # Public exports
├── Button.tsx                  # Main button component
├── IconButton.tsx              # Icon-only button
├── Fab.tsx                     # Floating action button
├── ToggleButton.tsx            # Toggle button
├── ButtonGroup.tsx             # Button group
├── types.ts                    # TypeScript interfaces
├── styles.ts                   # Shared styles
├── constants.ts                # Size/variant constants
├── __tests__/
│   ├── Button.test.tsx
│   ├── IconButton.test.tsx
│   └── ...
└── README.md                   # Component documentation
```

### Proposed Button Component API

```tsx
interface ButtonProps {
  // Variants
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'destructive' | 'success';
  
  // Sizes
  size?: 'xs' | 'sm' | 'md' | 'lg';
  
  // States
  loading?: boolean;
  disabled?: boolean;
  
  // Icons
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  iconOnly?: boolean;
  
  // Accessibility
  ariaLabel?: string;
  
  // Behavior
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  
  // Styling
  fullWidth?: boolean;
  className?: string;
  sx?: SxProps<Theme>;
  
  children?: React.ReactNode;
}
```

### Theme Configuration (Proposed)

```tsx
// ThemeNodetool.tsx additions
components: {
  MuiButton: {
    defaultProps: {
      disableElevation: true,
      disableRipple: false,
    },
    styleOverrides: {
      root: ({ theme }) => ({
        fontFamily: theme.fontFamily1,
        fontWeight: 500,
        textTransform: 'none',
        borderRadius: theme.rounded.buttonSmall,
        transition: 'all 0.15s ease',
      }),
      sizeSmall: {
        height: 32,
        padding: '6px 12px',
        fontSize: '13px',
      },
      sizeMedium: {
        height: 40,
        padding: '8px 16px',
        fontSize: '14px',
      },
      sizeLarge: {
        height: 48,
        padding: '10px 24px',
        fontSize: '16px',
      },
      containedPrimary: ({ theme }) => ({
        backgroundColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.contrastText,
        '&:hover': {
          backgroundColor: theme.vars.palette.primary.dark,
        },
      }),
      outlinedPrimary: ({ theme }) => ({
        borderColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.main,
        '&:hover': {
          backgroundColor: `${theme.vars.palette.primary.main}10`,
          borderColor: theme.vars.palette.primary.dark,
        },
      }),
      textPrimary: ({ theme }) => ({
        color: theme.vars.palette.primary.main,
        '&:hover': {
          backgroundColor: `${theme.vars.palette.primary.main}10`,
        },
      }),
    },
    variants: [
      {
        props: { color: 'error' },
        style: ({ theme }) => ({
          '&.MuiButton-contained': {
            backgroundColor: theme.vars.palette.error.main,
            '&:hover': {
              backgroundColor: theme.vars.palette.error.dark,
            },
          },
          '&.MuiButton-outlined': {
            borderColor: theme.vars.palette.error.main,
            color: theme.vars.palette.error.main,
          },
        }),
      },
    ],
  },
  MuiIconButton: {
    defaultProps: {
      disableRipple: false,
    },
    styleOverrides: {
      root: ({ theme }) => ({
        borderRadius: theme.rounded.buttonSmall,
        transition: 'all 0.15s ease',
        '&:hover': {
          backgroundColor: theme.vars.palette.action.hover,
        },
      }),
      sizeSmall: {
        width: 32,
        height: 32,
        '& svg': {
          fontSize: '1rem',
        },
      },
      sizeMedium: {
        width: 40,
        height: 40,
        '& svg': {
          fontSize: '1.25rem',
        },
      },
      sizeLarge: {
        width: 48,
        height: 48,
        '& svg': {
          fontSize: '1.5rem',
        },
      },
    },
  },
  MuiFab: {
    defaultProps: {
      disableRipple: false,
    },
    styleOverrides: {
      root: ({ theme }) => ({
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        transition: 'all 0.2s ease',
        '&:hover': {
          boxShadow: '0 6px 16px rgba(0, 0, 0, 0.2)',
          transform: 'translateY(-1px)',
        },
      }),
      primary: ({ theme }) => ({
        backgroundColor: theme.vars.palette.primary.main,
        '&:hover': {
          backgroundColor: theme.vars.palette.primary.dark,
        },
      }),
    },
  },
}
```

---

## Migration Plan

### Phase 1: Foundation (Week 1-2)

**Priority: Critical**

1. **Update Theme Configuration**
   - Add comprehensive MuiButton overrides
   - Add MuiIconButton overrides
   - Add MuiFab overrides
   - Define custom variant styles
   - Complexity: Medium
   - Files: `ThemeNodetool.tsx`, `paletteDark.ts`, `paletteLight.ts`

2. **Create Button Constants**
   - Define size tokens
   - Define variant mappings
   - Create shared style utilities
   - Files: New `src/components/buttons/constants.ts`

3. **Update Existing Button Components**
   - Enhance `CloseButton.tsx`
   - Enhance `DeleteButton.tsx`
   - Enhance `FileUploadButton.tsx`
   - Add consistent props interface

### Phase 2: High-Impact Components (Week 3-4)

**Priority: High**

| Component | Effort | Impact |
|-----------|--------|--------|
| `ConfirmDialog.tsx` | Low | High (used everywhere) |
| `SendMessageButton.tsx` | Medium | High (chat core) |
| `FloatingToolBar.tsx` | High | High (main UI) |
| `AppToolbar.tsx` | Medium | High (editor core) |
| `AppHeader.tsx` | Medium | High (navigation) |

4. **Dialog Buttons**
   - Standardize confirm/cancel pattern
   - Add loading states
   - Files: `ConfirmDialog.tsx`, `OpenOrCreateDialog.tsx`

5. **Toolbar Buttons**
   - Unify toolbar button styles
   - Files: `FloatingToolBar.tsx`, `AppToolbar.tsx`, `EditorToolbar.tsx`

6. **Navigation Buttons**
   - Standardize nav button pattern
   - Files: `AppHeader.tsx`, `BackToDashboardButton.tsx`

### Phase 3: Feature Components (Week 5-6)

**Priority: Medium**

7. **Chat Components**
   - `SendMessageButton.tsx`
   - `StopGenerationButton.tsx`
   - `ResetButton.tsx`
   - `MinimizeButton.tsx`

8. **Asset/Workflow Components**
   - `AssetViewer.tsx`
   - `AssetActions.tsx`
   - `WorkflowToolbar.tsx`
   - `WorkflowListItem.tsx`

9. **Node Components**
   - `NodeToolButtons.tsx`
   - `RunGroupButton.tsx`
   - `NodeContent.tsx`

### Phase 4: Remaining Components (Week 7-8)

**Priority: Low**

10. **Hugging Face Components**
    - Model download buttons
    - Action buttons
    
11. **Settings/Menu Components**
    - Menu buttons
    - Settings actions

12. **Miscellaneous**
    - Inspector buttons
    - Collection buttons
    - Mini-app buttons

### Migration Approach

#### Option A: Wrapper Components (Recommended)

Create wrapper components that use MUI under the hood but enforce standardization:

```tsx
// src/components/buttons/Button.tsx
import { Button as MuiButton, ButtonProps as MuiButtonProps } from '@mui/material';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'destructive';
type Size = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<MuiButtonProps, 'variant' | 'size'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantMap: Record<Variant, MuiButtonProps['variant']> = {
  primary: 'contained',
  secondary: 'outlined',
  tertiary: 'text',
  ghost: 'text',
  destructive: 'contained',
};

const colorMap: Record<Variant, MuiButtonProps['color']> = {
  primary: 'primary',
  secondary: 'primary',
  tertiary: 'inherit',
  ghost: 'inherit',
  destructive: 'error',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  children,
  ...props
}) => {
  return (
    <MuiButton
      variant={variantMap[variant]}
      color={colorMap[variant]}
      size={size === 'xs' ? 'small' : size === 'lg' ? 'large' : 'medium'}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <CircularProgress size={16} /> : children}
    </MuiButton>
  );
};
```

#### Option B: Theme-Only (Lower effort, less control)

Only update theme configuration and gradually update component usages to use standardized props.

### Backward Compatibility

1. **Keep existing className conventions** during transition
2. **Add deprecated warnings** for old patterns
3. **Create codemods** for automated migration where possible
4. **Document breaking changes** clearly

---

## Implementation Guidelines

### Do's

- ✅ Use theme variables (`theme.vars.palette.*`) for colors
- ✅ Use standardized size props (`small`, `medium`, `large`)
- ✅ Include `aria-label` for icon-only buttons
- ✅ Wrap with `Tooltip` for actions that need explanation
- ✅ Use `tabIndex={-1}` for buttons that shouldn't be in tab order
- ✅ Handle loading and disabled states consistently

### Don'ts

- ❌ Hardcode colors directly
- ❌ Use inconsistent button sizes within the same context
- ❌ Skip accessibility attributes
- ❌ Mix styling approaches in the same component
- ❌ Create new button components without checking existing ones

### Accessibility Checklist

- [ ] All buttons have accessible names (text content or aria-label)
- [ ] Icon-only buttons have aria-label
- [ ] Disabled buttons have clear visual indication
- [ ] Focus states are visible
- [ ] Color contrast meets WCAG AA standards
- [ ] Loading states announce to screen readers

### Testing Guidelines

```tsx
// Example test for standardized button
describe('Button', () => {
  it('renders primary variant correctly', () => {
    render(<Button variant="primary">Click me</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('MuiButton-contained');
  });

  it('shows loading state', () => {
    render(<Button loading>Submit</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('handles click events', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

---

## Appendix

### Current CSS Class Names in Use

```
.button-confirm
.button-cancel
.close-button
.delete-button
.action-button
.run-stop-button
.run-workflow
.stop-workflow
.toolbar-button
.nav-button
.model-download-button
.copy-button
.expand-button
.upload-file
.floating-action-button
.quick-add-button
.save-button
.cancel-button
.create-button
```

### Files by Migration Complexity

**Low Complexity (1-2 hours each):**
- ConfirmDialog.tsx
- CloseButton.tsx
- DeleteButton.tsx
- FileUploadButton.tsx
- CollectionForm.tsx
- ErrorBoundary.tsx
- Login.tsx
- Inspector.tsx

**Medium Complexity (2-4 hours each):**
- SendMessageButton.tsx
- AppToolbar.tsx
- AppHeader.tsx
- AssetViewer.tsx
- WorkflowToolbar.tsx
- NodeToolButtons.tsx
- ModelCardActions.tsx

**High Complexity (4-8 hours each):**
- FloatingToolBar.tsx
- QuickActions.tsx
- OpenOrCreateDialog.tsx (multiple toggles)

### Estimated Total Effort

| Phase | Hours | Duration |
|-------|-------|----------|
| Phase 1: Foundation | 24-32 | 1-2 weeks |
| Phase 2: High-Impact | 32-40 | 2 weeks |
| Phase 3: Features | 24-32 | 2 weeks |
| Phase 4: Remaining | 16-24 | 1-2 weeks |
| **Total** | **96-128** | **6-8 weeks** |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12-30 | Initial audit and specification |
