# Server State Management Guide

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web AGENTS.md](../AGENTS.md) → **ServerState**

This guide helps AI agents understand server state management using TanStack Query (React Query) in the NodeTool web application.

## Overview

The `serverState` directory contains React Query hooks for fetching and mutating server data. These hooks provide caching, automatic refetching, optimistic updates, and error handling for all backend API interactions.

## Directory Structure

```
/serverState
├── __tests__          # Tests for server state hooks
├── useAsset.ts        # Single asset fetching
├── useAssetDeletion.ts # Asset deletion mutation
├── useAssetSearch.ts  # Asset search with filters
├── useAssetUpdate.ts  # Asset update mutation
├── useAssetUpload.ts  # Asset upload with progress
├── useAssets.ts       # Asset list fetching
├── useMetadata.ts     # Node metadata and types
├── useWorkflow.ts     # Single workflow fetching
├── useWorkflowTools.ts # Workflow tool definitions
├── checkHfCache.ts    # HuggingFace cache checking
└── tryCacheFiles.tsx  # File caching utilities
```

## Core Concepts

### TanStack Query Basics

TanStack Query (React Query) manages server state with:
- **Query**: Fetches data from server
- **Mutation**: Modifies server data
- **Cache**: Stores fetched data
- **Invalidation**: Marks cached data as stale

```typescript
// Query pattern
const { data, isLoading, error, refetch } = useQuery({
  queryKey: ['resource', id],
  queryFn: () => fetchResource(id),
  staleTime: 5000,
  cacheTime: 10000
});

// Mutation pattern
const { mutate, mutateAsync, isLoading } = useMutation({
  mutationFn: (data) => updateResource(data),
  onSuccess: () => {
    queryClient.invalidateQueries(['resource']);
  }
});
```

## Asset Management Hooks

### useAssets.ts

Fetches list of assets with optional filtering:

```typescript
export const useAssets = (params?: AssetQueryParams) => {
  return useQuery({
    queryKey: ['assets', params],
    queryFn: async () => {
      const response = await ApiClient.GET('/api/assets/', {
        params: {
          query: params
        }
      });
      return response.data;
    },
    staleTime: 30000, // 30 seconds
    cacheTime: 5 * 60 * 1000 // 5 minutes
  });
};

// Usage in component
const MyComponent = () => {
  const { data: assets, isLoading } = useAssets({
    content_type: 'image',
    parent_id: folderId
  });
  
  if (isLoading) return <LoadingSpinner />;
  return <AssetGrid assets={assets} />;
};
```

**Features**:
- Caches asset lists by query parameters
- Automatic background refetching
- Returns loading and error states
- Supports filtering by content type, parent folder, etc.

### useAsset.ts

Fetches single asset by ID:

```typescript
export const useAsset = (assetId: string | null) => {
  return useQuery({
    queryKey: ['asset', assetId],
    queryFn: async () => {
      const response = await ApiClient.GET('/api/assets/{asset_id}', {
        params: { path: { asset_id: assetId! } }
      });
      return response.data;
    },
    enabled: !!assetId, // Only fetch if ID provided
    staleTime: 60000 // 1 minute
  });
};

// Usage
const AssetViewer = ({ assetId }: { assetId: string }) => {
  const { data: asset, isLoading, error } = useAsset(assetId);
  
  if (isLoading) return <Skeleton />;
  if (error) return <ErrorDisplay error={error} />;
  if (!asset) return <NotFound />;
  
  return <AssetDetails asset={asset} />;
};
```

**Key Options**:
- `enabled: !!assetId` - Conditional fetching
- Query only runs when ID is provided
- Automatic refetch on window focus

### useAssetUpload.ts

Handles asset upload with progress tracking:

