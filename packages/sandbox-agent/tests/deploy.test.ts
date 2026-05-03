import { describe, it, expect, beforeEach } from "vitest";
import { exposePort } from "../src/tools/deploy.js";
import { setPortMap, _resetForTests } from "../src/port-map.js";

beforeEach(() => {
  _resetForTests();
});

describe("exposePort", () => {
  it("returns the mapped public URL when the container port is registered", async () => {
    setPortMap({
      "8080": "http://127.0.0.1:34567"
    });
    const out = await exposePort({ port: 8080 });
    expect(out).toMatchObject({
      container_port: 8080,
      public_url: "http://127.0.0.1:34567",
      expires_at: null
    });
  });

  it("rewrites the scheme when requested", async () => {
    setPortMap({ "3000": "http://host:12345" });
    const out = await exposePort({ port: 3000, scheme: "https" });
    expect(out.public_url).toBe("https://host:12345");
  });

  it("lists known ports in the error when the requested port is unmapped", async () => {
    setPortMap({ "3000": "http://host:1", "8080": "http://host:2" });
    await expect(exposePort({ port: 9999 })).rejects.toThrow(/3000.*8080/);
  });

  it("error is descriptive when no ports are registered", async () => {
    await expect(exposePort({ port: 8080 })).rejects.toThrow(/Available: \(none\)/);
  });
});
