/**
 * The auth-helper and signing host modules, end to end in the sandbox.
 *
 * These packs replace the S3, Notion, Supabase, Twilio and Apify nodes. Every
 * export is pure — it builds a request and never sends one — so what has to be
 * true is that the request it builds is the one the service expects, and that
 * nothing here reaches the network.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SANDBOX_HOST_MODULES,
  type ResolvedSandboxModule,
  type SandboxModuleResolution
} from "@nodetool-ai/protocol";

import { runInSandbox } from "../src/js-sandbox.js";
import { presign, sigv4 } from "../src/host-modules/aws.js";

const DIGEST = "c".repeat(64);

function hostModule(id: string): ResolvedSandboxModule {
  const spec = SANDBOX_HOST_MODULES[id];
  if (spec === undefined) throw new Error(`no host module ${id}`);
  return {
    specifier: spec.packName,
    packName: spec.packName,
    packVersion: "0.0.0-test",
    contentDigest: DIGEST,
    moduleId: `host:${id}`,
    kind: "host",
    hostId: id,
    graph: []
  };
}

function resolution(...ids: string[]): SandboxModuleResolution {
  return { modules: ids.map(hostModule), statuses: [] };
}

async function run(code: string, ...ids: string[]) {
  return runInSandbox({ code, modules: resolution(...ids), timeoutMs: 20000 });
}

afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
// AWS SigV4
// ---------------------------------------------------------------------------

/**
 * The `get-vanilla` case from AWS's own SigV4 test suite. The signature is a
 * fixed string, so this checks the canonicalization the way nothing structural
 * can: one wrong byte anywhere in the chain and it does not match.
 */
const VECTOR = {
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
  service: "service",
  at: new Date("2015-08-30T12:36:00Z"),
  expected:
    "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31"
};

describe("aws.sigv4", () => {
  it("reproduces the get-vanilla signature from the AWS test suite", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(VECTOR.at);
    const signed = await sigv4({
      method: "GET",
      url: "https://example.amazonaws.com/",
      region: VECTOR.region,
      service: VECTOR.service,
      accessKeyId: VECTOR.accessKeyId,
      secretAccessKey: VECTOR.secretAccessKey
    });
    expect(signed.headers.Authorization).toBe(
      "AWS4-HMAC-SHA256 " +
        `Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ` +
        "SignedHeaders=host;x-amz-date, " +
        `Signature=${VECTOR.expected}`
    );
  });

  it("signs the payload hash for s3 and carries a session token", async () => {
    const signed = await sigv4({
      method: "PUT",
      url: "https://bucket.s3.us-east-1.amazonaws.com/a%20key.txt",
      region: "us-east-1",
      service: "s3",
      accessKeyId: "AK",
      secretAccessKey: "SK",
      sessionToken: "TOKEN",
      body: "hello"
    });
    // sha256("hello")
    expect(signed.headers["x-amz-content-sha256"]).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
    expect(signed.headers["x-amz-security-token"]).toBe("TOKEN");
    expect(signed.headers.Authorization).toContain(
      "SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token"
    );
    // The body is hashed, never echoed — the guest passes it to fetch itself.
    expect(signed).not.toHaveProperty("body");
  });

  it("refuses to sign without credentials", async () => {
    await expect(
      sigv4({ url: "https://bucket.s3.amazonaws.com/" })
    ).rejects.toThrow(/accessKeyId and secretAccessKey are required/);
  });

  it("presigns a URL whose query carries the signature", async () => {
    const url = await presign({
      method: "GET",
      url: "https://bucket.s3.us-east-1.amazonaws.com/report.pdf",
      region: "us-east-1",
      service: "s3",
      expiresIn: 600,
      accessKeyId: "AK",
      secretAccessKey: "SK"
    });
    const query = new URL(url).searchParams;
    expect(query.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(query.get("X-Amz-Expires")).toBe("600");
    expect(query.get("X-Amz-SignedHeaders")).toBe("host");
    expect(query.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("clamps an absurd expiry to a week", async () => {
    const url = await presign({
      url: "https://bucket.s3.amazonaws.com/x",
      expiresIn: 99_999_999,
      accessKeyId: "AK",
      secretAccessKey: "SK"
    });
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("604800");
  });

  it("signs from inside the guest", async () => {
    const result = await run(
      `import { sigv4 } from "@nodetool-ai/sandbox-aws";
       const signed = await sigv4({
         url: "https://bucket.s3.us-east-1.amazonaws.com/k",
         region: "us-east-1", service: "s3",
         accessKeyId: "AK", secretAccessKey: "SK"
       });
       return { auth: signed.headers.Authorization.slice(0, 16), method: signed.method };`,
      "aws"
    );
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ auth: "AWS4-HMAC-SHA256", method: "GET" });
  });
});

// ---------------------------------------------------------------------------
// Notion
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-notion", () => {
  it("builds a versioned, authenticated request", async () => {
    const result = await run(
      `import { request } from "@nodetool-ai/sandbox-notion";
       return await request({ token: "secret_x", path: "search", method: "POST", body: { query: "q" } });`,
      "notion"
    );
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      url: "https://api.notion.com/v1/search",
      method: "POST",
      headers: {
        Authorization: "Bearer secret_x",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
      },
      body: '{"query":"q"}'
    });
  });

  it("reads rich text and renders blocks as markdown", async () => {
    const result = await run(
      `import { plainText, toMarkdown } from "@nodetool-ai/sandbox-notion";
       const title = await plainText([{ plain_text: "Road" }, { plain_text: "map" }]);
       const md = await toMarkdown([
         { type: "heading_1", heading_1: { rich_text: [{ plain_text: "Plan" }] } },
         { type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ plain_text: "ship" }] } },
         { type: "to_do", to_do: { rich_text: [{ plain_text: "write" }], checked: true } },
         { type: "child_database", child_database: {} }
       ]);
       return { title, md };`,
      "notion"
    );
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      title: "Roadmap",
      md: "# Plan\n\n- ship\n\n- [x] write"
    });
  });
});

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-supabase", () => {
  it("encodes a select with filters, ordering and paging", async () => {
    const result = await run(
      `import { from } from "@nodetool-ai/sandbox-supabase";
       return await from({
         url: "https://ref.supabase.co", key: "anon",
         table: "issues", select: "id,title",
         filters: { status: "eq.open", age: { gte: 18 } },
         order: "created_at.desc", limit: 20, offset: 40
       });`,
      "supabase"
    );
    expect(result.error).toBeUndefined();
    const prepared = result.result as { url: string; headers: Record<string, string> };
    const url = new URL(prepared.url);
    expect(url.pathname).toBe("/rest/v1/issues");
    expect(url.searchParams.getAll("status")).toEqual(["eq.open"]);
    expect(url.searchParams.getAll("age")).toEqual(["gte.18"]);
    expect(url.searchParams.get("order")).toBe("created_at.desc");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("offset")).toBe("40");
    expect(prepared.headers.apikey).toBe("anon");
    expect(prepared.headers.Prefer).toBe("return=representation");
  });

  it("turns onConflict into a merging upsert", async () => {
    const result = await run(
      `import { from } from "@nodetool-ai/sandbox-supabase";
       return await from({
         url: "https://ref.supabase.co", key: "anon", table: "users",
         method: "POST", onConflict: "email", body: [{ email: "a@b.c" }]
       });`,
      "supabase"
    );
    const prepared = result.result as {
      url: string;
      method: string;
      headers: Record<string, string>;
      body: string;
    };
    expect(prepared.method).toBe("POST");
    expect(new URL(prepared.url).searchParams.get("on_conflict")).toBe("email");
    expect(prepared.headers.Prefer).toContain("resolution=merge-duplicates");
    expect(prepared.body).toBe('[{"email":"a@b.c"}]');
  });

  it("builds an rpc call", async () => {
    const result = await run(
      `import { rpc } from "@nodetool-ai/sandbox-supabase";
       return await rpc({ url: "https://ref.supabase.co", key: "anon", fn: "search", args: { term: "x" } });`,
      "supabase"
    );
    expect(result.result).toMatchObject({
      url: "https://ref.supabase.co/rest/v1/rpc/search",
      method: "POST",
      body: '{"term":"x"}'
    });
  });
});