```typescript
export const useAssetUpload = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      file: File;
      workflowId: string;
      onProgress?: (progress: number) => void;
    }) => {
      const formData = new FormData();
      formData.append('file', params.file);
      formData.append('workflow_id', params.workflowId);
      
      return await ApiClient.POST('/api/assets/', {
        body: formData,
        onUploadProgress: (progressEvent) => {
          const progress = (progressEvent.loaded / progressEvent.total) * 100;
          params.onProgress?.(progress);
        }
      });
    },
    onSuccess: (data) => {
      // Invalidate asset list queries
      queryClient.invalidateQueries(['assets']);
      
      // Add new asset to cache
      queryClient.setQueryData(['asset', data.id], data);
    },
    onError: (error) => {
      console.error('Upload failed:', error);
    }
  });
};

// Usage
const FileUploader = () => {
  const [progress, setProgress] = useState(0);
  const { mutate: upload, isLoading } = useAssetUpload();
  
  const handleFileSelect = (file: File) => {
    upload({
      file,
      workflowId: 'workflow-123',
      onProgress: setProgress
    }, {
      onSuccess: (asset) => {
        console.log('Uploaded:', asset.id);
      }
    });
  };
  
  return (
    <div>
      <input type="file" onChange={(e) => handleFileSelect(e.target.files[0])} />
      {isLoading && <Progress value={progress} />}
    </div>
  );
};
```

**Features**:
- Progress tracking via callback
- Automatic cache invalidation
- Optimistic updates possible
- Error handling with retry

### useAssetUpdate.ts

Updates asset metadata:

```typescript
export const useAssetUpdate = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      assetId: string;
      data: Partial<Asset>;
    }) => {
      return await ApiClient.PATCH('/api/assets/{asset_id}', {
        params: { path: { asset_id: params.assetId } },
        body: params.data
      });
    },
    onMutate: async (params) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries(['asset', params.assetId]);
      
      // Snapshot previous value
      const previous = queryClient.getQueryData(['asset', params.assetId]);
      
      // Optimistically update
      queryClient.setQueryData(['asset', params.assetId], (old: Asset) => ({
        ...old,
        ...params.data
      }));
      
      return { previous };
    },
    onError: (err, params, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['asset', params.assetId], context.previous);
      }
    },
    onSettled: (data, error, params) => {
      // Refetch after mutation
      queryClient.invalidateQueries(['asset', params.assetId]);
      queryClient.invalidateQueries(['assets']);
    }
  });
};

// Usage with optimistic updates
const AssetRenameForm = ({ asset }: { asset: Asset }) => {
  const { mutate: updateAsset } = useAssetUpdate();
  const [name, setName] = useState(asset.name);
  
  const handleSubmit = () => {
    updateAsset({
      assetId: asset.id,
      data: { name }
    }, {
      onSuccess: () => {
        console.log('Updated successfully');
      },
      onError: () => {
        setName(asset.name); // Reset on error
      }
    });
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit">Save</button>
    </form>
  );
};
```

**Features**:
- Optimistic updates for instant UI feedback
- Automatic rollback on error
- Context preservation for error recovery

### useAssetDeletion.ts

Deletes assets with cache cleanup:

```typescript
export const useAssetDeletion = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (assetId: string) => {
      return await ApiClient.DELETE('/api/assets/{asset_id}', {
        params: { path: { asset_id: assetId } }
      });
    },
    onSuccess: (data, assetId) => {
      // Remove from cache
      queryClient.removeQueries(['asset', assetId]);
      
      // Update lists
      queryClient.invalidateQueries(['assets']);
    }
  });
};

// Usage
const AssetDeleteButton = ({ assetId }: { assetId: string }) => {
  const { mutate: deleteAsset, isLoading } = useAssetDeletion();
  
  const handleDelete = () => {
    if (confirm('Delete this asset?')) {
      deleteAsset(assetId, {
        onSuccess: () => {
          console.log('Deleted successfully');
        },
        onError: (error) => {
          alert('Failed to delete: ' + error.message);
        }
      });
    }
  };
  
  return (
    <Button onClick={handleDelete} disabled={isLoading}>
      {isLoading ? 'Deleting...' : 'Delete'}
    </Button>
  );
};
```

### useAssetSearch.ts

Searches assets with debouncing:

```typescript
export const useAssetSearch = (query: string, options?: SearchOptions) => {
  const [debouncedQuery] = useDebounce(query, 300);
  
  return useQuery({
    queryKey: ['assets', 'search', debouncedQuery, options],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      
      const response = await ApiClient.GET('/api/assets/search', {
        params: {
          query: {
            q: debouncedQuery,
            ...options
          }
        }
      });
      return response.data;
    },
    enabled: debouncedQuery.length > 0,
    staleTime: 60000
  });
};

// Usage
const SearchBar = () => {
  const [query, setQuery] = useState('');
  const { data: results, isLoading } = useAssetSearch(query, {
    content_type: 'image'
  });
  
  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search assets..."
      />
      {isLoading && <Spinner />}
      {results && <SearchResults results={results} />}
    </div>
  );
};
```

