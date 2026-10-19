/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(__dirname, "..", "nodes.zoomed.css"), "utf8");

// Issue #6793: below the zoomed-out threshold the React Flow frame got a
// solid fill, so every card narrower than its frame or with rounded corners
// showed a black block around it.
describe("nodes.zoomed.css", () => {
  it("does not fill the React Flow node frame when zoomed out", () => {
    const frameRules = [
      ...css.matchAll(/\.react-flow\.zoomed-out \.react-flow__node\s*\{([^}]*)\}/g)
    ];
    expect(frameRules.length).toBeGreaterThan(0);
    for (const [, body] of frameRules) {
      expect(body).not.toMatch(/background/);
    }
  });
});
