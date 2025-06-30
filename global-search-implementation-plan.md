# Global Search Implementation Plan

## Overview

Implement a server-side global search feature that allows users to search across all folders in their asset library. Local search within current folder is handled efficiently by the frontend.
Take extra care not to remove or change existing functionality and styles.

## Phase 1: Backend API Implementation

### 1.1 New API Endpoint

**Location**: `nodetool-core/src/nodetool/api/asset.py`

Add new endpoint: `GET /api/assets/search`

```python
@router.get("/search")
async def search_assets_global(
    query: str,
    content_type: Optional[str] = None,
    page_size: Optional[int] = 100,
    cursor: Optional[str] = None,
    user: str = Depends(current_user),
) -> AssetSearchResult
```

**Parameters**:

- `query`: Search term (minimum 2 characters)
- `content_type`: Optional content type filter
- `page_size`: Results per page (default 100)
- `cursor`: Pagination cursor
- `user`: Current user ID

**Note**: Local search is handled efficiently in the frontend by filtering already-loaded folder assets.

**Response Model**:

```python
class AssetSearchResult(BaseModel):
    assets: List[AssetWithPath]
    next_cursor: Optional[str]
    total_count: int
    is_global_search: bool

class AssetWithPath(BaseModel):
    # All existing Asset fields
    id: str
    name: str
    content_type: str
    # ... other Asset fields

    # New fields for search context
    folder_name: str          # Direct parent folder name
    folder_path: str          # Full path breadcrumb
    folder_id: str            # Parent folder ID for navigation
```

### 1.2 Database Query Implementation

**Location**: `nodetool-core/src/nodetool/models/asset.py`

Add new methods to AssetModel:

```python
@classmethod
def search_assets_global(
    cls,
    user_id: str,
    query: str,
    content_type: Optional[str] = None,
    limit: int = 100,
    start_key: Optional[str] = None,
) -> Tuple[List['AssetModel'], Optional[str], List[Dict[str, str]]]:
    """
    Search assets globally across all user folders and return path information
    """
    # Implementation details for database query
    pass

@classmethod
def get_asset_path_info(cls, user_id: str, asset_ids: List[str]) -> Dict[str, Dict[str, str]]:
    """
    Get folder path information for given asset IDs
    Returns: {asset_id: {folder_name, folder_path, folder_id}}
    """
    pass
```

## Phase 2: Frontend State Management

### 2.1 AssetGridStore Updates

**Location**: `nodetool/web/src/stores/AssetGridStore.ts`

Add new state properties:

```typescript
interface AssetGridState {
  // ... existing properties

  // New global search properties
  globalSearchResults: AssetWithPath[];
  isGlobalSearchActive: boolean;
  globalSearchQuery: string;

  // New actions
  setGlobalSearchResults: (results: AssetWithPath[]) => void;
  setIsGlobalSearchActive: (active: boolean) => void;
  setGlobalSearchQuery: (query: string) => void;
}
```

### 2.2 New Asset Type

**Location**: `nodetool/web/src/stores/ApiTypes.ts`

```typescript
export interface AssetWithPath extends Asset {
  folder_name: string;
  folder_path: string;
  folder_id: string;
}

export interface AssetSearchResult {
  assets: AssetWithPath[];
  next_cursor?: string;
  total_count: number;
  is_global_search: boolean;
}
```

## Phase 3: API Integration

### 3.1 New Hook: useAssetSearch

**Location**: `nodetool/web/src/serverState/useAssetSearch.ts`

```typescript
export const useAssetSearch = () => {
  const searchAssets = useCallback(
    async (query: string, globalSearch: boolean, parentId?: string) => {
      // Implementation with 500ms debounce
      // API call to /api/assets/search
    },
    []
  );

  return {
    searchAssets,
    isSearching,
    searchError,
  };
};
```

### 3.2 Update useAssets Hook

**Location**: `nodetool/web/src/serverState/useAssets.ts`

Add integration with new search API and handle search result state.

## Phase 4: UI Components

### 4.0 Search Results View Mode Decision

**Decision**: Search results will **always use list view** for initial implementation. This provides optimal space for folder context information and navigation.

**Implementation**:

- **List View Only**: Display folder context inline with asset details (folder name + navigation button)
- **Global Search Only**: Backend only handles global search; local search is handled efficiently in frontend
- **Future Enhancement**: Grid view support can be added later with careful UX consideration for small item sizes
- **Tooltip**: Show full folder path on hover

### 4.1 Enhanced Search Input

**Location**: New component `nodetool/web/src/components/assets/AssetSearchInput.tsx`

Features:

- Search input with 500ms debounce for global search
- Minimum 2 characters validation
- Loading indicator
- Clear search button
- **Note**: Local search is handled by existing frontend filtering

