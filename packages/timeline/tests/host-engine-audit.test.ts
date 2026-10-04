import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

function assertSharedEngine(source: string): void {
  if (!/\bapplyTimelineOp\(/.test(source)) {
    throw new Error("Host must call applyTimelineOp");
  }
  for (const declaration of source.matchAll(
    /import\s*\{([^}]+)\}\s*from\s*['"]@nodetool-ai\/timeline['"]/g
  )) {
    if (/\b(makeClip|textStyleWithDefaults)\b/.test(declaration[1])) {
      throw new Error("Host must use the engine clip factories");
    }
  }
}
describe("the web timeline edit host uses the shared engine", () => {
  it("rejects a host with its own clip factory", () => {
    expect(() =>
      assertSharedEngine(
        'import {makeClip} from "@nodetool-ai/timeline"; applyTimelineOp(state,op,context)'
      )
    ).toThrow("clip factories");
  });
  it("rejects a host without an engine call", () => {
    expect(() => assertSharedEngine("export const edit=()=>{};")).toThrow(
      "applyTimelineOp"
    );
  });
  it("checks the production web host", () => {
    const source = readFileSync(
      new URL(
        "../../../web/src/hooks/timeline/useTimelineAgentBridge.ts",
        import.meta.url
      ),
      "utf8"
    );
    expect(source.length).toBeGreaterThan(0);
    assertSharedEngine(source);
  });
});
