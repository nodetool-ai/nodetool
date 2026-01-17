# Workflow Pattern Library (Experimental)

## Overview

The Workflow Pattern Library is a research feature that allows users to discover, preview, and drag-and-drop reusable workflow patterns onto the canvas. Patterns are pre-built workflow templates for common AI tasks like text-to-image generation, RAG workflows, multi-modal analysis, and more.

## Status

⚠️ **Experimental**: This is a research feature. API may change.

## Use Cases

- **Researchers**: Quickly prototype workflows using established patterns
- **New Users**: Learn workflow construction by examining pattern structures
- **Advanced Users**: Speed up workflow creation with pre-built templates

## How It Works

The Pattern Library integrates with the left panel as a new tab (keyboard shortcut: `4`). Users can:

1. **Browse Patterns**: Filter by category (Generative AI, NLP, Computer Vision, Audio, Data Processing)
2. **Search**: Find patterns by name, description, or tags
3. **Preview**: View pattern details including node count, category, and description
4. **Drag & Drop**: Drag a pattern onto the canvas to instantiate all nodes and edges

### Pattern Structure

Each pattern contains:
- `id`: Unique identifier
- `name`: Display name
- `description`: Brief description
- `category`: Category for filtering
- `tags`: Searchable tags
- `nodes`: Array of pattern nodes with positions
- `edges`: Array of connections between nodes

### Node Mapping

When a pattern is dropped:
1. New node IDs are generated
2. Node positions are offset from the drop location
3. Node data properties are copied
4. Edges are recreated with new node IDs
5. Original node types are validated against available metadata

## Usage Example

```typescript
// Patterns are stored in PatternLibraryStore
const patterns = usePatternLibraryStore(state => state.patterns);

// Filter patterns
const filtered = patterns.filter(p => 
  p.category === "Generative AI" || 
  p.tags.includes("image")
);

// Drag pattern to canvas (handled automatically by useDropHandler)
```

## Limitations

- **Sample Patterns Only**: Currently includes 5 sample patterns
- **No Pattern Editor**: Cannot create or edit patterns via UI
- **No Persistence**: Patterns are not saved to backend
- **Basic Node Types**: Uses a limited set of node types for samples
- **No Versioning**: Patterns don't track version history

## Future Improvements

- **Pattern Editor**: UI to create and save custom patterns
- **Pattern Marketplace**: Share and discover community patterns
- **Version Control**: Track pattern versions and updates
- **Category Customization**: User-defined categories
- **Template Variables**: Parameterized patterns with placeholders

## Feedback

To provide feedback on this feature:
1. Report issues via GitHub issues
2. Suggest new pattern categories or examples
3. Share use cases for pattern customization

## Files

- `web/src/stores/PatternLibraryStore.ts` - Pattern data and filtering logic
- `web/src/components/patterns/PatternLibraryPanel.tsx` - UI component
- `web/src/hooks/handlers/dropHandlerUtils.ts` - Pattern drop handling
- `web/src/lib/dragdrop/types.ts` - Drag-drop type definitions
