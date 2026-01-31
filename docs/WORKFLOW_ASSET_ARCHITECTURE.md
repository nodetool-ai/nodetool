# Workflow Asset Panel and Node Result History Architecture

## Overview

This document describes the architecture for two new features:
1. **Workflow Asset Panel**: Displays assets scoped to the current workflow
2. **Node Result History**: Accumulates and displays node execution results across multiple workflow runs

## Current State

### Asset Management
- **AssetStore**: Manages CRUD operations for assets with folder tree navigation
- **useAssets Hook**: Loads assets by `parent_id` (folder-based navigation)
- **AssetGridStore**: Manages UI state (current folder, selection, filters)
- **API Support**: `/api/assets/` endpoint supports filtering by `parent_id`, `content_type`, and `workflow_id`
- **Asset Model**: Includes optional `workflow_id`, `node_id`, and `job_id` fields for association

### Workflow Execution & Results
- **WorkflowRunner**: Manages workflow execution via WebSocket, clears all results on every run
- **ResultsStore**: Stores node execution results keyed by `workflowId:nodeId`
- **workflowUpdates.ts**: Central reducer handling all WebSocket message types
- **node_update messages**: Contain `node_id`, `status`, `result`, and optional `error`
- **Result Clearing**: `clearResults()` called in `WorkflowRunner.run()` before each execution

### WebSocket Message Flow
```
WebSocket → globalWebSocketManager 
  → subscribeToWorkflowUpdates (by workflow_id)
  → handleUpdate (workflowUpdates.ts)
  → ResultsStore.setResult() / StatusStore / ErrorStore
```

## New Architecture

### 1. Workflow Asset Panel

#### Purpose
Display assets that are associated with the current workflow, separate from the global asset browser.

#### Data Flow
```
User opens workflow
  → WorkflowAssetStore loads assets filtered by workflow_id
  → useWorkflowAssets hook fetches from /api/assets/?workflow_id={id}
  → WorkflowAssetPanel component displays results
```

#### New Components

**WorkflowAssetStore**
```typescript
// web/src/stores/WorkflowAssetStore.ts
interface WorkflowAssetStore {
  assetsByWorkflow: Record<string, Asset[]>;
  loadWorkflowAssets: (workflowId: string) => Promise<Asset[]>;
  clearWorkflowAssets: (workflowId: string) => void;
  isLoading: boolean;
  error: Error | null;
}
```

**useWorkflowAssets Hook**
```typescript
// web/src/serverState/useWorkflowAssets.ts
export const useWorkflowAssets = (workflowId: string) => {
  return useQuery({
    queryKey: ['assets', { workflow_id: workflowId }],
    queryFn: () => fetchAssetsByWorkflow(workflowId),
    enabled: !!workflowId
  });
};
```

**WorkflowAssetPanel Component**
- Location: `web/src/components/assets/panels/WorkflowAssetPanel.tsx`
- Uses: `useWorkflowAssets` to load workflow-scoped assets
- Displays: Grid/list view of assets with filters
- Integration: Added to workflow editor's panel system

#### Integration Points
- **PanelStore**: Add new panel type `WORKFLOW_ASSETS`
- **Asset Upload**: When uploading in workflow context, set `workflow_id`
- **Query Cache**: Use TanStack Query with workflow-specific keys

### 2. Node Result History

#### Purpose
Accumulate node execution results across multiple runs within a session, allowing users to view the full history of node outputs.

#### Current Problem
`ResultsStore.clearResults()` is called on every workflow run, erasing all previous results.

#### Solution Strategy

**A. Session-Based Result Accumulation**

Create a separate store for historical results that persists across runs:

```typescript
// web/src/stores/NodeResultHistoryStore.ts
interface NodeResultHistoryStore {
  // History keyed by workflowId:nodeId, contains array of timestamped results
  history: Record<string, HistoricalResult[]>;
  
  // Add result to history (called from workflowUpdates)
  addToHistory: (workflowId: string, nodeId: string, result: any) => void;
  
  // Get history for a node
  getHistory: (workflowId: string, nodeId: string) => HistoricalResult[];
  
  // Clear history for workflow
  clearHistory: (workflowId: string) => void;
  
  // Clear all history
  clearAllHistory: () => void;
}

interface HistoricalResult {
  result: any;
  timestamp: number;
  jobId: string | null;
  status: string;
}
```

