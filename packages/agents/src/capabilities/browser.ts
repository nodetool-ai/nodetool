/**
 * The `browser` capability module — driving one real Chrome page.
 *
 * These are the `browser_*` actions that used to exist only as `AgentNode`
 * tool classes, reachable from a workflow graph and nowhere else. As
 * capabilities they reach every surface the registry serves: the chat agent,
 * MCP, CodeAct, a Code node, a JS script.
 *
 * The page they drive is either a headless Chrome this process launched or —
 * over the NodeTool Chrome extension's `/ws/extension` relay — the tab the
 * user is already signed in to, cookies, 2FA and all. Nothing here knows
 * which: the action loop is transport-agnostic, so the only two capabilities
 * that mention transports at all are `browser_status`, which reports the one
 * in force, and `browser_restart`, which changes it.
 *
 * The actions themselves live in `@nodetool-ai/automation-nodes` (Chrome, CDP,
 * the relay) and that package depends on this one, so they arrive through
 * `browser-runner.ts` rather than an import. A process that loaded no node
 * packages has no runner, and every capability here says that plainly instead
 * of failing on an unresolved module.
 */

import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  browserActionKey,
  browserCaptureMediaSpec,
  browserClickSpec,
  browserConsoleExecSpec,
  browserConsoleViewSpec,
  browserInputTextSpec,
  browserMoveMouseSpec,
  browserNavigateSpec,
  browserPressKeySpec,
  browserRestartSpec,
  browserScrollSpec,
  browserSelectOptionSpec,
  browserSpecs,
  browserStatusSpec,
  browserUploadAssetSpec,
  browserViewSpec
} from "./browser.specs.js";
import {
  getBrowserActionRunner,
  type BrowserActionRunner
} from "./browser-runner.js";
import type { CapabilitySpec } from "./types.js";

/**
 * What a caller gets where no runner is registered. It names the package
 * rather than the symbol: the fix is loading the node packages in this
 * process, not calling something else.
 */
const NO_RUNNER =
  "Browser actions are unavailable in this process — the browser action " +
  "layer (@nodetool-ai/automation-nodes) is not loaded here. Run this from " +
  "the NodeTool server or desktop app.";

function runner(): BrowserActionRunner | { error: string } {
  return getBrowserActionRunner() ?? { error: NO_RUNNER };
}

function isError(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value;
}

/**
 * One capability per action: resolve the runner, hand it the action key and
 * the arguments, hand back what it returns.
 *
 * Errors come back as `{error}` rather than a throw because a browser action
 * fails for reasons the model can act on — nobody attached a tab, the element
 * index is stale, the page navigated away — and an agent that reads the
 * sentence can retry differently. It is the shape the `browser_*` tool classes
 * already returned.
 */
function action(spec: CapabilitySpec): CapabilityExport {
  const key = browserActionKey(spec.name);
  return {
    spec,
    impl: async (run: CapabilityRun, args: Record<string, unknown>) => {
      const resolved = runner();
      if (isError(resolved)) return resolved;
      try {
        return await resolved.run(run.context, key, args);
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }
  };
}

const browserStatus: CapabilityExport = {
  spec: browserStatusSpec,
  impl: async () => {
    const resolved = runner();
    if (isError(resolved)) return resolved;
    try {
      return await resolved.status();
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
};

export const module: CapabilityModule = {
  module: "browser",
  exports: [
    browserStatus,
    action(browserViewSpec),
    action(browserNavigateSpec),
    action(browserRestartSpec),
    action(browserClickSpec),
    action(browserInputTextSpec),
    action(browserMoveMouseSpec),
    action(browserPressKeySpec),
    action(browserSelectOptionSpec),
    action(browserScrollSpec),
    action(browserConsoleExecSpec),
    action(browserConsoleViewSpec),
    action(browserCaptureMediaSpec),
    action(browserUploadAssetSpec)
  ]
};

export { browserSpecs };
