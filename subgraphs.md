Based on my comprehensive analysis of the ComfyUI_frontend repository, here is a detailed PRD-style document for implementing subgraph functionality in any node-based environment:

---

# **Product Requirements Document: UI-Only Subgraph System**
## **For Node-Based Visual Programming Environments**

**Version:** 1.0  
**Last Updated:** 2026-01-11  
**Document Type:** Architecture & Feature Specification

---

## **1. Executive Summary**

### **1.1 Purpose**
This document specifies a complete UI-only subgraph system that allows users to encapsulate groups of nodes into reusable, hierarchical components without backend awareness. The implementation maintains full workflow flattening for execution while providing powerful organizational and reusability features.

### **1.2 Key Principles**
- ✅ **UI-Only**: Subgraphs exist purely in the frontend; backend receives flattened node graphs
- ✅ **Execution Transparency**: No backend changes required; existing execution engines work unchanged  
- ✅ **Hierarchical**: Subgraphs can contain other subgraphs (nested composition)
- ✅ **Reusable**: Subgraph definitions can be instantiated multiple times
- ✅ **Serializable**: Complete state persists in workflow JSON

**Note:** Results are limited to the search responses received. For complete code exploration, [view all subgraph files on GitHub](https://github.com/Comfy-Org/ComfyUI_frontend/search?q=path%3A**%2Fsubgraph%2F**).

---

## **2. Core Concepts**

### **2.1 Subgraph Definition vs Instance**

#### **Subgraph Definition (The Blueprint)**
- **Immutable template** defining internal structure
- Contains: nodes, links, reroutes, groups, input/output configurations
- Has a unique **UUID** for identification
- Stored once per workflow in `definitions.subgraphs[]`
- Analogous to a "class" in OOP

```typescript
interface SubgraphDefinition {
  id: UUID                    // Unique identifier
  name: string                // Display name
  version: number             // Schema version
  
  // Structure
  nodes: Node[]               // Internal nodes
  links: Link[]               // Internal connections
  reroutes: Reroute[]         // Internal reroute points
  groups: Group[]             // Visual groupings
  
  // Interface
  inputNode: IONodeConfig     // Special input node
  outputNode: IONodeConfig    // Special output node
  inputs: SubgraphInput[]     // Ordered inputs
  outputs: SubgraphOutput[]   // Ordered outputs
  widgets: ExposedWidget[]    // Promoted widgets
  
  // Metadata
  state: GraphState           // Canvas state (zoom, offset)
  revision: number            // Change tracking
  config: GraphConfig         // Graph settings
}
```

#### **Subgraph Instance (The Usage)**
- **Concrete usage** of a definition on a canvas
- Contains: position, size, custom properties, slot overrides
- References definition by UUID via `type` field
- Can have multiple instances of same definition
- Analogous to an "object instance" in OOP

```typescript
interface SubgraphInstance {
  id: NodeId                  // Unique instance ID
  type: UUID                  // References SubgraphDefinition.id
  pos: [number, number]       // Canvas position
  size: [number, number]      // Visual dimensions
  
  // Instance customization
  properties: Record<string, any>  // Custom properties
  inputs: SlotConfig[]        // Input slot customization
  outputs: SlotConfig[]       // Output slot customization
  
  // Visual state
  flags: NodeFlags            // Collapsed, bypassed, etc.
  mode: NodeMode              // Always, never, on_change, etc.
  order: number               // Execution order hint
  color?: string              // Custom color
  bgcolor?: string            // Background color
}
```

---

### **2.2 Special Nodes: Input/Output Gateways**

Subgraphs have two **special virtual nodes** that manage data flow:

#### **SubgraphInputNode** (Unique ID: `-1`)
- **Appears inside subgraph** on the left edge
- **Acts as output slots** within the subgraph (data flows OUT of it)
- Each slot connects to internal node inputs
- Adds an empty slot ("+") for creating new inputs on-demand

```
Parent Graph                    Subgraph Interior
┌──────────────┐                ┌────────────────────┐
│ [NodeA]      │                │  [Input Node]      │
│   output ────┼───────────────►│  • input1 ────►... │
│              │                │  • input2 ────►... │
└──────────────┘                │  • [+]             │
                                └────────────────────┘
```

#### **SubgraphOutputNode** (Unique ID: `-2`)
- **Appears inside subgraph** on the right edge
- **Acts as input slots** within the subgraph (data flows INTO it)
- Each slot receives from internal node outputs
- Adds an empty slot ("+") for creating new outputs on-demand

```
Subgraph Interior               Parent Graph
┌────────────────────┐          ┌──────────────┐
│  ...────►output1 • │          │ [NodeB]      │
│  ...────►output2 • │◄─────────┼────input     │
│          [+]     • │          │              │
└────────────────────┘          └──────────────┘
         [Output Node]
```

**Key Properties:**
- Virtual nodes (not part of node registry)
- Fixed IDs (`SUBGRAPH_INPUT_ID = -1`, `SUBGRAPH_OUTPUT_ID = -2`)
- Not deletable, always present in subgraphs
- Render as rounded rectangles on canvas edges
- Support double-click to rename slots
- Right-click for context menu (rename/remove)

---

### **2.3 Subgraph Slots: The Interface Contract**

#### **SubgraphInput (Parent → Subgraph)**
```typescript
interface SubgraphInput {
  id: UUID                    // Unique slot ID
  name: string                // Slot name
  type: string                // Data type
  linkIds: LinkId[]           // Connected links (multiple allowed)
  
  // Optional metadata
  label?: string              // Display override
  localized_name?: string     // i18n name
  color_on?: string           // Active color
  color_off?: string          // Inactive color
  shape?: SlotShape           // Visual shape (circle, square, etc.)
  dir?: SlotDirection         // UP, DOWN, LEFT, RIGHT
  
  // Widget binding (if input is from promoted widget)
  _widget?: WeakRef<Widget>   // Linked widget reference
}
```

#### **SubgraphOutput (Subgraph → Parent)**
```typescript
interface SubgraphOutput {
  id: UUID                    // Unique slot ID
  name: string                // Slot name
  type: string                // Data type
  linkIds: [LinkId] | []      // Single link only
  
  // Optional metadata (same as inputs)
  label?: string
  localized_name?: string
  color_on?: string
  color_off?: string
  shape?: SlotShape
  dir?: SlotDirection
}
```

**Important Distinction:**
- Subgraph **inputs** are **outputs** when viewed from inside (data flows OUT to nodes)
- Subgraph **outputs** are **inputs** when viewed from inside (data flows IN from nodes)
- Similar to "reroutes" but with special handling for hierarchy traversal

---

## **3. Operations**

### **3.1 Creating Subgraphs: "Convert to Subgraph"**

#### **User Action**
1. Select multiple nodes on canvas (minimum 2)
2. Invoke "Convert to Subgraph" (right-click menu, toolbar, or keyboard shortcut)

#### **Process**
```typescript
function convertToSubgraph(selectedItems: Set<Node | Reroute | Group>) {
  // 1. Validate selection (must have nodes)
  if (selectedItems.size === 0) throw Error("Nothing to convert")
  
  // 2. Expand groups to include children
  if (selectedItems has LGraphGroup) {
    group.recomputeInsideNodes()
    selectedItems.add(...group.children)
  }
  
  // 3. Analyze connections
  const analysis = analyzeBoundaryConnections(selectedItems)
  // analysis = {
  //   boundaryInputLinks:  Links entering from outside
  //   boundaryOutputLinks: Links exiting to outside
  //   internalLinks:       Links within selection
  //   boundaryFloatingLinks: Floating links crossing boundary
  // }
  
  // 4. Create subgraph definition
  const subgraphDef = {
    id: generateUUID(),
    name: "New Subgraph",
    nodes: cloneNodes(selectedItems.nodes),
    links: cloneLinks(analysis.internalLinks),
    reroutes: cloneReroutes(selectedItems.reroutes),
    groups: cloneGroups(selectedItems.groups),
    inputs: mapInputsFromBoundaryLinks(analysis.boundaryInputLinks),
    outputs: mapOutputsFromBoundaryLinks(analysis.boundaryOutputLinks),
    inputNode: createIONode(position: [left, center]),
    outputNode: createIONode(position: [right, center])
  }
  
  // 5. Create subgraph instance node
  const instanceNode = new SubgraphNode(subgraphDef)
  instanceNode.pos = computeCenter(selectedItems)
  
  // 6. Reconnect external links to instance
  reconnectBoundaryLinks(instanceNode, analysis)
  
  // 7. Remove original nodes from parent graph
  removeNodes(selectedItems)
  
  // 8. Add subgraph to graph registry
  parentGraph.subgraphs.set(subgraphDef.id, subgraphDef)
  parentGraph.add(instanceNode)
  
  // 9. Dispatch event for UI updates
  parentGraph.events.dispatch('subgraph-created', { subgraph: subgraphDef })
  
  return { subgraph: subgraphDef, node: instanceNode }
}
```

#### **Input/Output Mapping Algorithm**
```typescript
function mapInputsFromBoundaryLinks(boundaryLinks: Link[]): SubgraphInput[] {
  // Group links by target (node inside subgraph)
  const grouped = groupBy(boundaryLinks, link => `${link.target_id}:${link.target_slot}`)
  
  const inputs: SubgraphInput[] = []
  for (const [key, connections] of Object.entries(grouped)) {
    const firstConnection = connections[0]
    const targetNode = getNode(firstConnection.target_id)
    const targetSlot = targetNode.inputs[firstConnection.target_slot]
    
    // Create input slot matching target's type
    const input: SubgraphInput = {
      id: generateUUID(),
      name: generateUniqueName(targetSlot.name, existingInputs),
      type: targetSlot.type,
      linkIds: [], // Will be filled when reconnecting
      color_on: targetSlot.color_on,
      shape: targetSlot.shape
    }
    
    inputs.push(input)
    
    // Update internal link to point from SubgraphInputNode
    for (const conn of connections) {
      conn.origin_id = SUBGRAPH_INPUT_ID
      conn.origin_slot = inputs.length - 1
    }
  }
  return inputs
}

function mapOutputsFromBoundaryLinks(boundaryLinks: Link[]): SubgraphOutput[] {
  // Similar process but for outputs
  // Group by origin (node inside subgraph emitting data)
  const grouped = groupBy(boundaryLinks, link => `${link.origin_id}:${link.origin_slot}`)
  
  const outputs: SubgraphOutput[] = []
  for (const [key, connections] of Object.entries(grouped)) {
    const firstConnection = connections[0]
    const originNode = getNode(firstConnection.origin_id)
    const originSlot = originNode.outputs[firstConnection.origin_slot]
    
    // Create output slot matching origin's type
    const output: SubgraphOutput = {
      id: generateUUID(),
      name: generateUniqueName(originSlot.name, existingOutputs),
      type: originSlot.type,
      linkIds: [], // Only one link per output
      color_on: originSlot.color_on,
      shape: originSlot.shape
    }
    
    outputs.push(output)
    
    // Update internal link to point to SubgraphOutputNode
    for (const conn of connections) {
      conn.target_id = SUBGRAPH_OUTPUT_ID
      conn.target_slot = outputs.length - 1
    }
  }
  return outputs
}
```

---

### **3.2 Unpacking Subgraphs: "Unpack Subgraph"**

#### **User Action**
1. Select subgraph instance node
2. Invoke "Unpack Subgraph" (right-click menu or command)

#### **Process**
```typescript
function unpackSubgraph(subgraphNode: SubgraphInstance, options?: { skipMissingNodes: boolean }) {
  const subgraph = subgraphNode.subgraph
  const skipMissing = options?.skipMissingNodes ?? false
  
  // 1. Calculate positioning
  const bounds = computeBounds(subgraph.nodes, subgraph.reroutes, subgraph.groups)
  const center = [bounds.x + bounds.width/2, bounds.y + bounds.height/2]
  const offsetX = subgraphNode.pos[0] - center[0]
  const offsetY = subgraphNode.pos[1] - center[1]
  
  // 2. Clone internal nodes to parent graph
  const nodeIdMap = new Map<NodeId, NodeId>()
  const newNodes = []
  
  for (const nodeData of subgraph.nodes) {
    const newId = parentGraph.getNextNodeId()
    nodeIdMap.set(nodeData.id, newId)
    
    const newNode = createNode(nodeData.type)
    if (!newNode && skipMissing) continue  // Skip if node type not found
    
    newNode.id = newId
    newNode.pos = [nodeData.pos[0] + offsetX, nodeData.pos[1] + offsetY]
    newNode.size = nodeData.size
    // ... copy all properties
    
    parentGraph.add(newNode)
    newNodes.push(newNode)
  }
  
  // 3. Recreate internal links
  const linkIdMap = new Map<LinkId, LinkId[]>()
  for (const linkData of subgraph.links) {
    // Skip links to/from I/O nodes (will be recreated from boundary)
    if (linkData.origin_id === SUBGRAPH_INPUT_ID || 
        linkData.target_id === SUBGRAPH_OUTPUT_ID) continue
    
    const newOriginId = nodeIdMap.get(linkData.origin_id)
    const newTargetId = nodeIdMap.get(linkData.target_id)
    if (!newOriginId || !newTargetId) continue
    
    const newLink = parentGraph.createLink(
      newOriginId, linkData.origin_slot,
      newTargetId, linkData.target_slot
    )
    
    linkIdMap.set(linkData.id, [newLink.id])
  }
  
  // 4. Reconnect boundary links (inputs)
  for (const input of subgraph.inputs) {
    for (const linkId of input.linkIds) {
      const internalLink = subgraph.getLink(linkId)
      const newTargetId = nodeIdMap.get(internalLink.target_id)
      if (!newTargetId) continue
      
      // Find external link connected to this input
      const externalLink = parentGraph.findLinkToSlot(subgraphNode.id, inputIndex)
      if (externalLink) {
        // Reconnect external origin to internal target
        parentGraph.createLink(
          externalLink.origin_id, externalLink.origin_slot,
          newTargetId, internalLink.target_slot
        )
        parentGraph.removeLink(externalLink.id)
      }
    }
  }
  
  // 5. Reconnect boundary links (outputs)
  for (const output of subgraph.outputs) {
    const linkId = output.linkIds[0]
    if (!linkId) continue
    
    const internalLink = subgraph.getLink(linkId)
    const newOriginId = nodeIdMap.get(internalLink.origin_id)
    if (!newOriginId) continue
    
    // Find all external links from this output
    const externalLinks = parentGraph.findLinksFromSlot(subgraphNode.id, outputIndex)
    for (const externalLink of externalLinks) {
      // Reconnect internal origin to external targets
      parentGraph.createLink(
        newOriginId, internalLink.origin_slot,
        externalLink.target_id, externalLink.target_slot
      )
      parentGraph.removeLink(externalLink.id)
    }
  }
  
  // 6. Restore reroutes, groups
  restoreReroutes(subgraph.reroutes, offsetX, offsetY, linkIdMap)
  restoreGroups(subgraph.groups, offsetX, offsetY)
  
  // 7. Remove subgraph instance node
  parentGraph.remove(subgraphNode)
  
  // 8. Select unpacked nodes
  canvas.select(...newNodes)
}
```

---

### **3.3 Navigating Subgraphs: "Open Subgraph"**

#### **User Action**
1. Double-click subgraph instance node OR
2. Select node and click "Edit" button OR
3. Use breadcrumb navigation

#### **Navigation Stack**
```typescript
interface SubgraphNavigationStore {
  activeSubgraph: Subgraph | undefined
  idStack: UUID[]  // Path from root to current subgraph
  viewportCache: LRU<UUID, ViewportState>  // Per-subgraph viewport
  
  // Navigation methods
  openSubgraph(subgraphNode: SubgraphInstance): void
  exitSubgraph(): void
  exitToRoot(): void
  restoreState(subgraphIds: UUID[]): void
}

function openSubgraph(subgraphNode: SubgraphInstance) {
  const subgraph = getSubgraphDefinition(subgraphNode.type)
  
  // 1. Save current viewport
  const currentGraphId = activeSubgraph?.id ?? 'root'
  viewportCache.set(currentGraphId, getCurrentViewport())
  
  // 2. Push to navigation stack
  idStack.push(subgraphNode.id)
  activeSubgraph = subgraph
  
  // 3. Set canvas to subgraph
  canvas.setGraph(subgraph)
  
  // 4. Restore subgraph's saved viewport (if any)
  const savedViewport = viewportCache.get(subgraph.id)
  if (savedViewport) {
    canvas.ds.scale = savedViewport.scale
    canvas.ds.offset = savedViewport.offset
  } else {
    canvas.centerView()  // Default: center on content
  }
  
  // 5. Dispatch event
  canvas.dispatchEvent('subgraph-opened', { 
    subgraph, 
    fromNode: subgraphNode 
  })
}

function exitSubgraph() {
  if (idStack.length === 0) return  // Already at root
  
  // 1. Save current viewport
  viewportCache.set(activeSubgraph.id, getCurrentViewport())
  
  // 2. Pop navigation stack
  idStack.pop()
  
  // 3. Get parent graph
  const parentGraph = (idStack.length === 0) 
    ? rootGraph 
    : getSubgraphDefinition(idStack[idStack.length - 1])
  
  activeSubgraph = (idStack.length > 0) ? parentGraph : undefined
  
  // 4. Set canvas to parent
  canvas.setGraph(parentGraph)
  
  // 5. Restore parent's viewport
  const parentId = parentGraph.id ?? 'root'
  const savedViewport = viewportCache.get(parentId)
  if (savedViewport) {
    canvas.ds.scale = savedViewport.scale
    canvas.ds.offset = savedViewport.offset
  }
}
```

#### **Breadcrumb Component**
```typescript
interface BreadcrumbItem {
  label: string          // Subgraph name
  subgraph: Subgraph     // Reference to definition
  command: () => void    // Click handler to navigate
  updateTitle: (newTitle: string) => void  // Rename handler
}

function computeBreadcrumbs(): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [
    {
      label: workflowName,
      subgraph: rootGraph,
      command: () => exitToRoot(),
      updateTitle: (title) => renameWorkflow(title)
    }
  ]
  
  for (const subgraphId of idStack) {
    const subgraph = getSubgraphDefinition(subgraphId)
    items.push({
      label: subgraph.name,
      subgraph: subgraph,
      command: () => navigateToSubgraph(subgraph),
      updateTitle: (title) => renameSubgraph(subgraph, title)
    })
  }
  
  return items
}
```

**UI Features:**
- Displays workflow name → subgraph 1 → subgraph 2 → ...
- Click any breadcrumb to jump to that level
- Double-click breadcrumb to rename
- Hover shows tooltip with full path
- Auto-collapse if too many levels (show "..." with overflow menu)

---

### **3.4 Managing Subgraph I/O**

#### **Adding Inputs/Outputs**

**Method 1: Auto-create from connections**
```typescript
// When dragging link from external node to empty slot ("+")
function onDropLinkToEmptySlot(
  externalOutput: NodeOutput,
  emptySlot: EmptySubgraphInput
) {
  // 1. Create new input slot matching type
  const newInput = {
    id: generateUUID(),
    name: generateUniqueName(externalOutput.name, subgraph.inputs),
    type: externalOutput.type,
    linkIds: [],
    color_on: externalOutput.color_on,
    shape: externalOutput.shape
  }
  
  subgraph.inputs.push(newInput)
  
  // 2. Update subgraph instance
  subgraphNode.addInput(newInput.name, newInput.type)
  
  // 3. Create external link
  const externalLink = parentGraph.createLink(
    externalOutput.node.id, externalOutput.slot,
    subgraphNode.id, subgraph.inputs.length - 1
  )
  newInput.linkIds.push(externalLink.id)
  
  // 4. Dispatch event
  subgraph.events.dispatch('input-added', { input: newInput })
}
```

**Method 2: Manual creation via context menu**
```typescript
// Right-click on I/O node → "Add Input/Output"
function addInputSlot(subgraph: Subgraph) {
  const name = await promptForName("New Input")
  const type = await selectType() // "*" (any), "number", "string", etc.
  
  const newInput = {
    id: generateUUID(),
    name: generateUniqueName(name, subgraph.inputs),
    type: type,
    linkIds: [],
  }
  
  subgraph.inputs.push(newInput)
  
  // Update all instances
  forEachSubgraphInstance(subgraph, (instance) => {
    instance.addInput(newInput.name, newInput.type)
  })
  
  subgraph.events.dispatch('input-added', { input: newInput })
}
```

#### **Removing Inputs/Outputs**
```typescript
function removeInput(subgraph: Subgraph, input: SubgraphInput) {
  const index = subgraph.inputs.indexOf(input)
  if (index === -1) return
  
  // 1. Dispatch pre-removal event
  subgraph.events.dispatch('removing-input', { input, index })
  
  // 2. Disconnect all internal links
  for (const linkId of input.linkIds) {
    const link = subgraph.getLink(linkId)
    link.disconnect(subgraph)
  }
  
  // 3. Remove slot from definition
  subgraph.inputs.splice(index, 1)
  
  // 4. Update all instances
  forEachSubgraphInstance(subgraph, (instance) => {
    instance.removeInput(index)
    // Disconnect external links
    const externalLinks = parentGraph.findLinksToSlot(instance.id, index)
    externalLinks.forEach(link => parentGraph.removeLink(link.id))
  })
  
  // 5. Decrement slot indices for later slots
  for (let i = index; i < subgraph.inputs.length; i++) {
    // Update internal links pointing to this input
    // ...decrementSlotIndex logic
  }
}
```

#### **Renaming Slots**
```typescript
function renameInput(subgraph: Subgraph, input: SubgraphInput, newName: string) {
  const index = subgraph.inputs.indexOf(input)
  const oldName = input.name
  
  // 1. Validate uniqueness
  if (subgraph.inputs.some((i, idx) => i.name === newName && idx !== index)) {
    throw new Error(`Input name "${newName}" already exists`)
  }
  
  // 2. Dispatch pre-rename event
  subgraph.events.dispatch('renaming-input', { input, index, oldName, newName })
  
  // 3. Update definition
  input.name = newName
  input.label = newName
  
  // 4. Update all instances
  forEachSubgraphInstance(subgraph, (instance) => {
    const slot = instance.inputs[index]
    slot.name = newName
    slot.label = newName
  })
}
```

---

### **3.5 Widget Promotion (Proxy Widgets)**

**Concept:** Expose internal node widgets on the subgraph instance for easy parameter access without opening the subgraph.

#### **Data Structure**
```typescript
interface ExposedWidget {
  nodeId: NodeId    // Node inside subgraph
  widgetName: string  // Widget name on that node
}

// Stored in subgraph instance properties
subgraphNode.properties.proxyWidgets = [
  [nodeId, widgetName],  // Array of tuples
  ...
]
```

#### **Promoting a Widget**
```typescript
function promoteWidget(subgraph: Subgraph, node: LGraphNode, widget: IWidget) {
  const subgraphNode = findSubgraphInstance(subgraph)
  if (!subgraphNode) return
  
  // 1. Create proxy widget on subgraph node
  const proxyWidget = createProxyWidget(widget, {
    graph: subgraph,
    nodeId: node.id,
    widgetName: widget.name
  })
  
  subgraphNode.widgets.push(proxyWidget)
  
  // 2. Update properties
  subgraphNode.properties.proxyWidgets.push([node.id, widget.name])
  
  // 3. Mark widget as promoted
  widget.promoted = true
  
  // 4. Dispatch event
  subgraph.events.dispatch('widget-promoted', { 
    widget, 
    subgraphNode 
  })
}

function createProxyWidget(targetWidget: IWidget, overlay: WidgetOverlay): ProxyWidget {
  // Create a Proxy that intercepts property access
  return new Proxy(targetWidget, {
    get(target, prop) {
      // Properties in overlay take precedence
      if (prop === '_overlay') return overlay
      if (prop in overlay) return overlay[prop]
      
      // Fall back to target widget
      return target[prop]
    },
    set(target, prop, value) {
      // Some properties go to overlay, others to target
      if (prop in overlay) {
        overlay[prop] = value
        return true
      }
      target[prop] = value
      return true
    }
  })
}
```

#### **Widget Promotion UI**
- **Subgraph Editor Panel** (right sidebar):
  - Lists all internal nodes and their widgets
  - Checkbox per widget to promote/demote
  - Drag-to-reorder promoted widgets
  - Search/filter widgets by name
  - Group by node for organization
  
- **Automatic Promotion**:
  - When converting to subgraph, auto-promote "recommended" widgets:
    - Not connected to any link
    - Has `recommend` property set
    - Common parameters (seed, steps, cfg_scale, etc.)

```typescript
function promoteRecommendedWidgets(subgraphNode: SubgraphInstance) {
  const subgraph = subgraphNode.subgraph
  
  for (const node of subgraph.nodes) {
    for (const widget of node.widgets ?? []) {
      if (isRecommendedWidget(widget, node)) {
        promoteWidget(subgraph, node, widget)
      }
    }
  }
}

function isRecommendedWidget(widget: IWidget, node: LGraphNode): boolean {
  // 1. Already promoted?
  if (widget.promoted) return false
  
  // 2. Has explicit recommend flag?
  if (widget.options?.recommend) return true
  
  // 3. Not connected to any link?
  const connectedToInput = node.inputs.some(input => 
    input.widget === widget && input.link != null
  )
  if (connectedToInput) return false
  
  // 4. Common parameter names
  const recommendedNames = [
    'seed', 'control_after_generate',
    'steps', 'cfg', 'cfg_scale',
    'sampler', 'scheduler',
    'denoise', 'strength'
  ]
  if (recommendedNames.includes(widget.name)) return true
  
  return false
}
```

---

## **4. Serialization Format**

### **4.1 Workflow JSON Structure**
```json
{
  "version": 0.4,
  "last_node_id": 123,
  "last_link_id": 456,
  
  "nodes": [
    // Regular nodes
    { "id": 1, "type": "LoadImage", ... },
    
    // Subgraph instance nodes
    {
      "id": 42,
      "type": "uuid-1234-5678-abcd",  // References subgraph definition
      "pos": [100, 200],
      "size": [200, 150],
      "properties": {
        "proxyWidgets": [[5, "seed"], [7, "steps"]]
      },
      "inputs": [...],
      "outputs": [...]
    }
  ],
  
  "links": [
    // Links between nodes (including subgraph instances)
    [linkId, originId, originSlot, targetId, targetSlot, dataType]
  ],
  
  "definitions": {
    "subgraphs": [
      {
        "id": "uuid-1234-5678-abcd",
        "name": "My Subgraph",
        "version": 0.4,
        
        "inputNode": {
          "id": -1,
          "bounding": [0, 0, 75, 100]
        },
        "outputNode": {
          "id": -2,
          "bounding": [0, 0, 75, 100]
        },
        
        "inputs": [
          {
            "id": "uuid-input-1",
            "name": "image",
            "type": "IMAGE",
            "linkIds": [101, 102]
          }
        ],
        "outputs": [
          {
            "id": "uuid-output-1",
            "name": "result",
            "type": "IMAGE",
            "linkIds": [201]
          }
        ],
        
        "nodes": [
          // Internal nodes (IDs scoped to subgraph)
          { "id": 5, "type": "KSampler", ... }
        ],
        "links": [
          // Internal links (including to/from I/O nodes)
          [101, -1, 0, 5, 2, "IMAGE"],  // From SubgraphInputNode
          [201, 5, 0, -2, 0, "IMAGE"]   // To SubgraphOutputNode
        ],
        "reroutes": [...],
        "groups": [...],
        "widgets": [[5, "seed"], [5, "steps"]],
        
        "state": { ... },
        "revision": 0,
        "config": { ... }
      }
    ]
  }
}
```

### **4.2 Loading Workflow**
```typescript
function loadWorkflow(jsonData: WorkflowJSON) {
  // 1. Load subgraph definitions first
  if (jsonData.definitions?.subgraphs) {
    for (const subgraphData of jsonData.definitions.subgraphs) {
      const subgraph = rootGraph.createSubgraph(subgraphData)
      
      // Register as node definition in node library
      registerSubgraphNodeDef(subgraph)
    }
  }
  
  // 2. Load regular nodes and subgraph instances
  for (const nodeData of jsonData.nodes) {
    if (isSubgraphInstanceNode(nodeData)) {
      const subgraphDef = rootGraph.subgraphs.get(nodeData.type)
      if (!subgraphDef) {
        console.error(`Subgraph definition ${nodeData.type} not found`)
        continue
      }
      const instance = new SubgraphNode(rootGraph, subgraphDef, nodeData)
      rootGraph.add(instance)
    } else {
      const node = createNode(nodeData.type)
      configure(node, nodeData)
      rootGraph.add(node)
    }
  }
  
  // 3. Recreate links
  for (const linkData of jsonData.links) {
    const [id, originId, originSlot, targetId, targetSlot, type] = linkData
    rootGraph.createLink(originId, originSlot, targetId, targetSlot, id)
  }
  
  // 4. Restore groups, reroutes, etc.
  // ...
}
```

---

## **5. Execution: Flattening for Backend**

### **5.1 The Flattening Process**

**Key Principle:** Backend receives a **completely flat graph** with no subgraph nodes.

```typescript
function flattenForExecution(rootGraph: LGraph): ExecutableWorkflow {
  const flatNodes: ExecutableNode[] = []
  const flatLinks: ExecutableLink[] = []
  
  // Recursive traversal
  function traverse(
    graph: LGraph | Subgraph,
    pathPrefix: string = ""
  ) {
    for (const node of graph.nodes) {
      if (node.isSubgraphNode()) {
        // Recurse into subgraph
        const newPrefix = pathPrefix ? `${pathPrefix}:${node.id}` : `${node.id}`
        traverse(node.subgraph, newPrefix)
      } else {
        // Add regular node with execution ID
        const executionId = pathPrefix ? `${pathPrefix}:${node.id}` : `${node.id}`
        flatNodes.push({
          id: executionId,  // Hierarchical ID
          class_type: node.type,
          inputs: flattenInputs(node, graph, pathPrefix)
        })
      }
    }
    
    // Handle links (excluding I/O node links which are virtual)
    for (const link of graph.links) {
      if (link.origin_id === SUBGRAPH_INPUT_ID || 
          link.target_id === SUBGRAPH_OUTPUT_ID) continue
      
      flatLinks.push({
        id: link.id,
        origin: pathPrefix ? `${pathPrefix}:${link.origin_id}` : `${link.origin_id}`,
        target: pathPrefix ? `${pathPrefix}:${link.target_id}` : `${link.target_id}`,
        origin_slot: link.origin_slot,
        target_slot: link.target_slot
      })
    }
  }
  
  traverse(rootGraph)
  
  return { nodes: flatNodes, links: flatLinks }
}

function flattenInputs(
  node: LGraphNode, 
  graph: LGraph | Subgraph, 
  pathPrefix: string
): Record<string, any> {
  const inputs: Record<string, any> = {}
  
  for (const input of node.inputs) {
    if (input.link != null) {
      const link = graph.getLink(input.link)
      
      // Resolve link origin (may cross subgraph boundaries)
      const originNode = resolveOriginNode(link, graph)
      const originId = pathPrefix 
        ? `${pathPrefix}:${originNode.id}` 
        : `${originNode.id}`
      
      inputs[input.name] = [originId, link.origin_slot]
    } else if (input.widget) {
      // Widget value
      inputs[input.name] = input.widget.value
    }
  }
  
  return inputs
}

function resolveOriginNode(link: LLink, graph: LGraph | Subgraph): LGraphNode {
  // If origin is SubgraphInputNode, trace back to parent graph
  if (link.origin_id === SUBGRAPH_INPUT_ID) {
    const subgraphNode = findParentSubgraphNode(graph)
    const inputIndex = link.origin_slot
    const externalLink = findExternalLinkToInput(subgraphNode, inputIndex)
    return resolveOriginNode(externalLink, subgraphNode.graph)
  }
  
  return graph.getNodeById(link.origin_id)
}
```

### **5.2 Execution ID Format**

**Hierarchical ID:** `<subgraph_node_id>:<subgraph_node_id>:...<node_id>`

Examples:
- Root node: `"7"` (just node ID)
- Node in subgraph: `"42:7"` (subgraph 42, node 7)
- Nested: `"10:42:7"` (root → subgraph 10 → subgraph 42 → node 7)

**Usage:**
```typescript
// Parsing execution ID
function parseExecutionId(executionId: string): string[] {
  return executionId.split(':')
}

function getLocalNodeId(executionId: string): string {
  const parts = parseExecutionId(executionId)
  return parts[parts.length - 1]
}

function getSubgraphPath(executionId: string): string[] {
  const parts = parseExecutionId(executionId)
  return parts.slice(0, -1)  // All but last
}

// Example: "10:42:7"
// getLocalNodeId("10:42:7") → "7"
// getSubgraphPath("10:42:7") → ["10", "42"]
```

### **5.3 Mapping Execution Results Back to UI**

```typescript
function onExecutionProgress(executionId: string, status: ExecutionStatus) {
  const [path, localId] = splitExecutionId(executionId)
  
  // 1. Navigate to correct graph
  const targetGraph = traverseSubgraphPath(rootGraph, path)
  if (!targetGraph) {
    console.warn(`Invalid subgraph path: ${path}`)
    return
  }
  
  // 2. Find node in target graph
  const node = targetGraph.getNodeById(localId)
  if (!node) {
    console.warn(`Node ${localId} not found in graph`)
    return
  }
  
  // 3. Update node status
  node.executionStatus = status
  node.progressPercent = status.progress / status.max
  
  // 4. Redraw canvas (if graph is visible)
  if (canvas.graph === targetGraph) {
    canvas.setDirty(true)
  }
}
```

---

## **6. UI Components**

### **6.1 SubgraphNode Visual Design**

```
┌──────────────────────────────┐
│ 🔧 My Subgraph              ▼│ ← Title bar (icon + name + collapse)
├──────────────────────────────┤
│ ● image ───────────→ [node] │ ← Input slots (left side)
│ ● strength                   │
│   └─ [0.75] ←────────────────│ ← Proxy widget (indented under input)
├──────────────────────────────┤
│ [node] ───────────→ result ●│ ← Output slots (right side)
│                    latent ●  │
└──────────────────────────────┘
```

**Properties:**
- Custom icon (🔧 or workflow SVG)
- Badge showing node count: `(5 nodes)`
- Double-click title bar → Open subgraph
- Collapse button → Hide widgets (show only I/O)
- Right-click → Context menu

**Rendering Code:**
```typescript
function drawSubgraphNode(ctx: CanvasRenderingContext2D, node: SubgraphNode) {
  const { x, y, width, height } = node.boundingRect
  
  // Background
  ctx.fillStyle = node.bgcolor || '#2a2a2a'
  ctx.fillRect(x, y, width, height)
  
  // Border (highlight if selected)
  ctx.strokeStyle = node.selected ? '#FFA500' : '#555'
  ctx.lineWidth = node.selected ? 2 : 1
  ctx.strokeRect(x, y, width, height)
  
  // Title bar
  const titleHeight = LiteGraph.NODE_TITLE_HEIGHT
  ctx.fillStyle = node.color || '#353535'
  ctx.fillRect(x, y, width, titleHeight)
  
  // Icon
  const icon = node.subgraph.icon || '🔧'
  ctx.font = '14px sans-serif'
  ctx.fillStyle = '#FFF'
  ctx.fillText(icon, x + 8, y + titleHeight - 8)
  
  // Title text
  ctx.font = 'bold 14px sans-serif'
  ctx.fillText(node.title, x + 30, y + titleHeight - 8)
  
  // Badge
  const nodeCount = node.subgraph.nodes.length
  const badge = `(${nodeCount} nodes)`
  ctx.font = '10px sans-serif'
  ctx.fillStyle = '#999'
  ctx.fillText(badge, x + width - 60, y + titleHeight - 8)
  
  // Input slots
  let slotY = y + titleHeight + 10
  for (const input of node.inputs) {
    drawSlot(ctx, x, slotY, 'input', input)
    
    // Draw proxy widget if exists
    if (input._widget) {
      slotY += drawWidget(ctx, x + 20, slotY + 20, input._widget)
    }
    
    slotY += LiteGraph.NODE_SLOT_HEIGHT
  }
  
  // Output slots
  slotY = y + titleHeight + 10
  for (const output of node.outputs) {
    drawSlot(ctx, x + width, slotY, 'output', output)
    slotY += LiteGraph.NODE_SLOT_HEIGHT
  }
}
```

---

### **6.2 SubgraphInputNode / SubgraphOutputNode Visual**

```
┌─────────────┐               ┌─────────────┐
│ Inputs      │               │   Outputs   │
│             │               │             │
│ image ───●  │               │  ●─── result│
│ strength ●  │               │  ●─── latent│
│           ●─│               │─●─          │
│ [+]         │  Add slot     │         [+] │  Add slot
└─────────────┘               └─────────────┘
```

**Key Features:**
- **Fixed position**: InputNode on left edge, OutputNode on right edge
- **Auto-sizing**: Height adjusts to number of slots
- **Rounded corners**: Distinct from regular nodes
- **Empty slot ("+")**: Always visible at bottom for quick add
- **Hover effects**: Slot highlights on hover
- **Drag-from-slot**: Start new connection
- **Drop-to-slot**: Accept connection (auto-creates slot if empty)

**Rendering Code:**
```typescript
function drawSubgraphIONode(
  ctx: CanvasRenderingContext2D, 
  ioNode: SubgraphInputNode | SubgraphOutputNode
) {
  const isInput = ioNode instanceof SubgraphInputNode
  const { x, y, width, height } = ioNode.boundingRect
  
  // Rounded rectangle background
  ctx.fillStyle = '#1a1a1a'
  roundRect(ctx, x, y, width, height, 8)
  ctx.fill()
  
  // Border
  ctx.strokeStyle = '#444'
  ctx.lineWidth = 1
  roundRect(ctx, x, y, width, height, 8)
  ctx.stroke()
  
  // Title
  ctx.font = 'bold 12px sans-serif'
  ctx.fillStyle = '#AAA'
  const title = isInput ? 'Inputs' : 'Outputs'
  ctx.fillText(title, x + 10, y + 20)
  
  // Slots
  let slotY = y + 40
  for (const slot of ioNode.allSlots) {  // Includes empty slot
    if (slot instanceof EmptySubgraphInput || slot instanceof EmptySubgraphOutput) {
      // Draw "+" button
      ctx.fillStyle = '#555'
      ctx.fillRect(x + 10, slotY, width - 20, 20)
      ctx.font = 'bold 16px sans-serif'
      ctx.fillStyle = '#AAA'
      ctx.fillText('+', x + width/2 - 4, slotY + 15)
    } else {
      // Draw slot
      drawSubgraphSlot(ctx, slot, isInput)
    }
    slotY += LiteGraph.NODE_SLOT_HEIGHT
  }
}

function drawSubgraphSlot(
  ctx: CanvasRenderingContext2D,
  slot: SubgraphInput | SubgraphOutput,
  isInput: boolean
) {
  const { x, y, width, height } = slot.boundingRect
  
  // Slot circle
  const circleX = isInput ? x + width - 8 : x + 8
  const circleY = y + height / 2
  
  ctx.beginPath()
  ctx.arc(circleX, circleY, 6, 0, Math.PI * 2)
  ctx.fillStyle = slot.isConnected ? slot.color_on : slot.color_off
  ctx.fill()
  ctx.strokeStyle = '#FFF'
  ctx.lineWidth = 2
  ctx.stroke()
  
  // Label
  ctx.font = '12px sans-serif'
  ctx.fillStyle = '#CCC'
  const textX = isInput ? x + 10 : x + 20
  ctx.fillText(slot.displayName, textX, y + height/2 + 4)
  
  // Hover highlight
  if (slot.isPointerOver) {
    ctx.strokeStyle = '#FFF'
    ctx.lineWidth = 2
    ctx.strokeRect(x, y, width, height)
  }
}
```

---

### **6.3 Breadcrumb Navigation**

```
┌─────────────────────────────────────────────────────┐
│ Workflow → SubgraphA → SubgraphB → [Current]       │
└─────────────────────────────────────────────────────┘
```

**Component:**
```vue
<template>
  <div class="subgraph-breadcrumb">
    <Breadcrumb :model="breadcrumbItems">
      <template #item="{ item }">
        <div
          class="breadcrumb-item"
          :class="{ active: item === breadcrumbItems.at(-1) }"
          @click="item.command"
          @dblclick="() => handleRename(item)"
        >
          <i v-if="item.icon" :class="item.icon" />
          <span>{{ item.label }}</span>
          <Badge v-if="item.badge" :value="item.badge" />
        </div>
      </template>
      <template #separator>
        <span class="separator">/</span>
      </template>
    </Breadcrumb>
  </div>
</template>

<script setup>
const breadcrumbItems = computed(() => {
  const items = []
  
  // Root
  items.push({
    label: workflowStore.activeWorkflow?.filename ?? 'Workflow',
    icon: 'pi pi-home',
    command: () => navigationStore.exitToRoot()
  })
  
  // Subgraph path
  for (const subgraph of navigationStore.navigationStack) {
    items.push({
      label: subgraph.name,
      icon: 'pi pi-sitemap',
      badge: subgraph.nodes.length,
      command: () => canvas.setGraph(subgraph),
      updateTitle: (newName) => {
        subgraph.name = newName
        // Update all instances
        forEachSubgraphInstance(subgraph, node => {
          node.title = newName
        })
      }
    })
  }
  
  return items
})

function handleRename(item) {
  const newName = prompt('Enter new name:', item.label)
  if (newName && item.updateTitle) {
    item.updateTitle(newName)
  }
}
</script>
```

---

### **6.4 Subgraph Editor Panel**

**Layout:**
```
┌───────────────────────────────────┐
│ Subgraph Widgets                  │
│ ─────────────────────────────────│
│ [Search widgets...]               │
│                                   │
│ ✓ Promoted (3)                   │
│   ⋮ seed (KSampler)              │
│   ⋮ steps (KSampler)             │
│   ⋮ cfg (KSampler)               │
│                                   │
│ ▼ Available (12)                 │
│   ☐ sampler_name (KSampler)      │
│   ☐ denoise (KSampler)           │
│   ☐ width (EmptyLatentImage)     │
│   ...                             │
└───────────────────────────────────┘
```

**Component:**
```vue
<template>
  <div class="subgraph-editor">
    <SidePanelSearch @search="handleSearch" />
    
    <!-- Promoted widgets (drag-to-reorder) -->
    <div class="promoted-section">
      <h3>Promoted Widgets ({{ promotedWidgets.length }})</h3>
      <DraggableList
        v-model="promotedWidgets"
        @update="handleReorder"
      >
        <template #item="{ widget }">
          <div class="widget-item">
            <i class="icon-drag" />
            <input
              type="checkbox"
              :checked="true"
              @change="() => demoteWidget(widget)"
            />
            <span class="widget-name">{{ widget.name }}</span>
            <span class="widget-node">({{ widget.node.title }})</span>
          </div>
        </template>
      </DraggableList>
    </div>
    
    <!-- Available widgets -->
    <div class="available-section">
      <h3>Available Widgets ({{ availableWidgets.length }})</h3>
      <div
        v-for="widget in filteredAvailableWidgets"
        :key="`${widget.node.id}:${widget.name}`"
        class="widget-item"
      >
        <input
          type="checkbox"
          :checked="false"
          @change="() => promoteWidget(widget)"
        />
        <span class="widget-name">{{ widget.name }}</span>
        <span class="widget-node">({{ widget.node.title }})</span>
        <Badge
          v-if="isRecommended(widget)"
          value="Recommended"
          severity="success"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
const activeSubgraph = computed(() => navigationStore.activeSubgraph)

const promotedWidgets = computed({
  get() {
    const subgraphNode = findSubgraphInstanceNode(activeSubgraph.value)
    return parseProxyWidgets(subgraphNode.properties.proxyWidgets)
      .map(([nodeId, widgetName]) => {
        const node = activeSubgraph.value.getNodeById(nodeId)
        const widget = node.widgets.find(w => w.name === widgetName)
        return { node, widget }
      })
  },
  set(value) {
    const subgraphNode = findSubgraphInstanceNode(activeSubgraph.value)
    subgraphNode.properties.proxyWidgets = value.map(({ node, widget }) => 
      [node.id, widget.name]
    )
  }
})

const availableWidgets = computed(() => {
  const widgets = []
  for (const node of activeSubgraph.value.nodes) {
    for (const widget of node.widgets ?? []) {
      if (!widget.promoted) {
        widgets.push({ node, widget })
      }
    }
  }
  return widgets
})

function handleSearch(query) {
  searchQuery.value = query.toLowerCase()
}

const filteredAvailableWidgets = computed(() => {
  if (!searchQuery.value) return availableWidgets.value
  return availableWidgets.value.filter(({ widget, node }) =>
    widget.name.toLowerCase().includes(searchQuery.value) ||
    node.title.toLowerCase().includes(searchQuery.value)
  )
})

function promoteWidget({ node, widget }) {
  // Call promotion logic
  promoteWidgetToSubgraph(activeSubgraph.value, node, widget)
}

function demoteWidget({ node, widget }) {
  // Call demotion logic
  demoteWidgetFromSubgraph(activeSubgraph.value, node, widget)
}
</script>
```

---

## **7. Advanced Features**

### **7.1 Nested Subgraphs**

**Concept:** Subgraphs can contain other subgraph instances (recursive composition).

**Implementation:**
- No special handling needed; subgraph instances are regular nodes
- Flattening automatically handles nesting via recursive traversal
- Execution IDs encode full path: `"10:42:7"`

**Limitation:**
```typescript
function preventCircularReference(
  graph: LGraph, 
  subgraphDefId: UUID
): boolean {
  // Check if subgraphDefId already exists in ancestor chain
  let currentGraph = graph
  while (currentGraph.isSubgraph) {
    if (currentGraph.id === subgraphDefId) {
      alert("Cannot create circular subgraph reference!")
      return false
    }
    currentGraph = currentGraph.parentGraph
  }
  return true
}
```

---

### **7.2 Subgraph Blueprints (Reusable Library)**

**Concept:** Save subgraph definitions as standalone files for reuse across workflows.

#### **Saving as Blueprint**
```typescript
async function saveSubgraphBlueprint(subgraphNode: SubgraphInstance) {
  const subgraph = subgraphNode.subgraph
  
  // 1. Prompt for name
  const name = await prompt('Blueprint name:', subgraph.name)
  if (!name) return
  
  // 2. Create minimal workflow (single subgraph node)
  const blueprintWorkflow = {
    version: 0.4,
    last_node_id: 1,
    last_link_id: 0,
    nodes: [
      {
        id: 1,
        type: subgraph.id,
        pos: [0, 0],
        size: [200, 100],
        properties: {},
        inputs: [],
        outputs: []
      }
    ],
    links: [],
    definitions: {
      subgraphs: [subgraph.serialize()]
    }
  }
  
  // 3. Save to user library
  const path = `subgraphs/${name}.json`
  await api.saveUserData(path, JSON.stringify(blueprintWorkflow, null, 2))
  
  // 4. Register as node definition in library
  registerBlueprintNodeDef(name, subgraph)
  
  // 5. Show toast
  showToast({
    severity: 'success',
    summary: 'Blueprint saved',
    detail: `"${name}" added to library`
  })
}
```

#### **Loading Blueprints**
```typescript
async function loadSubgraphBlueprints() {
  // 1. List user subgraph files
  const files = await api.listUserData('subgraphs/')
  const jsonFiles = files.filter(f => f.path.endsWith('.json'))
  
  // 2. Load each blueprint
  for (const file of jsonFiles) {
    const content = await api.getUserData(file.path)
    const workflow = JSON.parse(content)
    
    // 3. Extract subgraph definition
    const subgraphDef = workflow.definitions.subgraphs[0]
    if (!subgraphDef) continue
    
    // 4. Register as node def
    const nodeDef = {
      name: file.name.replace('.json', ''),
      display_name: file.name.replace('.json', ''),
      category: 'Subgraph Blueprints',
      description: 'User-created subgraph blueprint',
      input: createInputSpec(subgraphDef.inputs),
      output: subgraphDef.outputs.map(o => o.type),
      output_name: subgraphDef.outputs.map(o => o.name)
    }
    
    nodeDefStore.addNodeDef(nodeDef)
    
    // 5. Store blueprint data
    blueprintCache.set(nodeDef.name, { workflow, subgraphDef })
  }
}

// When user adds blueprint node from library
function createBlueprintInstance(blueprintName: string) {
  const { workflow, subgraphDef } = blueprintCache.get(blueprintName)
  
  // Create subgraph definition in current workflow
  const subgraph = rootGraph.createSubgraph(subgraphDef)
  
  // Create instance
  const instanceData = {
    id: rootGraph.getNextNodeId(),
    type: subgraph.id,
    pos: [100, 100],
    size: [200, 100],
    properties: {},
    inputs: [],
    outputs: []
  }
  
  const instance = new SubgraphNode(rootGraph, subgraph, instanceData)
  rootGraph.add(instance)
  
  return instance
}
```

---

### **7.3 Subgraph Validation**

**Blueprint Constraint:** A subgraph blueprint file must contain **exactly one subgraph instance node** at the root level.

```typescript
function validateSubgraphBlueprint(workflow: WorkflowJSON): boolean {
  const { nodes, definitions } = workflow
  const { subgraphs } = definitions ?? {}
  
  if (!subgraphs || subgraphs.length === 0) {
    throw new Error('Blueprint must contain at least one subgraph definition')
  }
  
  // Check root nodes
  let subgraphNodeCount = 0
  for (const node of nodes) {
    if (subgraphs.some(s => s.id === node.type)) {
      subgraphNodeCount++
    }
  }
  
  if (subgraphNodeCount === 0) {
    throw new Error('Blueprint root must contain a subgraph instance node')
  }
  
  if (subgraphNodeCount > 1 || nodes.length > 1) {
    throw new Error('Blueprint must contain exactly one subgraph instance node')
  }
  
  return true
}

// Auto-validate on save
async function saveBlueprint() {
  try {
    validateSubgraphBlueprint(currentWorkflow)
    await saveBlueprintFile()
  } catch (error) {
    // Show error UI
    highlightInvalidNodes()
    showToast({
      severity: 'error',
      summary: 'Invalid blueprint',
      detail: error.message
    })
  }
}
```

---

### **7.4 Undo/Redo Support**

**State Tracking:**
```typescript
class SubgraphChangeTracker {
  beforeState: GraphState
  afterState: GraphState
  
  constructor(graph: LGraph | Subgraph) {
    this.graph = graph
  }
  
  beginChange() {
    this.beforeState = this.graph.serialize()
  }
  
  endChange() {
    this.afterState = this.graph.serialize()
    
    // Push to history
    undoManager.push({
      undo: () => this.graph.loadState(this.beforeState),
      redo: () => this.graph.loadState(this.afterState)
    })
  }
}

// Usage in operations
function convertToSubgraph(items: Set<Node>) {
  graph.beforeChange()
  try {
    const result = _convertToSubgraphImpl(items)
    graph.afterChange()
    return result
  } catch (error) {
    graph.cancelChange()  // Rollback
    throw error
  }
}
```

**Operations to Track:**
- Convert to subgraph
- Unpack subgraph
- Add/remove subgraph I/O
- Rename subgraph
- Promote/demote widgets
- Reorder proxy widgets

---

### **7.5 Search & Navigation**

**Global Search:**
```typescript
function searchInWorkflow