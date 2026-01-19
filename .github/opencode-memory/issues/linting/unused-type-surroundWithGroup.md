# Lint Warning Fix: Unused Type

**Problem**: `SurroundWithGroupOptions` type was defined but never used in useSurroundWithGroup.ts, causing ESLint warning.

**Solution**: Renamed type to `_SurroundWithGroupOptions` with underscore prefix to indicate intentionally unused type (follows ESLint rule for allowed unused vars).

**Files**: web/src/hooks/nodes/useSurroundWithGroup.ts

**Date**: 2026-01-19
