---
name: e2e-testing
description: "Write, repair, or diagnose Playwright E2E tests for NodeTool web and workflow harnesses using existing suites and fixtures."
origin: ECC
---

# E2E testing

Build or repair a Playwright test that detects the requested user-visible behavior.
Use [web/TESTING.md](../../../web/TESTING.md) and the existing suite's fixtures,
page objects, and configuration. Do not replace them with a generic scaffold.
Electron main-process tests use Jest under `electron/src/__tests__/`, as described
in [Electron instructions](../../../electron/src/AGENTS.md).

## Choose the suite

Inspect `web/package.json` and the relevant Playwright config for the exact command.
Use the graph runner or debug harness for real-backend workflow scenarios. Read
its entry in the [harness reference](../../../docs/harnesses.md) before first use.
Build backend packages and install the required Playwright browser as described
in the testing guide before running web E2E.

## Write or diagnose the test

Reuse the nearest scenario. Select controls by role and accessible name when
available. Assert the specific visible result with retrying Playwright assertions.
Keep tests independent and reset fixtures through the suite's existing mechanism.

Register a network wait before triggering the action that produces the request.
Wait for a specific response or visible state, not arbitrary sleeps or global
network idleness. Use page objects only where they simplify repeated interactions.

For a reported failure, reproduce it before changing the test or application.
Inspect its trace, screenshot, console, and request evidence. Use bounded repeat
runs when diagnosing an intermittent race. A retry reaching green does not prove
the race is fixed. Do not hide failures with skip, fixme, or extra retries.

## Verify and report

Run the affected scenario and confirm the assertion detects the intended failure
and passes with the correction. Use the suite's configured trace, screenshot,
and video capture rather than introducing a separate recording mechanism.

Complete [mandatory post-change verification](../../../AGENTS.md#mandatory-post-change-verification)
for code changes. Report the tested scenario, actual command result, and relevant
failure artifacts. Do not run unrelated browser suites without a dependency or
unresolved concern that warrants them.
