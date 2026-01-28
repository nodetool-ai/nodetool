# API to WebSocket Migration Analysis Report

This report analyzes the NodeTool frontend codebase to identify areas where REST API requests could be replaced with WebSocket-based push updates to reduce unnecessary data transmission and improve real-time responsiveness.

## Executive Summary

NodeTool already has a sophisticated WebSocket infrastructure (`GlobalWebSocketManager`) used for workflow execution updates, chat streaming, and model downloads. However, several resource types still rely on polling or on-demand API fetches that could benefit from WebSocket push notifications.

### Key Opportunities Identified:
1. **Asset updates** - Currently polled, could receive real-time updates
2. **Job status** - Mixed polling/websocket, could be fully websocket-based
3. **Workflow list changes** - Cache invalidation could be replaced with push
4. **Model cache status** - Polling for download status could be websocket-based
5. **Collection updates** - Currently fetched on-demand after mutations

---

## Current WebSocket Infrastructure

### GlobalWebSocketManager (`/web/src/lib/websocket/GlobalWebSocketManager.ts`)

The application already has a robust WebSocket infrastructure:

```typescript
// Singleton pattern with message routing by job_id, thread_id, or workflow_id
class GlobalWebSocketManager extends EventEmitter {
  subscribe(key: string, handler: MessageHandler): () => void
  send(message: any): Promise<void>
  ensureConnection(): Promise<void>
}
```

**Current message types handled via WebSocket:**
- `job_update` - Workflow execution status
- `node_update` - Individual node execution status
- `node_progress` - Progress updates for long-running nodes
- `output_update` - Node output results
- `preview_update` - Preview data for nodes
- `edge_update` - Edge status during execution
- `log_update` - Execution logs
- `tool_call_update` - Agent tool calls
- `planning_update` - Agent planning status
- `task_update` - Agent task updates
- `notification` - User notifications
- `prediction` - Model prediction updates

---

## Analysis of API Usage Patterns

### 1. Assets (`/web/src/stores/AssetStore.ts`, `/web/src/serverState/useAssets.ts`)

**Current Pattern:** REST API with TanStack Query caching

| Endpoint | Method | Trigger | Issue |
|----------|--------|---------|-------|
| `/api/assets/` | GET | Load folder contents | Refetched on folder navigation |
| `/api/assets/{id}` | GET | Get asset details | Individual fetches |
| `/api/assets/` | POST | Create asset | Requires manual cache invalidation |
| `/api/assets/{id}` | PUT | Update asset | Requires manual cache invalidation |
| `/api/assets/{id}` | DELETE | Delete asset | Requires manual cache invalidation |

**Problems:**
- When assets change (upload, rename, move, delete), all components with asset queries must manually invalidate caches
- Other users or tabs don't see asset changes in real-time
- File uploads require manual refetch after completion

**WebSocket Opportunity:**
```typescript
// Proposed message types
type AssetCreatedUpdate = { type: "asset_created"; asset: Asset }
type AssetUpdatedUpdate = { type: "asset_updated"; asset: Asset }
type AssetDeletedUpdate = { type: "asset_deleted"; asset_id: string }
type AssetMovedUpdate = { type: "asset_moved"; asset: Asset; old_parent_id: string }
```

**Impact:** HIGH - Assets are frequently used and modified

---

### 2. Jobs (`/web/src/hooks/useRunningJobs.ts`)

**Current Pattern:** TanStack Query with polling-like behavior

```typescript
// Current implementation
const useRunningJobs = () => {
  return useQuery({
    queryKey: ["jobs", "running", user?.id],
    queryFn: fetchRunningJobs,
    staleTime: 10000, // 10 seconds - acts like polling
    refetchOnMount: true,
    refetchOnWindowFocus: false
  });
};
```

**Problems:**
- 10-second stale time means job updates have delay
- Already receiving `job_update` via WebSocket, but query still runs separately
- Manual `invalidateQueries` called in `workflowUpdates.ts` when job status changes

