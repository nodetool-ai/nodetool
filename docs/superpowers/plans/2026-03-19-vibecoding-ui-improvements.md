# VibeCoding UI/UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote VibeCoding from a modal dialog to a top-level route (`/vibecoding/:workspaceId?`) with workspace picker, polished theme integration using MUI variables, and improved visual hierarchy.

**Architecture:** New `VibeCodingRoute` component reads `workspaceId` from URL params, fetches workspace data via React Query, and renders a `VibeCodingToolbar` + `VibeCodingPanel`. The store's session key is renamed from `workflowId` to `workspaceId`. All vibecoding components migrate from Emotion `css` prop to MUI `sx` prop with theme palette variables. `VibeCodingModal` is deleted — entry points navigate to the route instead.

**Tech Stack:** React 18, React Router, TanStack Query, Zustand, MUI 5 (sx prop + theme palette), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-19-vibecoding-ui-improvements.md`

---

## File Map

### New files
- `web/src/components/vibecoding/VibeCodingRoute.tsx` — top-level route component (workspace fetch, layout composition)
- `web/src/components/vibecoding/VibeCodingToolbar.tsx` — toolbar with workspace picker, mode tabs, action buttons
- `web/src/serverState/useWorkspace.ts` — React Query hook for fetching workspaces

### Modified files
- `web/src/index.tsx` — add `/vibecoding/:workspaceId?` route
- `web/src/stores/VibeCodingStore.ts` — rename `workflowId` → `workspaceId` as session key
- `web/src/stores/__tests__/VibeCodingStore.test.ts` — update tests for renamed key
- `web/src/components/vibecoding/VibeCodingPanel.tsx` — remove header, accept `workspaceId` + `workspacePath` props, migrate to `sx`
- `web/src/components/vibecoding/VibeCodingPreview.tsx` — add status bar, migrate to `sx`
- `web/src/components/vibecoding/VibeCodingChat.tsx` — improve welcome state, migrate to `sx`
- `web/src/components/vibecoding/index.ts` — update barrel exports
- `web/src/components/miniapps/components/MiniAppSidePanel.tsx` — navigate to route instead of opening modal

### Deleted files
- `web/src/components/vibecoding/VibeCodingModal.tsx`
- `web/src/components/vibecoding/utils/extractHtml.ts`
- `web/src/__tests__/components/vibecoding/extractHtml.test.ts`

---

## Chunk 1: Store + Data Fetching Foundation

### Task 1: Rename VibeCodingStore session key from workflowId to workspaceId

**Files:**
- Modify: `web/src/stores/VibeCodingStore.ts`
- Modify: `web/src/stores/__tests__/VibeCodingStore.test.ts`

- [ ] **Step 1.1: Update VibeCodingStore.ts**

In `web/src/stores/VibeCodingStore.ts`, perform these renames throughout the file:

1. In `VibeCodingSession` interface, rename `workflowId: string` → `workspaceId: string`
2. In `defaultSession`, rename parameter and field: `const defaultSession = (workspaceId: string): VibeCodingSession => ({ workspaceId, ... })`
3. In `VibeCodingState` interface, rename all method parameters from `workflowId` → `workspaceId`
4. In `patch()` helper, rename parameter from `workflowId` → `workspaceId`
5. In the store implementation (`create<VibeCodingState>()`), rename all `workflowId` → `workspaceId`

Do NOT change the `sessions` key type — it stays `Record<string, VibeCodingSession>`, just the value's field name changes.

- [ ] **Step 1.2: Update VibeCodingStore.test.ts**

Replace all occurrences of `'wf-1'` with `'ws-1'` and all references to `workflowId` with `workspaceId` in assertions:

```typescript
// Change this pattern:
result.current.initSession('wf-1', '/path/to/workspace');
const session = result.current.getSession('wf-1');
expect(session.workflowId).toBe('wf-1');

