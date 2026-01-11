# Subgraph Implementation Plan for NodeTool

## Executive Summary

This document outlines the implementation plan for UI-only subgraph functionality in NodeTool, adapted from the ComfyUI PRD in `subgraphs.md`. The implementation follows NodeTool's existing architecture patterns while introducing hierarchical workflow composition.

## Architecture Alignment with NodeTool

### Core Principles (Unchanged from PRD)

- ✅ **UI-Only**: Subgraphs exist purely in frontend; backend receives flattened node graphs
- ✅ **Execution Transparency**: No backend changes required; existing execution engines work unchanged
- ✅ **Hierarchical**: Subgraphs can contain other subgraphs (nested composition)
- ✅ **Reusable**: Subgraph definitions can be instantiated multiple times
- ✅ **Serializable**: Complete state persists in workflow JSON

### NodeTool-Specific Adaptations

#### 1. Store Architecture

**Current NodeTool Pattern:**
- Multiple specialized Zustand stores (NodeStore, WorkflowStore, etc.)
- Temporal undo/redo with zundo
- Selector-based subscriptions for performance

**Subgraph Adaptation:**
```typescript
// Create new SubgraphStore following NodeTool patterns
export interface SubgraphStoreState {
  // Definitions registry (keyed by UUID)
  definitions: Map<string, SubgraphDefinition>;
  
  // Navigation state
  activeSubgraphId: string | null;
  navigationStack: string[]; // Stack of subgraph instance IDs
  
  // Viewport cache (per graph)
  viewportCache: Map<string, Viewport>;
  
  // Operations
  createDefinition: (def: SubgraphDefinition) => void;
  deleteDefinition: (id: string) => void;
  updateDefinition: (id: string, updates: Partial<SubgraphDefinition>) => void;
  
  // Navigation
  openSubgraph: (instanceId: string) => void;
  exitSubgraph: () => void;
  exitToRoot: () => void;
}
```

**Key Decision**: Keep node/edge management in NodeStore, only add subgraph-specific state to SubgraphStore.

#### 2. Type System Integration

**Current NodeTool Pattern:**
- API types defined in `ApiTypes.ts` from OpenAPI schema
- ReactFlow types (`Node<NodeData>`, `Edge`) for UI
- Conversion functions: `graphNodeToReactFlowNode`, `reactFlowNodeToGraphNode`

**Subgraph Adaptation:**
```typescript
// Extend existing Graph type in ApiTypes.ts
export interface GraphWithSubgraphs extends Graph {
  definitions?: {
    subgraphs?: SubgraphDefinition[];
  };
}

// Subgraph definition (UI-only, not in backend schema)
export interface SubgraphDefinition {
  id: string;  // UUID
  name: string;
  version: number;
  
  // Internal structure (stored as Graph)
  nodes: Node[];
  edges: Edge[];
  
  // Interface definition
  inputs: SubgraphInput[];
  outputs: SubgraphOutput[];
  
  // UI state
  viewport?: Viewport;
  
  // Metadata
  created_at: string;
  updated_at: string;
}

// Subgraph instance (extends Node)
export interface SubgraphInstanceNode extends Node<NodeData> {
  type: string;  // References SubgraphDefinition.id
  data: NodeData & {
    subgraphId: string;
    promotedWidgets?: [string, string][]; // [nodeId, widgetName]
  };
}
```

**Key Decision**: Subgraph definitions NOT sent to backend; workflow flattened before execution.

#### 3. ReactFlow Integration

**Current NodeTool Pattern:**
- Custom node components: BaseNode, CommentNode, GroupNode, RerouteNode
- Node type registry in MetadataStore
- ReactFlowWrapper as main canvas component

**Subgraph Adaptation:**
```typescript
// Add new node types to existing registry
const nodeTypes = {
  ...existingTypes,
  [SUBGRAPH_NODE_TYPE]: SubgraphNode,
  [SUBGRAPH_INPUT_NODE_TYPE]: SubgraphInputNode,
  [SUBGRAPH_OUTPUT_NODE_TYPE]: SubgraphOutputNode
};

// SubgraphNode extends existing node patterns
const SubgraphNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  // Similar structure to GroupNode but with:
  // - Icon + badge (node count)
  // - Double-click to open handler
  // - Promoted widgets rendered inline
  // - Custom visual styling
};
```

**Key Decision**: Subgraph nodes are just another node type in the existing ReactFlow system.

#### 4. Navigation System

**Current NodeTool Pattern:**
- Single workflow per tab
- Tab-based navigation for multiple workflows
- No hierarchical navigation within a workflow