## Workflow Hooks

### useWorkflow.ts

Fetches single workflow:

```typescript
export const useWorkflow = (workflowId: string | null) => {
  return useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: async () => {
      const response = await ApiClient.GET('/api/workflows/{id}', {
        params: { path: { id: workflowId! } }
      });
      return response.data;
    },
    enabled: !!workflowId,
    staleTime: 30000
  });
};
```

### useWorkflowTools.ts

Fetches workflow tool definitions:

```typescript
export const useWorkflowTools = (workflowId: string) => {
  return useQuery({
    queryKey: ['workflow', workflowId, 'tools'],
    queryFn: async () => {
      const response = await ApiClient.GET('/api/workflows/{id}/tools', {
        params: { path: { id: workflowId } }
      });
      return response.data;
    },
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
};
```

## Metadata Hooks

### useMetadata.ts & loadMetadata()

Loads node metadata and types:

```typescript
// Load metadata at app startup
export const loadMetadata = async (): Promise<MetadataState> => {
  const response = await ApiClient.GET('/api/nodes/metadata');
  const metadata = response.data;
  
  // Build node types registry
  const nodeTypes: NodeTypes = {};
  const metadataByType: Record<string, NodeMetadata> = {};
  
  metadata.forEach((meta) => {
    nodeTypes[meta.node_type] = BaseNode;
    metadataByType[meta.node_type] = meta;
  });
  
  // Extract recommended models
  const recommendedModels = extractRecommendedModels(metadata);
  
  // Store in MetadataStore
  MetadataStore.getState().setNodeTypes(nodeTypes);
  MetadataStore.getState().setMetadata(metadataByType);
  
  return { nodeTypes, metadataByType, recommendedModels };
};

// Usage in app initialization
useEffect(() => {
  const init = async () => {
    try {
      await loadMetadata();
      setReady(true);
    } catch (error) {
      console.error('Failed to load metadata:', error);
      setError(error);
    }
  };
  
  init();
}, []);
```

**Features**:
- Loads all node type definitions
- Builds connectability matrix
- Extracts recommended models
- Caches in Zustand store

## Cache Utilities

### checkHfCache.ts

Checks HuggingFace model cache:

```typescript
export const checkHfCache = async (modelId: string): Promise<boolean> => {
  try {
    const response = await ApiClient.GET('/api/models/cache/check', {
      params: { query: { model_id: modelId } }
    });
    return response.data.cached;
  } catch {
    return false;
  }
};

// Usage
const ModelDownloadButton = ({ modelId }: { modelId: string }) => {
  const [isCached, setIsCached] = useState(false);
  
  useEffect(() => {
    checkHfCache(modelId).then(setIsCached);
  }, [modelId]);
  
  if (isCached) {
    return <Badge>Downloaded</Badge>;
  }
  
  return <DownloadButton modelId={modelId} />;
};
```

### tryCacheFiles.tsx

Attempts to cache files locally:

```typescript
export const tryCacheFiles = async (files: string[]): Promise<void> => {
  await ApiClient.POST('/api/models/cache/files', {
    body: { files }
  });
};
```

## Query Key Patterns

Consistent query key structure:

```typescript
// Single resource
['asset', assetId]
['workflow', workflowId]
['model', modelId]

// Resource list
['assets']
['assets', { content_type: 'image' }]
['workflows']
['workflows', { tags: ['stable-diffusion'] }]

// Resource sub-collections
['workflow', workflowId, 'tools']
['asset', assetId, 'versions']

// Search queries
['assets', 'search', query]
['workflows', 'search', query, filters]
```

**Benefits**:
- Predictable cache keys
- Easy invalidation
- Hierarchical organization
- Consistent patterns

## Best Practices

### 1. Query Key Structure

Use arrays with hierarchical structure:

```typescript
// ✅ Good
const queryKey = ['assets', { folder: folderId, type: 'image' }];

// ❌ Bad
const queryKey = 'assets-' + folderId + '-image';
```

### 2. Stale Time Configuration

Set appropriate stale times based on data volatility:

```typescript
// Frequently changing data - 30s
queryClient: {
  defaultOptions: {
    queries: {
      staleTime: 30000
    }
  }
}

// Rarely changing data - 5 minutes
staleTime: 5 * 60 * 1000

// Static data - Infinity
staleTime: Infinity
```