**WebSocket Opportunity:**
Already partially implemented! The `workflowUpdates.ts` handles `job_update` messages. Need to:
1. Eliminate the 10-second polling by using WebSocket job updates to maintain the job list
2. Add `jobs_list_update` message type for multi-job scenarios

**Impact:** MEDIUM - Reduces redundant API calls

---

### 3. Workflows (`/web/src/stores/WorkflowManagerStore.ts`, `/web/src/hooks/useDashboardData.ts`)

**Current Pattern:** REST API with manual cache invalidation

| Endpoint | Method | Usage |
|----------|--------|-------|
| `/api/workflows/` | GET | List user workflows |
| `/api/workflows/{id}` | GET | Fetch single workflow |
| `/api/workflows/` | POST | Create workflow |
| `/api/workflows/{id}` | PUT | Update workflow |
| `/api/workflows/{id}` | DELETE | Delete workflow |
| `/api/workflows/examples` | GET | List templates |

**Problems:**
- After create/delete, manual `queryClient.invalidateQueries({ queryKey: ["workflows"] })` required
- Dashboard doesn't see workflow changes until refresh
- Multiple tabs don't stay in sync

**WebSocket Opportunity:**
```typescript
type WorkflowListUpdate = {
  type: "workflow_list_update";
  action: "created" | "updated" | "deleted";
  workflow?: WorkflowAttributes;  // For created/updated
  workflow_id?: string;           // For deleted
}
```

**Impact:** MEDIUM - Improves multi-tab and dashboard consistency

---

### 4. Model Downloads (`/web/src/stores/ModelDownloadStore.ts`)

**Current Pattern:** Separate WebSocket for model downloads

```typescript
// Already using WebSocket for downloads
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.repo_id) {
    get().updateDownload(id, {
      status: data.status,
      downloadedBytes: data.downloaded_bytes,
      // ...
    });
  }
};
```

**Problems:**
- Uses a separate WebSocket connection (`DOWNLOAD_URL`) instead of the unified connection
- Reconnection logic duplicated

**WebSocket Opportunity:**
Consolidate model download updates into `GlobalWebSocketManager`:
```typescript
type ModelDownloadUpdate = {
  type: "model_download_update";
  repo_id: string;
  status: "pending" | "running" | "completed" | "error";
  downloaded_bytes: number;
  total_bytes: number;
  // ...
}
```

**Impact:** MEDIUM - Reduces WebSocket connections, simplifies reconnection logic

---

### 5. HuggingFace Cache Status (`/web/src/serverState/checkHfCacheStatus.ts`, `/web/src/stores/HfCacheStatusStore.ts`)

**Current Pattern:** REST API polling triggered by component mounts

```typescript
// Current: POST to check if models are downloaded
const checkHfCacheStatus = async (items: HfCacheStatusRequestItem[]) => {
  const res = await fetch(`${BASE_URL}/api/models/huggingface/cache_status`, {
    method: "POST",
    // ...
  });
  return res.json();
};
```

**Problems:**
- Called every time model selection components mount
- Status doesn't update when downloads complete (relies on manual `invalidate()`)
- Many components check cache status independently

**WebSocket Opportunity:**
```typescript
type CacheStatusUpdate = {
  type: "cache_status_update";
  key: string;
  downloaded: boolean;
}
```

Combined with model downloads, cache status could be pushed when:
- Downloads complete
- Models are deleted
- Cache is cleared

**Impact:** MEDIUM - Reduces API calls, provides real-time download status

---

### 6. Collections (`/web/src/stores/CollectionStore.ts`)

**Current Pattern:** REST API with manual refetch

```typescript
// After any mutation, refetch entire list
deleteCollection: async (collectionName: string) => {
  await client.DELETE("/api/collections/{name}", {...});
  await get().fetchCollections();  // Manual refetch
}
```

**Problems:**
- Full list refetch after each mutation
- Index progress not pushed via WebSocket

