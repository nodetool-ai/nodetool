# Important Insights and Learnings

This file captures important discoveries, architectural decisions, and best practices learned during development.

## Architecture Insights

### State Management Strategy

**Insight**: Zustand with selective subscriptions prevents unnecessary re-renders better than Context.

**Rationale**: 
- Context causes all consumers to re-render on any change
- Zustand allows component-level subscriptions to specific state slices
- Temporal middleware provides undo/redo without extra code

**Example**:
```typescript
// Subscribes only to this specific node
const node = useNodeStore(state => state.nodes[nodeId]);
```

**Impact**: 60%+ reduction in re-renders in node editor.

**Date**: Pre-existing pattern, documented 2026-01-10

---

### Keyboard Shortcut Implementation Pattern

**Insight**: New keyboard shortcuts are added in two places: the shortcut definition in `shortcuts.ts` and the handler in `useNodeEditorShortcuts.ts`.

**Pattern**:
```typescript
// 1. Add to shortcuts.ts
{
  title: "Feature Name",
  slug: "toggleFeature",
  keyCombo: ["Control", "Shift", "F"],
  category: "panel",
  description: "Show or hide feature panel",
  registerCombo: true
}

// 2. Add handler in useNodeEditorShortcuts.ts
const handleFeatureToggle = useCallback(() => {
  inspectorToggle("featureName");
}, [inspectorToggle]);

// 3. Add to shortcutMeta
toggleFeature: { callback: handleFeatureToggle },

// 4. Add to dependencies array
handleFeatureToggle
```

**Files**: `web/src/config/shortcuts.ts`, `web/src/hooks/useNodeEditorShortcuts.ts`

**Date**: 2026-01-10

---

## How to Add New Insights

When documenting new insights:

1. **Title**: Clear, descriptive heading
2. **Insight**: What you learned
3. **Rationale**: Why it matters
4. **Example**: Code or pattern (if applicable)
5. **Impact**: Measurable benefit (if known)
6. **Files**: Related files
7. **Date**: When documented

## Last Updated

2026-01-10 - Initial memory system creation with pre-existing patterns documented

---

### Mobile Package Dependencies Issue (2026-01-10)

**Insight**: Mobile package requires `npm install` before type checking can succeed.

**Problem**: The mobile package (React Native/Expo) has its own `package.json` with separate dependencies from the web and electron packages. When running `make typecheck`, the mobile package fails because `node_modules` is not installed.

**Solution**: Always run `npm install` in the mobile directory before type checking:
```bash
cd mobile && npm install
```

**Impact**: TypeScript cannot find module declarations for React, React Native, and other dependencies without `node_modules` installed. This affects both local development and CI pipelines.

**Files**: `mobile/package.json`, `mobile/tsconfig.json`

**Recommendation**: Consider adding `npm install` as a pre-step in the Makefile typecheck-mobile command or CI pipeline to prevent failures.

**Date**: 2026-01-10

---

### GitHub Workflow Dependency Management (2026-01-10)

**Insight**: GitHub workflows must install npm dependencies in all package directories (web, electron, mobile) to ensure consistent CI/CD behavior.

**Problem**: Workflows that only install dependencies for web and electron will fail when mobile package changes are made, since mobile tests and type checks depend on installed node_modules.

**Solution**: Add explicit dependency installation steps for all packages in workflows:
```yaml
- name: Install web dependencies
  run: |
    cd web
    npm ci

- name: Install electron dependencies
  run: |
    cd electron
    npm ci

- name: Install mobile dependencies
  run: |
    cd mobile
    npm ci
```

**Additional Fix**: Update path filters to include `mobile/**` so workflows trigger on mobile package changes:
```yaml
on:
  push:
    paths:
      - "web/**"
      - "electron/**"
      - "mobile/**"
```

**Impact**: Ensures all packages are properly set up before running tests, type checks, or builds in CI.

**Files**: `.github/workflows/e2e.yml`, `.github/workflows/copilot-setup-steps.yml`, `.github/workflows/test.yml`

**Date**: 2026-01-10
