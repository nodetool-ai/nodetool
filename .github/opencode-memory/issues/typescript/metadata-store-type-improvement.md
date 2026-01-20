# MetadataStore Type Improvement

**Problem**: The addNodeType function used `any` type for nodeTypeComponent parameter.

**Solution**: Changed to use `NodeTypes[string]` which properly types the component based on the NodeTypes type from @xyflow/react.

**Files**:
- web/src/stores/MetadataStore.ts

**Date**: 2026-01-20
