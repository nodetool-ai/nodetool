# TypeScript Type Errors Fix

**Problem**: Multiple TypeScript errors in test files and components causing typecheck failures.

**Solution**: Fixed import paths, missing type properties, and type assertions across 7 files.

**Files Fixed**:
- `web/src/hooks/__tests__/useAlignNodes.test.ts` - Fixed import path `../stores/NodeData` → `../../stores/NodeData`
- `web/src/hooks/__tests__/useFitView.test.ts` - Fixed import path `../stores/NodeData` → `../../stores/NodeData`
- `web/src/utils/__tests__/hfCache.test.ts` - Fixed import path `../stores/ApiTypes` → `../../stores/ApiTypes`
- `web/src/stores/__tests__/NodeFocusStore.test.ts` - Added missing `dynamic_properties: {}` to mock node data
- `web/src/stores/__tests__/ResultsStore.test.ts` - Fixed Task, ToolCallUpdate, and PlanningUpdate types with proper schema properties
- `web/src/stores/__tests__/graphEdgeToReactFlowEdge.test.ts` - Added missing `sourceHandle` and `targetHandle` to test edge objects
- `web/src/components/model_menu/ProviderList.tsx` - Added type assertion for `e.currentTarget as HTMLElement`
- `web/src/stores/ResultsStore.ts` - Added missing `chunk?: string` parameter to interface

**Date**: 2026-01-17
