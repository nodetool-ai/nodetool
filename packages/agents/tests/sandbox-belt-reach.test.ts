/**
 * What a Code node and a JS script can call, and what a body written against
 * the retired `tools.<name>()` global gets instead.
 *
 * The failure the belt checks pin: a chat ran `run_apify_actor` inside
 * `execute_code`, then wrote the same call into a `nodetool.code.Code` body.
 * The chat belt carried the Apify capabilities and the sandbox belt did not,
 * so the body failed with QuickJS's `TypeError: not a function` — naming
 * neither the tool nor the belt. The agent read that as "the sandbox has no
 * network", tried `fetch` against Apify's REST API, hit the same message, and
 * ended up hard-coding a scraped URL into a workflow it reported as working.
 *
 * `tools` is now a thrower for every name, because the belt is imported. What
 * these check is that the message says which import replaces the call rather
 * than leaving the reader where `TypeError` left them.
 */
import { describe, it, expect } from "vitest";

import { assembleSandboxToolbelt } from "../src/sandbox-toolbelt.js";
import {
  APIFY_TOOL_NAMES,
  SERPAPI_TOOL_NAMES
} from "../src/tools/external-capability-tools.js";
import { runInSandbox } from "../src/js-sandbox.js";
import {
  NODETOOL_API_NAMESPACE_TOOLS,
  NODETOOL_API_PRELUDE_FULL
} from "../src/codeact/nodetool-api.js";
import { TOOLS_PRELUDE } from "../src/codeact/tools-prelude.js";

const PRELUDE = `${TOOLS_PRELUDE}\n${NODETOOL_API_PRELUDE_FULL}`;

/** Run a body over a belt of `names`, none of which is really callable. */
async function run(
  code: string,
  names: readonly string[] = [],
  modules: Record<string, string> = {}
) {
  return runInSandbox({
    code: `${PRELUDE}\n${code}`,
    context: {} as never,
    globals: {
      __toolNames: [...names],
      __toolModules: modules,
      __callTool: async (name: unknown) => ({
        ok: true,
        result: { called: name }
      })
    },
    timeoutMs: 20000
  });
}

