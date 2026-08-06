# Config Guidelines

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web](../AGENTS.md) → **Config**

## Rules

- Group related constants together in the same object or section.
- Use `as const` for immutable configuration arrays and objects.
- Use TypeScript interfaces for all configuration types.
- Use environment variables (`import.meta.env.VITE_*`) for deployment-specific config — never hardcode URLs or API keys.
- Export getter functions for derived config values instead of mutable state.

## Patterns

```typescript
// ✅ Good — typed, immutable configuration
export const ALLOWED_TYPES = ['image', 'video', 'audio'] as const;
type AllowedType = typeof ALLOWED_TYPES[number];

// ❌ Bad — untyped, mutable
export const ALLOWED_TYPES = ['image', 'video', 'audio'];
```

```typescript
// ✅ Good — environment-aware
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:7777';

// ❌ Bad — hardcoded
export const API_URL = 'http://localhost:7777';
```

## Key Files

- `constants.ts` — Application-wide constants (zoom levels, file limits, cache times)
- `shortcuts.ts` — Keyboard shortcut definitions
- `data_types.ts` — Node data type definitions and colors
- `optionalNodePacks.ts` — Node packs offered as optional installs
- `quickActionNodeTypes.ts` / `quickAccessCategories.tsx` — Node menu quick-access entries

## Adding Configuration

- **New shortcut**: Add a `Shortcut` to `shortcuts.ts`.
- **New data type**: Add to `DATA_TYPES` in `data_types.ts`.
- **New constant**: Add to `constants.ts` with proper typing.