**WebSocket Opportunity:**
```typescript
type CollectionUpdate = {
  type: "collection_update";
  action: "created" | "deleted" | "indexed";
  collection?: Collection;
  collection_name?: string;
}

type IndexProgressUpdate = {
  type: "index_progress_update";
  collection_name: string;
  current: number;
  total: number;
  file_name?: string;
}
```

**Impact:** LOW-MEDIUM - Collections are less frequently used than assets

---

### 7. Secrets (`/web/src/stores/SecretsStore.ts`, `/web/src/hooks/useSecrets.ts`)

**Current Pattern:** REST API with manual refetch

```typescript
updateSecret: async (key: string, value: string) => {
  await client.PUT("/api/settings/secrets/{key}", {...});
  await get().fetchSecrets();  // Refetch all secrets
}
```

**Problems:**
- Full refetch after any secret change
- Multiple tabs don't sync secret changes

**WebSocket Opportunity:**
```typescript
type SecretsUpdate = {
  type: "secrets_update";
  action: "updated" | "deleted";
  key: string;
  // Never include value for security
}
```

**Impact:** LOW - Secrets are infrequently changed

---

### 8. Providers and Models (`/web/src/hooks/useProviders.ts`, `/web/src/hooks/useModelsByProvider.ts`)

**Current Pattern:** REST API with long staleTime

```typescript
useQuery({
  queryKey: ["providers"],
  queryFn: async () => {
    const { data, error } = await client.GET("/api/models/providers", {});
    // ...
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
});
```

**Problems:**
- If API keys are added, provider availability doesn't update automatically
- Model lists are static but fetched repeatedly

**WebSocket Opportunity:**
```typescript
type ProvidersUpdate = {
  type: "providers_update";
  providers: Provider[];
}
```

This would be useful when:
- User adds/removes API keys
- Provider availability changes

**Impact:** LOW - Providers rarely change during a session

---

### 9. Workflow Versions (`/web/src/serverState/useWorkflowVersions.ts`)

**Current Pattern:** REST API with cache invalidation

```typescript
// After creating/restoring versions
onSuccess: () => {
  queryClient.invalidateQueries({
    queryKey: workflowVersionsQueryKey(workflowId)
  });
}
```

**Problems:**
- Other tabs don't see new versions
- Autosave creates versions that aren't visible until refetch

**WebSocket Opportunity:**
```typescript
type VersionUpdate = {
  type: "version_update";
  workflow_id: string;
  action: "created" | "restored" | "deleted";
  version?: WorkflowVersion;
}
```

**Impact:** LOW-MEDIUM - Useful for autosave visibility

---

## Implementation Recommendations

### Phase 1: High Impact, Low Complexity

1. **Asset Updates**
   - Add asset CRUD event types to backend WebSocket
   - Subscribe by folder/workspace in frontend
   - Update TanStack Query cache on WebSocket events
   - Remove manual `invalidateQueries` calls

2. **Consolidate Model Downloads**
   - Move model download updates to `GlobalWebSocketManager`
   - Use unified reconnection logic
   - Eliminate separate WebSocket connection

### Phase 2: Medium Impact

3. **Jobs List Sync**
   - Use `job_update` events to maintain running jobs list
   - Remove staleTime polling behavior
   - Update cache directly from WebSocket events

4. **Workflow List Updates**
   - Add workflow CRUD events
   - Subscribe to user's workflow list changes
   - Keep dashboard in sync across tabs

5. **Cache Status Push**
   - Push cache status changes after downloads complete
   - Eliminate polling in model selection components

### Phase 3: Lower Impact

6. **Collections Updates**
   - Add collection mutation events
   - Push index progress via WebSocket

7. **Version Updates**
   - Push autosave version creation events
   - Keep version history in sync

---

## Proposed Message Type Hierarchy

