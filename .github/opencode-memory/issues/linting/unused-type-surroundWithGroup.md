# Unused Type Definition in useSurroundWithGroup

**Problem**: `SurroundWithGroupOptions` type was defined but not used in the function signature, causing ESLint warning.

**Solution**: Updated function to use the defined type `SurroundWithGroupOptions` instead of inline type annotation.

**Files**: web/src/hooks/nodes/useSurroundWithGroup.ts

**Date**: 2026-01-19
