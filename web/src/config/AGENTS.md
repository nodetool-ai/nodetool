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
- `models.ts` — Pre-configured AI model definitions
- `data_types.tsx` — Node data type definitions and colors
- `defaultLayouts.ts` — Default Dockview panel layouts

## Adding Configuration

- **New shortcut**: Add a `ShortcutDefinition` to `shortcuts.ts`.
- **New model**: Add a `UnifiedModel` entry to the appropriate array in `models.ts`.
- **New data type**: Add to `DATA_TYPES` in `data_types.tsx`.
- **New constant**: Add to `constants.ts` with proper typing.
