# Testing Library Patterns

**Insight**: Query by role/label, not test IDs or implementation details.

**Why**: Tests should reflect user behavior, not code structure.

**Best Practices**:
```typescript
// ✅ Good - user-centric
screen.getByRole('button', { name: /save/i })
screen.getByLabelText('Node name')

// ❌ Bad - implementation detail
screen.getByTestId('save-button')
```

**Impact**: Tests are more resilient to refactoring.

**Date**: 2026-01-10
