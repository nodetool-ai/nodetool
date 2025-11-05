# Frontend Component Consolidation Plan

## Executive Summary

This document outlines a comprehensive plan to streamline and consolidate frontend components in the NodeTool codebase. The goal is to create a unified component system that reduces variations, improves maintainability, and makes global changes easier to implement.

## Current State Analysis

### 1. Component Distribution

#### Buttons (30 files)
- **Multiple implementations:** Regular buttons, icon buttons, specialized buttons
- **Styling approaches:** Mix of `css()`, `sx` prop, inline styles, and Emotion CSS
- **Inconsistent patterns:** Some use MUI directly, others wrap MUI components

#### Dialogs (13 files)
- **Variations:** Custom dialogs, MUI dialogs, modals
- **Styling:** Mix of external styles (`dialogStyles`) and inline styling
- **Component structure:** Some use MUI dialog components directly, others create custom wrappers

#### Menus (28 files)
- **Types:** Context menus, dropdown menus, command menus, settings menus
- **Implementation:** Mix of MUI Menu components and custom implementations
- **Inconsistent APIs:** Different prop interfaces for similar functionality

#### Tooltips (2 files)
- **Limited standardization:** Direct MUI usage with varying delay constants
- **Inconsistent placement and behavior**

#### Inputs (16 files)
- **Types:** Text inputs, number inputs, selects, specialized inputs
- **Validation:** Inconsistent validation patterns
- **Styling:** Mix of approaches

### 2. Identified Issues

1. **Styling Inconsistency**
   - Mix of Emotion CSS (`css()`), MUI's `sx` prop, and inline styles
   - Some components use theme directly, others hardcode values
   - Inconsistent use of theme variables

2. **Component API Fragmentation**
   - Different prop interfaces for similar components
   - Inconsistent naming conventions
   - Varying levels of abstraction

3. **Code Duplication**
   - Similar button variations implemented separately
   - Repeated tooltip delay logic
   - Duplicate dialog patterns

4. **Theme Integration**
   - Some components properly use theme variables
   - Others have hardcoded values
   - Inconsistent access to theme (useTheme vs sx prop)

5. **Constants Management**
   - `TOOLTIP_ENTER_DELAY` used inconsistently
   - Some components define their own delay values
   - Theme values not centralized

## Proposed Solution

### 1. Component Wrapper Strategy

Create wrapper components that standardize common patterns while maintaining flexibility:

```typescript
// Example: Button wrapper
interface ButtonProps extends MuiButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';
  size?: 'small' | 'medium' | 'large';
  tooltip?: string;
  tooltipPlacement?: TooltipProps['placement'];
}
```

### 2. Component Hierarchy

```
src/components/
├── core/                    # Core wrapped components
│   ├── Button/
│   │   ├── Button.tsx      # Main button wrapper
│   │   ├── IconButton.tsx  # Icon button variant
│   │   ├── styles.ts       # Shared styles
│   │   └── index.ts
│   ├── Dialog/
│   │   ├── Dialog.tsx
│   │   ├── ConfirmDialog.tsx
│   │   └── styles.ts
│   ├── Menu/
│   │   ├── Menu.tsx
│   │   ├── ContextMenu.tsx
│   │   └── MenuItem.tsx
│   ├── Tooltip/
│   │   └── Tooltip.tsx
│   └── Input/
│       ├── TextField.tsx
│       ├── NumberInput.tsx
│       └── Select.tsx
└── composite/              # Higher-level components using core
```

### 3. Standardization Approach

#### Phase 1: Core Component Creation
1. **Button System**
   - Create base `Button` wrapper with all variants
   - Standardize props interface
   - Implement consistent theming
   - Add built-in tooltip support

2. **Dialog System**
   - Create base `Dialog` wrapper
   - Implement common patterns (confirm, alert, form)
   - Standardize animations and backdrop behavior

3. **Menu System**
   - Unify context menu and dropdown menu patterns
   - Create consistent `MenuItem` component
   - Standardize keyboard navigation

4. **Tooltip System**
   - Single `Tooltip` wrapper with consistent delays
   - Standardize placement logic
   - Theme-aware styling