```typescript
interface AssetSearchInputProps {
  onSearchChange: (query: string) => void;
  onClearSearch: () => void;
}
```

### 4.2 Search Results Component

**Location**: `nodetool/web/src/components/assets/AssetSearchResults.tsx`

Features:

- **List view only**: Folder context inline with asset details
- Tooltip with full folder path on hover
- "Go to folder" button for each result
- Empty state with "No results found" message
- Asset selection support (compatible with existing selection system)
- **Architecture**: Built to easily add grid view support later

```typescript
interface AssetSearchResultsProps {
  results: AssetWithPath[];
  onAssetSelect: (assetId: string) => void;
  onNavigateToFolder: (folderId: string) => void;
  selectedAssetIds: string[];
  containerWidth?: number;
  isHorizontal?: boolean;
}
```

### 4.3 Folder Context Display

**Location**: `nodetool/web/src/components/assets/FolderContext.tsx`

```typescript
interface FolderContextProps {
  folderName: string;
  folderPath: string;
  folderId: string;
  onNavigateToFolder: (folderId: string) => void;
}
```

## Phase 5: Integration & UI Updates

**Note**: All updates preserve existing functionality and styles. No breaking changes to current behavior.

### 5.1 Update AssetGrid Component

**Location**: `nodetool/web/src/components/assets/AssetGrid.tsx`

- Integrate new search input component
- Handle search mode switching
- Show appropriate content based on search state
- **Preserve**: All existing grid/list view functionality
- **Preserve**: Current viewMode toggle behavior

### 5.2 Update AssetListView Component

**Location**: `nodetool/web/src/components/assets/AssetListView.tsx`

- Support for displaying search results with folder context
- Handle mixed content types in search results
- **Preserve**: All existing list view functionality and styling
- **Preserve**: Current asset grouping and sorting behavior

### 5.3 Update AssetGridContent Component

**Location**: `nodetool/web/src/components/assets/AssetGridContent.tsx`

- Conditional rendering based on search state
- **For now**: Show search results in list view regardless of current viewMode
- **Preserve**: All existing grid content functionality
- **Preserve**: Current asset card layout and interactions
- **Future**: Support for grid view search results when implemented

## Phase 6: User Experience Enhancements

### 6.1 Search Behavior

- **Debouncing**: 500ms delay after user stops typing
- **Minimum Length**: Search starts from 2 characters
- **Loading States**: Show spinner during search
- **Error Handling**: Display error messages for failed searches

### 6.2 Navigation

- **Folder Navigation**: "Go to folder" button in search results
- **Breadcrumb Updates**: Update breadcrumbs when navigating from search
- **Search Persistence**: Maintain search state when navigating back

### 6.3 Empty States

- **No Results**: "No assets found matching your search" message
- **Global Search Off**: Regular folder view with local search
- **Search Too Short**: "Enter at least 2 characters to search" hint

## Phase 7: Styling & Polish

### 7.1 CSS Updates

- Global search input styling
- Folder context inline styling (for list view)
- Search results list styling
- Loading and empty state styling
- **Future**: Grid view styling when implemented

### 7.2 Responsive Design

- Mobile-friendly search interface
- Responsive folder context display
- Touch-friendly navigation buttons

## Implementation Order

1. **Backend First** (Phase 1): Implement API endpoint and database queries
2. **State Management** (Phase 2): Update stores and types
3. **API Integration** (Phase 3): Create hooks and API calls
4. **Core Components** (Phase 4): Build search input and results components
5. **Integration** (Phase 5): Connect components to existing views
6. **Polish** (Phase 6-7): UX improvements and styling

## Testing Strategy

### Backend Testing

- Unit tests for search API endpoint
- Database query performance tests
- Path resolution accuracy tests

### Frontend Testing

- Component unit tests
- Integration tests for search flow
- Performance tests for debouncing
- User interaction tests

## Performance Considerations

- **Database Indexing**: Ensure asset names are indexed for fast text search
- **Pagination**: Implement proper pagination for large result sets
- **Debouncing**: Prevent excessive API calls during typing
- **Caching**: Consider caching recent search results
- **Lazy Loading**: Load folder path information only when needed

## Security Considerations

- **User Isolation**: Ensure users can only search their own assets
- **Input Validation**: Sanitize search queries
- **Rate Limiting**: Prevent search API abuse
- **Permission Checks**: Verify folder access permissions

## Future Enhancements

- **Grid View for Search Results**: Add grid view support with folder context badges/overlays
- **Advanced Filters**: Content type, size, date range filters
- **Search History**: Remember recent searches
- **Saved Searches**: Allow users to save common searches
- **Search Suggestions**: Auto-complete based on asset names
- **Full-Text Search**: Search within document content (PDFs, text files)
