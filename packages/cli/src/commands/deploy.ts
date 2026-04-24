/**
 * `nodetool deploy` CLI commands — registered on a Commander `Command`
 * via `registerDeployCommands(program)`. See docs/ for the full spec.
 */

import { Command } from "commander";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as yaml from "js-yaml";

import {
  ComputeType,
  CPUFlavor,
  DataCenter,
  GPUType,
  configureDocker,
  configureGCP,
  configureRunPod,
  getDeploymentConfigPath,
  initDeploymentConfig,
  loadDeploymentConfig,
  saveDeploymentConfig,
  WorkflowSyncer
} from "@nodetool/deploy";
import { getCollection } from "@nodetool/vectorstore";

import {
  asJson,
  buildStubDeployment,
  confirm,
  getAdminClient,
  getDeploymentOrExit,
  getManager,
  getUserManager,
  loadConfigOrExit,
  makeSyncerDeps,
  parseParamPairs,
  printTable,
  promptHidden,
  promptLine,
  runEditor
} from "./deploy-helpers.js";
import type { DeploymentType } from "@nodetool/deploy";

const SUPPORTED_TYPES: DeploymentType[] = [
  "docker",
  "runpod",
  "gcp",
  "fly",
  "railway",
  "huggingface"
];

/** Common GCP Cloud Run regions. Hardcoded because not exported by @nodetool/deploy. */
const GCP_REGIONS = [
  "us-central1",
  "us-east1",
  "us-east4",
  "us-east5",
  "us-south1",
  "us-west1",
  "us-west2",
  "us-west3",
  "us-west4",
  "northamerica-northeast1",
  "northamerica-northeast2",
  "southamerica-east1",
  "southamerica-west1",
  "europe-central2",
  "europe-north1",
  "europe-southwest1",
  "europe-west1",
  "europe-west2",
  "europe-west3",
  "europe-west4",
  "europe-west6",
  "europe-west8",
  "europe-west9",
  "europe-west10",
  "europe-west12",
  "asia-east1",
  "asia-east2",
  "asia-northeast1",
  "asia-northeast2",
  "asia-northeast3",
  "asia-south1",
  "asia-south2",
  "asia-southeast1",
  "asia-southeast2",
  "australia-southeast1",
  "australia-southeast2",
  "me-central1",
  "me-central2",
  "me-west1",
  "africa-south1"
];

// ---------------------------------------------------------------------------
// Wrapper to unify error handling on every sub-command
// ---------------------------------------------------------------------------

function runAction<A extends unknown[]>(
  fn: (...args: A) => Promise<void>
): (...args: A) => Promise<void> {
  return async (...args: A): Promise<void> => {
    try {
      await fn(...args);
    } catch (err) {
      console.error(String(err));
      process.exit(1);
    }
  };
}

// ---------------------------------------------------------------------------
// Public registration hooks
// ---------------------------------------------------------------------------

export function registerDeployCommands(program: Command): void {
  const deploy = program
    .command("deploy")
    .description("Manage deployments (docker, runpod, gcp, fly, railway, huggingface)");

  registerInit(deploy);
  registerList(deploy);
  registerShow(deploy);
  registerAdd(deploy);
  registerEdit(deploy);
  registerPlan(deploy);
  registerApply(deploy);
  registerStatus(deploy);
  registerLogs(deploy);
  registerDestroy(deploy);
  registerWorkflows(deploy);
  registerDatabase(deploy);
  registerCollections(deploy);
  registerUsers(deploy);
}

export function registerListGcpOptions(program: Command): void {
  program
    .command("list-gcp-options")
    .description(
      "List supported GCP Cloud Run regions and RunPod GPU/CPU/data-center options"
    )
    .option("--json", "Output as JSON")
    .action(
      runAction(async (opts: { json?: boolean }) => {
        const data = {
          gcp_regions: GCP_REGIONS,
          runpod_gpu_types: Object.values(GPUType),
          runpod_cpu_flavors: Object.values(CPUFlavor),
          runpod_data_centers: Object.values(DataCenter),
          runpod_compute_types: Object.values(ComputeType)
        };
        if (opts.json) {
          asJson(data);
          return;
        }
        console.log("\nGCP Cloud Run regions:");
        printTable(data.gcp_regions.map((r) => ({ region: r })));
        console.log("\nRunPod GPU types:");
        printTable(data.runpod_gpu_types.map((g) => ({ gpu_type: g })));
        console.log("\nRunPod CPU flavors:");
        printTable(data.runpod_cpu_flavors.map((c) => ({ cpu_flavor: c })));
        console.log("\nRunPod compute types:");
        printTable(data.runpod_compute_types.map((c) => ({ compute_type: c })));
        console.log("\nRunPod data centers:");
        printTable(data.runpod_data_centers.map((d) => ({ data_center: d })));
        console.log();
      })
    );
}

