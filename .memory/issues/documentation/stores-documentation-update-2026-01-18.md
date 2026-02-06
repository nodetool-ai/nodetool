### Stores AGENTS.md Documentation Update (2026-01-18)

**Areas Improved**: Store documentation completeness

**Issues Fixed**: 29 stores were missing from the stores AGENTS.md file:
- UI State: BottomPanelStore, RightPanelStore, LayoutStore, GettingStartedStore, FindInWorkflowStore (5 stores)
- Node & Workflow: NodeFocusStore, NodePlacementStore, WorkflowManagerStore, WorkflowActionsStore, WorkflowListViewStore, VersionHistoryStore, ExecutionTimeStore, MiniAppsStore, MiniMapStore, FavoriteNodesStore, FavoriteWorkflowsStore, RecentNodesStore, InspectedNodeStore (13 stores)
- Model Management: ModelManagerStore, ModelMenuStore, ModelFiltersStore, ModelPreferencesStore, HfCacheStatusStore (5 stores)
- Session & System: SecretsStore, AudioQueueStore, WorkspaceManagerStore (3 stores)

**Improvements Made**:
- Added descriptive comments for each store's purpose
- Highlighted recently-added features (NodeFocusStore for keyboard navigation, ExecutionTimeStore for performance monitoring)
- Organized stores by functional domain for better discoverability
- Maintained consistent documentation format with existing entries

**Impact**: Agents can now discover all available state management stores and understand their purposes, improving code navigation and development efficiency.

**Files Updated**:
- `web/src/stores/AGENTS.md`

**Verification**:
- ✅ TypeScript compilation: Passes (pre-existing test errors unrelated)
- ✅ Documentation follows established AGENTS.md patterns
- ✅ All store names match actual file names in `/web/src/stores/`
