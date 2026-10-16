# Rebuilding shipped games

Run `node scripts/example-games/build.mjs` to rebuild all shipped bundles, or
pass `--slug=kindle` to select one. The builder verifies every selected asset,
stages complete bundles and posters, then publishes them. A validation or
capture failure leaves the previous generation untouched. A publication failure
rolls back paths already replaced. If rollback itself fails, the error identifies
the retained recovery directory. Publication uses renames with rollback rather
than a cross-directory filesystem transaction.

Signal Forge, Aether and Blacksite use their committed projects under
`packages/game-runtime/samples/`. Kindle, Lumen and Neon Drift use their packaged
documents under `packages/base-nodes/nodetool/examples/games/` and their
content-verified media and posters under
`packages/base-nodes/nodetool/assets/nodetool-base/games/`. These packaged 2D
sources preserve the existing catalog without requiring the original author's
private workspace. The builder reads all selected canonical inputs before
publishing any replacement.

Set `NODETOOL_GAMES_DIR` explicitly to use editable 2D source projects instead.
Each selected project needs `game.json` and an `assets/` directory containing
files named by their bound asset IDs. Bound digests must match the files. Asset
slots cannot contain path separators or use the reserved `poster.jpg` filename.

Existing posters are preserved by default. `--posters` requests fresh capture.
The committed 2D catalog has no input recordings, so fresh 2D capture requires an
explicit project and its recording: `inputs-route.json` for Kindle, `inputs.json`
for Lumen and Neon Drift. Missing recordings fail before any shipped paths
change. The builder never substitutes an old poster for a requested capture.

Run the transactional publication controls with:

```bash
NODETOOL_TEST_WORKERS=1 node scripts/run-vitest.mjs run --config vitest.config.ts scripts/__tests__/example-game-build.test.mjs
```
