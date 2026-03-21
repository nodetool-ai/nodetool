# ReactFlow Integration

**Insight**: ReactFlow is powerful but requires careful type management and layout calculations.

**Key Learnings**:
1. Use ELK.js for automatic layout (DAG algorithm)
2. Custom node components need explicit type definitions
3. Edge validation must be bidirectional (source and target)
4. Position changes should batch to avoid layout thrashing

**Files**: `web/src/hooks/useCreateNode.ts`, `web/src/hooks/useFitView.ts`

**Date**: 2026-01-10
