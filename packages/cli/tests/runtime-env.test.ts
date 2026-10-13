import { describe, expect, it } from "vitest";
import { cliHostForPath } from "../src/runtime-env.js";

describe("CLI runtime host", () => {
  it.each([
    ["/usr/local/lib/node_modules/@nodetool-ai/cli/dist/nodetool.js", "cli"],
    ["/home/test/project/node_modules/@nodetool-ai/cli/dist/nodetool.js", "cli"],
    ["/home/test/.npm/_npx/123/node_modules/@nodetool-ai/cli/dist/nodetool.js", "npx"],
    [String.raw`C:\Users\test\npm\_npx\123\node_modules\@nodetool-ai\cli\dist\nodetool.js`, "npx"],
    ["/checkout/packages/cli/src/nodetool.ts", "source"],
    ["/checkout/packages/cli/dist/nodetool.js", "source"]
  ])("recognizes %s", (path, host) => { expect(cliHostForPath(path)).toBe(host); });
});