// ---------------------------------------------------------------------------
// init / list / show / add / edit
// ---------------------------------------------------------------------------

function registerInit(deploy: Command): void {
  deploy
    .command("init")
    .description("Initialize deployment.yaml with defaults")
    .action(
      runAction(async () => {
        const configPath = getDeploymentConfigPath();
        if (fs.existsSync(configPath)) {
          const ok = await confirm(
            `${configPath} already exists. Overwrite?`
          );
          if (!ok) return;
          await fsp.unlink(configPath);
        }
        await initDeploymentConfig();
        console.log(`Created ${configPath}`);
        console.log("\nNext steps:");
        console.log(
          "  nodetool deploy add <name> --type docker|runpod|gcp|fly|railway|huggingface"
        );
        console.log("  nodetool deploy plan <name>");
        console.log("  nodetool deploy apply <name>");
      })
    );
}

function registerList(deploy: Command): void {
  deploy
    .command("list")
    .description("List configured deployments with status")
    .option("--json", "Output as JSON")
    .action(
      runAction(async (opts: { json?: boolean }) => {
        const mgr = await getManager();
        const rows = await mgr.listDeployments();
        if (opts.json) {
          asJson(rows);
          return;
        }
        if (rows.length === 0) {
          console.log("(no deployments configured)");
          return;
        }
        printTable(rows as unknown as Record<string, unknown>[], [
          "name",
          "type",
          "status",
          "last_deployed",
          "host",
          "container",
          "pod_id",
          "project",
          "region",
          "service"
        ]);
      })
    );
}

function registerShow(deploy: Command): void {
  deploy
    .command("show <name>")
    .description("Print deployment config as YAML")
    .action(
      runAction(async (name: string) => {
        const config = await loadConfigOrExit();
        const dep = getDeploymentOrExit(config, name);
        process.stdout.write(
          yaml.dump({ [name]: dep }, { sortKeys: false, noCompatMode: true })
        );
      })
    );
}

