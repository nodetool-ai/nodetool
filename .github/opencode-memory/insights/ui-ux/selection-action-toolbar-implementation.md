# Selection Action Toolbar Implementation

**Insight**: TypeScript discriminated unions work well for rendering mixed content (buttons and dividers), but type guards need explicit function boundaries to properly narrow types.

**Challenge**: When using `.map()` with a union type, TypeScript doesn't automatically narrow types inside the callback even with `if` checks.

**Solution**: Use explicit type guard functions and render functions outside the map callback:
```typescript
const isDividerButton = (button: ButtonItem): button is DividerButton => {
  return button.divider === true;
};

const renderButton = (button: ActionButton, index: number): React.ReactNode => { ... };
```

**Files**: `web/src/components/node_editor/SelectionActionToolbar.tsx`

**Date**: 2026-01-10