**Subgraph Adaptation:**
```typescript
// Add navigation context to existing NodeStore
export interface NodeStoreState {
  // ... existing fields
  
  // NEW: Navigation state
  currentGraphId: string; // "root" or subgraph instance ID
  navigationPath: string[]; // Breadcrumb path from root
  
  // NEW: Navigation methods
  navigateToSubgraph: (instanceId: string) => void;
  navigateBack: () => void;
  navigateToRoot: () => void;
}
```

**UI Changes:**
- Add breadcrumb component above ReactFlow canvas
- Clicking breadcrumb navigates to that level
- Preserve viewport per graph level
- Show current graph name in breadcrumb

**Key Decision**: Navigation state lives in NodeStore, not a separate store.

#### 5. Execution Pipeline

**Current NodeTool Pattern:**
- WorkflowRunner handles execution
- Graph sent to backend via WebSocket
- Backend executes nodes and streams results

**Subgraph Adaptation:**
```typescript
// In WorkflowRunner.ts
export class WorkflowRunner {
  async runWorkflow(workflow: Workflow) {
    // NEW: Flatten subgraphs before sending to backend
    const flattenedGraph = flattenSubgraphs(workflow.graph);
    
    // Existing execution logic
    await this.executeGraph(flattenedGraph);
  }
  
  onNodeUpdate(update: NodeUpdate) {
    // NEW: Parse hierarchical node ID (e.g., "10:42:7")
    const { path, localId } = parseExecutionId(update.node_id);
    
    // Navigate to correct graph level
    const graph = this.findGraphAtPath(path);
    const node = graph.nodes.find(n => n.id === localId);
    
    // Update node with execution status
    this.updateNodeStatus(node, update);
  }
}
```

**Key Decision**: Flattening happens client-side; backend sees flat graph.

#### 6. Serialization Format

**Current NodeTool Pattern:**
- Workflow stored as `Workflow` type
- Graph stored as `Graph` type with nodes and edges
- Persisted to backend database

**Subgraph Adaptation:**
```json
{
  "id": "workflow-123",
  "name": "My Workflow",
  "graph": {
    "nodes": [
      {
        "id": "1",
        "type": "nodetool.input.ImageInput",
        ...
      },
      {
        "id": "2",
        "type": "subgraph:uuid-abc-123",  // References definition
        "data": {
          "subgraphId": "uuid-abc-123",
          "promotedWidgets": [["5", "seed"]]
        },
        ...
      }
    ],
    "edges": [...],
    
    // NEW: Subgraph definitions (UI-only)
    "definitions": {
      "subgraphs": [
        {
          "id": "uuid-abc-123",
          "name": "My Subgraph",
          "nodes": [...],
          "edges": [...],
          "inputs": [...],
          "outputs": [...]
        }
      ]
    }
  }
}
```

**Key Decision**: Definitions stored in graph.definitions.subgraphs (ignored by backend).

## Implementation Phases

### Phase 1: Foundation (Types & Store)

**Files to Create:**
- `web/src/stores/SubgraphStore.ts`
- `web/src/types/subgraph.ts`

**Files to Modify:**
- `web/src/stores/ApiTypes.ts` - Add subgraph types
- `web/src/stores/NodeStore.ts` - Add navigation state

**Tasks:**
- [ ] Define TypeScript interfaces for subgraphs
- [ ] Create SubgraphStore with Zustand
- [ ] Add subgraph definition registry
- [ ] Add navigation state to NodeStore
- [ ] Write unit tests for store

**Estimated Effort:** 2-3 hours

### Phase 2: Core Operations

**Files to Create:**
- `web/src/core/workflow/subgraph/convert.ts` - Convert to subgraph
- `web/src/core/workflow/subgraph/unpack.ts` - Unpack subgraph
- `web/src/core/workflow/subgraph/io.ts` - I/O management
- `web/src/core/workflow/subgraph/flatten.ts` - Execution flattening

**Tasks:**
- [ ] Implement boundary link analysis
- [ ] Create convert-to-subgraph function
- [ ] Create unpack-subgraph function
- [ ] Implement I/O slot management
- [ ] Add circular reference prevention
- [ ] Write unit tests for operations

**Estimated Effort:** 4-5 hours

### Phase 3: UI Components

**Files to Create:**
- `web/src/components/node/SubgraphNode.tsx`
- `web/src/components/node/SubgraphInputNode.tsx`
- `web/src/components/node/SubgraphOutputNode.tsx`
- `web/src/components/navigation/SubgraphBreadcrumb.tsx`
- `web/src/components/panels/SubgraphEditorPanel.tsx`

**Files to Modify:**
- `web/src/components/node/ReactFlowWrapper.tsx` - Register node types
- `web/src/hooks/useNodeContextMenu.ts` - Add menu items

