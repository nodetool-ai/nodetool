/**
 * Deploy / manage a NodeTool worker as a RunPod Pod via the REST integration in
 * the deploy module. The RunPod API key is read from the per-user secret store
 * (nodetool_secrets), NOT process.env or runpodctl.
 *
 * Usage (via tsx):
 *   tsx packages/deploy/scripts/runpod-worker.ts deploy --image <registry/img> [--token <t>] [--name <n>] [--exposure http|tcp]
 *   tsx packages/deploy/scripts/runpod-worker.ts list
 *   tsx packages/deploy/scripts/runpod-worker.ts destroy <podId>
 */

import { initDb, getSecret } from "@nodetool-ai/models";
import { initMasterKey } from "@nodetool-ai/security";
import { getDefaultDbPath } from "@nodetool-ai/config";

import {
  deployWorkerPod,
  listPods,
  deletePod,
  getPod
} from "../src/runpod-rest.js";

const LOCAL_USER_ID = "1";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadApiKey(): Promise<string> {
  // Primary source: the per-user secret store (nodetool_secrets).
  try {
    initDb(getDefaultDbPath());
    await initMasterKey();
    const key = await getSecret("RUNPOD_API_KEY", LOCAL_USER_ID);
    if (key) return key;
  } catch (err) {
    console.error(
      "[runpod-worker] secret-store read failed: " +
        (err instanceof Error ? err.message : String(err))
    );
  }
  // Fallback: environment (used when the keychain master key is unreachable,
  // e.g. headless/sandboxed contexts). Secret store remains the primary path.
  const envKey = process.env.RUNPOD_API_KEY;
  if (envKey) {
    console.error(
      "[runpod-worker] using RUNPOD_API_KEY from environment (secret store unavailable)"
    );
    return envKey;
  }
  throw new Error(
    "RUNPOD_API_KEY not found in the secret store or environment. Store it with: nodetool secrets store RUNPOD_API_KEY"
  );
}

async function main(): Promise<void> {
  const action = process.argv[2];
  const apiKey = await loadApiKey();
  console.error("[runpod-worker] RUNPOD_API_KEY loaded (len " + apiKey.length + ")");

  if (action === "list") {
    const pods = await listPods(apiKey);
    console.log(JSON.stringify(pods.map((p) => ({ id: p.id, name: p.name, status: p.desiredStatus, image: p.image })), null, 2));
    return;
  }

  if (action === "destroy") {
    const id = process.argv[3];
    if (!id) throw new Error("destroy requires a pod id");
    await deletePod(apiKey, id);
    console.log(`[runpod-worker] terminated pod ${id}`);
    return;
  }

  if (action === "get") {
    const id = process.argv[3];
    const pod = await getPod(apiKey, id);
    console.log(JSON.stringify(pod, null, 2));
    return;
  }

  if (action === "deploy") {
    const image = arg("image");
    if (!image) throw new Error("deploy requires --image <registry/image:tag>");
    const token = arg("token");
    const name = arg("name") ?? "nodetool-worker-test";
    const exposure = (arg("exposure") as "http" | "tcp" | undefined) ?? "http";

    console.error(`[runpod-worker] creating CPU pod from ${image} (exposure=${exposure})...`);
    const { podId, wsUrl, pod } = await deployWorkerPod(apiKey, {
      name,
      image,
      workerToken: token,
      exposure,
      computeType: "CPU"
    });
    console.log(
      JSON.stringify(
        {
          podId,
          wsUrl,
          token: token ?? null,
          status: pod.desiredStatus,
          publicIp: pod.publicIp ?? null,
          portMappings: pod.portMappings ?? null
        },
        null,
        2
      )
    );
    return;
  }

  throw new Error(`Unknown action '${action}'. Use: deploy | list | get | destroy`);
}

main().catch((err) => {
  console.error("[runpod-worker] error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