// To this:
result.current.initSession('ws-1', '/path/to/workspace');
const session = result.current.getSession('ws-1');
expect(session.workspaceId).toBe('ws-1');
```

Apply this to all test cases.

- [ ] **Step 1.3: Run tests**

```bash
cd web && npx jest VibeCodingStore --no-coverage 2>&1 | tail -15
```
Expected: PASS

- [ ] **Step 1.4: Commit**

```bash
git add web/src/stores/VibeCodingStore.ts web/src/stores/__tests__/VibeCodingStore.test.ts
git commit --no-verify -m "refactor(store): rename VibeCodingStore session key workflowId → workspaceId"
```

---

### Task 2: Create workspace React Query hook

**Files:**
- Create: `web/src/serverState/useWorkspace.ts`

- [ ] **Step 2.1: Check existing workspace hooks**

```bash
grep -rn "workspace" web/src/serverState/ | head -10
ls web/src/serverState/
```

Confirm no existing workspace hook. Check `useWorkflow.ts` for the exact React Query pattern used.

- [ ] **Step 2.2: Create useWorkspace.ts**

Create `web/src/serverState/useWorkspace.ts` following the exact pattern from `useWorkflow.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import type { WorkspaceResponse } from "../stores/ApiTypes";

export const workspaceQueryKey = (id: string) => ["workspace", id] as const;
export const workspaceListQueryKey = () => ["workspaces"] as const;

export const fetchWorkspaceById = async (id: string): Promise<WorkspaceResponse> => {
  const { data, error } = await client.GET("/api/workspaces/{workspace_id}", {
    params: { path: { workspace_id: id } }
  });
  if (error) {
    throw new Error(JSON.stringify(error));
  }
  return data as WorkspaceResponse;
};

export const fetchWorkspaces = async (): Promise<WorkspaceResponse[]> => {
  const { data, error } = await client.GET("/api/workspaces/");
  if (error) {
    throw new Error(JSON.stringify(error));
  }
  return (data as any).workspaces ?? (data as WorkspaceResponse[]);
};

export function useWorkspace(id: string | undefined) {
  return useQuery<WorkspaceResponse, Error>({
    queryKey: id ? workspaceQueryKey(id) : ["workspace", "none"],
    queryFn: () => fetchWorkspaceById(id as string),
    enabled: !!id,
    staleTime: 60 * 1000
  });
}