function registerAdd(deploy: Command): void {
  deploy
    .command("add <name>")
    .description("Add a deployment via interactive prompts")
    .requiredOption(
      "--type <type>",
      `Deployment type (${SUPPORTED_TYPES.join("|")})`
    )
    .action(
      runAction(async (name: string, opts: { type: string }) => {
        const type = opts.type as DeploymentType;
        if (!SUPPORTED_TYPES.includes(type)) {
          throw new Error(
            `Invalid --type '${opts.type}'. Must be one of: ${SUPPORTED_TYPES.join(", ")}`
          );
        }

        let config;
        try {
          config = await loadDeploymentConfig();
        } catch {
          const shouldInit = await confirm(
            "No deployment.yaml found. Create one now?"
          );
          if (!shouldInit) {
            console.error(
              "Run 'nodetool deploy init' first to create deployment.yaml."
            );
            process.exit(1);
          }
          config = await initDeploymentConfig();
        }

        if (config.deployments[name]) {
          throw new Error(`Deployment '${name}' already exists`);
        }

        let deployment;
        switch (type) {
          case "docker": {
            const host = await promptLine("Docker host (IP/hostname or localhost)", {
              default: "localhost"
            });
            const isLocal =
              host === "localhost" ||
              host === "127.0.0.1" ||
              host === "::1" ||
              host === "0.0.0.0";
            const sshUser = isLocal
              ? undefined
              : await promptLine("SSH user", { default: "root" });
            const sshKeyPath = isLocal
              ? undefined
              : await promptLine("SSH key path", { default: "~/.ssh/id_rsa" });
            const imageName = await promptLine("Docker image name", {
              default: "ghcr.io/nodetool-ai/nodetool"
            });
            const imageTag = await promptLine("Image tag", {
              default: "latest"
            });
            const containerName = await promptLine("Container name", {
              default: `nodetool-${name}`
            });
            const containerPortRaw = await promptLine("Container port", {
              default: "8000"
            });
            deployment = configureDocker(name, {
              host,
              sshUser,
              sshKeyPath,
              imageName,
              imageTag,
              containerName,
              containerPort: Number.parseInt(containerPortRaw, 10)
            });
            break;
          }
          case "runpod": {
            const imageName = await promptLine(
              "RunPod Docker image name (e.g. user/nodetool)"
            );
            const imageTag = await promptLine("Image tag", {
              default: "latest"
            });
            const registry = await promptLine("Registry", {
              default: "docker.io"
            });
            deployment = configureRunPod(name, { imageName, imageTag, registry });
            break;
          }
          case "gcp": {
            const projectId = await promptLine("GCP project ID");
            const region = await promptLine("Region", {
              default: "us-central1"
            });
            const serviceName = await promptLine("Cloud Run service name", {
              default: name
            });
            const imageRepository = await promptLine(
              "Image repository (e.g. project/repo/image)"
            );
            const imageTag = await promptLine("Image tag", {
              default: "latest"
            });
            deployment = configureGCP(name, {
              projectId,
              region,
              serviceName,
              imageRepository,
              imageTag
            });
            break;
          }
          case "fly":
          case "railway":
          case "huggingface":
            deployment = buildStubDeployment(type, name);
            break;
        }

        config.deployments[name] = deployment;
        await saveDeploymentConfig(config);
        console.log(`Added '${name}' to ${getDeploymentConfigPath()}`);
        if (type === "fly" || type === "railway" || type === "huggingface") {
          console.log(
            `Stub deployment written — run 'nodetool deploy edit ${name}' to finish configuring.`
          );
        }
      })
    );
}

function registerEdit(deploy: Command): void {
  deploy
    .command("edit [name]")
    .description("Open deployment.yaml in $EDITOR")
    .action(
      runAction(async (_name?: string) => {
        const configPath = getDeploymentConfigPath();
        if (!fs.existsSync(configPath)) {
          throw new Error(
            `No deployment.yaml at ${configPath}. Run 'nodetool deploy init' first.`
          );
        }
        const status = runEditor(configPath);
        if (status !== 0) process.exit(status);
      })
    );
}

// ---------------------------------------------------------------------------
// lifecycle: plan / apply / status / logs / destroy
// ---------------------------------------------------------------------------

function registerPlan(deploy: Command): void {
  deploy
    .command("plan <name>")
    .description("Show what 'apply' would do")
    .action(
      runAction(async (name: string) => {
        const mgr = await getManager();
        const plan = await mgr.plan(name);
        asJson(plan);
      })
    );
}

function registerApply(deploy: Command): void {
  deploy
    .command("apply <name>")
    .description("Deploy to its target platform")
    .option("--dry-run", "Show what would be done without executing")
    .action(
      runAction(async (name: string, opts: { dryRun?: boolean }) => {
        const mgr = await getManager();
        const result = await mgr.apply(name, { dryRun: Boolean(opts.dryRun) });
        asJson(result);
        if (result["status"] === "error") process.exit(1);
      })
    );
}

function registerStatus(deploy: Command): void {
  deploy
    .command("status <name>")
    .description("Show the current status of a deployment")
    .action(
      runAction(async (name: string) => {
        const mgr = await getManager();
        const status = await mgr.status(name);
        asJson(status);
      })
    );
}

function registerLogs(deploy: Command): void {
  deploy
    .command("logs <name>")
    .description(
      "Fetch deployment logs (streaming for --follow depends on platform support)"
    )
    .option("--service <service>", "Service/container name")
    .option("-f, --follow", "Follow logs")
    .option("--tail <n>", "Number of lines to tail", "100")
    .action(
      runAction(
        async (
          name: string,
          opts: { service?: string; follow?: boolean; tail: string }
        ) => {
          const mgr = await getManager();
          const text = await mgr.logs(name, {
            service: opts.service,
            follow: Boolean(opts.follow),
            tail: Number.parseInt(opts.tail, 10)
          });
          process.stdout.write(text);
          if (!text.endsWith("\n")) process.stdout.write("\n");
        }
      )
    );
}

