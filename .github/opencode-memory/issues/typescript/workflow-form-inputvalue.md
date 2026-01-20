# TypeScript Type Error in WorkflowForm.tsx

**Problem**: Property 'inputValue' does not exist on type 'never' in Autocomplete getOptionLabel and renderOption functions.

**Solution**: Added explicit type casting to handle both string and object options in freeSolo mode.

**Files**: web/src/components/workflows/WorkflowForm.tsx

**Date**: 2026-01-20