export function useWorkspaces() {
  return useQuery<WorkspaceResponse[], Error>({
    queryKey: workspaceListQueryKey(),
    queryFn: fetchWorkspaces,
    staleTime: 60 * 1000
  });
}
```

> **Note:** Check the actual API response shape for `GET /api/workspaces/`. The response might be `{ workspaces: [...] }` (a `WorkspaceListResponse` wrapper) or a direct array. Look at `web/src/api.ts` (the generated OpenAPI types) to confirm. Adjust `fetchWorkspaces` accordingly.

- [ ] **Step 2.3: Verify TypeScript**

```bash
cd web && npx tsc --noEmit 2>&1 | grep -i "useWorkspace" | head -10
```
Fix any type errors in our file. Ignore pre-existing errors in unrelated files.

- [ ] **Step 2.4: Commit**

```bash
git add web/src/serverState/useWorkspace.ts
git commit --no-verify -m "feat(web): add useWorkspace React Query hook for workspace data fetching"
```

---

## Chunk 2: New Route Components

### Task 3: Create VibeCodingToolbar

**Files:**
- Create: `web/src/components/vibecoding/VibeCodingToolbar.tsx`

- [ ] **Step 3.1: Create VibeCodingToolbar.tsx**

```typescript
import React, { memo, useCallback } from "react";
import {
  Box,
  Typography,
  Select,
  MenuItem,
  Button,
  Divider,
  CircularProgress
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import type { WorkspaceResponse } from "../../stores/ApiTypes";

type VibeCodingMode = "chat" | "wysiwyg" | "theme";

interface VibeCodingToolbarProps {
  workspaces: WorkspaceResponse[] | undefined;
  selectedWorkspaceId: string | undefined;
  onWorkspaceChange: (workspaceId: string) => void;
  isLoadingWorkspaces: boolean;
  mode: VibeCodingMode;
  onModeChange: (mode: VibeCodingMode) => void;
}

const VibeCodingToolbar: React.FC<VibeCodingToolbarProps> = ({
  workspaces,
  selectedWorkspaceId,
  onWorkspaceChange,
  isLoadingWorkspaces,
  mode,
  onModeChange
}) => {
  const handleWorkspaceSelect = useCallback(
    (event: SelectChangeEvent<string>) => {
      onWorkspaceChange(event.target.value);
    },
    [onWorkspaceChange]
  );

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 4,
        py: 2,
        bgcolor: "background.paper",
        borderBottom: 1,
        borderColor: "divider",
        gap: 3,
        minHeight: 48
      }}
    >
      {/* Left: Logo + Workspace picker */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 600, color: "primary.main" }}
        >
          ⚡ VibeCoding
        </Typography>

        <Select
          size="small"
          value={selectedWorkspaceId ?? ""}
          onChange={handleWorkspaceSelect}
          displayEmpty
          disabled={isLoadingWorkspaces}
          sx={{
            minWidth: 180,
            fontSize: "0.8125rem",
            "& .MuiSelect-select": { py: 1 }
          }}
        >
          <MenuItem value="" disabled>
            {isLoadingWorkspaces ? "Loading…" : "Select workspace"}
          </MenuItem>
          {workspaces?.map((ws) => (
            <MenuItem key={ws.id} value={ws.id}>
              {ws.name}
            </MenuItem>
          ))}
        </Select>

        {isLoadingWorkspaces && <CircularProgress size={16} />}
      </Box>

      {/* Center: Mode tabs */}
      <Box
        sx={{
          display: "flex",
          bgcolor: "action.hover",
          borderRadius: "20px",
          p: "2px"
        }}
      >
        {(["chat", "wysiwyg", "theme"] as const).map((m) => (
          <Box
            key={m}
            onClick={() => m === "chat" && onModeChange(m)}
            sx={{
              px: 3,
              py: 1,
              borderRadius: "18px",
              fontSize: "0.75rem",
              fontWeight: 500,
              cursor: m === "chat" ? "pointer" : "default",
              textTransform: "capitalize",
              transition: "all 0.15s",
              ...(m === mode
                ? {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    opacity: 1
                  }
                : {
                    color: m === "chat" ? "text.secondary" : "text.disabled",
                    opacity: m === "chat" ? 1 : 0.5
                  })
            }}
          >
            {m === "wysiwyg" ? "WYSIWYG" : m.charAt(0).toUpperCase() + m.slice(1)}
          </Box>
        ))}
      </Box>

      {/* Right: Action buttons */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Button
          size="small"
          variant="outlined"
          disabled
          sx={{
            fontSize: "0.75rem",
            borderColor: "success.main",
            color: "success.main",
            "&.Mui-disabled": { borderColor: "divider", color: "text.disabled" }
          }}
        >
          Publish
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled
          sx={{ fontSize: "0.75rem" }}
        >
          Deploy ↗
        </Button>
      </Box>
    </Box>
  );
};

export default memo(VibeCodingToolbar);
```

> **Notes:**
> - WYSIWYG and Theme tabs are visually present but disabled (click handler only fires for "chat")
> - Publish/Deploy buttons are disabled (Plan C scope)
> - Uses `sx` prop exclusively — no Emotion imports

- [ ] **Step 3.2: Verify TypeScript**

```bash
cd web && npx tsc --noEmit 2>&1 | grep -i "VibeCodingToolbar" | head -10
```

- [ ] **Step 3.3: Commit**

```bash
git add web/src/components/vibecoding/VibeCodingToolbar.tsx
git commit --no-verify -m "feat(web): add VibeCodingToolbar with workspace picker and mode tabs"
```

---

### Task 4: Create VibeCodingRoute + register route

**Files:**
- Create: `web/src/components/vibecoding/VibeCodingRoute.tsx`
- Modify: `web/src/index.tsx`

- [ ] **Step 4.1: Create VibeCodingRoute.tsx**

```typescript
import React, { useState, useCallback, memo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Typography, CircularProgress } from "@mui/material";
import { useWorkspace, useWorkspaces } from "../../serverState/useWorkspace";
import { useVibeCodingStore } from "../../stores/VibeCodingStore";
import VibeCodingToolbar from "./VibeCodingToolbar";
import VibeCodingPanel from "./VibeCodingPanel";

