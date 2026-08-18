/**
 * A saved AgentNode stores its tools as bare name stubs, and a stub that
 * resolves to nothing is silently uncallable. These names outlived the tools
 * they named, so hydration has to answer with what replaced them.
 */

import { describe, it, expect } from "vitest";
import {
  resolveBuiltinAgentTool,
  hydrateBuiltinAgentTool
} from "../src/nodes/agent-tool-hydration.js";

describe("retired tool names", () => {
  it.each([
    ["openai_web_search", "web_search"],
    ["google_grounded_search", "web_search"],
    ["dataforseo_search", "web_search"],
    ["dataforseo_news", "web_search"],
    ["dataforseo_images", "web_search"],
    ["google_news", "web_search"],
    ["google_images", "web_search"],
    ["image_generation", "generate_image"],
    ["openai_image_generation", "generate_image"],
    ["google_image_generation", "generate_image"],
    ["openai_text_to_speech", "generate_speech"]
  ])("resolves %s to %s", (retired, replacement) => {
    const tool = resolveBuiltinAgentTool(retired);
    expect(tool?.name).toBe(replacement);
  });

  it("hydrates a saved stub into a runnable tool", () => {
    const hydrated = hydrateBuiltinAgentTool({ name: "dataforseo_news" });
    expect(hydrated.name).toBe("web_search");
    expect(typeof (hydrated as { process?: unknown }).process).toBe("function");
  });

  it("still answers null for a name nothing ever registered", () => {
    expect(resolveBuiltinAgentTool("no_such_tool")).toBeNull();
  });
});