describe("the sandbox toolbelt", () => {
  it("carries the Apify and SerpAPI capabilities", () => {
    const names = new Set(assembleSandboxToolbelt().map((tool) => tool.name));
    for (const name of [...APIFY_TOOL_NAMES, ...SERPAPI_TOOL_NAMES]) {
      expect(names.has(name)).toBe(true);
    }
  });

  it("names every tool once", () => {
    const names = assembleSandboxToolbelt().map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  /**
   * The same failure one namespace over. `nodetool.media.generateImage` is in
   * the object model and `Object.keys(nodetool.media)` lists it, but the tool
   * behind it was added only beside `find_model`, which needs an injected
   * provider map this belt has none of. So a Code node that had just spent
   * four LLM calls writing twenty-five keyframe prompts got
   * `tool "generate_image" is not in this toolbelt` twenty-five times.
   *
   * Nothing about generation needs the map: these go through
   * `context.runProviderPrediction`, the same call `critique_image` and
   * `render_storyboard_stills` — both already here — make.
   */
  it("can generate media, not only judge it", () => {
    const names = new Set(assembleSandboxToolbelt().map((tool) => tool.name));
    for (const name of [
      "generate_image",
      "edit_image",
      "generate_video",
      "animate_image",
      "generate_speech",
      "generate_music",
      "transcribe_audio",
      "embed_text"
    ]) {
      expect(names.has(name)).toBe(true);
    }
  });

  /**
   * The object model's own promise: a namespace it reports as live must be
   * callable. `capabilities()` filters `NODETOOL_API_NAMESPACE_TOOLS` by the
   * belt, so a name it returns is one `__need` will not throw on.
   */
  it("serves the whole media namespace the object model advertises", () => {
    const names = new Set(assembleSandboxToolbelt().map((tool) => tool.name));
    const advertised = NODETOOL_API_NAMESPACE_TOOLS["media"] ?? [];
    const missing = advertised.filter((name) => !names.has(name));
    // `yt_dlp` is dropped under the cloud profile; nothing else may be.
    expect(missing.filter((name) => name !== "yt_dlp")).toEqual([]);
  });

  /**
   * The failure as the guest met it: a Code node body calling the object
   * model, over the belt a Code node really gets.
   */
  it("dispatches nodetool.media.generateImage instead of throwing", async () => {
    const names = assembleSandboxToolbelt().map((tool) => tool.name);
    const result = await run(
      `const r = await nodetool.media.generateImage("a red fox in snow", {
         provider: "fal_ai",
         model_id: "fal-ai/flux/schnell"
       });
       return r.called;`,
      names
    );
    expect(result.error).toBeUndefined();
    expect(result.result).toBe("generate_image");
  });

  it("reports media as a live namespace", async () => {
    const names = assembleSandboxToolbelt().map((tool) => tool.name);
    const result = await run(`return nodetool.capabilities().media;`, names);
    expect(result.result).toContain("generate_image");
  });
});

describe("the retired tools.<name> global", () => {
  it("names the import that replaces a call it knows the module for", async () => {
    const result = await run(
      `try {
         await tools.run_apify_actor({ actor_id: "apify/instagram-scraper" });
         return "no throw";
       } catch (e) {
         return String(e.message);
       }`,
      ["run_apify_actor"],
      { run_apify_actor: "apify" }
    );
    expect(result.error).toBeUndefined();
    expect(result.result).toContain(
      'import { run_apify_actor } from "@nodetool-ai/sandbox-nodetool/apify";'
    );
    expect(result.result).not.toContain("not a function");
  }, 60_000);

  it("points at searchTools for a name no module owns", async () => {
    const result = await run(
      `try {
         await tools.run_apify_actor({});
         return "no throw";
       } catch (e) {
         return String(e.message);
       }`
    );
    expect(result.result).toContain("run_apify_actor");
    expect(result.result).toContain("searchTools");
    expect(result.result).not.toContain("not a function");
  }, 60_000);

  it("throws for a name the belt does carry — the belt is imported now", async () => {
    const result = await run(
      `try {
         await tools.list_workflows({});
         return "no throw";
       } catch (e) {
         return String(e.message);
       }`,
      ["list_workflows"],
      { list_workflows: "workflows" }
    );
    expect(result.result).toContain(
      '"@nodetool-ai/sandbox-nodetool/workflows"'
    );
  }, 60_000);

  it("does not make nodetool report a capability the belt lacks", async () => {
    // `nodetool.capabilities()` and its per-method errors read `__toolNames`,
    // which is still the belt even though nothing enumerates `tools`.
    const result = await run(
      `const caps = nodetool.capabilities();
       let denied = "";
       try {
         await nodetool.workflows.list({});
       } catch (e) {
         denied = String(e.message);
       }
       return { workflows: Boolean(caps.workflows), denied };`
    );
    expect(result.result).toMatchObject({ workflows: false });
    expect((result.result as { denied: string }).denied).toContain(
      "list_workflows"
    );
  }, 60_000);

  it("still lets the nodetool object model reach the belt", async () => {
    // The object model calls `__callBeltTool`, not a belt object — this is
    // what the retired global's removal had to leave working.
    const result = await run(
      `const r = await nodetool.workflows.list({});
       return r.called;`,
      ["list_workflows"],
      { list_workflows: "workflows" }
    );
    expect(result.error).toBeUndefined();
    expect(result.result).toBe("list_workflows");
  }, 60_000);

  it("is not a thenable, so awaiting it cannot call the thrower", async () => {
    const result = await run(
      `return { keys: Object.keys(tools), then: typeof tools.then };`,
      ["list_workflows", "run_workflow"]
    );
    expect(result.result).toEqual({ keys: [], then: "undefined" });
  }, 60_000);
});