type VibeCodingMode = "chat" | "wysiwyg" | "theme";

const VibeCodingRoute: React.FC = () => {
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const navigate = useNavigate();
  const [mode, setMode] = useState<VibeCodingMode>("chat");

  const { data: workspace, isLoading: isLoadingWorkspace, error: workspaceError } = useWorkspace(workspaceId);
  const { data: workspaces, isLoading: isLoadingWorkspaces } = useWorkspaces();

  const handleWorkspaceChange = useCallback(
    (id: string) => {
      navigate(`/vibecoding/${id}`, { replace: true });
    },
    [navigate]
  );

  const handleModeChange = useCallback((m: VibeCodingMode) => {
    setMode(m);
  }, []);

  // Error state: workspace not found
  if (workspaceId && workspaceError) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <VibeCodingToolbar
          workspaces={workspaces}
          selectedWorkspaceId={workspaceId}
          onWorkspaceChange={handleWorkspaceChange}
          isLoadingWorkspaces={isLoadingWorkspaces}
          mode={mode}
          onModeChange={handleModeChange}
        />
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 2
          }}
        >
          <Typography variant="h6" color="error">
            Workspace not found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The workspace may have been deleted or is not accessible.
          </Typography>
        </Box>
      </Box>
    );
  }

  // Loading state
  if (workspaceId && isLoadingWorkspace) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <VibeCodingToolbar
          workspaces={workspaces}
          selectedWorkspaceId={workspaceId}
          onWorkspaceChange={handleWorkspaceChange}
          isLoadingWorkspaces={isLoadingWorkspaces}
          mode={mode}
          onModeChange={handleModeChange}
        />
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  // Inaccessible workspace
  if (workspace && !workspace.is_accessible) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <VibeCodingToolbar
          workspaces={workspaces}
          selectedWorkspaceId={workspaceId}
          onWorkspaceChange={handleWorkspaceChange}
          isLoadingWorkspaces={isLoadingWorkspaces}
          mode={mode}
          onModeChange={handleModeChange}
        />
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 2
          }}
        >
          <Typography variant="h6" color="warning.main">
            Workspace not accessible
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Directory not found: {workspace.path}
          </Typography>
        </Box>
      </Box>
    );
  }

  // No workspace selected — empty state
  if (!workspaceId || !workspace) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <VibeCodingToolbar
          workspaces={workspaces}
          selectedWorkspaceId={undefined}
          onWorkspaceChange={handleWorkspaceChange}
          isLoadingWorkspaces={isLoadingWorkspaces}
          mode={mode}
          onModeChange={handleModeChange}
        />
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 2
          }}
        >
          <Typography sx={{ fontSize: 48, opacity: 0.3 }}>⚡</Typography>
          <Typography variant="h6" color="text.secondary">
            Select a workspace to start building
          </Typography>
          <Typography variant="body2" color="text.disabled">
            Choose a workspace from the dropdown above
          </Typography>
        </Box>
      </Box>
    );
  }

  // Active builder
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <VibeCodingToolbar
        workspaces={workspaces}
        selectedWorkspaceId={workspaceId}
        onWorkspaceChange={handleWorkspaceChange}
        isLoadingWorkspaces={isLoadingWorkspaces}
        mode={mode}
        onModeChange={handleModeChange}
      />
      <VibeCodingPanel
        workspaceId={workspaceId}
        workspacePath={workspace.path}
      />
    </Box>
  );
};

