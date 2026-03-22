# Utils Guidelines

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web](../AGENTS.md) → **Utils**

## Rules

- Utility functions should be pure when possible — no side effects, no mutation.
- Always use TypeScript with explicit parameter and return types. No `any`.
- Each utility should do one thing well (single responsibility).
- Build complex utilities by composing simple ones.
- Add JSDoc comments for complex or non-obvious functions.
- Place tests in `__tests__/` subdirectories.

## Naming

- Use verbs for actions: `formatDate`, `parseJSON`, `validateEmail`.
- Use nouns for getters: `getFileExtension`, `getNodeColor`.
- Use `is`/`has` for booleans: `isValidEmail`, `hasProperty`.

## Patterns

```typescript
// ✅ Good — pure function with explicit types
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

// ❌ Bad — side effects, no types
let lastBytes = 0;
export const formatBytes = (bytes) => {
  lastBytes = bytes;
  // ...
};
```

## Error Handling

```typescript
// ✅ Good — graceful error handling
export const parseJSON = <T>(json: string): T | null => {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    // JSON parse failed, return null
    return null;
  }
};
```

## Testing

```bash
cd web
npm test -- --testPathPattern=utils  # Utility tests only
```

- Test edge cases (empty input, null, undefined, boundary values).
- Test both success and error paths.