5. **Input System**
   - Unified validation approach
   - Consistent error handling
   - Standardized sizing and spacing

#### Phase 2: Migration Strategy
1. **Incremental Replacement**
   - Start with least-used components
   - Create compatibility layer for gradual migration
   - Update one component type at a time

2. **Testing Strategy**
   - Create comprehensive tests for new components
   - Visual regression testing
   - Ensure backwards compatibility

3. **Documentation**
   - Component usage guidelines
   - Migration guide for developers
   - Storybook for component showcase

### 4. Technical Implementation

#### Style System
```typescript
// Centralized style utilities
export const buttonStyles = {
  base: (theme: Theme) => ({
    // Common button styles
  }),
  variants: {
    primary: (theme: Theme) => ({
      // Primary variant styles
    }),
    // ... other variants
  }
};
```

#### Theme Extensions
```typescript
// Extend theme with component tokens
declare module '@mui/material/styles' {
  interface Theme {
    components: {
      button: {
        borderRadius: string;
        padding: Record<Size, string>;
      };
      dialog: {
        borderRadius: string;
        backdrop: string;
      };
      // ... other component tokens
    };
  }
}
```

#### Prop Standardization
```typescript
// Common prop interfaces
interface BaseComponentProps {
  className?: string;
  tooltip?: string;
  tooltipPlacement?: TooltipPlacement;
  'data-testid'?: string;
}
```

### 5. Benefits

1. **Maintainability**
   - Single source of truth for each component type
   - Easier to make global changes
   - Reduced code duplication

2. **Consistency**
   - Unified visual appearance
   - Predictable behavior across the app
   - Standardized accessibility features

3. **Developer Experience**
   - Clear component APIs
   - Better TypeScript support
   - Simplified imports

4. **Performance**
   - Reduced bundle size through deduplication
   - Optimized re-renders
   - Better tree-shaking

### 6. Implementation Timeline

#### Month 1: Foundation
- Week 1-2: Create core component structure and base wrappers
- Week 3-4: Implement Button and Tooltip systems

#### Month 2: Core Components
- Week 1-2: Dialog system implementation
- Week 3-4: Menu system implementation

#### Month 3: Inputs and Migration
- Week 1-2: Input system implementation
- Week 3-4: Begin migration of existing components

#### Month 4: Completion
- Week 1-2: Complete migration
- Week 3-4: Documentation and testing

### 7. Success Metrics

1. **Code Reduction**
   - Target: 40% reduction in component code
   - Measure: Lines of code, number of files

2. **Consistency**
   - All components use unified styling approach
   - Props follow standard patterns

3. **Developer Velocity**
   - Faster implementation of new features
   - Reduced time spent on styling decisions

4. **Bundle Size**
   - Reduced JavaScript bundle size
   - Better code splitting

## Next Steps

1. **Review and Approval**
   - Team review of this plan
   - Gather feedback and adjust

2. **Prototype Creation**
   - Create proof-of-concept for Button system
   - Validate approach with team

3. **Tooling Setup**
   - Set up Storybook for component development
   - Configure visual regression testing

4. **Begin Implementation**
   - Start with Phase 1 core components
   - Regular progress reviews

## Appendix: Current Component Inventory

### Button Variations Found
- `Button` (MUI direct usage)
- `IconButton` (MUI direct usage)
- `CloseButton` (custom wrapper)
- `DeleteButton` (custom wrapper with tooltip)
- `SendMessageButton` (IconButton with custom styling)
- `BackToDashboardButton`
- `FileUploadButton`
- And 20+ more variations...

### Dialog Patterns
- `ConfirmDialog` (custom implementation)
- `Dialog` (layout test component)
- Various model dialogs with different structures
- Modal components

### Menu Types
- Context menus (node, edge, asset, etc.)
- Settings menus
- Command menu
- App icon menu
- Various specialized menus

### Styling Approaches Found
1. Emotion CSS with `css()` function
2. MUI `sx` prop
3. Inline styles
4. Styled components
5. External style files
6. Theme-based styling
7. Hardcoded values

This consolidation will bring order to the current fragmentation and create a maintainable, scalable component system.