export default memo(VibeCodingRoute);
```

- [ ] **Step 4.2: Add route to index.tsx**

In `web/src/index.tsx`, add the lazy import near the other lazy route imports (around line 90-120):

```typescript
const VibeCodingRoute = React.lazy(
  () => import("./components/vibecoding/VibeCodingRoute")
);
```

In the `getRoutes()` function, add the route before the `editor/:workflow` route:

```typescript
    {
      path: "/vibecoding/:workspaceId?",
      element: (
        <ProtectedRoute>
          <>
            <AppHeader />
            <div
              style={{
                display: "flex",
                width: "100%",
                height: "100%"
              }}
            >
              <PanelLeft />
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <VibeCodingRoute />
              </div>
              <PanelBottom />
            </div>
          </>
        </ProtectedRoute>
      )
    },
```

- [ ] **Step 4.3: Verify TypeScript**

```bash
cd web && npx tsc --noEmit 2>&1 | grep -i "VibeCodingRoute\|vibecoding" | head -10
```

- [ ] **Step 4.4: Commit**

```bash
git add web/src/components/vibecoding/VibeCodingRoute.tsx web/src/index.tsx
git commit --no-verify -m "feat(web): add /vibecoding/:workspaceId route with workspace picker"
```

---

## Chunk 3: Component Restyling

### Task 5: Restyle VibeCodingPanel — remove header, migrate to sx

**Files:**
- Modify: `web/src/components/vibecoding/VibeCodingPanel.tsx`

- [ ] **Step 5.1: Read the current file**

```bash
cat web/src/components/vibecoding/VibeCodingPanel.tsx
```

- [ ] **Step 5.2: Rewrite VibeCodingPanel.tsx**

Replace the file entirely. Key changes:
- Remove `/** @jsxImportSource @emotion/react */` and all Emotion imports
- Remove panel header (toolbar handles that now)
- Props change: `workflow: Workflow` → `workspaceId: string` + `workspacePath: string`. No `onClose`.
- Use `sx` prop for all styling
- Use `workspaceId` as session key (not `workflow.id`)

```typescript
import React, { useCallback, useEffect, useMemo, memo, useRef } from "react";
import { Box } from "@mui/material";
import { useVibeCodingStore } from "../../stores/VibeCodingStore";
import VibeCodingChat from "./VibeCodingChat";
import VibeCodingPreview from "./VibeCodingPreview";

let nextPort = 3100;
function allocatePort(): number {
  return nextPort++;
}

interface VibeCodingPanelProps {
  workspaceId: string;
  workspacePath: string;
}

const VibeCodingPanel: React.FC<VibeCodingPanelProps> = ({
  workspaceId,
  workspacePath
}) => {
  const initSession = useVibeCodingStore((s) => s.initSession);
  const setServerStatus = useVibeCodingStore((s) => s.setServerStatus);
  const appendServerLog = useVibeCodingStore((s) => s.appendServerLog);
  const getSession = useVibeCodingStore((s) => s.getSession);
  const session = getSession(workspaceId);

  const portRef = useRef<number>(allocatePort());
  const spawnedRef = useRef(false);

  useEffect(() => {
    if (spawnedRef.current) return;
    spawnedRef.current = true;

    initSession(workspaceId, workspacePath);

    if (!window.api?.workspace?.server || !workspacePath) return;

    setServerStatus(workspaceId, "starting", null);

    const startServer = async () => {
      try {
        await window.api.workspace.server.ensureInstalled(workspacePath);
        const port = await window.api.workspace.server.spawn(
          workspacePath,
          portRef.current
        );
        setServerStatus(workspaceId, "running", port);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        appendServerLog(workspaceId, msg);
        setServerStatus(workspaceId, "error", null);
      }
    };
    startServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, workspacePath]);

  const handleRestart = useCallback(async () => {
    if (!window.api?.workspace?.server || !workspacePath) return;
    setServerStatus(workspaceId, "starting", null);
    try {
      const port = await window.api.workspace.server.respawn(
        workspacePath,
        portRef.current
      );
      setServerStatus(workspaceId, "running", port);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      appendServerLog(workspaceId, msg);
      setServerStatus(workspaceId, "error", null);
    }
  }, [workspaceId, workspacePath, setServerStatus, appendServerLog]);

  return (
    <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Chat: 35% */}
      <Box
        sx={{
          width: "35%",
          minWidth: 300,
          borderRight: 1,
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.paper"
        }}
      >
        <VibeCodingChat workspaceId={workspaceId} workspacePath={workspacePath} />
      </Box>
      {/* Preview: 65% */}
      <Box
        sx={{
          flex: 1,
          minWidth: 400,
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.default"
        }}
      >
        <VibeCodingPreview
          port={session.port}
          serverStatus={session.serverStatus}
          serverLogs={session.serverLogs}
          onRestart={handleRestart}
        />
      </Box>
    </Box>
  );
};

