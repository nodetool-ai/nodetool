import { beforeEach, describe, expect, it, vi } from "vitest";
const getSecret = vi.hoisted(() => vi.fn());
vi.mock("@nodetool-ai/models", () => ({ getSecret, initDb: vi.fn() }));
vi.mock("@nodetool-ai/security", () => ({ initMasterKey: vi.fn() }));
vi.mock("@nodetool-ai/config", () => ({ getDefaultDbPath: () => ":memory:" }));
import { resolveLocalSecret } from "../src/local-secrets.js";

beforeEach(() => { getSecret.mockReset(); });
describe("local command secret resolution", () => {
  it("resolves through the authorized local user rather than the environment-only lookup", async () => {
    getSecret.mockResolvedValue("fixture stored value");
    expect(await resolveLocalSecret("FIXTURE_API_KEY")).toBe("fixture stored value");
    expect(getSecret).toHaveBeenCalledExactlyOnceWith("FIXTURE_API_KEY", "1");
  });
  it("preserves an absent secret result", async () => {
    getSecret.mockResolvedValue(null);
    expect(await resolveLocalSecret("MISSING_FIXTURE_KEY")).toBeNull();
  });
  it("preserves store failures for the command to report", async () => {
    const failure = new Error("fixture encrypted store unavailable");
    getSecret.mockRejectedValue(failure);
    await expect(resolveLocalSecret("FIXTURE_API_KEY")).rejects.toBe(failure);
  });
});