**B. Modified Result Flow**

```
node_update message arrives
  ↓
handleUpdate() in workflowUpdates.ts
  ↓
├─→ ResultsStore.setResult()           (current run, cleared on next run)
└─→ NodeResultHistoryStore.addToHistory()  (accumulates across runs)
```

**C. Asset-Based History (API Approach)**

For persistent history beyond the session:
- Assets created during node execution have `node_id` and `job_id` set
- Query `/api/assets/?node_id={nodeId}` to get all assets for a node
- Display in history view with job context

#### New Components

**NodeResultHistoryStore**
```typescript
// web/src/stores/NodeResultHistoryStore.ts
- Stores array of results per node
- Timestamped entries with job_id
- Survives workflow reruns within session
- Cleared only on manual action or workflow close
```

**useNodeResultHistory Hook**
```typescript
// web/src/hooks/nodes/useNodeResultHistory.ts
export const useNodeResultHistory = (workflowId: string, nodeId: string) => {
  const sessionHistory = useNodeResultHistoryStore(
    state => state.getHistory(workflowId, nodeId)
  );
  
  // Optional: Fetch asset-based history from API
  const { data: assetHistory } = useQuery({
    queryKey: ['nodeAssets', nodeId],
    queryFn: () => fetchNodeAssets(nodeId),
    enabled: false // Loaded on demand
  });
  
  return { sessionHistory, assetHistory };
};
```

**fetchNodeAssets Helper**
```typescript
// web/src/serverState/useNodeAssets.ts
export const fetchNodeAssets = async (nodeId: string): Promise<Asset[]> => {
  const { data } = await client.GET('/api/assets/', {
    params: { query: { node_id: nodeId } }
  });
  return data?.assets || [];
};
```

**Node History UI**
- Location: `web/src/components/node/NodeHistoryPanel.tsx`
- Triggered by: "View Full History" button in node result view
- Displays: List of historical results with timestamps
- Shows: Session results + button to load persistent asset-based history

#### Integration Points

**Modified Files**
1. **workflowUpdates.ts**: Add call to `NodeResultHistoryStore.addToHistory()`
   ```typescript
   if (data.type === "node_update") {
     const update = data as NodeUpdate;
     // Existing code...
     if (update.result) {
       setResult(workflow.id, update.node_id, update.result);
       // NEW: Add to history
       addToHistory(workflow.id, update.node_id, {
         result: update.result,
         timestamp: Date.now(),
         jobId: runner.job_id,
         status: update.status
       });
     }
   }
   ```

2. **OutputRenderer.tsx**: Add "View History" button
3. **WorkflowRunner.ts**: Do NOT clear history on run (only clear ResultsStore)

**Clearing Behavior**
- **ResultsStore**: Cleared on every workflow run (preserves existing behavior for current run display)
- **NodeResultHistoryStore**: Cleared only when:
  - User explicitly clicks "Clear History"
  - Workflow is closed/switched
  - Session ends (browser refresh)

### 3. Store Architecture Patterns

#### Separation of Concerns

**Transient State (Current Run)**
- ResultsStore: Current execution results
- StatusStore: Current node statuses
- ProgressStore: Current progress indicators

**Persistent State (Session)**
- NodeResultHistoryStore: Historical results within session
- ExecutionTimeStore: Performance metrics

**Permanent State (Database)**
- Assets with node_id/job_id: Persistent output artifacts
- Workflow versions: Saved workflow states

#### TanStack Query Integration

**Query Keys Pattern**
```typescript
['assets', { parent_id: string }]          // Folder-scoped assets
['assets', { workflow_id: string }]        // Workflow-scoped assets  
['assets', { node_id: string }]            // Node-scoped assets
['nodeHistory', workflowId, nodeId]        // Session history
```

**Cache Invalidation**
```typescript
// On workflow asset upload
queryClient.invalidateQueries({
  queryKey: ['assets', { workflow_id: workflowId }]
});

// On node execution complete
queryClient.invalidateQueries({
  queryKey: ['assets', { node_id: nodeId }]
});
```

### 4. WebSocket & API Integration