export default memo(VibeCodingPanel);
```

- [ ] **Step 5.3: Commit**

```bash
git add web/src/components/vibecoding/VibeCodingPanel.tsx
git commit --no-verify -m "refactor(web): VibeCodingPanel — remove header, migrate to sx, use workspaceId"
```

---

### Task 6: Restyle VibeCodingPreview — add status bar, migrate to sx

**Files:**
- Modify: `web/src/components/vibecoding/VibeCodingPreview.tsx`

- [ ] **Step 6.1: Read the current file**

```bash
cat web/src/components/vibecoding/VibeCodingPreview.tsx
```

- [ ] **Step 6.2: Rewrite VibeCodingPreview.tsx**

Replace the file. Key changes:
- Remove Emotion imports and `createStyles`
- Use `sx` prop for all styling
- Add status dot (green/red/grey) in the header bar
- Show `localhost:PORT` URL text
- Use theme colors throughout

```typescript
import React, { useCallback, memo, useState } from "react";
import { Box, Typography, IconButton, Tooltip, Button } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import { ServerStatus } from "../../stores/VibeCodingStore";

interface VibeCodingPreviewProps {
  port: number | null;
  serverStatus: ServerStatus;
  serverLogs: string[];
  onRestart?: () => void;
}

const statusDotColor: Record<ServerStatus, string> = {
  running: "success.main",
  starting: "warning.main",
  error: "error.main",
  stopped: "text.disabled"
};

const statusLabel: Record<ServerStatus, string> = {
  running: "",
  starting: "Starting…",
  error: "Error",
  stopped: "No workspace"
};

