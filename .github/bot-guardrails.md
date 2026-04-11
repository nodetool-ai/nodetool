# Bot Guardrails — Read Before Making Changes

## DO NOT TOUCH — Protected Patterns
These exist for good reasons. Never remove or modify them:

- **`@ts-expect-error` / `@ts-ignore` directives with comments** — these suppress known type incompatibilities between library versions (e.g. zundo/zustand, Electron types). If the comment explains why, leave it alone. Removing them will break the build.
- **`describe.skipIf()` / `test.skip()` / `test.fixme()`** — these skip tests that require specific environments (native modules like canvas, API keys, Docker). Do not remove skip conditions.
- **Version pins in package.json** — do not bump major versions of dependencies (e.g. vitest 1.x → 4.x). Major version bumps require manual review and often break mocks, APIs, and test patterns.
- **CI workflow files** (`.github/workflows/`) — do not modify these unless explicitly asked.
- **`process.env.CI` guards** — code that checks for CI environment is intentional. Don't remove it.

## Before Submitting a PR
1. Run `npm run typecheck --workspace=web` — must pass
2. Run `npm run lint --workspace=web` — must pass
3. Run `npm test --workspace=web` — must pass
4. Run `npm run typecheck --workspace=electron` — must pass
5. If you changed packages/*, run `npm run build:packages && npm run test:packages`
6. **Verify you didn't remove any existing suppression directives** — run `git diff | grep -E "^\-.*ts-expect-error|^\-.*ts-ignore|^\-.*skipIf|^\-.*test\.skip"` and explain each removal