#### Message Handling Flow

```
WebSocket Message (node_update)
  ↓
globalWebSocketManager
  ↓
subscribeToWorkflowUpdates(workflowId)
  ↓
handleUpdate(workflow, message, runnerStore)
  ↓
Switch on message.type
  ├─ "node_update" → Update current state + add to history
  ├─ "job_update" → Update job state + invalidate queries
  └─ Other types...
```

#### API Endpoints Used

| Endpoint | Query Params | Purpose |
|----------|--------------|---------|
| `GET /api/assets/` | `workflow_id` | Load workflow assets |
| `GET /api/assets/` | `node_id` | Load node history assets |
| `GET /api/assets/` | `job_id` | Load job-specific assets |
| `POST /api/assets/` | `workflow_id`, `node_id`, `job_id` | Create associated asset |

### 5. UI/UX Design

#### Workflow Asset Panel
- **Location**: New tab in left panel or bottom panel
- **Features**:
  - Grid/list view toggle
  - Search and filter
  - Upload button (auto-sets workflow_id)
  - Quick actions (download, delete, preview)
- **Empty State**: "No assets for this workflow yet"

#### Node History Panel
- **Trigger**: "View History" button in node output area
- **Layout**: Modal or side panel
- **Content**:
  - Session history (from NodeResultHistoryStore)
  - Timestamp, job_id, status for each result
  - "Load Persistent History" button (queries API)
  - Preview/expand for each result
- **Actions**: Clear history, export, compare results

### 6. Testing Strategy

#### Unit Tests
- `WorkflowAssetStore.test.ts`: Store operations
- `NodeResultHistoryStore.test.ts`: History accumulation
- `useWorkflowAssets.test.ts`: Hook behavior
- `useNodeResultHistory.test.ts`: History fetching

#### Integration Tests
- Verify history accumulates across multiple runs
- Verify ResultsStore clears but history persists
- Verify workflow asset filtering works
- Verify node asset API queries work

#### E2E Tests
- Create workflow, run multiple times, verify history
- Upload asset to workflow, verify it appears in panel
- Clear history, verify it's removed
- Switch workflows, verify context switches correctly

## Implementation Checklist

### Phase 1: API & Core Stores
- [x] Install latest nodetool-core
- [x] Regenerate api.ts from OpenAPI schema
- [ ] Create `WorkflowAssetStore.ts`
- [ ] Create `NodeResultHistoryStore.ts`
- [ ] Write unit tests for stores

### Phase 2: Hooks & API Integration
- [ ] Create `useWorkflowAssets.ts` hook
- [ ] Create `useNodeResultHistory.ts` hook
- [ ] Create `useNodeAssets.ts` helper
- [ ] Write unit tests for hooks

### Phase 3: UI Components
- [ ] Create `WorkflowAssetPanel.tsx`
- [ ] Create `NodeHistoryPanel.tsx`
- [ ] Add "View History" button to node output
- [ ] Integrate with panel system

### Phase 4: Integration
- [ ] Modify `workflowUpdates.ts` to call `addToHistory()`
- [ ] Update asset upload to set workflow_id in context
- [ ] Add panel navigation in workflow editor
- [ ] Write integration tests

### Phase 5: Testing & Polish
- [ ] Run unit tests
- [ ] Run integration tests
- [ ] Manual testing
- [ ] Code review
- [ ] Security check (CodeQL)

## Future Enhancements

1. **History Export**: Export node history as JSON/CSV
2. **Result Comparison**: Side-by-side comparison of historical results
3. **History Persistence**: Save history to localStorage or backend
4. **Job Context**: Link history entries to job panel for full context
5. **Asset Tagging**: Tag workflow assets for better organization
6. **History Search**: Search through historical results
7. **Performance**: Lazy load history, pagination for large datasets

## Conclusion

This architecture separates concerns cleanly:
- **Workflow Asset Panel**: Uses existing asset infrastructure with workflow_id filtering
- **Node Result History**: Adds session-based accumulation without disrupting current run display
- **Minimal Changes**: Uses existing WebSocket flow and TanStack Query patterns
- **Extensible**: Easy to add persistent history via asset API later

The design maintains backward compatibility while adding new features for workflow and node output management.
