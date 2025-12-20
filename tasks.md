# Performance Improvement Tasks

This document tracks high and medium priority performance improvements for the NodeTool web application.

---

## 🔴 High Priority

### 1. Add React.lazy() / Code Splitting for Routes

**Problem:** All routes are eagerly loaded in `index.tsx`, increasing initial bundle size and TTI.

**Location:** `web/src/index.tsx`

**Current:**
```typescript
import Dashboard from "./components/dashboard/Dashboard";
import GlobalChat from "./components/chat/containers/GlobalChat";
import MiniAppPage from "./components/miniapps/MiniAppPage";
import ModelListIndex from "./components/hugging_face/model_list/ModelListIndex";
import TabsNodeEditor from "./components/editor/TabsNodeEditor";
import AssetExplorer from "./components/assets/AssetExplorer";
import CollectionsExplorer from "./components/collections/CollectionsExplorer";
import TemplateGrid from "./components/workflows/ExampleGrid";
```

**Solution:**
```typescript
const Dashboard = React.lazy(() => import("./components/dashboard/Dashboard"));
const GlobalChat = React.lazy(() => import("./components/chat/containers/GlobalChat"));
const MiniAppPage = React.lazy(() => import("./components/miniapps/MiniAppPage"));
const ModelListIndex = React.lazy(() => import("./components/hugging_face/model_list/ModelListIndex"));
const TabsNodeEditor = React.lazy(() => import("./components/editor/TabsNodeEditor"));
const AssetExplorer = React.lazy(() => import("./components/assets/AssetExplorer"));
const CollectionsExplorer = React.lazy(() => import("./components/collections/CollectionsExplorer"));
const TemplateGrid = React.lazy(() => import("./components/workflows/ExampleGrid"));
```

Add Suspense wrapper:
```typescript
<Suspense fallback={<LoadingAnimation />}>
  <Routes />
</Suspense>
```

**Impact:** Could reduce initial bundle size by 30-50%  
**Effort:** Low (30-60 minutes)

---

### 2. Tree-Shake Lodash Imports

**Problem:** 110+ files import from `"lodash"` directly, pulling in the entire library (~70KB).

**Files affected:** 
- `web/src/components/node/BaseNode.tsx`
- `web/src/components/node/ReactFlowWrapper.tsx`
- `web/src/components/node_menu/NodeMenu.tsx`
- `web/src/components/dashboard/Dashboard.tsx`
- `web/src/contexts/WorkflowManagerContext.tsx`
- And 100+ more files

**Current:**
```typescript
import { isEqual } from "lodash";
import { debounce } from "lodash";
import { debounce, isEqual } from "lodash";
import { debounce, omit } from "lodash";
import { zip } from "lodash";
```

**Solution:**
```typescript
import isEqual from "lodash/isEqual";
import debounce from "lodash/debounce";
import omit from "lodash/omit";
import zip from "lodash/zip";
```

**Alternative:** Consider replacing with native/smaller alternatives:
- `isEqual` → Zustand's `shallow` for simple objects, or custom deep equality
- `debounce` → `use-debounce` hook or custom implementation

**Impact:** ~70KB bundle reduction  
**Effort:** Low (global search & replace)

---

## 🟠 Medium Priority

### 3. Virtualize Workflow/Template Grids

**Problem:** `ExampleGrid.tsx` renders all workflow cards without virtualization.

**Location:** `web/src/components/workflows/ExampleGrid.tsx` (lines 625-644)

**Current:**
```typescript
filteredWorkflows.map((workflow) => {
  return (
    <WorkflowCard
      key={workflow.id}
      workflow={workflow}
      // ...
    />
  );
})
```

**Solution:** Use `react-window` (already used elsewhere in the codebase):
```typescript
import { FixedSizeGrid as Grid } from "react-window";

<Grid
  columnCount={columns}
  rowCount={Math.ceil(filteredWorkflows.length / columns)}
  columnWidth={240}
  rowHeight={280}
  height={containerHeight}
  width={containerWidth}
>
  {({ columnIndex, rowIndex, style }) => {
    const index = rowIndex * columns + columnIndex;
    const workflow = filteredWorkflows[index];
    if (!workflow) return null;
    return (
      <div style={style}>
        <WorkflowCard workflow={workflow} ... />
      </div>
    );
  }}
</Grid>
```

**Impact:** Significant performance improvement for large workflow lists  
**Effort:** Medium (2-3 hours)

---

### 4. Add Shallow Equality to Zustand Store Subscriptions

**Problem:** Only 6 files use Zustand's `shallow` comparator. Many components re-render unnecessarily.

**Key files to update:**
- `web/src/components/node/ReactFlowWrapper.tsx`
- `web/src/components/dashboard/Dashboard.tsx`
- `web/src/components/node_menu/NodeMenu.tsx`
- `web/src/components/node_editor/NodeEditor.tsx`
- `web/src/components/panels/*.tsx`

**Current:**
```typescript
const { nodes, edges, onNodesChange } = useNodes((state) => ({
  nodes: state.nodes,
  edges: state.edges,
  onNodesChange: state.onNodesChange
}));
```

**Solution:**
```typescript
import { shallow } from "zustand/shallow";

const { nodes, edges, onNodesChange } = useNodes(
  (state) => ({
    nodes: state.nodes,
    edges: state.edges,
    onNodesChange: state.onNodesChange
  }),
  shallow
);
```

