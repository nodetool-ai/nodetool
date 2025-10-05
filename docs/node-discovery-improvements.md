# Node Discovery Improvements for NodeTool

## Problem Statement
The hardest part for users of NodeTool is finding the next node to use. This document outlines concrete improvements from simple to advanced.

---

## 🟢 Simple Improvements (Quick Wins)

### 1. **Recently Used Nodes Section**
**Implementation**: Add a "Recent" section at the top of the node menu.

**Technical Details**:
- Extend `NodeMenuStore.ts` to track recently used nodes
- Store in localStorage: `recentNodes: string[]` (max 10-15 nodes)
- Add new section in `RenderNodes.tsx` above search results
- Update on every `createNode()` call

```typescript
// NodeMenuStore.ts addition
recentlyUsedNodes: string[], // node_type strings
addRecentNode: (nodeType: string) => {
  set((state) => ({
    recentlyUsedNodes: [
      nodeType,
      ...state.recentlyUsedNodes.filter(n => n !== nodeType)
    ].slice(0, 15)
  }));
}
```

**UX**: Show 5-8 most recent nodes with icons at the top of node menu, always visible.

**Effort**: ~4 hours | **Impact**: High

---

### 2. **Keyboard Quick-Add for Recent Nodes**
**Implementation**: Number keys (1-9) to instantly add recent nodes when menu is open.

**Technical Details**:
- Extend `useNodeEditorShortcuts.ts`
- When node menu is open, `1-9` keys create the corresponding recent node
- Show numbers next to recent nodes in the UI

**UX**: Press spacebar → see numbered recent nodes → press `3` → node instantly created

**Effort**: ~2 hours | **Impact**: High for power users

---

### 3. **Connector Badge Counts**
**Implementation**: Show compatible node counts on output/input handles.

**Technical Details**:
- Extend `BaseNode.tsx` to compute compatible node counts per handle
- Use existing `filterTypesByInputType()` / `filterTypesByOutputType()` from `typeFilterUtils.ts`
- Display small badge on hover with count

```tsx
// In Handle component
const compatibleCount = useMemo(() => {
  const metadata = useMetadataStore.getState().metadata;
  return filterTypesByInputType(
    Object.values(metadata), 
    handleTypeMetadata
  ).length;
}, [handleTypeMetadata]);

<Tooltip title={`${compatibleCount} compatible nodes`}>
  <Badge badgeContent={compatibleCount} color="primary">
    {/* Handle */}
  </Badge>
</Tooltip>
```

**UX**: Hover over output → see "12 compatible nodes" → click to open filtered menu

**Effort**: ~6 hours | **Impact**: Medium-High

---

### 4. **Search Result Highlighting**
**Implementation**: Better visual hierarchy in search results.

**Technical Details**:
- Modify `NodeItem.tsx` to highlight matched text
- Use the existing Fuse.js search scores in `nodeSearch.ts`
- Add badges for "exact match", "new", "popular"

**Effort**: ~3 hours | **Impact**: Medium

---

### 5. **Namespace Favorites/Pins**
**Implementation**: Allow users to pin frequently-used namespaces.

**Technical Details**:
- Add `pinnedNamespaces: string[]` to persisted settings in `SettingsStore.ts`
- Show pin icon next to namespaces in `NamespaceItem.tsx`
- Display pinned namespaces at top of namespace tree

```typescript
// SettingsStore.ts addition
pinnedNamespaces: [],
togglePinnedNamespace: (namespace: string) => {
  set((state) => ({
    pinnedNamespaces: state.pinnedNamespaces.includes(namespace)
      ? state.pinnedNamespaces.filter(n => n !== namespace)
      : [...state.pinnedNamespaces, namespace]
  }));
}
```

**UX**: Right-click namespace → "Pin to top" → appears in favorites section

**Effort**: ~5 hours | **Impact**: Medium

---

## 🟡 Medium Complexity Improvements

### 6. **Context-Aware Menu Positioning**
**Implementation**: Pre-filter node menu based on what's connected to selected node.

**Technical Details**:
- When opening node menu with a node selected, automatically:
  - Check selected node's outputs → pre-filter to compatible inputs
  - Check selected node's inputs → pre-filter to compatible outputs
- Extend `openNodeMenu()` in `NodeMenuStore.ts` to accept `selectedNodeId`
- Use existing `getInputEdges()` and `getOutputEdges()` from `NodeStore.ts`

