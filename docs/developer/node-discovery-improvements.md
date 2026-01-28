---
layout: page
title: "Node Discovery Improvements"
description: "15 concrete improvements to help users find the next node in their workflows."
parent: Developer
nav_order: 10
---

# Node Discovery Improvements

This document outlines 15 concrete improvements to address user difficulty in finding the next node when building workflows in NodeTool. Each improvement includes a description, rationale, implementation considerations, and expected impact.

---

## Overview

Node discovery is critical to the NodeTool user experience. When users struggle to find the right node, it creates friction that slows workflow creation and can lead to frustration. The current system uses fuzzy search, type filtering, and namespace browsing, but there are significant opportunities to enhance discoverability.

### Current State

The existing node discovery system includes:
- **Node Menu** (`Space` key): Opens a searchable menu with type filters
- **Fuzzy Search**: Fuse.js-powered search across node titles, namespaces, tags, and descriptions
- **Type Filtering**: Filter by input/output data types
- **Namespace Tree**: Browse nodes by category hierarchy
- **Smart Connect**: Dragging connections shows compatible nodes
- **Node Documentation**: Hover for descriptions and use cases

### Goals

1. Reduce time to find the right node
2. Surface relevant nodes proactively
3. Improve search accuracy and relevance
4. Support different discovery patterns (search, browse, contextual)
5. Help users learn what nodes are available

---

## Improvement 1: Contextual Node Suggestions

### Description
Display a curated list of suggested nodes based on the currently selected node's outputs. When a user selects a node, show a "What's Next?" panel with the most commonly connected node types.

### Rationale
Users often know what they have (current node output) but not what nodes can process it. This bridges the gap by showing logical next steps.

### Implementation Considerations
- Analyze existing workflow patterns to determine common node sequences
- Store node connection frequency data
- Display suggestions in a floating panel or right sidebar
- Allow users to click to add the suggested node and auto-connect

### Expected Impact
- **High** - Directly addresses the "what's next?" problem
- Reduces search friction for common workflows

---

## Improvement 2: Recent Nodes Quick Access

### Description
Add a "Recently Used" section at the top of the Node Menu showing the last 10-15 nodes the user has added across all workflows.

### Rationale
Users frequently reuse the same nodes. Quick access to recently used nodes eliminates repetitive searching.

### Implementation Considerations
- Store recent node usage in localStorage with timestamps
- Display as a collapsible section in the Node Menu
- Persist across sessions
- Clear/reset option in settings

### Expected Impact
- **High** - Speeds up repetitive workflows significantly
- Minimal implementation effort

---

## Improvement 3: Favorite Nodes

### Description
Allow users to mark nodes as favorites, displayed in a persistent "Favorites" section in the Node Menu.

### Rationale
Power users have go-to nodes they use constantly. Favorites provide instant access without searching.

### Implementation Considerations
- Add star/heart icon to node items in the menu
- Store favorites in user settings (localStorage or backend)
- Display favorites section above search results
- Support drag-and-drop reordering of favorites

### Expected Impact
- **Medium** - Valuable for power users
- Complements Recent Nodes for intentional organization

---

## Improvement 4: Smart Search Synonyms

### Description
Expand the search index to include common synonyms, abbreviations, and alternative terms for node names and functions.

### Rationale
Users may search for "resize" when the node is called "Scale Image," or "transcribe" when looking for "Whisper." Synonyms capture user intent better.

### Implementation Considerations
- Create a synonym mapping file (JSON/YAML) for common terms
- Include industry terminology (e.g., "STT" → "Speech to Text")
- Support abbreviations (e.g., "img" → "image", "txt" → "text")
- Add synonyms to Fuse.js search index with appropriate weights

### Example Mappings
```json
{
  "resize": ["scale", "resize", "enlarge", "shrink", "dimensions"],
  "transcribe": ["transcription", "speech to text", "STT", "audio to text"],
  "generate": ["create", "make", "produce", "synthesize"]
}
```

### Expected Impact
- **High** - Significantly improves search recall
- Reduces "no results found" frustration

---

## Improvement 5: Search by Use Case

### Description
Add a "Use Case" search mode that matches nodes based on what users want to accomplish rather than technical node names.

### Rationale
Users think in terms of tasks ("I want to remove the background from an image") rather than node names ("Rembg" or "Background Removal").

