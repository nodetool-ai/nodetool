# Presets

Follow the [backend rules](../AGENTS.md) and
[development standards](../../docs/DEVELOPMENT_STANDARDS.md).

- Keep every source module browser-safe. Inject runtime asset loading from the host.
- Keep runtime dependencies limited to protocol and Zod.
- Edit per-preset catalogue files, then regenerate the index and JSON Schema with
  `npm run build --workspace=packages/presets`.
- Preserve prompting-guide version boundaries when changing shared model patterns.
- Test catalogue paths, unique ids, alias collisions and generated-file drift.
