# Resource Change Updates on WebSocket

## Overview

The NodeTool client now supports real-time resource change notifications over the WebSocket connection. When database resources are created, updated, or deleted on the backend, the client automatically receives notifications and updates its local cache accordingly.

## How It Works

### Backend to Client Flow

1. **Backend Event**: A database resource is created, updated, or deleted
2. **WebSocket Notification**: Backend sends a `resource_change` message via `/ws`
3. **Client Routing**: `GlobalWebSocketManager` receives and routes the message
4. **Cache Invalidation**: `resourceChangeHandler` invalidates relevant TanStack Query caches
5. **Automatic Refetch**: React components automatically refetch updated data

### Message Format

Resource change messages follow this format:

```typescript
{
  type: "resource_change",
  event: "created" | "updated" | "deleted",
  resource_type: string,  // e.g., "workflow", "job", "asset", "thread"
  resource: {
    id: string,
    etag?: string,
    // ... additional resource properties
  }
}
```

### Example Messages

**Workflow Updated:**
```json
{
  "type": "resource_change",
  "event": "updated",
  "resource_type": "workflow",
  "resource": {
    "id": "workflow-123",
    "etag": "abc123",
    "name": "My Workflow",
    "status": "active"
  }
}
```

**Job Created:**
```json
{
  "type": "resource_change",
  "event": "created",
  "resource_type": "job",
  "resource": {
    "id": "job-456",
    "etag": "def456",
    "status": "running"
  }
}
```

**Asset Deleted:**
```json
{
  "type": "resource_change",
  "event": "deleted",
  "resource_type": "asset",
  "resource": {
    "id": "asset-789"
  }
}
```

## Supported Resource Types

The following resource types trigger cache invalidation:

| Resource Type | Invalidated Query Keys | Additional Queries |
|--------------|----------------------|-------------------|
| `workflow` | `workflows`, `templates` | `workflow-{id}`, `workflow_versions-{id}` |
| `job` | `jobs` | `job-{id}` |
| `asset` | `assets` | - |
| `thread` | `threads` | `thread-{id}`, `messages-{id}` |
| `collection` | `collections` | - |
| `workspace` | `workspaces` | - |
| `secret` | `secrets` | - |
| `model` | `models` | - |

## Implementation Details

### Key Files

- **`web/src/stores/ApiTypes.ts`**: Type definition for `ResourceChangeUpdate`
- **`web/src/stores/resourceChangeHandler.ts`**: Core logic for handling resource changes
- **`web/src/lib/websocket/GlobalWebSocketManager.ts`**: WebSocket message routing

### Resource Change Handler

The `handleResourceChange()` function in `resourceChangeHandler.ts`:

1. Logs the resource change event
2. Maps the resource type to query keys
3. Invalidates all relevant TanStack Query caches
4. Invalidates specific resource queries if an ID is provided

```typescript
export function handleResourceChange(update: ResourceChangeUpdate): void {
  const { event, resource_type, resource } = update;
  
  // Get query keys for this resource type
  const queryKeys = RESOURCE_TYPE_TO_QUERY_KEYS[resource_type];
  
  // Invalidate general caches
  queryKeys.forEach((queryKey) => {
    queryClient.invalidateQueries({ queryKey: [queryKey] });
  });
  
  // Invalidate specific resource queries
  if (resource.id) {
    // Type-specific invalidation logic...
  }
}
```

### GlobalWebSocketManager Routing

The `routeMessage()` method in `GlobalWebSocketManager` handles resource change messages specially:

```typescript
private routeMessage(message: any): void {
  // Handle resource_change messages separately
  if (message.type === "resource_change") {
    handleResourceChange(message as ResourceChangeUpdate);
    return; // Don't route to regular handlers
  }
  
  // Regular message routing by job_id/workflow_id/thread_id...
}
```

Resource change messages:
- Are **not** routed to job/workflow/thread-specific handlers
- Only trigger cache invalidation
- Don't require a routing key (job_id, workflow_id, thread_id)

## Adding New Resource Types

To add support for a new resource type:

1. Update the `RESOURCE_TYPE_TO_QUERY_KEYS` mapping in `resourceChangeHandler.ts`:

```typescript
const RESOURCE_TYPE_TO_QUERY_KEYS: Record<string, string[]> = {
  // ... existing mappings
  my_resource: ["my_resources"],
};
```

2. Optionally add specific query invalidation logic:

```typescript
if (resource_type === "my_resource" && resource.id) {
  queryClient.invalidateQueries({
    queryKey: ["my_resource", resource.id]
  });
}
```

3. Add tests in `resourceChangeHandler.test.ts`

## Testing

### Unit Tests

Tests are located in:
- `web/src/stores/__tests__/resourceChangeHandler.test.ts` (7 tests)
- `web/src/lib/websocket/__tests__/GlobalWebSocketManager.test.ts` (3 new tests)

Run tests:
```bash
cd web
npm test -- resourceChangeHandler.test.ts
npm test -- GlobalWebSocketManager.test.ts
```

### Manual Testing

To test with a live backend:

1. Start the backend server:
```bash
conda activate nodetool
nodetool serve --port 7777
```

2. Start the frontend:
```bash
cd web
npm start
```

3. Trigger resource changes:
   - Create/update/delete workflows
   - Create/update jobs
   - Upload/delete assets
   - Create/update threads

4. Verify:
   - Network tab shows WebSocket `resource_change` messages
   - Console logs show cache invalidation
   - UI updates automatically without manual refresh

## Benefits

### Real-time Synchronization
- Multiple clients stay in sync automatically
- No polling required
- Immediate UI updates

### Improved Performance
- Only fetch data when it actually changes
- Reduces unnecessary API calls
- Better user experience

### Simplified Architecture
- Single WebSocket endpoint for all updates
- Centralized cache invalidation logic
- Easy to extend for new resource types

## Troubleshooting

### No Updates Received

Check:
1. WebSocket connection is established (`globalWebSocketManager.isConnectionOpen()`)
2. Backend is sending resource_change messages (check Network tab)
3. Resource type is mapped in `RESOURCE_TYPE_TO_QUERY_KEYS`

### Cache Not Invalidating

Check:
1. Query keys match those used in your queries
2. `handleResourceChange()` is being called (check console logs)
3. TanStack Query DevTools shows cache invalidation

### Excessive Refetching

If you see too many refetches:
1. Add throttling to `handleResourceChange()`
2. Use more specific query keys
3. Increase `staleTime` in your queries

## See Also

- [WebSocket API Documentation](https://github.com/nodetool-ai/nodetool-core/blob/main/docs/websocket-api.md)
- [WebSocket Protocol Documentation](https://github.com/nodetool-ai/nodetool-core/blob/main/docs/websocket-protocol.md)
- [TanStack Query Documentation](https://tanstack.com/query/latest)
