# Testing Patterns - Hook Testing with Generated Types (2026-01-21)

## Challenge

Testing hooks that use generated OpenAPI types (like `TypeMetadata`) can be challenging because these types often have required fields that make test setup verbose.

## Solution: Type Assertion Pattern

Use `as unknown as TypeMetadata` to bypass TypeScript's strict type checking for test data:

```typescript
// Instead of verbose setup with all required fields:
const type: TypeMetadata = { 
  type: 'union', 
  type_args: [{ type: 'int' }, { type: 'float' }],
  optional: false,  // Required by generated type
  values: null,
  type_name: null,
};

// Use type assertion for cleaner tests:
const type = { type: 'union', type_args: [{ type: 'int' }, { type: 'float' }] } as TypeMetadata;
```

## When to Use This Pattern

- Generated OpenAPI types with many required fields
- Test data that only needs to satisfy the function's actual requirements
- Avoiding test bloat from fields not relevant to the test

## When NOT to Use This Pattern

- When testing actual type validation
- When the type mismatch indicates a real bug
- For critical business logic where type safety matters

## Example: reduceUnionType Hook Test

```typescript
describe('reduceUnionType', () => {
  it('should reduce int_float to float', () => {
    const type = { 
      type: 'union', 
      type_args: [{ type: 'int' }, { type: 'float' }] 
    } as TypeMetadata;
    expect(reduceUnionType(type)).toBe('float');
  });
});
```

## Related Files

- `web/src/hooks/__tests__/reduceUnionType.test.ts`
- `web/src/hooks/__tests__/useInputMinMax.test.tsx`