### 3. Optimistic Updates

Use for better UX on mutations:

```typescript
onMutate: async (newData) => {
  // Cancel queries
  await queryClient.cancelQueries(['resource']);
  
  // Snapshot previous
  const previous = queryClient.getQueryData(['resource']);
  
  // Optimistic update
  queryClient.setQueryData(['resource'], newData);
  
  return { previous };
},
onError: (err, newData, context) => {
  // Rollback
  queryClient.setQueryData(['resource'], context.previous);
}
```

### 4. Error Handling

Always handle errors appropriately:

```typescript
const { data, error, isError } = useQuery({
  queryKey: ['data'],
  queryFn: fetchData,
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
});

if (isError) {
  return <ErrorDisplay error={error} />;
}
```

### 5. Conditional Fetching

Use `enabled` option for conditional queries:

```typescript
// ✅ Good
const { data } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => fetchUser(userId),
  enabled: !!userId && isLoggedIn
});

// ❌ Bad - runs even when userId is null
const { data } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => fetchUser(userId)
});
```

### 6. Mutation Callbacks

Use callbacks for side effects:

```typescript
const { mutate } = useMutation({
  mutationFn: updateResource,
  onSuccess: (data) => {
    // Update cache
    queryClient.invalidateQueries(['resources']);
    
    // Show notification
    showNotification('Updated successfully');
  },
  onError: (error) => {
    // Show error
    showErrorNotification(error.message);
  }
});
```

## Testing Server State Hooks

### Mock API Client

```typescript
import { ApiClient } from '../stores/ApiClient';

jest.mock('../stores/ApiClient', () => ({
  GET: jest.fn(),
  POST: jest.fn(),
  PATCH: jest.fn(),
  DELETE: jest.fn()
}));
```

### Test Pattern

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAsset } from '../useAsset';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('useAsset', () => {
  it('fetches asset successfully', async () => {
    const mockAsset = { id: '1', name: 'Test Asset' };
    (ApiClient.GET as jest.Mock).mockResolvedValue({ data: mockAsset });
    
    const { result } = renderHook(() => useAsset('1'), {
      wrapper: createWrapper()
    });
    
    expect(result.current.isLoading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    
    expect(result.current.data).toEqual(mockAsset);
  });
});
```

## Common Patterns in NodeTool

### Asset Management Flow

```typescript
// 1. Fetch assets list
const { data: assets } = useAssets({ content_type: 'image' });

// 2. Upload new asset
const { mutate: upload } = useAssetUpload();
upload({ file, workflowId });

// 3. Update asset metadata
const { mutate: update } = useAssetUpdate();
update({ assetId, data: { name: 'New Name' } });

// 4. Delete asset
const { mutate: deleteAsset } = useAssetDeletion();
deleteAsset(assetId);
```

### Workflow Loading

```typescript
// Load workflow on route change
const { workflow } = useParams();
const { data: workflowData, isLoading } = useWorkflow(workflow);

useEffect(() => {
  if (workflowData) {
    // Load into editor
    workflowManager.load(workflowData);
  }
}, [workflowData]);
```

## Related Documentation

- [Stores Guide](../stores/AGENTS.md) - Zustand state management
- [Hooks Guide](../hooks/AGENTS.md) - Custom React hooks
- [Utils Guide](../utils/AGENTS.md) - Utility functions
- [Root AGENTS.md](../../../AGENTS.md) - Project overview

## Quick Reference

### Most Used Hooks
1. `useAssets` - Asset list fetching
2. `useAssetUpload` - File upload with progress
3. `useWorkflow` - Workflow data fetching
4. `useMetadata` - Node type metadata
5. `useAssetUpdate` - Asset updates with optimistic UI

### Query Configuration Options
- `staleTime`: How long data is considered fresh
- `cacheTime`: How long inactive data stays in cache
- `enabled`: Conditional query execution
- `retry`: Number of retry attempts on failure
- `refetchOnWindowFocus`: Auto-refetch on focus

### Mutation Callbacks
- `onMutate`: Before mutation (optimistic updates)
- `onSuccess`: After successful mutation
- `onError`: After failed mutation
- `onSettled`: After mutation (success or error)

---

**Note**: This guide is for AI coding assistants. For user documentation, see [docs.nodetool.ai](https://docs.nodetool.ai).
