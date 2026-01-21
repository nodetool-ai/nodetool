# Lint Warning Fix - Missing Braces in MessageInput.tsx

**Problem**: ESLint warning "Expected { after 'if' condition" at line 30 in MessageInput.tsx

**Solution**: Added braces to the if statement for consistent code style

**Files**: web/src/components/chat/composer/MessageInput.tsx

**Date**: 2026-01-21

**Change**:
```typescript
// Before
if (!textarea) return;

// After
if (!textarea) {
  return;
}
```
