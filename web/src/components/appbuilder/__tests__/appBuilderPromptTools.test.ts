/** The focused App Builder surface keeps its `ui_app_*` tools resident. */
import { readFileSync } from "fs";
import { join } from "path";

const read = (...parts: string[]) =>
  readFileSync(join(__dirname, "..", "..", "..", ...parts), "utf8");

const appBuilderPrompt = (): string => {
  const source = read("components", "appbuilder", "AppBuilderAgentPanel.tsx");
  const match = /const APP_BUILDER_SYSTEM_PROMPT = `([\s\S]*?)`;/ .exec(source);
  if (!match) throw new Error("No App Builder system prompt found");
  return match[1];
};

describe("App Builder system prompt", () => {
  it("does not tell the agent to rediscover focused tools", () => {
    expect(appBuilderPrompt()).not.toContain("select:");
    expect(appBuilderPrompt()).not.toContain("tools are deferred");
  });
});