### Implementation Considerations
- Enhance node metadata with use case descriptions
- Index use cases in Fuse.js with high weight
- Display use case matches in a separate search result group
- Consider natural language processing for better matching

### Expected Impact
- **High** - Bridges the intent-to-implementation gap
- Particularly valuable for new users

---

## Improvement 6: Visual Node Preview

### Description
Show a visual preview/thumbnail of what a node does when hovering in the Node Menu, especially for image and audio processing nodes.

### Rationale
"Show, don't tell" - a visual preview conveys node functionality faster than text descriptions.

### Implementation Considerations
- Generate or curate before/after preview images for applicable nodes
- Store previews as optimized thumbnails
- Display on hover with loading placeholder
- Support animated previews (GIFs) for process-oriented nodes

### Expected Impact
- **Medium** - Enhances understanding for visual nodes
- Requires content creation effort

---

## Improvement 7: Node Categories Quick Filter

### Description
Add quick filter buttons/chips at the top of the Node Menu for major categories: "AI", "Image", "Audio", "Text", "Data", "Utility".

### Rationale
One-click filtering is faster than navigating the namespace tree or typing filter terms.

### Implementation Considerations
- Define top-level categories mapping to namespaces
- Display as toggle chips/buttons above search input
- Allow multiple category selection (OR logic)
- Combine with search term (AND logic)
- Highlight active filters clearly

### Expected Impact
- **Medium** - Faster category navigation
- Reduces cognitive load for browsing

---

## Improvement 8: Inline Node Documentation

### Description
Expand the Node Menu to show key documentation inline (2-3 line description, input/output types) without requiring hover.

### Rationale
Requiring hover adds interaction cost. Inline info enables faster scanning.

### Implementation Considerations
- Show compact info by default, expand on hover/click
- Display primary input/output types with color coding
- Include truncated description with "more" link
- Optimize for scan-ability (consistent layout, key info left-aligned)

### Expected Impact
- **Medium** - Reduces hover interactions
- Improves scan speed for experienced users

---

## Improvement 9: AI-Powered Node Recommendations

### Description
Use an LLM to suggest nodes based on the current workflow context and user-provided intent description.

### Rationale
AI can understand complex user intentions and map them to the right nodes, especially for multi-step workflows.

### Implementation Considerations
- Add "Ask AI" button in Node Menu
- Send workflow context + user query to LLM
- Return ranked node suggestions with explanations
- Allow one-click add with suggested connections
- Rate-limit or make opt-in for performance/cost

### Expected Impact
- **High** - Powerful for complex discovery scenarios
- Complements Global Chat agent mode

---

## Improvement 10: Connection-Aware Search

### Description
When the Node Menu opens from a dragged connection, automatically filter and rank nodes by connection compatibility, showing best matches first.

### Rationale
The current smart connect feature shows compatible nodes, but could better rank them by relevance and show more context.

### Implementation Considerations
- Analyze the source node's output type
- Rank compatible nodes by:
  1. Exact type match
  2. Common connection patterns (from usage data)
  3. Semantic relevance (same namespace/domain)
- Show compatibility score/indicator
- Highlight the matching input on each suggested node

### Expected Impact
- **High** - Directly improves the connection workflow
- Builds on existing smart connect feature

---

## Improvement 11: Keyboard-First Navigation

### Description
Enhance keyboard navigation in the Node Menu with arrow keys to select nodes, Enter to add, and Tab to switch between sections.

### Rationale
Power users prefer keyboard navigation. Current implementation requires mouse interaction for node selection.

### Implementation Considerations
- Add keyboard event handlers for navigation
- Visual focus indicator for selected item
- Enter to add selected node at cursor position
- Tab cycles through: search → filters → results → categories
- Escape closes menu (already implemented)
- Number keys (1-9) for quick add of top results

### Expected Impact
- **Medium** - Significantly faster for keyboard users
- Improves accessibility

---

## Improvement 12: Search History

### Description
Show recent search terms in a dropdown when the search input is focused, allowing quick re-execution of past searches.

### Rationale
Users often search for the same things repeatedly. Search history reduces repetitive typing.

### Implementation Considerations
- Store last 20 search terms in localStorage
- Display as dropdown on search input focus
- Click or arrow-down to select from history
- Clear individual items or all history
- De-duplicate consecutive identical searches