```typescript
// Base type
interface WebSocketMessage {
  type: string;
  timestamp?: string;
}

// Resource updates (new category)
interface ResourceUpdate extends WebSocketMessage {
  type: "resource_update";
  resource_type: "asset" | "workflow" | "collection" | "secret" | "version";
  action: "created" | "updated" | "deleted";
  payload: unknown;
}

// Specific resource types
interface AssetResourceUpdate extends ResourceUpdate {
  resource_type: "asset";
  payload: {
    asset?: Asset;
    asset_id?: string;
    parent_id?: string;
  };
}

interface WorkflowResourceUpdate extends ResourceUpdate {
  resource_type: "workflow";
  payload: {
    workflow?: WorkflowAttributes;
    workflow_id?: string;
  };
}
```

---

## Backend Requirements

For this migration to work, the backend needs to:

1. **Track connected clients** - Know which user/session is connected
2. **Broadcast resource updates** - When resources change, send updates to relevant clients
3. **Scope updates appropriately** - Only send updates the user has permission to see
4. **Handle subscription patterns** - Let clients subscribe to specific resources/folders

### Suggested Backend Changes:

```python
# Example: Asset update broadcast
async def broadcast_asset_update(asset: Asset, action: str, user_id: str):
    message = {
        "type": "resource_update",
        "resource_type": "asset",
        "action": action,
        "payload": {
            "asset": asset.dict() if action != "deleted" else None,
            "asset_id": asset.id,
            "parent_id": asset.parent_id
        }
    }
    await websocket_manager.send_to_user(user_id, message)
```

---

## Migration Strategy

### Frontend Implementation Pattern

```typescript
// Example: Asset subscription hook
const useAssetWebSocketSync = (parentId: string) => {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    const unsubscribe = globalWebSocketManager.subscribe(
      `assets:${parentId}`,
      (message: ResourceUpdate) => {
        if (message.resource_type === "asset") {
          // Update TanStack Query cache directly
          queryClient.setQueryData(
            ["assets", { parent_id: parentId }],
            (old: AssetList) => updateAssetList(old, message)
          );
        }
      }
    );
    
    // Tell server we want updates for this folder
    globalWebSocketManager.send({
      type: "subscribe",
      resource: "assets",
      filter: { parent_id: parentId }
    });
    
    return () => {
      unsubscribe();
      globalWebSocketManager.send({
        type: "unsubscribe",
        resource: "assets",
        filter: { parent_id: parentId }
      });
    };
  }, [parentId, queryClient]);
};
```

---

## Metrics to Track

After implementing WebSocket updates, track:

1. **API call reduction** - Fewer GET requests for listing resources
2. **Data transfer reduction** - Smaller payloads (delta updates vs full lists)
3. **Time to update** - How quickly changes appear in other tabs
4. **WebSocket message volume** - Ensure we're not flooding with updates
5. **Reconnection reliability** - WebSocket drops don't cause stale data

---

## Summary Table

| Resource | Current Pattern | Priority | Complexity | Benefit |
|----------|----------------|----------|------------|---------|
| Assets | REST + invalidation | HIGH | Medium | Real-time file sync |
| Jobs | REST polling + partial WS | MEDIUM | Low | Reduce polling |
| Workflows | REST + invalidation | MEDIUM | Medium | Multi-tab sync |
| Model Downloads | Separate WebSocket | MEDIUM | Low | Consolidate connections |
| Cache Status | REST polling | MEDIUM | Medium | Real-time download status |
| Collections | REST + refetch | LOW | Low | Index progress updates |
| Versions | REST + invalidation | LOW | Low | Autosave visibility |
| Secrets | REST + refetch | LOW | Low | Security-sensitive |
| Providers | REST + long cache | LOW | Low | Rarely changes |

---

## Next Steps

1. **Discuss priorities** with the team - which resources benefit most from real-time updates?
2. **Design backend protocol** - Define message formats and subscription patterns
3. **Create proof-of-concept** - Implement asset updates as pilot
4. **Measure impact** - Compare API call counts before/after
5. **Roll out incrementally** - Add more resource types based on success
