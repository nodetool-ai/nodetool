# VibeCoding UI/UX Improvements

**Date:** 2026-03-19
**Status:** Approved
**Scope:** Promote VibeCoding from a modal dialog to a top-level route with workspace picker, polished theme integration, and improved visual hierarchy.

---

## Overview

The VibeCoding panel currently lives inside a MUI Dialog modal opened from MiniAppSidePanel. This design promotes it to a full top-level route (`/vibecoding/:workspaceId?`) with a compact single-row toolbar, workspace dropdown, and consistent use of the app's MUI theme variables throughout. The chat/preview split layout is preserved but refined.

---

## Section 1: Route & Navigation

### New Route

`/vibecoding/:workspaceId?` — a top-level route alongside `/editor`, `/chat`, `/apps`, `/dashboard`.

- Uses `AppHeader` (shared app header) + `PanelLeft` sidebar, same pattern as `/chat` and `/apps` routes.
- Lazy-loaded via `React.lazy` in `index.tsx`.
- If no `workspaceId` in URL params, the toolbar shows the workspace dropdown in "select" state and the content area shows an empty state prompting workspace selection.
- If `workspaceId` is present, the workspace is fetched from the API and the builder loads immediately.

### Data Fetching

`VibeCodingRoute` uses TanStack Query (React Query) to fetch workspace data, following the app's established pattern:

- **Workspace list** (for the dropdown): `useQuery({ queryKey: ["workspaces"], queryFn: () => client.GET("/api/workspaces/") })` — returns `WorkspaceListResponse`.
- **Single workspace** (when `workspaceId` is in URL): `useQuery({ queryKey: ["workspace", workspaceId], queryFn: () => client.GET("/api/workspaces/{workspace_id}", { params: { path: { workspace_id: workspaceId } } }) })` — returns `WorkspaceResponse`.
- If the workspace is not found (404), show an error state: "Workspace not found."
- If the workspace exists but `is_accessible` is `false` (directory deleted/unmounted), show: "Workspace directory not accessible" with the path.

### Session Key: workspaceId

The `VibeCodingStore` currently keys sessions by `workflowId`. This spec changes the session key to `workspaceId` — the route param. `VibeCodingRoute` calls `initSession(workspaceId, workspace.path)` using the workspace ID, not a workflow ID. The `VibeCodingSession.workflowId` field is renamed to `workspaceId` throughout.

This aligns with the system design spec (Section 2) which specifies `workspaceId` as the session identifier.

### Workspace Picker (Minimal)

A dropdown in the toolbar header listing available workspaces from the API. Selecting a workspace navigates to `/vibecoding/:workspaceId`. The dropdown shows `workspace.name` and uses `workspace.path` for the dev server.

### Entry Point Changes

- `MiniAppSidePanel.tsx`: "Design App UI" button navigates to `/vibecoding/:workspaceId` via `useNavigate()`. The `workspaceId` comes from the workflow's linked workspace — if the workflow has no linked workspace, the button navigates to `/vibecoding` (no ID) and the user picks from the dropdown.
- `VibeCodingModal.tsx`: Delete this file. All callers are updated to use `useNavigate()` instead. No backward-compatibility wrapper needed.

### Back Navigation

The `PanelLeft` sidebar is present on the route (same as other top-level routes), providing consistent navigation. No explicit "Back" button needed.

---

## Section 2: Layout & Styling

### Toolbar (Single Row)

```
[⚡ VibeCoding]  [Workspace: ▼ my-app]  |  [Chat | WYSIWYG | Theme]  |  [Publish] [Deploy ↗] [app.vercel.app]
```

- Background: `theme.palette.background.paper`
- Bottom border: `1px solid` using `theme.palette.divider`
- Mode tabs: Pill-style toggle group using `theme.palette.primary.main` at low opacity for the active state
- Publish button: Uses `theme.palette.success.main` accent (outline style)
- Deploy button: Uses `theme.palette.primary.main` (filled style)
- Vercel URL: Shown as a text link after first successful deploy
- WYSIWYG and Theme tabs are present but disabled (Plan B scope) — shown with `theme.palette.text.disabled` color

### Chat/Preview Split

- **35% chat / 65% preview** (slightly more room for preview than current 40/60)
- Chat section: `theme.palette.background.paper`
- Preview section: `theme.palette.background.default` (slightly darker for contrast)
- Divider: `1px solid` using `theme.palette.divider`
- Both sections use `min-width` constraints (chat: 300px, preview: 400px) to prevent collapse

### Preview Status Bar