### Expected Impact
- **Low-Medium** - Quality of life improvement
- Minimal implementation effort

---

## Improvement 13: Node Comparison View

### Description
Add ability to compare two or more similar nodes side-by-side, showing differences in inputs, outputs, and capabilities.

### Rationale
When multiple nodes seem to do similar things (e.g., different image generation models), users need to compare them to choose.

### Implementation Considerations
- Add "Compare" checkbox/button on node items
- Display comparison panel showing:
  - Inputs side-by-side
  - Outputs side-by-side
  - Performance characteristics
  - Model requirements
- Highlight differences
- Allow adding selected node from comparison view

### Expected Impact
- **Medium** - Valuable for model selection decisions
- Reduces trial-and-error

---

## Improvement 14: Workflow Template Snippets

### Description
Provide pre-built "recipe" snippets (2-5 connected nodes) that users can insert as a group for common tasks.

### Rationale
Many workflows follow patterns. Snippets let users insert proven patterns rather than building from scratch.

### Implementation Considerations
- Create library of common snippets:
  - "Image Generation Pipeline" (prompt → generate → upscale)
  - "Audio Transcription" (input → whisper → text output)
  - "Text Chat" (input → LLM → output)
- Display in a "Recipes" section of Node Menu
- One-click insert with auto-layout
- Allow users to save custom snippets

### Expected Impact
- **High** - Accelerates workflow creation significantly
- Educational value for new users

---

## Improvement 15: Guided Node Discovery Tour

### Description
Add an interactive tour/walkthrough that introduces users to the node discovery system, highlighting key features and common node types.

### Rationale
New users don't know what's available. A guided tour builds awareness and teaches discovery patterns.

### Implementation Considerations
- Trigger on first visit or from Help menu
- Highlight Node Menu features step-by-step:
  1. Search functionality
  2. Type filters
  3. Namespace browsing
  4. Smart connect
  5. Documentation hover
- Show popular nodes in each category
- Track completion in user settings
- Keep it short (< 2 minutes)

### Expected Impact
- **Medium** - Improves new user onboarding
- Reduces support burden

---

## Implementation Prioritization

### Quick Wins (Low effort, High impact)
1. **Recent Nodes Quick Access** - Simple localStorage implementation
2. **Search History** - Minimal UI change
3. **Keyboard-First Navigation** - Event handlers only

### High Value (Higher effort, High impact)
4. **Contextual Node Suggestions** - Requires usage data
5. **Smart Search Synonyms** - Needs synonym dictionary
6. **Connection-Aware Search** - Enhances existing feature
7. **Search by Use Case** - Metadata enhancement

### Strategic Investments (High effort, Transformative impact)
8. **AI-Powered Node Recommendations** - LLM integration
9. **Workflow Template Snippets** - Content creation + UI
10. **Visual Node Preview** - Asset creation

### Quality of Life (Medium effort, Medium impact)
11. **Favorite Nodes** - User preference storage
12. **Node Categories Quick Filter** - UI enhancement
13. **Inline Node Documentation** - Layout redesign
14. **Node Comparison View** - New component
15. **Guided Node Discovery Tour** - Onboarding feature

---

## Success Metrics

To measure the effectiveness of these improvements:

1. **Time to first node** - How quickly users add their first node after opening a new workflow
2. **Search success rate** - Percentage of searches that result in a node being added
3. **Search refinement rate** - How often users modify their search (lower is better)
4. **Node Menu close rate without action** - Percentage of times menu is opened but no node is added
5. **Help documentation access** - Frequency of accessing node documentation (should decrease over time)
6. **Workflow completion rate** - Percentage of started workflows that reach a runnable state

---

## Related Documentation

- [Workflow Editor Guide](../workflow-editor.md) - User documentation for the editor
- [Tips and Tricks](../tips-and-tricks.md) - Power user features
- [Web UI AGENTS.md](../../web/src/AGENTS.md) - Technical implementation guide
- [NodeMenuStore](../../web/src/stores/NodeMenuStore.ts) - State management for node menu
- [Node Search Utilities](../../web/src/utils/nodeSearch.ts) - Search implementation

---

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2024-12-26 | Initial | Created document with 15 improvements |