function registerDestroy(deploy: Command): void {
  deploy
    .command("destroy <name>")
    .description("Tear down a deployment")
    .option("--force", "Skip confirmation")
    .action(
      runAction(async (name: string, opts: { force?: boolean }) => {
        const ok = await confirm(
          `Destroy '${name}'? This action is irreversible.`,
          { force: Boolean(opts.force) }
        );
        if (!ok) return;
        const mgr = await getManager();
        const result = await mgr.destroy(name, { force: true });
        asJson(result);
      })
    );
}

// ---------------------------------------------------------------------------
// workflows subgroup
// ---------------------------------------------------------------------------

function registerWorkflows(deploy: Command): void {
  const wf = deploy
    .command("workflows")
    .description("Manage workflows on a remote deployment");

  wf.command("sync <deployment> <workflow_id>")
    .description("Sync a local workflow (and its assets/models) to the deployment")
    .option("--token <token>", "Admin bearer token")
    .action(
      runAction(
        async (
          deploymentName: string,
          workflowId: string,
          opts: { token?: string }
        ) => {
          const config = await loadConfigOrExit();
          const dep = getDeploymentOrExit(config, deploymentName);
          const client = await getAdminClient(dep, deploymentName, opts);
          const syncer = new WorkflowSyncer(client, makeSyncerDeps());
          const ok = await syncer.syncWorkflow(workflowId);
          if (!ok) process.exit(1);
          console.log(`Synced '${workflowId}' to '${deploymentName}'`);
        }
      )
    );

  wf.command("list <deployment>")
    .description("List workflows on a deployment")
    .option("--token <token>", "Admin bearer token")
    .option("--json", "Output as JSON")
    .action(
      runAction(
        async (
          deploymentName: string,
          opts: { token?: string; json?: boolean }
        ) => {
          const config = await loadConfigOrExit();
          const dep = getDeploymentOrExit(config, deploymentName);
          const client = await getAdminClient(dep, deploymentName, opts);
          const result = await client.listWorkflows();
          const rows = (result["workflows"] ?? []) as Record<string, unknown>[];
          if (opts.json) {
            asJson(rows);
            return;
          }
          printTable(
            rows.map((r) => ({
              id: r["id"],
              name: r["name"],
              updated_at: r["updated_at"]
            }))
          );
        }
      )
    );

  wf.command("delete <deployment> <workflow_id>")
    .description("Delete a workflow on the deployment")
    .option("--force", "Skip confirmation")
    .option("--token <token>", "Admin bearer token")
    .action(
      runAction(
        async (
          deploymentName: string,
          workflowId: string,
          opts: { force?: boolean; token?: string }
        ) => {
          const ok = await confirm(
            `Delete workflow '${workflowId}' on '${deploymentName}'?`,
            { force: Boolean(opts.force) }
          );
          if (!ok) return;
          const config = await loadConfigOrExit();
          const dep = getDeploymentOrExit(config, deploymentName);
          const client = await getAdminClient(dep, deploymentName, opts);
          await client.deleteWorkflow(workflowId);
          console.log(`deleted '${workflowId}'`);
        }
      )
    );

  wf.command("run <deployment> <workflow_id>")
    .description("Run a workflow on the deployment")
    .option("-p, --param <k=v>", "Parameter k=v (repeatable)", (val, acc: string[] = []) => {
      acc.push(val);
      return acc;
    }, [] as string[])
    .option("--token <token>", "Admin bearer token")
    .action(
      runAction(
        async (
          deploymentName: string,
          workflowId: string,
          opts: { param: string[]; token?: string }
        ) => {
          const params = parseParamPairs(opts.param ?? []);
          const config = await loadConfigOrExit();
          const dep = getDeploymentOrExit(config, deploymentName);
          const client = await getAdminClient(dep, deploymentName, opts);
          const result = await client.runWorkflow(workflowId, params);
          asJson(result);
        }
      )
    );
}

