import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("root Dockerfile", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");
  const dockerfile = fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");

  it("builds the backend bundle with the server profile and migrate runner", () => {
    // The bundler stages example workflows, gallery thumbnails, and provider
    // manifests next to server.mjs — the layout server.ts resolves relative
    // to import.meta.url.
    expect(dockerfile).toMatch(
      /node\s+scripts\/bundle-backend\.mjs\s+--out\s+\S+\s+--profile\s+server\s+--with-migrate/
    );
  });

  it("verifies the staged bundle so a staging regression fails the image build", () => {
    expect(dockerfile).toMatch(
      /node\s+scripts\/verify-backend-bundle\.mjs\s+\S+\s+--profile\s+server/
    );
  });

  it("promotes _modules to node_modules next to server.mjs", () => {
    expect(dockerfile).toMatch(/mv\s+\S*_modules\s+\S*node_modules/);
  });

  it("runs the bundled server entry", () => {
    expect(dockerfile).toMatch(/CMD\s+\["node",\s*"backend\/server\.mjs"\]/);
  });
});
