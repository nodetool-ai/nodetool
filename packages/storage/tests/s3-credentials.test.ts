import { describe, it, expect, vi } from "vitest";
import {
  cacheCredentials,
  createDefaultCredentialProvider,
  parseIniProfiles,
  type ResolvedCredentials
} from "../src/s3/credentials.js";

const missingFile = async (): Promise<string> => {
  throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
};

describe("createDefaultCredentialProvider", () => {
  it("resolves AWS_* env vars including the session token", async () => {
    const provider = createDefaultCredentialProvider({
      env: {
        AWS_ACCESS_KEY_ID: "AKIDENV",
        AWS_SECRET_ACCESS_KEY: "envsecret",
        AWS_SESSION_TOKEN: "envtoken"
      },
      readFileFn: missingFile
    });
    expect(await provider()).toEqual({
      accessKeyId: "AKIDENV",
      secretAccessKey: "envsecret",
      sessionToken: "envtoken"
    });
  });

  it("falls back to the shared credentials file default profile", async () => {
    const readFileFn = vi.fn(
      async () =>
        "[default]\naws_access_key_id = AKIDFILE\naws_secret_access_key = filesecret\n"
    );
    const provider = createDefaultCredentialProvider({
      env: {},
      readFileFn,
      homedirFn: () => "/home/u"
    });
    expect(await provider()).toEqual({
      accessKeyId: "AKIDFILE",
      secretAccessKey: "filesecret"
    });
    expect(readFileFn).toHaveBeenCalledWith("/home/u/.aws/credentials");
  });

  it("honors AWS_PROFILE and AWS_SHARED_CREDENTIALS_FILE", async () => {
    const readFileFn = vi.fn(
      async () =>
        [
          "[default]",
          "aws_access_key_id = AKIDDEFAULT",
          "aws_secret_access_key = s1",
          "",
          "[staging]",
          "aws_access_key_id = AKIDSTAGING",
          "aws_secret_access_key = s2",
          "aws_session_token = stagingtoken"
        ].join("\n")
    );
    const provider = createDefaultCredentialProvider({
      env: {
        AWS_PROFILE: "staging",
        AWS_SHARED_CREDENTIALS_FILE: "/custom/creds"
      },
      readFileFn
    });
    expect(await provider()).toEqual({
      accessKeyId: "AKIDSTAGING",
      secretAccessKey: "s2",
      sessionToken: "stagingtoken"
    });
    expect(readFileFn).toHaveBeenCalledWith("/custom/creds");
  });

  it("prefers env vars over the shared file", async () => {
    const provider = createDefaultCredentialProvider({
      env: { AWS_ACCESS_KEY_ID: "AKIDENV", AWS_SECRET_ACCESS_KEY: "envsecret" },
      readFileFn: async () =>
        "[default]\naws_access_key_id = AKIDFILE\naws_secret_access_key = filesecret\n"
    });
    expect((await provider()).accessKeyId).toBe("AKIDENV");
  });

  it("throws a clear error without leaking secret material", async () => {
    const provider = createDefaultCredentialProvider({
      env: { AWS_SECRET_ACCESS_KEY: "supersecretvalue" }, // key id missing
      readFileFn: missingFile
    });
    const error = await provider().catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/AWS credentials not found/);
    expect((error as Error).message).not.toContain("supersecretvalue");
  });
});

describe("parseIniProfiles", () => {
  it("parses sections, comments, and 'profile' prefixes", () => {
    const profiles = parseIniProfiles(
      [
        "# comment",
        "[default]",
        "aws_access_key_id=a ",
        "; another comment",
        "[profile dev]",
        "aws_access_key_id = b"
      ].join("\n")
    );
    expect(profiles.default.aws_access_key_id).toBe("a");
    expect(profiles.dev.aws_access_key_id).toBe("b");
  });
});

describe("cacheCredentials", () => {
  it("caches static credentials after the first resolution", async () => {
    const provider = vi.fn(
      async (): Promise<ResolvedCredentials> => ({
        accessKeyId: "A",
        secretAccessKey: "S"
      })
    );
    const cached = cacheCredentials(provider);
    await cached();
    await cached();
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("refreshes expiring credentials shortly before expiry", async () => {
    let now = 0;
    let generation = 0;
    const provider = vi.fn(async (): Promise<ResolvedCredentials> => {
      generation++;
      return {
        accessKeyId: `A${generation}`,
        secretAccessKey: "S",
        sessionToken: `T${generation}`,
        expiration: new Date(now + 60 * 60_000) // valid for 1h from "now"
      };
    });
    const cached = cacheCredentials(provider, () => now);
    expect((await cached()).accessKeyId).toBe("A1");

    now = 30 * 60_000; // 30 min left — still fresh
    expect((await cached()).accessKeyId).toBe("A1");

    now = 56 * 60_000; // inside the 5-min refresh window
    expect((await cached()).accessKeyId).toBe("A2");
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed resolution", async () => {
    let calls = 0;
    const provider = async (): Promise<ResolvedCredentials> => {
      if (calls++ === 0) throw new Error("transient");
      return { accessKeyId: "A", secretAccessKey: "S" };
    };
    const cached = cacheCredentials(provider);
    await expect(cached()).rejects.toThrow("transient");
    expect((await cached()).accessKeyId).toBe("A");
  });
});
