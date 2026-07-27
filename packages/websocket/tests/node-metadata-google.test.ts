import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { handleNodeMetadata } from "../src/http-api.js";

const NODES = [
  {
    node_type: "nodetool.text.Concat",
    title: "Concat",
    description: "join strings",
    namespace: "nodetool.text"
  },
  {
    node_type: "lib.google.DriveSearch",
    title: "Google Drive Search",
    description: "search drive",
    namespace: "lib.google"
  },
  {
    node_type: "lib.google.GmailSearch",
    title: "Gmail Search",
    description: "search gmail",
    namespace: "lib.google"
  }
];

const registry = { listMetadata: () => NODES } as unknown as NodeRegistry;

async function nodeTypes(): Promise<string[]> {
  const res = await handleNodeMetadata(
    new Request("http://localhost:7777/api/nodes/metadata"),
    { registry }
  );
  const data = (await res.json()) as Array<{ node_type: string }>;
  return data.map((n) => n.node_type);
}

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_KEY", "NODETOOL_GOOGLE_WORKSPACE"];
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("node metadata: Google Workspace visibility", () => {
  it("hides the lib.google nodes in local mode", async () => {
    const types = await nodeTypes();
    expect(types).toEqual(["nodetool.text.Concat"]);
  });

  it("includes them when Supabase auth is configured", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_KEY = "service-role-key";

    const types = await nodeTypes();
    expect(types).toContain("lib.google.DriveSearch");
    expect(types).toContain("lib.google.GmailSearch");
  });

  it("hides an exact node_type lookup too, so a local run cannot resolve one", async () => {
    const res = await handleNodeMetadata(
      new Request(
        "http://localhost:7777/api/nodes/metadata?node_type=lib.google.DriveSearch"
      ),
      { registry }
    );
    expect(res.status).toBe(404);
  });
});