**Impact:** Fewer unnecessary re-renders  
**Effort:** Low-Medium (1-2 hours audit + changes)

---

### 5. Batch API Cache Checks in RecommendedModels

**Problem:** `RecommendedModels.tsx` makes individual API calls for each model in useEffect.

**Location:** `web/src/components/hugging_face/RecommendedModels.tsx` (lines 48-90)

**Current:**
```typescript
useEffect(() => {
  const tasks = recommendedModels
    .filter((model) => {...})
    .map(async (model) => {
      const res = await checkHfCache({...}); // Individual API call per model
    });
  await Promise.all(tasks);
}, [recommendedModels, completedDownloadsKey]);
```

**Solution:**
1. Create a batch endpoint `/api/models/huggingface/check_cache_batch`
2. Or use React Query's `useQueries` with proper caching:
```typescript
import { useQueries } from "@tanstack/react-query";

const cacheQueries = useQueries({
  queries: recommendedModels.map((model) => ({
    queryKey: ["hf-cache", model.id],
    queryFn: () => checkHfCache({ repo_id: model.repo_id, ... }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!model.repo_id
  }))
});
```

**Impact:** Fewer API calls, better caching  
**Effort:** Medium (2-4 hours)

---

### 6. Split OutputRenderer into Type-Specific Renderers

**Problem:** `OutputRenderer.tsx` has a 300+ line switch statement in a single useMemo.

**Location:** `web/src/components/node/OutputRenderer.tsx` (lines 147-436)

**Solution:** Create a renderer registry:
```typescript
// renderers/index.ts
export const renderers: Record<string, React.ComponentType<RendererProps>> = {
  image: React.lazy(() => import("./ImageRenderer")),
  audio: React.lazy(() => import("./AudioRenderer")),
  video: React.lazy(() => import("./VideoRenderer")),
  dataframe: React.lazy(() => import("./DataframeRenderer")),
  plotly_config: React.lazy(() => import("./PlotlyRenderer")),
  // ...
};

// OutputRenderer.tsx
const OutputRenderer = ({ value }) => {
  const type = useMemo(() => typeFor(value), [value]);
  const Renderer = renderers[type] || TextRenderer;
  
  return (
    <Suspense fallback={<Skeleton />}>
      <Renderer value={value} />
    </Suspense>
  );
};
```

**Impact:** Better code organization, potential lazy loading  
**Effort:** Medium-High (4-6 hours)

---

### 7. Extract Static CSS from Components

**Problem:** Large CSS objects generated inside components on every render.

**Key files:**
- `web/src/components/workflows/ExampleGrid.tsx` - 330+ lines of styles
- Other components with inline `css({...})` calls

**Current:**
```typescript
const TemplateGrid = () => {
  const theme = useTheme();
  return <Box css={styles(theme)}>...</Box>; // styles() called every render
};

const styles = (theme: Theme) => css({
  // 330+ lines
});
```

**Solution:**
```typescript
// Separate file: ExampleGrid.styles.ts
import { css, Theme } from "@emotion/react";

export const getStyles = (theme: Theme) => css({...});

// Or use CSS modules for truly static styles
// ExampleGrid.module.css

// Component:
const TemplateGrid = () => {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => getStyles(theme), [theme]);
  return <Box css={memoizedStyles}>...</Box>;
};
```

**Impact:** Reduced style recalculation overhead  
**Effort:** Medium (per-component, ongoing)

---

### 8. Memoize Unmemoized Large Components

**Problem:** 341 functional components found, only 115 use `memo()`.

**Key unmemoized components to address:**
- `TemplateGrid` (`web/src/components/workflows/ExampleGrid.tsx`)
- Dialog components in `web/src/components/dialogs/`
- Panel components in `web/src/components/panels/`

**Solution:**
```typescript
// Current:
const TemplateGrid = () => {...};
export default TemplateGrid;

// Better:
const TemplateGrid = () => {...};
export default memo(TemplateGrid);

// With custom comparison for complex props:
export default memo(TemplateGrid, (prevProps, nextProps) => {
  return isEqual(prevProps.data, nextProps.data);
});
```

**Impact:** Fewer unnecessary re-renders  
**Effort:** Low per component (ongoing effort)

---

## Progress Tracking

| Task | Priority | Status | Assignee | Notes |
|------|----------|--------|----------|-------|
| 1. React.lazy routes | 🔴 High | ✅ Done | | Lazy-loaded 9 route components |
| 2. Tree-shake lodash | 🔴 High | ✅ Done | | Converted 110 files to tree-shakeable imports |
| 3. Virtualize grids | 🟠 Medium | ⬜ Todo | | |
| 4. Shallow equality | 🟠 Medium | ✅ Done | | Added shallow to 16 files + default in hooks |
| 5. Batch cache API | 🟠 Medium | ⬜ Todo | | |
| 6. Split OutputRenderer | 🟠 Medium | ⬜ Todo | | |
| 7. Extract static CSS | 🟠 Medium | ⬜ Todo | | |
| 8. Memoize components | 🟠 Medium | ⬜ Todo | | |

---

## Metrics to Track

Before implementing changes, establish baselines for:
- [ ] Initial bundle size (via `npm run build`)
- [ ] Time to Interactive (TTI) via Lighthouse
- [ ] Component render counts (via React DevTools Profiler)
- [ ] Memory usage during workflow editing

After each change, measure improvement against these baselines.

