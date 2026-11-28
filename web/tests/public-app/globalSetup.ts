/**
 * Global setup for the public app link suite.
 *
 * A deployed app link only works on a production server, where auth is
 * enforced. The other browser suites run `screenshot-server.ts`, which has no
 * auth at all, so this suite starts the real `server.ts` instead:
 *
 * - `NODETOOL_ENV=production` turns the deployment routes on.
 * - `NODETOOL_TRUST_LOCALHOST=false` stops loopback (the Vite proxy) from
 *   counting as the local user, so a request without a token is refused.
 * - `SERVER_AUTH_TOKEN` is the owner's credential. The visitor never has it.
 *
 * The owner then deploys a fixture app through the API: an Echo workflow, an
 * app bound to it, a budget, a release and a public link. The link's token
 * reaches the tests as `PUBLIC_APP_TOKEN`.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OWNER_TOKEN,
  PUBLIC_APP_BACKEND_PORT,
  PUBLIC_APP_TOKEN_ENV,
  backendUrl
} from "./constants";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SERVER_SCRIPT = resolve(REPO_ROOT, "packages/websocket/src/server.ts");
const TSX_BIN = resolve(REPO_ROOT, "node_modules/.bin/tsx");
const STARTUP_TIMEOUT_MS = 120_000;
// Test-only master key. Never use this value in production.
const TEST_MASTER_KEY_B64 = "UFVCTElDX0FQUF9URVNUX0tFWV9ET19OT1RfVVNFISE=";

const ECHO_GRAPH = {
  nodes: [
    {
      id: "prompt_input",
      type: "nodetool.input.StringInput",
      data: { name: "prompt", label: "Prompt", value: "" }
    },
    {
      id: "result_output",
      type: "nodetool.output.Output",
      data: { name: "result" }
    }
  ],
  edges: [
    {
      id: "edge-echo",
      source: "prompt_input",
      sourceHandle: "output",
      target: "result_output",
      targetHandle: "value"
    }
  ]
};

function echoDocument(workflowId: string): Record<string, unknown> {
  return {
    schemaVersion: 3,
    ui: {
      root: { props: { title: "Public Echo" } },
      content: [
        {
          type: "Container",
          props: {
            id: "panel-main",
            title: "Public Echo",
            content: [
              {
                type: "WorkflowInput",
                props: {
                  id: "in-prompt",
                  binding: "op:main/in:prompt_input",
                  events: []
                }
              },
              {
                type: "Button",
                props: {
                  id: "btn-run",
                  label: "Run echo",
                  variant: "contained",
                  color: "primary",
                  events: [{ trigger: "click", kind: "run", key: "", value: "" }]
                }
              },
              {
                type: "Output",
                props: {
                  id: "out-result",
                  binding: "op:main/out:result_output",
                  placeholder: "Your result appears here"
                }
              }
            ]
          }
        }
      ],
      zones: {}
    },
    operations: [
      {
        id: "main",
        name: "Run",
        workflowId,
        inputs: {},
        outputs: {},
        policy: "replace"
      }
    ],
    resources: [],
    variables: []
  };
}

/** One tRPC mutation as the owner. Throws with the server's message. */
async function ownerMutation<T>(path: string, input: unknown): Promise<T> {
  const response = await fetch(`${backendUrl()}/trpc/${path}?batch=1`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OWNER_TOKEN}`
    },
    body: JSON.stringify({ 0: input })
  });
  const [entry] = (await response.json()) as Array<{
    result?: { data: T };
    error?: { message: string };
  }>;
  if (!entry?.result) {
    throw new Error(
      `[public-app] ${path} failed: ${entry?.error?.message ?? response.status}`
    );
  }
  return entry.result.data;
}

/** Deploy the Echo app the way an owner does, and return its link token. */
async function deployFixtureApp(): Promise<string> {
  const workflow = await ownerMutation<{ id: string }>("workflows.create", {
    name: "Public Echo",
    access: "private",
    graph: ECHO_GRAPH
  });
  const app = await ownerMutation<{ id: string }>("applications.create", {
    name: "Public Echo",
    document: echoDocument(workflow.id)
  });
  // A public link needs a finite budget, so a shared link cannot run up the
  // owner's bill.
  await ownerMutation("applications.setBudget", {
    id: app.id,
    maxInvocations: 50
  });
  await ownerMutation("applications.publish", { id: app.id });
  const deployment = await ownerMutation<{ token: string }>(
    "applications.deploy",
    { id: app.id }
  );
  return deployment.token;
}

async function waitForHealth(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `[public-app] Backend exited during startup (code=${child.exitCode}). See its output above.`
      );
    }
    try {
      const response = await fetch(`${backendUrl()}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(
    `[public-app] Timed out waiting for the backend on port ${PUBLIC_APP_BACKEND_PORT}`
  );
}

export default async function publicAppGlobalSetup(): Promise<
  () => Promise<void>
> {
  const dataDir = mkdtempSync(join(tmpdir(), "nodetool-public-app-"));
  const child = spawn(TSX_BIN, ["--conditions", "development", SERVER_SCRIPT], {
    env: {
      ...process.env,
      PORT: String(PUBLIC_APP_BACKEND_PORT),
      HOST: "127.0.0.1",
      NODETOOL_ENV: "production",
      NODETOOL_TRUST_LOCALHOST: "false",
      SERVER_AUTH_TOKEN: OWNER_TOKEN,
      SECRETS_MASTER_KEY: process.env.SECRETS_MASTER_KEY ?? TEST_MASTER_KEY_B64,
      DB_PATH: join(dataDir, "nodetool.sqlite3"),
      HOME: dataDir,
      PROJECTS_DIR: join(dataDir, "projects"),
      NODETOOL_WORKSPACES_DIR: join(dataDir, "workspaces"),
      METADATA_ROOTS: ""
    },
    stdio: ["ignore", "inherit", "inherit"]
  });

  const stop = async (): Promise<void> => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise<void>((done) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          done();
        }, 5_000);
        child.once("exit", () => {
          clearTimeout(timer);
          done();
        });
      });
    }
    rmSync(dataDir, { recursive: true, force: true });
  };

  try {
    await waitForHealth(child);
    process.env[PUBLIC_APP_TOKEN_ENV] = await deployFixtureApp();
  } catch (error) {
    await stop();
    throw error;
  }
  return stop;
}
