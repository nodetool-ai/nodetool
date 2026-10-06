# K7: Stop with no host Vulkan driver

The crash reported in [F30](native-game-editor-audit.md) did not reproduce in
one run of the 2D editor journey on the current implementation working tree,
based on commit `81288ab79aa0ff90391ad1618108e80eb793b8f7`. No application
code changed for this investigation.

## Reproduction

Run from the repository root after building packages. Ports 3000 and 7777 must
be available. Verify that the driver path does not exist before running.

```bash
test ! -e /tmp/native-game-missing-vulkan-icd.json
env \
  VK_DRIVER_FILES=/tmp/native-game-missing-vulkan-icd.json \
  VK_ICD_FILENAMES=/tmp/native-game-missing-vulkan-icd.json \
  DEBUG=pw:browser \
  mise exec node@24.18.0 -- npm run test:journeys --workspace=web -- \
    native-game-editor.spec.ts --workers=1 \
    > /tmp/k7-no-vulkan.log 2>&1
native_game_journey_status=$?
printf '%s\n' "$native_game_journey_status" > /tmp/k7-no-vulkan.exit
exit "$native_game_journey_status"
```

The environment overrides reach the seeded backend and Chromium through the
existing [journey setup](https://github.com/nodetool-ai/nodetool/blob/81288ab79aa0ff90391ad1618108e80eb793b8f7/web/tests/globalSetup.ts). `DEBUG=pw:browser`
captures browser-process diagnostics that the journey's normal error filter
can omit.

## Observed result

The command exited with status `0` and reported `1 passed (26.3s)`. The
[journey](https://github.com/nodetool-ai/nodetool/blob/81288ab79aa0ff90391ad1618108e80eb793b8f7/web/tests/journeys/native-game-editor.spec.ts) reached Play,
observed advancing ticks, clicked Stop, verified the saved document, undid the
change, and published a revision. The seeded backend became ready before the
journey and stopped during normal teardown.

Chromium used `chromium_headless_shell-1223` with the existing configuration's
`--use-angle=swiftshader` flag. Its stderr included these errors before the
journey completed:

```text
ANGLE Display::initialize error 0: Internal Vulkan error (-7): A requested extension is not supported
eglInitialize SwANGLE failed with error EGL_NOT_INITIALIZED
Exiting GPU process due to errors during initialization
```

The evidence is in `/tmp/k7-no-vulkan.log` and the captured command status is
in `/tmp/k7-no-vulkan.exit`. These temporary artifacts are local evidence,
not required inputs to the reproduction.

## Interpretation and limits

The observed GPU initialization errors did not prevent Stop or the remaining
journey actions. [Stop](https://github.com/nodetool-ai/nodetool/blob/72d5b2462278b3ea85e3a7ba7d1b49400ec171b8/web/src/components/game/useGamePlaySession.ts)
resets client play state. It does not call a backend Stop endpoint. The
[browser renderer](https://github.com/nodetool-ai/nodetool/blob/81288ab79aa0ff90391ad1618108e80eb793b8f7/packages/game-renderer/src/browser.ts) can fall back
to Canvas2D when a WebGPU adapter is unavailable. This source behavior is
consistent with the passing result, but this run did not instrument the chosen
renderer backend.

The overrides force an absent host driver manifest. Chromium can also use its
bundled SwiftShader implementation. This does not recreate every property of
the original container, whose crash error text remains unavailable. The test
used the current implementation changes rather than an untouched baseline.
The result closes K7 as not reproduced in this tested configuration and does
not establish that the historical report was incorrect.