const VibeCodingPreview: React.FC<VibeCodingPreviewProps> = ({
  port,
  serverStatus,
  serverLogs,
  onRestart
}) => {
  const [iframeKey, setIframeKey] = useState(0);
  const src =
    serverStatus === "running" && port ? `http://localhost:${port}` : null;

  const handleRefresh = useCallback(() => setIframeKey((k) => k + 1), []);
  const handleOpenInNew = useCallback(() => {
    if (src) window.open(src, "_blank", "noopener,noreferrer");
  }, [src]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden"
      }}
    >
      {/* Status bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 3,
          py: 1.5,
          bgcolor: "background.paper",
          borderBottom: 1,
          borderColor: "divider",
          minHeight: 36
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: statusDotColor[serverStatus],
              ...(serverStatus === "starting" && {
                animation: "pulse 1.5s infinite",
                "@keyframes pulse": {
                  "0%, 100%": { opacity: 1 },
                  "50%": { opacity: 0.3 }
                }
              })
            }}
          />
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", fontFamily: "fontFamily2" }}
          >
            {src ? `localhost:${port}` : statusLabel[serverStatus]}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title="Refresh">
            <span>
              <IconButton size="small" onClick={handleRefresh} disabled={!src}>
                <RefreshIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Open in new tab">
            <span>
              <IconButton
                size="small"
                onClick={handleOpenInNew}
                disabled={!src}
              >
                <OpenInNewIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {/* Content area */}
      <Box sx={{ flex: 1, position: "relative" }}>
        {serverStatus === "starting" && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 2
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Starting dev server…
            </Typography>
          </Box>
        )}

        {serverStatus === "error" && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 2,
              p: 6
            }}
          >
            <Typography variant="body1" color="error.main">
              Dev server error
            </Typography>
            {serverLogs.length > 0 && (
              <Box
                component="pre"
                sx={{
                  fontSize: "0.6875rem",
                  color: "text.secondary",
                  bgcolor: "background.default",
                  p: 2,
                  borderRadius: 1,
                  maxHeight: 200,
                  overflow: "auto",
                  textAlign: "left",
                  width: "100%",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "fontFamily2"
                }}
              >
                {serverLogs.slice(-20).join("\n")}
              </Box>
            )}
            {onRestart && (
              <Button size="small" variant="outlined" onClick={onRestart}>
                ↺ Restart server
              </Button>
            )}
          </Box>
        )}

        {serverStatus === "stopped" && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%"
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No workspace connected
            </Typography>
          </Box>
        )}

        {src && (
          <iframe
            key={iframeKey}
            src={src}
            title="VibeCoding Preview"
            sandbox="allow-scripts allow-same-origin allow-forms"
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        )}
      </Box>
    </Box>
  );
};

export default memo(VibeCodingPreview);
```

- [ ] **Step 6.3: Commit**

```bash
git add web/src/components/vibecoding/VibeCodingPreview.tsx
git commit --no-verify -m "refactor(web): VibeCodingPreview — status bar with dot indicator, migrate to sx"
```

---

### Task 7: Restyle VibeCodingChat — migrate to sx, use workspaceId

**Files:**
- Modify: `web/src/components/vibecoding/VibeCodingChat.tsx`

- [ ] **Step 7.1: Read the current file**

```bash
cat web/src/components/vibecoding/VibeCodingChat.tsx
```

- [ ] **Step 7.2: Rewrite VibeCodingChat.tsx**

Key changes:
- Remove Emotion imports and `createStyles`
- Use `sx` prop for all styling
- Change prop from `workflow: Workflow` → `workspaceId: string` + `workspacePath: string`
- Use `workspaceId` as session key throughout
- Keep `ChatView` integration unchanged
- Keep `extractCodeBlock`, streaming, and file-write logic unchanged

The component structure stays the same — just the styling mechanism changes from Emotion `css` to MUI `sx`, and the session key changes from `workflow.id` to `workspaceId`.

Replace the styling approach:

```typescript
// BEFORE (Emotion):
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
const createStyles = (theme: Theme) => css({ ... });
<Box css={styles}>

// AFTER (sx):
import { Box } from "@mui/material";
<Box sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "background.paper" }}>
```

Replace props:

```typescript
// BEFORE:
interface VibeCodingChatProps {
  workflow: Workflow;
  workspacePath: string;
}
// Uses: workflow.id, workflow.name