// ---------------------------------------------------------------------------
// Twilio
// ---------------------------------------------------------------------------

describe("@nodetool-ai/sandbox-twilio", () => {
  it("form-encodes a message under the account path with basic auth", async () => {
    const result = await run(
      `import { request } from "@nodetool-ai/sandbox-twilio";
       return await request({
         accountSid: "AC123", authToken: "tok", path: "Messages.json", method: "POST",
         params: { To: "+15551234567", From: "+15559876543", Body: "hi there" }
       });`,
      "twilio"
    );
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      url: "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from("AC123:tok").toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "To=%2B15551234567&From=%2B15559876543&Body=hi+there"
    });
  });

  it("puts params in the query string on a read, on the host the caller names", async () => {
    const result = await run(
      `import { request } from "@nodetool-ai/sandbox-twilio";
       return await request({
         accountSid: "AC1", authToken: "t",
         host: "lookups.twilio.com", path: "/v2/PhoneNumbers/+15551234567",
         params: { Fields: "line_type_intelligence" }
       });`,
      "twilio"
    );
    const prepared = result.result as { url: string; method: string };
    expect(prepared.method).toBe("GET");
    expect(prepared.url).toContain(
      "https://lookups.twilio.com/v2/PhoneNumbers/+15551234567"
    );
    expect(prepared.url).toContain("Fields=line_type_intelligence");
  });

  it("refuses a host that is not Twilio's", async () => {
    const result = await run(
      `import { request } from "@nodetool-ai/sandbox-twilio";
       try {
         await request({ accountSid: "AC1", authToken: "t", host: "evil.example", path: "x" });
         return { threw: false };
       } catch (e) { return { threw: true, message: String(e.message) }; }`,
      "twilio"
    );
    expect(result.result).toMatchObject({ threw: true });
    expect((result.result as { message: string }).message).toContain(
      "must be a twilio.com host"
    );
  });
});
