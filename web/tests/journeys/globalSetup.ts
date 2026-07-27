/**
 * Playwright global setup for the user-journey suite.
 *
 * Same seeded backend the smoke and visual suites use, with one difference:
 * `NODETOOL_FAKE_PROVIDERS=1` puts `screenshot-server.ts` in hermetic mode, so
 * every LLM provider and every external/media node resolves to a deterministic
 * fake. Journeys can therefore send a chat message and run a workflow with no
 * API keys and no network, while structural and pure-compute nodes still run
 * for real — a run that produces the wrong value still fails.
 *
 * The env var is set here rather than in the config so it applies only to this
 * suite: the screenshot and visual suites render pages and must keep the real
 * provider wiring.
 */

import sharedGlobalSetup from "../globalSetup";

export default async function journeysGlobalSetup(): Promise<
  () => Promise<void>
> {
  // Overridable so a failing journey can be re-run against real providers to
  // tell "the fake is wrong" apart from "the app is broken".
  process.env.NODETOOL_FAKE_PROVIDERS ??= "1";
  return sharedGlobalSetup();
}
