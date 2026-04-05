# Onboarding & First Impressions Polish — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the first-time user experience — loading states, empty states, search UX, tooltip shortcuts, and notification improvements — so NodeTool feels intentional and delightful from the very first second.

**Architecture:** All changes are in the web frontend (`web/src/`). No backend changes. Each task targets a small set of files with zero cross-task file overlap, enabling parallel execution. All tasks follow existing patterns (Emotion CSS, MUI theme tokens, Zustand stores, memo'd components).

**Tech Stack:** React 18, MUI v7, Emotion CSS-in-JS, Zustand, react-window, Vitest/Jest

---

## Chunk 1: Loading & Empty States

### Task 1: Branded Loading Screens in index.tsx

Replace the bare `CircularProgress` spinners in `index.tsx` with the existing `LoadingSpinner` component plus contextual messages.

**Files:**
- Modify: `web/src/index.tsx:546-590`

- [ ] **Step 1: Write test for loading screen accessibility**

Create a test that verifies loading screens have proper role and aria attributes:

```tsx
// web/src/__tests__/LoadingScreens.test.tsx
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// We'll test the loading markup directly since index.tsx is hard to unit test
describe("Loading screen patterns", () => {
  it("loading screen should have role=status and descriptive text", () => {
    const { container } = render(
      <div role="status" aria-label="Loading NodeTool" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <div>Loading NodeTool...</div>
      </div>
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Loading NodeTool...")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd /Users/mg/workspace/nodetool/web && npx jest --testPathPattern=LoadingScreens --no-coverage`
Expected: PASS

- [ ] **Step 3: Replace CircularProgress with LoadingSpinner in index.tsx**

In `web/src/index.tsx`, replace the two `CircularProgress` loading states (lines ~546-590):

Change the first loading block (metadata pending, ~line 546-556) from:
```tsx
{status === "pending" && !isDevTestRoute && (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh"
    }}
  >
    <CircularProgress />
  </div>
)}
```

To:
```tsx
{status === "pending" && !isDevTestRoute && (
  <div
    role="status"
    aria-label="Loading NodeTool"
    style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      gap: "16px"
    }}
  >
    <LoadingSpinner size="large" />
    <span style={{ color: "var(--palette-text-secondary)", fontSize: "0.9rem" }}>
      Loading NodeTool...
    </span>
  </div>
)}
```

Change the error block (~line 558-570) to include a retry button:
```tsx
{status === "error" && !isDevTestRoute && (
  <div
    role="alert"
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      flexDirection: "column",
      gap: "12px"
    }}
  >
    <span style={{ color: "var(--palette-text-primary)", fontSize: "1rem" }}>
      Error loading application metadata.
    </span>
    <button
      onClick={() => window.location.reload()}
      style={{
        padding: "8px 16px",
        borderRadius: "6px",
        border: "1px solid var(--palette-divider)",
        backgroundColor: "transparent",
        color: "var(--palette-text-primary)",
        cursor: "pointer",
        fontSize: "0.85rem"
      }}
    >
      Refresh Page
    </button>
  </div>
)}
```

Change the Suspense fallback (~line 575-588) from:
```tsx
<Suspense
  fallback={
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        width: "100%"
      }}
    >
      <CircularProgress />
    </div>
  }
>
```

To:
```tsx
<Suspense
  fallback={
    <div
      role="status"
      aria-label="Loading"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        width: "100%",
        gap: "16px"
      }}
    >
      <LoadingSpinner size="large" />
      <span style={{ color: "var(--palette-text-secondary)", fontSize: "0.9rem" }}>
        Preparing workspace...
      </span>
    </div>
  }
>
```

Also add the import at the top of `index.tsx`:
```tsx
import { LoadingSpinner } from "./components/ui_primitives/LoadingSpinner";
```

And remove the `CircularProgress` import if it's no longer used elsewhere in the file.

- [ ] **Step 4: Run typecheck and lint**

Run: `cd /Users/mg/workspace/nodetool && make typecheck && make lint`
Expected: PASS with no new errors

- [ ] **Step 5: Commit**

```bash
git add web/src/index.tsx web/src/__tests__/LoadingScreens.test.tsx
git commit -m "polish: replace bare CircularProgress with branded loading states in index.tsx"
```

---

### Task 2: Add "No Results" Empty State to Node Menu Search

When node menu search returns zero results, show the `EmptyState` component instead of a blank list.

**Files:**
- Modify: `web/src/components/node_menu/SearchResultsPanel.tsx`

- [ ] **Step 1: Write test for empty search results**

```tsx
// web/src/components/node_menu/__tests__/SearchResultsPanel.test.tsx
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock the stores and hooks
jest.mock("../../../hooks/useCreateNode", () => ({
  useCreateNode: () => jest.fn()
}));
jest.mock("../../../stores/NodeMenuStore", () => {
  const store = jest.fn(() => ({
    setDragToCreate: jest.fn(),
    selectedIndex: -1
  }));
  store.getState = jest.fn(() => ({}));
  return { __esModule: true, default: store };
});
jest.mock("../../../lib/dragdrop/store", () => ({
  useDragDropStore: jest.fn(() => ({
    setActiveDrag: jest.fn(),
    clearDrag: jest.fn()
  }))
}));
jest.mock("../../../lib/dragdrop", () => ({
  serializeDragData: jest.fn()
}));

import SearchResultsPanel from "../SearchResultsPanel";

describe("SearchResultsPanel", () => {
  it("shows empty state when searchNodes is empty", () => {
    render(<SearchResultsPanel searchNodes={[]} />);
    expect(screen.getByText("No matching nodes")).toBeInTheDocument();
    expect(screen.getByText(/Try a different search term/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/mg/workspace/nodetool/web && npx jest --testPathPattern=SearchResultsPanel --no-coverage`
Expected: FAIL — "No matching nodes" not found

- [ ] **Step 3: Add empty state to SearchResultsPanel**

In `web/src/components/node_menu/SearchResultsPanel.tsx`, add the EmptyState import and an early return:

Add import at top:
```tsx
import { EmptyState } from "../ui_primitives/EmptyState";
```

Add early return before the AutoSizer block (before line 76 `return (`):
```tsx
  if (searchNodes.length === 0) {
    return (
      <EmptyState
        variant="no-results"
        title="No matching nodes"
        description="Try a different search term or adjust your filters."
        size="small"
      />
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/mg/workspace/nodetool/web && npx jest --testPathPattern=SearchResultsPanel --no-coverage`
Expected: PASS

- [ ] **Step 5: Run typecheck**

Run: `cd /Users/mg/workspace/nodetool && make typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/components/node_menu/SearchResultsPanel.tsx web/src/components/node_menu/__tests__/SearchResultsPanel.test.tsx
git commit -m "polish: add 'no results' empty state to node menu search"
```

---

## Chunk 2: Tooltip Shortcuts & Hardcoded Colors

### Task 3: Add Keyboard Shortcut Labels to Header Tooltips

Update AppHeader mode pill tooltips to show keyboard shortcuts where applicable.

**Files:**
- Modify: `web/src/components/panels/AppHeader.tsx`

- [ ] **Step 1: Identify shortcuts for header actions**

Check `web/src/config/shortcuts.ts` for any existing shortcut slugs related to editor/chat/app mode switching. If none exist, the tooltips should just get descriptive text improvements.

- [ ] **Step 2: Replace hardcoded rgba colors with theme tokens in mode pills**

In `web/src/components/panels/AppHeader.tsx`, replace the hardcoded colors in the `.mode-pill` styles:

Change lines 104-109:
```tsx
"&:hover": {
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  color: theme.vars.palette.text.primary
},
"&.active": {
  backgroundColor: "rgba(255, 255, 255, 0.12)",
```

To:
```tsx
"&:hover": {
  backgroundColor: theme.vars.palette.action.hover,
  color: theme.vars.palette.text.primary
},
"&.active": {
  backgroundColor: theme.vars.palette.action.selected,
```

Also in the TemplatesButton (line ~254), replace:
```tsx
"&:hover": {
  backgroundColor: "rgba(255, 255, 255, 0.08)",
```
To:
```tsx
"&:hover": {
  backgroundColor: theme.vars.palette.action.hover,
```

- [ ] **Step 3: Improve disabled App button styling**

In `web/src/components/panels/AppHeader.tsx`, replace the inline opacity style (line ~218):
```tsx
style={{ opacity: currentWorkflowId ? 1 : 0.5 }}
```
To:
```tsx
style={{
  opacity: currentWorkflowId ? 1 : 0.4,
  pointerEvents: currentWorkflowId ? "auto" : "none",
  cursor: currentWorkflowId ? "pointer" : "default"
}}
```

- [ ] **Step 4: Run typecheck and lint**

Run: `cd /Users/mg/workspace/nodetool && make typecheck && make lint`
Expected: PASS

- [ ] **Step 5: Visual check**

Run: `cd /Users/mg/workspace/nodetool/web && npm start`
Verify: Mode pills hover/active states use proper theme colors, disabled App button is clearly distinguishable.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/panels/AppHeader.tsx
git commit -m "polish: replace hardcoded colors with theme tokens in AppHeader mode pills"
```

---

### Task 4: Remove Commented-Out Icon Code in AppHeader

Clean up dead code in AppHeader — commented-out icons on lines 196, 207, 220.

**Files:**
- Modify: `web/src/components/panels/AppHeader.tsx`

- [ ] **Step 1: Remove commented-out icons**

In `web/src/components/panels/AppHeader.tsx`, remove these three lines:
- Line 196: `{/* <EditIcon /> */}`
- Line 207: `{/* <IconForType iconName="message" showTooltip={false} /> */}`
- Line 220: `{/* <RocketLaunchIcon /> */}`

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/mg/workspace/nodetool && make typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add web/src/components/panels/AppHeader.tsx
git commit -m "polish: remove commented-out icon code from AppHeader mode pills"
```

---

## Chunk 3: Notification System Improvements

### Task 5: Add Reading-Time-Based Notification Dismiss

Scale notification auto-dismiss duration based on content length so users have time to read longer messages.

**Files:**
- Modify: `web/src/stores/NotificationStore.ts`
- Modify: `web/src/config/constants.ts`

- [ ] **Step 1: Write test for reading-time calculation**

```tsx
// web/src/stores/__tests__/NotificationStore.test.ts
import { calculateReadingTimeout } from "../NotificationStore";
import {
  NOTIFICATION_TIMEOUT_DEFAULT,
  NOTIFICATION_TIMEOUT_MIN,
  NOTIFICATION_TIMEOUT_MAX
} from "../../config/constants";

describe("calculateReadingTimeout", () => {
  it("returns default timeout for short messages", () => {
    expect(calculateReadingTimeout("Done.")).toBe(NOTIFICATION_TIMEOUT_DEFAULT);
  });

  it("returns longer timeout for longer messages", () => {
    const longMessage = "This is a much longer error message that describes what went wrong and provides additional context for debugging the issue.";
    const timeout = calculateReadingTimeout(longMessage);
    expect(timeout).toBeGreaterThan(NOTIFICATION_TIMEOUT_DEFAULT);
  });

  it("never exceeds max timeout", () => {
    const veryLongMessage = "word ".repeat(500);
    expect(calculateReadingTimeout(veryLongMessage)).toBe(NOTIFICATION_TIMEOUT_MAX);
  });

  it("never goes below minimum timeout", () => {
    expect(calculateReadingTimeout("")).toBe(NOTIFICATION_TIMEOUT_MIN);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/mg/workspace/nodetool/web && npx jest --testPathPattern=NotificationStore --no-coverage`
Expected: FAIL — `calculateReadingTimeout` is not exported

- [ ] **Step 3: Add timeout constants to constants.ts**

In `web/src/config/constants.ts`, add after line 18:
```tsx
export const NOTIFICATION_TIMEOUT_MIN = 2000; // 2 seconds minimum
export const NOTIFICATION_TIMEOUT_MAX = 12000; // 12 seconds maximum
export const NOTIFICATION_READING_WPM = 200; // average reading speed in words per minute
```

- [ ] **Step 4: Add calculateReadingTimeout to NotificationStore**

In `web/src/stores/NotificationStore.ts`, add the import and function:

Add to imports:
```tsx
import {
  NOTIFICATION_TIMEOUT_DEFAULT,
  NOTIFICATION_TIMEOUT_MIN,
  NOTIFICATION_TIMEOUT_MAX,
  NOTIFICATION_READING_WPM
} from "../config/constants";
```

Add exported function before the store definition (before `interface NotificationStore`):
```tsx
/** Calculate auto-dismiss timeout based on message length. Longer messages get more reading time. */
export function calculateReadingTimeout(content: string): number {
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const readingTimeMs = Math.ceil((wordCount / NOTIFICATION_READING_WPM) * 60 * 1000);
  return Math.max(NOTIFICATION_TIMEOUT_MIN, Math.min(NOTIFICATION_TIMEOUT_MAX, Math.max(readingTimeMs, NOTIFICATION_TIMEOUT_DEFAULT)));
}
```

- [ ] **Step 5: Use calculateReadingTimeout in addNotification**

In `NotificationStore.ts`, in the `addNotification` method, when creating the notification object (~line 107), apply reading-time timeout when no explicit timeout is set:

Change line 107 from:
```tsx
{ ...sanitizedNotification, id: uuidv4(), timestamp: now }
```
To:
```tsx
{
  ...sanitizedNotification,
  id: uuidv4(),
  timestamp: now,
  timeout: sanitizedNotification.timeout ?? calculateReadingTimeout(sanitizedNotification.content)
}
```

- [ ] **Step 6: Run tests**

Run: `cd /Users/mg/workspace/nodetool/web && npx jest --testPathPattern=NotificationStore --no-coverage`
Expected: PASS

- [ ] **Step 7: Run typecheck**

Run: `cd /Users/mg/workspace/nodetool && make typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add web/src/stores/NotificationStore.ts web/src/config/constants.ts web/src/stores/__tests__/NotificationStore.test.ts
git commit -m "polish: auto-scale notification dismiss timeout based on reading time"
```

---

## Chunk 4: Search Result Count & Active Filter Indicator

### Task 6: Show Search Result Count in Node Menu

Display the number of matching nodes when searching in the node palette.

**Files:**
- Modify: `web/src/components/node_menu/NodeMenu.tsx:295-316`

- [ ] **Step 1: Add result count display**

In `web/src/components/node_menu/NodeMenu.tsx`, inside the search-row FlexRow (after the SearchInput component, around line 316), add a result count:

After the closing `/>` of `<SearchInput ... />` (line 316), add:
```tsx
{searchTerm && searchTerm.trim() !== "" && (
  <span
    style={{
      fontSize: "0.75rem",
      color: "var(--palette-text-secondary)",
      whiteSpace: "nowrap",
      flexShrink: 0
    }}
  >
    {searchResults.length} {searchResults.length === 1 ? "node" : "nodes"}
  </span>
)}
```

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/mg/workspace/nodetool && make typecheck`
Expected: PASS

- [ ] **Step 3: Visual check**

Run: `cd /Users/mg/workspace/nodetool/web && npm start`
Verify: When typing in the node menu search, a "N nodes" count appears next to the search field.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/node_menu/NodeMenu.tsx
git commit -m "polish: show search result count in node palette"
```

---

### Task 7: Add "Active Filters" Visual Indicator

When provider/input/output type filters are active, show a subtle indicator near the search field so users know filters are constraining results.

**Files:**
- Modify: `web/src/components/node_menu/NodeMenu.tsx:317-348`

- [ ] **Step 1: Add filter count badge**

The filter chips already show when active (lines 327-347), but they can be easy to miss because they're at the far right. Add a subtle "Filtered" badge next to the result count:

After the result count span added in Task 6, add:
```tsx
{(selectedProviderType !== "all" || selectedInputType || selectedOutputType) && (
  <Chip
    size="small"
    label="Filtered"
    variant="outlined"
    sx={{
      height: "20px",
      fontSize: "0.65rem",
      borderColor: "var(--palette-warning-main)",
      color: "var(--palette-warning-main)"
    }}
  />
)}
```

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/mg/workspace/nodetool && make typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add web/src/components/node_menu/NodeMenu.tsx
git commit -m "polish: add 'Filtered' badge when node menu filters are active"
```

---

## Chunk 5: Empty State Enrichment

### Task 8: Add Contextual Actions to Key Empty States

Enhance the chat thread empty state to suggest helpful next actions.

**Files:**
- Modify: `web/src/components/chat/thread/EmptyThreadList.tsx`

- [ ] **Step 1: Read current EmptyThreadList implementation**

Read the file to understand the current empty state markup.

- [ ] **Step 2: Add action button to empty thread list**

Update `EmptyThreadList.tsx` to use the `EmptyState` component with a "Start a Conversation" action that triggers thread creation. The exact implementation depends on the current file contents — use the `EmptyState` component from `../ui_primitives/EmptyState` with:
- `variant="empty"`
- `title="No conversations yet"`
- `description="Start a conversation to explore AI workflows with natural language."`
- `actionText="New Conversation"`
- `onAction` callback that creates a new thread

- [ ] **Step 3: Run typecheck**

Run: `cd /Users/mg/workspace/nodetool && make typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/components/chat/thread/EmptyThreadList.tsx
git commit -m "polish: add 'New Conversation' action to empty thread list"
```

---

## Final Verification

### Task 9: Full Check

- [ ] **Step 1: Run full check suite**

Run: `cd /Users/mg/workspace/nodetool && make check`
Expected: All typecheck, lint, and test passes

- [ ] **Step 2: Visual smoke test**

Run: `cd /Users/mg/workspace/nodetool && make dev`
Verify these scenarios:
1. App loads with branded spinner and "Loading NodeTool..." text
2. Node menu search with no results shows "No matching nodes" empty state
3. Node menu search shows result count ("12 nodes")
4. Active filters show "Filtered" badge
5. Mode pill hover/active states look correct (no white flash on dark theme)
6. Disabled App button is clearly distinguishable
7. Notifications auto-dismiss based on content length (short = fast, long = slow)

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -A && git commit -m "polish: final cleanup for onboarding improvements"
```