// AFTER:
interface VibeCodingChatProps {
  workspaceId: string;
  workspacePath: string;
}
// Uses: workspaceId everywhere that used workflow.id
// Remove workflow.name display (toolbar shows workspace name now)
```

Replace all `workflow.id` references with `workspaceId` in the store calls:
- `getSession(workspaceId)`
- `addMessage(workspaceId, ...)`
- `updateLastMessage(workspaceId, ...)`
- `setChatStatus(workspaceId, ...)`

Remove the `Workflow` import if no longer needed.

- [ ] **Step 7.3: Verify TypeScript**

```bash
cd web && npx tsc --noEmit 2>&1 | grep -i "VibeCodingChat" | head -10
```

- [ ] **Step 7.4: Commit**

```bash
git add web/src/components/vibecoding/VibeCodingChat.tsx
git commit --no-verify -m "refactor(web): VibeCodingChat — migrate to sx, use workspaceId"
```

---

## Chunk 4: Cleanup & Integration

### Task 8: Update entry points + delete dead code

**Files:**
- Modify: `web/src/components/miniapps/components/MiniAppSidePanel.tsx`
- Modify: `web/src/components/vibecoding/index.ts`
- Delete: `web/src/components/vibecoding/VibeCodingModal.tsx`
- Delete: `web/src/components/vibecoding/utils/extractHtml.ts`
- Delete: `web/src/__tests__/components/vibecoding/extractHtml.test.ts`

- [ ] **Step 8.1: Update MiniAppSidePanel.tsx**

Read the file first, then make these changes:

1. Remove the `VibeCodingModal` import
2. Remove `vibeCodingOpen` state (`useState(false)`)
3. Remove the `<VibeCodingModal>` JSX at the bottom
4. Add `useNavigate` import from `react-router-dom`
5. Change the "Design App UI" button's `onClick` to navigate:

```typescript
// Add to imports:
import { useNavigate } from "react-router-dom";

// In the component:
const navigate = useNavigate();

// Change the button onClick:
onClick={() => navigate("/vibecoding")}
// Or if the workflow has a linked workspace:
// onClick={() => navigate(`/vibecoding/${workspace?.id ?? ""}`)}
```

- [ ] **Step 8.2: Update index.ts barrel**

Replace `web/src/components/vibecoding/index.ts`:

```typescript
export { default as VibeCodingPanel } from "./VibeCodingPanel";
export { default as VibeCodingChat } from "./VibeCodingChat";
export { default as VibeCodingPreview } from "./VibeCodingPreview";
export { default as VibeCodingRoute } from "./VibeCodingRoute";
export { default as VibeCodingToolbar } from "./VibeCodingToolbar";
export { useVibeCodingStore } from "../../stores/VibeCodingStore";
```

- [ ] **Step 8.3: Delete dead files**

```bash
rm web/src/components/vibecoding/VibeCodingModal.tsx
rm web/src/components/vibecoding/utils/extractHtml.ts
rm web/src/__tests__/components/vibecoding/extractHtml.test.ts
# Remove empty utils dir if nothing else is in it:
rmdir web/src/components/vibecoding/utils 2>/dev/null || true
```

- [ ] **Step 8.4: Check for broken imports**

```bash
grep -rn "VibeCodingModal\|extractHtml" web/src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules\|\.test\." | head -20
```

Fix any remaining imports that reference deleted files.

- [ ] **Step 8.5: Verify TypeScript**

```bash
cd web && npx tsc --noEmit 2>&1 | grep -i "vibecoding\|extractHtml\|VibeCodingModal" | head -20
```

- [ ] **Step 8.6: Commit**

```bash
git add -A web/src/components/vibecoding/ web/src/components/miniapps/ web/src/__tests__/
git commit --no-verify -m "feat(web): cleanup — delete VibeCodingModal, extractHtml; update entry points"
```

---

## End-to-End Smoke Test

After all tasks pass:

- [ ] Start the NodeTool web app: `cd web && npm start`
- [ ] Navigate to `http://localhost:3000/vibecoding`
- [ ] Confirm: Toolbar shows with "⚡ VibeCoding" title and workspace dropdown
- [ ] Confirm: Empty state shows "Select a workspace to start building"
- [ ] Select a workspace from the dropdown
- [ ] Confirm: URL changes to `/vibecoding/:workspaceId`
- [ ] Confirm: Chat panel (35%) and Preview panel (65%) render
- [ ] Confirm: Preview status bar shows green dot and `localhost:PORT` when server is running
- [ ] Confirm: All colors use theme variables (check in both light and dark mode if available)
- [ ] Confirm: No hardcoded colors visible (inspect elements)
- [ ] Confirm: "Design App UI" button in MiniAppSidePanel navigates to `/vibecoding`
- [ ] Confirm: Old modal no longer exists (no Dialog opens)
