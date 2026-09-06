import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRPC_MAX_BATCH_SIZE } from "@nodetool-ai/protocol";

const CLIENT_FILES = [
  "../../../electron/src/api.ts",
  "../../../mobile/src/trpc/client.ts",
  // The CLI had three copies of this client; they are now one shared factory.
  "../../../packages/cli/src/api-client.ts",
  "../../../packages/deploy/src/api-user-manager.ts",
  "../../../packages/sdk/src/client.ts",
  "../../../web/src/trpc/links.ts"
] as const;

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("shared tRPC client policy", () => {
  it("keeps the server limit at the shared client batch size", () => {
    expect(TRPC_MAX_BATCH_SIZE).toBe(20);
    for (const path of ["../src/server.ts", "../src/test-ui-server.ts"]) {
      expect(source(path), path).toContain(
        "maxBatchSize: TRPC_MAX_BATCH_SIZE"
      );
    }
  });

  it("caps every TypeScript httpBatchLink and forces POST", () => {
    for (const path of CLIENT_FILES) {
      const text = source(path);
      const links = text.split("httpBatchLink(").slice(1);
      expect(links.length, path).toBeGreaterThan(0);
      for (const link of links) {
        const options = link.slice(0, 700);
        expect(options, `${path}: maxItems`).toContain(
          "maxItems: TRPC_MAX_BATCH_SIZE"
        );
        expect(options, `${path}: methodOverride`).toMatch(
          /methodOverride:\s*["']POST["']/
        );
      }
    }
  });

  it("uses one link factory for web React and vanilla clients", () => {
    for (const path of [
      "../../../web/src/trpc/Provider.tsx",
      "../../../web/src/trpc/client.ts"
    ]) {
      const text = source(path);
      expect(text, path).toContain("links: createTrpcLinks()");
      expect(text, path).not.toContain("httpBatchLink(");
    }
  });
});