A thin bar between the toolbar and the iframe:
- Left: Green status dot (`theme.palette.success.main`) + `localhost:PORT` text
- Right: Refresh button, open-in-new-tab button
- Starting state: Pulsing dot with "Starting…" text
- Error state: Red dot (`theme.palette.error.main`) with expandable log section
- Stopped state: Grey dot with "No workspace" text

---

## Section 3: Component Changes

### New Files

| File | Purpose |
|---|---|
| `web/src/components/vibecoding/VibeCodingRoute.tsx` | Top-level route component. Reads `workspaceId` from URL params, fetches workspace, renders toolbar + panel. |
| `web/src/components/vibecoding/VibeCodingToolbar.tsx` | Single-row toolbar: workspace dropdown, mode tabs (Chat/WYSIWYG/Theme), Publish/Deploy buttons. |

### Modified Files

| File | Changes |
|---|---|
| `web/src/index.tsx` | Add `/vibecoding/:workspaceId?` route with lazy-loaded `VibeCodingRoute` |
| `web/src/components/vibecoding/VibeCodingPanel.tsx` | Remove panel header (moved to toolbar). Receive workspace data from route context instead of props. Remove `onClose` prop. |
| `web/src/components/vibecoding/VibeCodingPreview.tsx` | Add status bar (green dot + URL). Replace Emotion `createStyles` with `sx` props. Use theme variables for all colors. |
| `web/src/components/vibecoding/VibeCodingChat.tsx` | Improve welcome state styling. Template chips use theme accent colors. Replace Emotion `createStyles` with `sx` props. |
| `web/src/components/miniapps/components/MiniAppSidePanel.tsx` | "Design App UI" button navigates to `/vibecoding/:workspaceId` via router. |
| `web/src/stores/VibeCodingStore.ts` | Rename `workflowId` to `workspaceId` as session key throughout. |

### Deleted Files

| File | Reason |
|---|---|
| `web/src/components/vibecoding/VibeCodingModal.tsx` | Replaced by route navigation — all callers updated |
| `web/src/components/vibecoding/utils/extractHtml.ts` | Orphaned dead code from HTML-blob system removal |
| `web/src/__tests__/components/vibecoding/extractHtml.test.ts` | Test for deleted file |

### Unchanged (Out of Scope)

- `ChatView` internals — kept as-is, wrapper improved
- Block components in `demo/` — no changes
- WYSIWYG/Theme modes — Plan B scope (toolbar tabs present but disabled)
- WorkspaceDevServer, IPC channels — no changes needed

---

## Section 4: Theme Integration

### Migration from Emotion to sx Props

All vibecoding components drop the `/** @jsxImportSource @emotion/react */` directive and `createStyles` pattern. Replace with MUI `sx` prop for layout and theme variable references for colors.

### Color Mapping

| Usage | Source |
|---|---|
| Backgrounds | `theme.palette.background.default`, `theme.palette.background.paper` |
| Borders | `theme.palette.divider` |
| Primary text | `theme.palette.text.primary` |
| Secondary text | `theme.palette.text.secondary` |
| Disabled text | `theme.palette.text.disabled` |
| Accent/active | `theme.palette.primary.main` |
| Success (green) | `theme.palette.success.main` |
| Error (red) | `theme.palette.error.main` |
| UI font | `theme.fontFamily1` in `sx` props, `var(--fontFamily1)` in plain CSS only |
| Code/log font | `theme.fontFamily2` in `sx` props, `var(--fontFamily2)` in plain CSS only |
| Spacing | `theme.spacing()` (base 4px) |
| Border radius | `theme.shape.borderRadius` (4px), `20px` for pill-style toggle groups |

### No Hardcoded Colors

Zero hardcoded hex/rgb values in vibecoding components. All colors flow from the MUI theme, ensuring automatic light/dark mode support.

---

## Implementation Scope Summary

### What Changes
- VibeCoding becomes a top-level route (`/vibecoding/:workspaceId?`)
- New toolbar component with workspace picker, mode tabs, action buttons
- All vibecoding components restyled with theme variables (no hardcoded colors)
- Emotion `css` prop replaced with MUI `sx` prop
- Modal entry point becomes a route navigation
- Dead code cleanup (extractHtml)

### What Doesn't Change
- WorkspaceDevServer, IPC channels — all untouched
- VibeCodingStore session shape — only the key rename (`workflowId` → `workspaceId`)
- ChatView component — used as-is
- Block components — no changes
- WYSIWYG/Theme functionality — deferred to Plan B (tabs visible but disabled)
