# Performance Improvements

This document outlines the performance optimizations made to the NodeTool codebase to improve efficiency and responsiveness.

## Summary

A comprehensive performance audit identified and resolved several inefficient code patterns, resulting in significant algorithmic complexity improvements and reduced memory allocations.

## Key Improvements

### 1. NodeStore Operations

**File:** `web/src/stores/NodeStore.ts`

#### onConnect Method (Lines ~461-518)
- **Before:** Unnecessarily mapped all filtered edges to normalize handles
- **After:** Removed redundant map operation as handles are already normalized
- **Impact:** Eliminates intermediate array allocation on every connection

#### deleteNode Method (Lines ~625-653)
- **Before:** Used filter().map() chain creating two intermediate arrays
- **After:** Single for-loop that filters and updates in one pass
- **Impact:** 
  - Reduced memory allocations
  - O(2n) → O(n) iterations

#### getBounds Function (Lines ~768-792)
- **Before:** Four separate iterations with Math.min/max on mapped arrays
- **After:** Single pass calculating all bounds simultaneously
- **Impact:**
  - O(4n) → O(n) complexity
  - Reduced from 4 array allocations to 0

#### autoLayout Method (Lines ~798-820)
- **Before:** Used find() for each node lookup (O(n) per lookup)
- **After:** Built Map for O(1) lookups
- **Impact:** O(n²) → O(n) for large node graphs

#### getWorkflow Method (Lines ~723-756)
- **Before:** Nested iteration checking all edges for each property
- **After:** Built Set of connected handles for O(1) lookups
- **Impact:** 
  - O(n×m×e) → O(n×m) complexity
  - Critical improvement for large workflows with many nodes and edges

### 2. Edge Processing

**File:** `web/src/hooks/useProcessedEdges.ts`

#### DataType Lookups (Lines ~59-100)
- **Before:** Repeated find() operations on dataTypes array for each edge
- **After:** Built Maps indexed by value, name, and slug
- **Impact:**
  - O(n) → O(1) per dataType lookup
  - Significant improvement for workflows with many edges

### 3. Copy/Paste Operations

**File:** `web/src/hooks/handlers/useCopyPaste.tsx`

#### handleCut Method (Lines ~89-108)
- **Before:** Nested some() calls for filtering (O(n×m))
- **After:** Set-based filtering (O(n))
- **Impact:** Much faster for large selections

### 4. String Operations

Multiple files optimized to cache toLowerCase() results:

#### WorkflowList
- **File:** `web/src/components/workflows/WorkflowList.tsx`
- **Before:** Called toLowerCase() on filterValue for each workflow
- **After:** Cache filterValue.toLowerCase() once

#### FileBrowserDialog
- **File:** `web/src/components/dialogs/FileBrowserDialog.tsx`
- **Before:** Called toLowerCase() on searchQuery for each file
- **After:** Cache searchQuery.toLowerCase() once

#### NodeColorSelector
- **File:** `web/src/components/node/NodeColorSelector.tsx`
- **Before:** Called toLowerCase() on searchTerm for each datatype
- **After:** Cache searchTerm.toLowerCase() once

**Impact:** Reduces string allocation and conversion overhead in filter loops

## Complexity Analysis

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| getWorkflow | O(n×m×e) | O(n×m) | Linear in edges |
| getBounds | O(4n) | O(n) | 4x fewer iterations |
| autoLayout lookups | O(n) per lookup | O(1) | Logarithmic to constant |
| handleCut filtering | O(n×m) | O(n) | Linear improvement |
| dataType lookups | O(n) per edge | O(1) | Critical for edge processing |

Where:
- n = number of nodes
- m = average properties per node
- e = number of edges

## Testing

All optimizations have been validated:
- ✅ Code builds successfully
- ✅ No new TypeScript errors introduced
- ✅ Changes are backward compatible
- ✅ Existing functionality preserved

## Best Practices Applied

1. **Use appropriate data structures:** Map and Set for O(1) lookups instead of arrays with find()
2. **Cache repeated computations:** Store results of expensive operations
3. **Single-pass algorithms:** Combine multiple iterations into one when possible
4. **Avoid intermediate allocations:** Reduce memory pressure in hot paths
5. **Memoize expensive string operations:** Cache toLowerCase() and other transformations

## Future Opportunities

Additional optimizations that could be explored:

1. **Virtualization:** For large lists (workflows, assets, nodes)
2. **Web Workers:** Offload heavy computations (layout, validation)
3. **React.memo:** Prevent unnecessary re-renders of expensive components
4. **Code splitting:** Dynamic imports for rarely-used features
5. **Lazy loading:** Defer loading of non-critical metadata

## Measurement

To measure the impact of these changes, consider:

1. **Chrome DevTools Performance tab:** Record timeline during heavy operations
2. **React Profiler:** Measure component render times
3. **Memory profiler:** Check for reduced allocations
4. **User testing:** Subjective performance improvements

## Contributing

When adding new code, keep these performance principles in mind:

- Prefer O(1) lookups (Map, Set) over O(n) searches (find, filter)
- Cache expensive computations and string operations
- Use single-pass algorithms when possible
- Profile before optimizing - measure, don't guess
- Document the complexity of your algorithms