```typescript
// When user selects a node and opens menu (Shift+A or right-click)
const selectedNode = getSelectedNodes()[0];
if (selectedNode) {
  const inputEdges = getInputEdges(selectedNode.id);
  const outputEdges = getOutputEdges(selectedNode.id);
  
  // If node has free outputs, suggest compatible inputs
  if (hasUnconnectedOutputs(selectedNode)) {
    openNodeMenu({
      x, y,
      connectDirection: 'source',
      dropType: getFirstUnconnectedOutputType(selectedNode)
    });
  }
}
```

**UX**: Select image node → press Shift+A → menu shows image processing nodes first

**Effort**: ~8 hours | **Impact**: High

---

### 7. **"Next Nodes" Preview on Node Hover**
**Implementation**: Show quick-add buttons for common next nodes when hovering over a node.

**Technical Details**:
- Add new component `NodeQuickActions.tsx`
- Show on node hover with 200ms delay (use existing `useDelayedHover`)
- Display 3-5 most common next nodes as small floating buttons
- Use statistical data (see #10) or hardcoded common patterns initially

```tsx
// NodeQuickActions.tsx
<Box className="node-quick-actions" sx={{ position: 'absolute', top: -30 }}>
  {commonNextNodes.map(node => (
    <IconButton 
      size="small"
      onClick={() => createNodeAndConnect(node)}
      title={node.title}
    >
      <NodeIcon type={node.node_type} />
    </IconButton>
  ))}
</Box>
```

**UX**: Hover over "Load Image" → see quick buttons: "Resize", "Preview", "Save"

**Effort**: ~12 hours | **Impact**: High

---

### 8. **Smart Search with Aliases**
**Implementation**: Add searchable aliases and use-case keywords to nodes.

**Technical Details**:
- Extend node metadata on backend to include `aliases` and `keywords` fields
- Update Fuse.js configuration in `fuseOptions.ts` to include these fields
- Add common aliases:
  - "LLM" → finds Claude, GPT, Llama nodes
  - "resize" → finds Image Resize, Scale, Crop nodes
  - "save" → finds all output nodes

```typescript
// Backend: nodetool.metadata.types.NodeMetadata
class NodeMetadata:
    aliases: list[str] = []  # ['LLM', 'chat', 'AI']
    keywords: list[str] = []  # ['generation', 'creative', 'writing']
    common_use_cases: list[str] = []  # ['chatbot', 'image editing']
```

```typescript
// fuseOptions.ts update
export const fuseOptions = {
  keys: [
    { name: "title", weight: 3 },
    { name: "namespace", weight: 1 },
    { name: "description", weight: 2 },
    { name: "aliases", weight: 2.5 },  // NEW
    { name: "keywords", weight: 1.5 },  // NEW
  ],
  // ... rest of config
};
```

**UX**: Type "chat" → finds ChatOpenAI, Anthropic, Ollama nodes even if "chat" not in title

**Effort**: ~10 hours (4 backend, 6 frontend) | **Impact**: High

---

### 9. **Connection Suggestions on Drag**
**Implementation**: Show compatible nodes while dragging from a handle.

**Technical Details**:
- Extend `useDragHandlers.ts` to detect handle drag start
- Highlight compatible nodes in the canvas with glow effect
- Show floating "Compatible Nodes" count in corner
- Already partially implemented in `ConnectableNodes.tsx` - enhance it

```typescript
// When dragging from a handle
onConnectStart: (event, { nodeId, handleType, handleId }) => {
  const compatibleNodes = getConnectableNodes();
  
  // Highlight compatible nodes on canvas
  setNodes(nodes => nodes.map(node => ({
    ...node,
    className: compatibleNodes.includes(node.type) 
      ? 'compatible-highlight' 
      : 'dimmed'
  })));
  
  // Show floating menu
  setDragConnectionState({
    active: true,
    compatibleCount: compatibleNodes.length
  });
}
```

**UX**: Drag from image output → compatible image nodes glow, others dim

**Effort**: ~8 hours | **Impact**: Medium-High

---

### 10. **Node Usage Statistics (Local)**
**Implementation**: Track which nodes are used together and suggest based on patterns.

**Technical Details**:
- Create new store: `NodeUsageStore.ts`
- Track:
  - Node creation count: `Map<nodeType, number>`
  - Node pair frequency: `Map<"sourceType→targetType", number>`
  - Namespace usage: `Map<namespace, number>`
- Store in IndexedDB for persistence
- Update `RenderNodes.tsx` to sort by usage frequency

```typescript
// NodeUsageStore.ts
interface NodeUsageState {
  nodeFrequency: Record<string, number>;
  nodePairs: Record<string, number>; // "image.load→image.resize": 45
  lastUpdated: number;
  
  incrementNodeUsage: (nodeType: string) => void;
  recordNodeConnection: (sourceType: string, targetType: string) => void;
  getMostCommonNextNodes: (nodeType: string) => string[];
  getPopularNodes: (limit: number) => NodeMetadata[];
}

// Usage tracking
const { recordNodeConnection } = useNodeUsageStore();

onConnect: (connection) => {
  const sourceNode = findNode(connection.source);
  const targetNode = findNode(connection.target);
  if (sourceNode?.type && targetNode?.type) {
    recordNodeConnection(sourceNode.type, targetNode.type);
  }
}

// Suggestion usage
const getMostCommonNextNodes = (nodeType: string) => {
  const pairs = Object.entries(state.nodePairs)
    .filter(([pair]) => pair.startsWith(nodeType + '→'))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([pair]) => pair.split('→')[1]);
  return pairs;
}
```

**UX**: After using NodeTool for a week, your most-used nodes appear first

**Effort**: ~16 hours | **Impact**: High (grows over time)

---

## 🔴 Advanced Improvements

### 11. **Community Usage Statistics (Cloud)**
**Implementation**: Anonymous usage analytics to show popular node combinations.

**Technical Details**:
- Add optional telemetry to track node usage patterns
- Backend endpoint: `POST /api/v1/analytics/node-usage`
- Aggregate data daily: most common node pairs, workflows
- New endpoint: `GET /api/v1/suggestions/next-nodes?after=image.load`
- Cache results in React Query with 24h stale time

```typescript
// Backend API (FastAPI)
@router.get("/api/v1/suggestions/next-nodes")
async def get_next_node_suggestions(
    after: str,  # node_type
    limit: int = 10,
    user_id: str = None
) -> List[NodeSuggestion]:
    """
    Returns most common next nodes based on community usage.
    If user_id provided, personalize based on their history.
    """
    suggestions = await analytics_service.get_next_nodes(
        source_node=after,
        limit=limit
    )
    return [
        NodeSuggestion(
            node_type=s.node_type,
            frequency=s.frequency,
            confidence=s.confidence
        )
        for s in suggestions
    ]

# Frontend integration
const { data: suggestions } = useQuery({
  queryKey: ['node-suggestions', selectedNode.type],
  queryFn: () => api.getSuggestions({ after: selectedNode.type }),
  staleTime: 1000 * 60 * 60 * 24, // 24 hours
  enabled: !!selectedNode
});
```

**Privacy**: Opt-in, anonymous, only track node types and connections, not data

**UX**: See badge "Popular next step" on suggested nodes

**Effort**: ~40 hours (20 backend, 20 frontend) | **Impact**: Very High

---

### 12. **Workflow Template Suggestions**
**Implementation**: Suggest complete sub-workflows based on context.

**Technical Details**:
- Create template library: common node patterns
- Store in `templates/` directory as JSON workflows
- Detect context (selected nodes, current workflow stage)
- Show "Insert Template" option in node menu

```typescript
// Template structure
interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  trigger_context: {
    after_node_types?: string[];  // Show after these nodes
    required_outputs?: string[];  // Match output types
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Templates
const IMAGE_UPSCALE_TEMPLATE: WorkflowTemplate = {
  id: "image-upscale-4x",
  name: "4x Upscale with Denoise",
  description: "Upscales image 4x using Real-ESRGAN with denoising",
  tags: ["image", "upscale", "enhancement"],
  trigger_context: {
    after_node_types: ["image.load", "image.resize"],
    required_outputs: ["image"]
  },
  nodes: [
    { type: "image.upscale", properties: { scale: 4 } },
    { type: "image.denoise", properties: { strength: 0.5 } },
    { type: "image.preview" }
  ],
  edges: [/* ... */]
};

// Show templates in node menu
const templates = useMemo(() => {
  if (!selectedNode) return [];
  return workflowTemplates.filter(t => 
    t.trigger_context.after_node_types?.includes(selectedNode.type)
  );
}, [selectedNode]);
```

**UX**: Select image node → see "Insert: 4x Upscale" → click → 3 nodes added and connected

**Effort**: ~24 hours + template creation | **Impact**: Very High

---

### 13. **Natural Language Node Search**
**Implementation**: Type descriptions like "make the image bigger" to find resize nodes.

**Technical Details**:
- Add semantic search using embeddings
- Pre-compute embeddings for all node descriptions on load
- Use lightweight model like `all-MiniLM-L6-v2` (client-side with ONNX)
- Fall back to existing Fuse.js for exact matching

```typescript
// New utility: semanticSearch.ts
import { pipeline } from '@xenova/transformers';

let embedder: any = null;

export async function initSemanticSearch() {
  embedder = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2'
  );
}

export async function semanticNodeSearch(
  query: string,
  nodes: NodeMetadata[]
): Promise<NodeMetadata[]> {
  if (!embedder) await initSemanticSearch();
  
  const queryEmbedding = await embedder(query, {
    pooling: 'mean',
    normalize: true
  });
  
  // Compare with pre-computed node embeddings
  const scores = nodes.map(node => ({
    node,
    score: cosineSimilarity(queryEmbedding, node.embedding)
  }));
  
  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(s => s.node);
}

// Integration in NodeMenuStore.ts
performSearch: (term: string) => {
  // If query looks conversational, use semantic search
  if (term.split(' ').length > 2) {
    const results = await semanticNodeSearch(term, metadata);
    set({ searchResults: results });
  } else {
    // Use existing Fuse.js search
    const results = fuseSearch(term, metadata);
    set({ searchResults: results });
  }
}
```

**UX**: Type "convert video to audio" → finds audio extraction nodes

**Effort**: ~30 hours | **Impact**: High (game-changing for new users)

---

### 14. **AI-Powered Workflow Assistant**
**Implementation**: Chat-based assistant to suggest next nodes based on conversation.

**Technical Details**:
- Extend existing `GlobalChatStore.ts` 
- Add new system prompt for workflow assistance
- Register new tool: `suggest_next_node`
- Use workflow context (current nodes, connections) as chat context

```typescript
// Backend tool definition
@tool
def suggest_next_node(
    current_node_type: str,
    user_intent: str,
    workflow_context: dict
) -> List[dict]:
    """
    Suggests next nodes based on current workflow and user intent.
    
    Args:
        current_node_type: The node user is working with
        user_intent: What user wants to do next
        workflow_context: Current workflow state
    
    Returns:
        List of suggested nodes with reasoning
    """
    # Use LLM to analyze intent and suggest nodes
    suggestions = llm.suggest_nodes(
        current_node=current_node_type,
        intent=user_intent,
        context=workflow_context,
        available_nodes=get_all_node_metadata()
    )
    
    return [
        {
            "node_type": s.node_type,
            "reason": s.reason,
            "confidence": s.confidence
        }
        for s in suggestions
    ]

// Frontend integration
// Add button in node context menu: "Ask AI for suggestions"
const handleAIAssist = async () => {
  const message = `I'm working with a ${node.type} node. 
    What should I add next to ${userIntent}?`;
  
  await sendMessage({
    role: "user",
    content: message,
    workflow_context: {
      nodes: nodes.map(n => ({ type: n.type })),
      edges: edges.map(e => ({ source: e.source, target: e.target }))
    }
  });
};
```

**UX**: 
- Right-click node → "Get AI Suggestions"
- Chat: "I want to blur the background" → AI suggests relevant nodes with explanations
- Click suggested node → instantly added to workflow

**Effort**: ~40 hours | **Impact**: Very High (Premium feature)

---

### 15. **Visual Node Recommendations**
**Implementation**: Show visual examples of what each node does when hovering.

**Technical Details**:
- Add `example_input` and `example_output` to node metadata
- Store thumbnail images or generated previews
- Show in `NodeInfo.tsx` tooltip
- Create example library: 100 most common nodes

```typescript
// Backend addition
class NodeMetadata:
    example_images: List[ExampleImage] = []

class ExampleImage:
    input_url: str  # URL to example input
    output_url: str  # URL to example output
    description: str

// Frontend: Enhanced NodeInfo.tsx
<Box className="node-examples">
  <Typography variant="caption">Examples:</Typography>
  {nodeMetadata.example_images?.slice(0, 2).map(example => (
    <Box key={example.input_url} className="example-pair">
      <img src={example.input_url} alt="Input" width={80} />
      <ArrowRightIcon />
      <img src={example.output_url} alt="Output" width={80} />
      <Typography variant="caption">{example.description}</Typography>
    </Box>
  ))}
</Box>
```

**UX**: Hover over "Gaussian Blur" → see before/after image thumbnails

**Effort**: ~50 hours (15 dev, 35 content creation) | **Impact**: Very High for new users

---

## 🎯 Implementation Priority

### Phase 1 (Week 1-2): Quick Wins
1. Recently Used Nodes (#1) ⭐
2. Keyboard Quick-Add (#2) ⭐
3. Search Result Highlighting (#4)
4. Namespace Favorites (#5)

### Phase 2 (Week 3-4): Context Awareness
5. Context-Aware Menu Positioning (#6) ⭐⭐
6. Connector Badge Counts (#3)
7. Connection Suggestions on Drag (#9)

### Phase 3 (Month 2): Intelligence
8. Node Usage Statistics - Local (#10) ⭐⭐⭐
9. Smart Search with Aliases (#8) ⭐⭐
10. "Next Nodes" Preview (#7)

### Phase 4 (Month 3): Advanced
11. Community Statistics (#11) ⭐⭐⭐
12. Workflow Template Suggestions (#12) ⭐⭐⭐
13. Natural Language Search (#13)

### Phase 5 (Month 4+): AI Features
14. AI Workflow Assistant (#14) 🚀
15. Visual Node Recommendations (#15) 🚀

**Legend**: 
- ⭐ = High user value
- 🚀 = Game-changing feature

---

## Success Metrics

Track these metrics to measure improvement:

1. **Time to Find Node**: Average time from opening node menu to selection
2. **Search Usage**: % of users using search vs browsing namespaces
3. **Connection Success Rate**: % of attempted connections that succeed
4. **New User Onboarding**: Time for new users to create first working workflow
5. **Feature Adoption**: Usage rates of recently used, favorites, suggestions
6. **Node Menu Abandonment**: % of times menu opened but closed without selection

---

## Technical Considerations

### Performance
- Cache search results and embeddings
- Lazy-load node metadata and examples
- Use IndexedDB for local statistics (not localStorage)
- Debounce search input (already implemented)
- Virtual scrolling for large node lists (consider `react-window`)

### Privacy
- Make community statistics opt-in
- Anonymize all usage data
- Allow users to clear their usage history
- GDPR-compliant data retention policies

### Accessibility
- All suggestions must be keyboard accessible
- Screen reader support for recommendations
- High contrast mode for highlighted nodes
- Focus management in node menu

### Testing
- Unit tests for suggestion algorithms
- Integration tests for node creation flows
- A/B testing for different suggestion UIs
- User testing sessions with 5-10 users per phase

---

## File Changes Required

### Simple Features (#1-5)
- `web/src/stores/NodeMenuStore.ts` - Add recent nodes tracking
- `web/src/stores/SettingsStore.ts` - Add pinned namespaces
- `web/src/components/node_menu/RenderNodes.tsx` - Show recent section
- `web/src/components/node_menu/NamespaceItem.tsx` - Add pin button
- `web/src/hooks/useNodeEditorShortcuts.ts` - Add number key shortcuts
- `web/src/components/node/BaseNode.tsx` - Add handle badges

### Medium Features (#6-10)
- `web/src/stores/NodeUsageStore.ts` - NEW FILE for usage tracking
- `web/src/components/node/NodeQuickActions.tsx` - NEW FILE for hover actions
- `web/src/hooks/useDragHandlers.ts` - Enhance connection highlighting
- `web/src/utils/fuseOptions.ts` - Add alias/keyword support
- Backend: `nodetool/metadata/types.py` - Add aliases to NodeMetadata

### Advanced Features (#11-15)
- `web/src/services/SuggestionService.ts` - NEW FILE for API calls
- `web/src/utils/semanticSearch.ts` - NEW FILE for NLP search
- `web/src/components/templates/WorkflowTemplates.tsx` - NEW FILE
- `web/src/components/node_menu/VisualExamples.tsx` - NEW FILE
- Backend: `nodetool/api/routers/suggestions.py` - NEW FILE for analytics
- Backend: `nodetool/analytics/usage_tracker.py` - NEW FILE

---

## Conclusion

These improvements address node discovery from multiple angles:

1. **Memory aids**: Recently used, favorites, statistics
2. **Context awareness**: Connected nodes, output types, workflow state
3. **Search enhancement**: Aliases, semantic search, visual examples
4. **Intelligent suggestions**: Usage patterns, AI assistance, templates

Start with Phase 1 quick wins for immediate user impact, then progressively add intelligence as usage data accumulates.

The combination of local intelligence (#10) + community data (#11) + AI assistance (#14) will create a learning system that gets better over time, dramatically reducing the node discovery problem.