// ---------------------------------------------------------------------------
// database subgroup
// ---------------------------------------------------------------------------

function registerDatabase(deploy: Command): void {
  const db = deploy.command("database").description("Remote DB row management");

  db.command("get <deployment> <table> <key>")
    .description("Read a DB row")
    .option("--token <token>", "Admin bearer token")
    .action(
      runAction(
        async (
          deploymentName: string,
          table: string,
          key: string,
          opts: { token?: string }
        ) => {
          const config = await loadConfigOrExit();
          const dep = getDeploymentOrExit(config, deploymentName);
          const client = await getAdminClient(dep, deploymentName, opts);
          const row = await client.dbGet(table, key);
          asJson(row);
        }
      )
    );

  db.command("save <deployment> <table> <json_data>")
    .description("Upsert a DB row (positional JSON string)")
    .option("--token <token>", "Admin bearer token")
    .action(
      runAction(
        async (
          deploymentName: string,
          table: string,
          jsonData: string,
          opts: { token?: string }
        ) => {
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(jsonData) as Record<string, unknown>;
          } catch (e) {
            throw new Error(`Invalid JSON for <json_data>: ${String(e)}`);
          }
          const config = await loadConfigOrExit();
          const dep = getDeploymentOrExit(config, deploymentName);
          const client = await getAdminClient(dep, deploymentName, opts);
          const row = await client.dbSave(table, parsed);
          asJson(row);
        }
      )
    );

  db.command("delete <deployment> <table> <key>")
    .description("Delete a DB row")
    .option("--force", "Skip confirmation")
    .option("--token <token>", "Admin bearer token")
    .action(
      runAction(
        async (
          deploymentName: string,
          table: string,
          key: string,
          opts: { force?: boolean; token?: string }
        ) => {
          const ok = await confirm(
            `Delete '${table}/${key}' on '${deploymentName}'?`,
            { force: Boolean(opts.force) }
          );
          if (!ok) return;
          const config = await loadConfigOrExit();
          const dep = getDeploymentOrExit(config, deploymentName);
          const client = await getAdminClient(dep, deploymentName, opts);
          await client.dbDelete(table, key);
          console.log("deleted");
        }
      )
    );
}

// ---------------------------------------------------------------------------
// collections sync
// ---------------------------------------------------------------------------

function registerCollections(deploy: Command): void {
  const coll = deploy
    .command("collections")
    .description("Sync local vector collections to a deployment");

  coll
    .command("sync <deployment> <collection>")
    .description("Sync a local collection to the deployment")
    .option("--token <token>", "Admin bearer token")
    .option("--batch-size <n>", "Batch size for uploads", "100")
    .action(
      runAction(
        async (
          deploymentName: string,
          collectionName: string,
          opts: { token?: string; batchSize: string }
        ) => {
          const config = await loadConfigOrExit();
          const dep = getDeploymentOrExit(config, deploymentName);
          const client = await getAdminClient(dep, deploymentName, opts);

          const collection = await getCollection(collectionName);
          if (!collection) {
            throw new Error(`Local collection not found: ${collectionName}`);
          }

          const metadata = (collection as { metadata?: Record<string, unknown> })
            .metadata ?? {};
          const embeddingModel =
            (metadata["embedding_model"] as string | undefined) ?? "";
          if (!embeddingModel) {
            throw new Error(
              `Local collection '${collectionName}' has no embedding_model in metadata — cannot sync without embeddings.`
            );
          }

          await client.createCollection(collectionName, embeddingModel);

          // Stream documents in pages. Without access to stored embeddings
          // locally via the public API, we must re-embed via the local
          // embedding function. If the collection has no embedding function
          // attached, fail fast rather than silently uploading empty vectors.
          const withGet = collection as unknown as {
            get(opts?: {
              limit?: number;
              offset?: number;
            }): Promise<{
              ids: string[];
              documents: (string | null)[];
              metadatas: (Record<string, unknown> | null)[];
            }>;
          };

          const batchSize = Number.parseInt(opts.batchSize, 10);
          const page = await withGet.get({ limit: batchSize, offset: 0 });
          if (page.ids.length === 0) {
            console.log(
              `Collection '${collectionName}' is empty — created an empty collection on '${deploymentName}'.`
            );
            return;
          }

          throw new Error(
            "deploy collections sync: re-embedding of local documents during sync is not yet implemented in the Node CLI. " +
              `Found ${page.ids.length} document(s) locally but cannot upload without embeddings.`
          );
        }
      )
    );
}

