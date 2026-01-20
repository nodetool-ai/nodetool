# TypeScript Type Mismatch in TypeFilter.tsx

**Problem**: MUI Select component expected different event type than provided for onChange handlers.

**Solution**: Updated `handleInputChange` and `handleOutputChange` to use union type that matches MUI's Select expectations.

**Files**: web/src/components/node_menu/TypeFilter.tsx

**Date**: 2026-01-20