**Tasks:**
- [ ] Create SubgraphNode component (double-click, badge, icon)
- [ ] Create I/O node components (+ slot, drag-to-create)
- [ ] Create breadcrumb navigation component
- [ ] Add "Convert to Subgraph" menu item
- [ ] Add "Unpack Subgraph" menu item
- [ ] Create widget promotion panel
- [ ] Write component tests

**Estimated Effort:** 5-6 hours

### Phase 4: Navigation & Execution

**Files to Modify:**
- `web/src/stores/WorkflowRunner.ts` - Add flattening
- `web/src/stores/NodeStore.ts` - Navigation handlers

**Tasks:**
- [ ] Implement openSubgraph handler
- [ ] Implement exitSubgraph handler
- [ ] Add viewport preservation
- [ ] Implement graph flattening
- [ ] Add execution ID mapping
- [ ] Handle node updates for nested nodes
- [ ] Write integration tests

**Estimated Effort:** 3-4 hours

### Phase 5: Serialization & Loading

**Files to Modify:**
- `web/src/stores/graphNodeToReactFlowNode.ts` - Handle subgraph nodes
- `web/src/stores/reactFlowNodeToGraphNode.ts` - Serialize subgraph nodes

**Tasks:**
- [ ] Update workflow serialization
- [ ] Update workflow deserialization
- [ ] Add migration for old workflows
- [ ] Test save/load round-trip
- [ ] Write serialization tests

**Estimated Effort:** 2-3 hours

### Phase 6: Advanced Features

**Files to Create:**
- `web/src/core/workflow/subgraph/blueprints.ts` - Blueprint system
- `web/src/core/workflow/subgraph/search.ts` - Subgraph search

**Tasks:**
- [ ] Implement subgraph blueprints (save to library)
- [ ] Add blueprint loading
- [ ] Implement global search for subgraphs
- [ ] Add subgraph validation
- [ ] Write feature tests

**Estimated Effort:** 3-4 hours

### Phase 7: Polish & Documentation

**Tasks:**
- [ ] Add error handling and user feedback
- [ ] Add loading states
- [ ] Write user documentation
- [ ] Create demo workflows
- [ ] E2E testing
- [ ] Performance optimization

**Estimated Effort:** 3-4 hours

## Total Estimated Effort

**22-29 hours** of development time

## Key Risks & Mitigation

### Risk 1: Performance with Deep Nesting

**Risk:** Deep subgraph nesting could cause slow flattening.

**Mitigation:**
- Limit nesting depth (e.g., max 5 levels)
- Cache flattened graphs
- Add performance monitoring

### Risk 2: Undo/Redo Complexity

**Risk:** Temporal state management across navigation.

**Mitigation:**
- Use separate undo stack per graph level
- Clear redo stack on graph switch
- Document undo behavior clearly

### Risk 3: Edge Case Handling

**Risk:** Unusual node types (Loop, Group) may not convert cleanly.

**Mitigation:**
- Add explicit support for special node types
- Comprehensive test suite
- Graceful fallbacks

## Success Criteria

1. ✅ User can select nodes and convert to subgraph
2. ✅ User can double-click subgraph to navigate inside
3. ✅ User can add/remove I/O slots
4. ✅ User can promote widgets to subgraph interface
5. ✅ User can unpack subgraph back to nodes
6. ✅ Workflows with subgraphs execute correctly
7. ✅ Subgraphs persist correctly in saved workflows
8. ✅ No backend changes required
9. ✅ Performance acceptable (< 100ms for navigation)
10. ✅ Comprehensive test coverage (> 80%)

## Open Questions for Review

1. **Navigation UX**: Should we auto-open subgraphs on creation, or require explicit double-click?

2. **I/O Node Placement**: Should I/O nodes be fixed to edges or draggable?

3. **Widget Promotion**: Auto-promote all widgets, or only on user request?

4. **Blueprint Storage**: Store blueprints in backend or browser localStorage?

5. **Naming Convention**: Use "subgraph" throughout or align with existing "group" terminology?

6. **Execution IDs**: Use colon-separated IDs ("10:42:7") or another format?

7. **Circular References**: Prevent entirely or allow with warning?

8. **Migration Strategy**: How to handle existing workflows during deployment?

## Next Steps

1. **Review this plan** with team and stakeholders
2. **Get feedback** on open questions
3. **Prioritize phases** based on business needs
4. **Start implementation** with Phase 1
5. **Iterate** based on user testing

## References

- Original PRD: `/home/runner/work/nodetool/nodetool/subgraphs.md`
- NodeTool Architecture: `/home/runner/work/nodetool/nodetool/AGENTS.md`
- Web Store Guide: `/home/runner/work/nodetool/nodetool/web/src/stores/AGENTS.md`
- Component Guide: `/home/runner/work/nodetool/nodetool/web/src/components/AGENTS.md`