// ---------------------------------------------------------------------------
// users-* commands
// ---------------------------------------------------------------------------

function registerUsers(deploy: Command): void {
  deploy
    .command("users-add <deployment> <username>")
    .description("Add an API user to the deployment")
    .option("--role <role>", "User role (admin|user)", "user")
    .option("--token <token>", "Admin bearer token")
    .action(
      runAction(
        async (
          deploymentName: string,
          username: string,
          opts: { role: string; token?: string }
        ) => {
          if (opts.role !== "admin" && opts.role !== "user") {
            throw new Error(
              `Invalid --role '${opts.role}'. Must be 'admin' or 'user'.`
            );
          }
          const config = await loadConfigOrExit();
          const dep = getDeploymentOrExit(config, deploymentName);
          const mgr = await getUserManager(dep, deploymentName, opts);
          const result = await mgr.addUser(username, opts.role);
          console.log(
            `Created user '${result.username}' (role: ${result.role}, id: ${result.user_id})`
          );
          if (result.token) {
            console.log("");
            console.log(`  Token: ${result.token}`);
            console.log("");
            console.log(
              "  WARNING: save this token now — it will not be shown again."
            );
          }
        }
      )
    );

  deploy
    .command("users-list <deployment>")
    .description("List API users on the deployment")
    .option("--token <token>", "Admin bearer token")
    .option("--json", "Output as JSON")
    .action(
      runAction(
        async (
          deploymentName: string,
          opts: { token?: string; json?: boolean }
        ) => {
          const config = await loadConfigOrExit();
          const dep = getDeploymentOrExit(config, deploymentName);
          const mgr = await getUserManager(dep, deploymentName, opts);
          const users = await mgr.listUsers();
          if (opts.json) {
            asJson(users);
            return;
          }
          printTable(
            users.map((u) => ({
              username: u.username,
              user_id: u.user_id,
              role: u.role,
              token_hash_preview: u.token_hash
                ? `${u.token_hash.slice(0, 16)}...`
                : "",
              created_at: (u.created_at ?? "").slice(0, 19)
            })),
            ["username", "user_id", "role", "token_hash_preview", "created_at"]
          );
        }
      )
    );

  deploy
    .command("users-remove <deployment> <username>")
    .description("Remove an API user")
    .option("--force", "Skip confirmation")
    .option("--token <token>", "Admin bearer token")
    .action(
      runAction(
        async (
          deploymentName: string,
          username: string,
          opts: { force?: boolean; token?: string }
        ) => {
          const ok = await confirm(
            `Remove user '${username}' from '${deploymentName}'?`,
            { force: Boolean(opts.force) }
          );
          if (!ok) return;
          const config = await loadConfigOrExit();
          const dep = getDeploymentOrExit(config, deploymentName);
          const mgr = await getUserManager(dep, deploymentName, opts);
          await mgr.removeUser(username);
          console.log(`removed '${username}'`);
        }
      )
    );

  deploy
    .command("users-reset-token <deployment> <username>")
    .description("Rotate a user's API token")
    .option("--token <token>", "Admin bearer token")
    .action(
      runAction(
        async (
          deploymentName: string,
          username: string,
          opts: { token?: string }
        ) => {
          const config = await loadConfigOrExit();
          const dep = getDeploymentOrExit(config, deploymentName);
          const mgr = await getUserManager(dep, deploymentName, opts);
          const result = await mgr.resetToken(username);
          console.log(`Rotated token for '${result.username}'`);
          if (result.token) {
            console.log("");
            console.log(`  New token: ${result.token}`);
            console.log("");
            console.log(
              "  The previous token is now invalid. Save this token — it will not be shown again."
            );
          }
        }
      )
    );
}

// Suppress TS unused-warning for these hidden helper imports in certain branches
void promptHidden;
