import { describe, it, expect } from "vitest";
import {
  configuredMcpUrl,
  isMcpHttpEnabled,
  MCP_ENABLE_FLAG
} from "../src/lib/mcp-mount.js";

/**
 * `isMcpHttpEnabled` decides whether a production deployment opens `/mcp` — a
 * mount carrying the full agent toolbelt. `server.ts` registers the route by
 * it and the settings UI reports it, so both readings are pinned here rather
 * than only through the surfaces that consume them.
 */
describe("isMcpHttpEnabled", () => {
  it("keeps the mount off in production when the flag is unset", () => {
    expect(isMcpHttpEnabled({ NODETOOL_ENV: "production" })).toBe(false);
  });

  it("opens the mount in production when the flag is exactly 1", () => {
    expect(
      isMcpHttpEnabled({ NODETOOL_ENV: "production", NODETOOL_ENABLE_MCP: "1" })
    ).toBe(true);
  });

  it.each(["0", "true", "yes", "", " 1"])(
    "keeps the mount off in production for the flag value %o",
    (value) => {
      expect(
        isMcpHttpEnabled({
          NODETOOL_ENV: "production",
          NODETOOL_ENABLE_MCP: value
        })
      ).toBe(false);
    }
  );

  it("leaves development on with no flag", () => {
    expect(isMcpHttpEnabled({ NODETOOL_ENV: "development" })).toBe(true);
    expect(isMcpHttpEnabled({})).toBe(true);
  });

  it("names the flag the boot log and the settings UI print", () => {
    expect(MCP_ENABLE_FLAG).toBe("NODETOOL_ENABLE_MCP");
  });
});

describe("configuredMcpUrl", () => {
  it("returns null with no public URL, so the client falls back to its origin", () => {
    expect(configuredMcpUrl({})).toBeNull();
    expect(configuredMcpUrl({ NODETOOL_PUBLIC_URL: "  " })).toBeNull();
  });

  it("appends /mcp to the configured address without doubling the slash", () => {
    expect(configuredMcpUrl({ NODETOOL_PUBLIC_URL: "https://n.example" })).toBe(
      "https://n.example/mcp"
    );
    expect(
      configuredMcpUrl({ NODETOOL_PUBLIC_URL: "https://n.example///" })
    ).toBe("https://n.example/mcp");
  });
});
