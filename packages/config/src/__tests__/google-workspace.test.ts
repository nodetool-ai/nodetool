import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isGoogleWorkspaceEnabled } from "../google-workspace.js";

const KEYS = ["SUPABASE_URL", "SUPABASE_KEY", "NODETOOL_GOOGLE_WORKSPACE"];

describe("isGoogleWorkspaceEnabled", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const key of KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("is off in local mode", () => {
    expect(isGoogleWorkspaceEnabled()).toBe(false);
  });

  it("is on when Supabase auth is configured", () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_KEY = "service-role-key";
    expect(isGoogleWorkspaceEnabled()).toBe(true);
  });

  it("stays off when only one Supabase variable is set", () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    expect(isGoogleWorkspaceEnabled()).toBe(false);
  });

  it("honours the explicit override in both directions", () => {
    process.env.NODETOOL_GOOGLE_WORKSPACE = "1";
    expect(isGoogleWorkspaceEnabled()).toBe(true);

    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_KEY = "service-role-key";
    process.env.NODETOOL_GOOGLE_WORKSPACE = "0";
    expect(isGoogleWorkspaceEnabled()).toBe(false);
  });
});
