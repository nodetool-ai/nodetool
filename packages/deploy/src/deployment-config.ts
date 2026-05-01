/**
 * Deployment configuration management for NodeTool.
 *
 * This module provides a Terraform-like deployment configuration system where all
 * deployments (self-hosted, RunPod, GCP) are managed through a single deployment.yaml file.
 */

import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as yaml from "js-yaml";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.deploy.config");

// ============================================================================
// Enums
// ============================================================================

export const DeploymentType = {
  DOCKER: "docker",
  RUNPOD: "runpod",
  GCP: "gcp",
  FLY: "fly",
  RAILWAY: "railway",
  HUGGINGFACE: "huggingface"
} as const;
export type DeploymentType =
  (typeof DeploymentType)[keyof typeof DeploymentType];

export const DeploymentStatus = {
  UNKNOWN: "unknown",
  PENDING: "pending",
  DEPLOYING: "deploying",
  RUNNING: "running",
  ACTIVE: "active",
  SERVING: "serving",
  ERROR: "error",
  STOPPED: "stopped",
  DESTROYED: "destroyed"
} as const;
export type DeploymentStatus =
  (typeof DeploymentStatus)[keyof typeof DeploymentStatus];

const DeploymentStatusEnum = z.enum([
  "unknown",
  "pending",
  "deploying",
  "running",
  "active",
  "serving",
  "error",
  "stopped",
  "destroyed"
]);

// ============================================================================
// Helper: expand ~ in paths
// ============================================================================

function expandUser(p: string): string {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Helper to create a `.default({})` that applies nested field defaults.
 *
 * Zod v4 does not re-parse the default value, so we use a factory function
 * that runs `schema.parse({})` on each access to fill in sub-defaults.
 */
function withEmptyDefault<T extends z.ZodTypeAny>(schema: T): z.ZodDefault<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return schema.default(() => schema.parse({}) as any) as z.ZodDefault<T>;
}

// ============================================================================
// Self-Hosted Deployment Schemas
// ============================================================================

export const SSHConfigSchema = z.object({
  user: z.string(),
  key_path: z
    .string()
    .optional()
    .transform((v) => (v ? expandUser(v) : v)),
  password: z.string().optional(),
  port: z.number().int().default(22)
});
export type SSHConfig = z.infer<typeof SSHConfigSchema>;

export const ContainerConfigSchema = z.object({
  name: z.string(),
  port: z.number().int(),
  gpu: z.string().optional(),
  environment: z.record(z.string(), z.string()).optional(),
  workflows: z.array(z.string()).optional()
});
export type ContainerConfig = z.infer<typeof ContainerConfigSchema>;

export const ServerPathsSchema = z.object({
  workspace: z.string().default("~/nodetool_data/workspace"),
  hf_cache: z.string().default("~/nodetool_data/hf-cache")
});
export type ServerPaths = z.infer<typeof ServerPathsSchema>;

export const PersistentPathsSchema = z.object({
  users_file: z.string().default("/workspace/users.yaml"),
  db_path: z.string().default("/workspace/nodetool.db"),
  chroma_path: z.string().default("/workspace/chroma"),
  hf_cache: z.string().default("/workspace/hf-cache"),
  asset_bucket: z.string().default("/workspace/assets"),
  logs_path: z.string().optional().default("/workspace/logs")
});
export type PersistentPaths = z.infer<typeof PersistentPathsSchema>;

export const SelfHostedStateSchema = z.object({
  last_deployed: z.string().nullable().optional().default(null),
  status: DeploymentStatusEnum.default("unknown"),
  container_id: z.string().nullable().optional().default(null),
  container_name: z.string().nullable().optional().default(null),
  url: z.string().nullable().optional().default(null),
  container_hash: z.string().nullable().optional().default(null),
  container_run_hash: z.string().nullable().optional().default(null)
});
export type SelfHostedState = z.infer<typeof SelfHostedStateSchema>;

export const ImageConfigSchema = z.object({
  name: z.string(),
  tag: z.string().default("latest"),
  registry: z.string().default("docker.io")
});
export type ImageConfig = z.infer<typeof ImageConfigSchema>;

/** Get the full image name including tag. */
export function imageConfigFullName(image: ImageConfig): string {
  if (image.name.includes("@")) return image.name;
  const lastSegment = image.name.split("/").pop() ?? image.name;
  if (lastSegment.includes(":")) return image.name;
  return `${image.name}:${image.tag}`;
}

export const NginxConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    ssl_cert_path: z
      .string()
      .optional()
      .transform((v) => (v ? expandUser(v) : v)),
    ssl_key_path: z
      .string()
      .optional()
      .transform((v) => (v ? expandUser(v) : v)),
    http_port: z.number().int().default(80),
    https_port: z.number().int().default(443),
    config_dir: z
      .string()
      .default("~/nodetool_data/nginx/conf.d")
      .transform(expandUser),
    custom_config_path: z
      .string()
      .optional()
      .transform((v) => (v ? expandUser(v) : v))
  })
  .refine(
    (data) => {
      if (data.ssl_cert_path && !data.ssl_key_path) return false;
      if (data.ssl_key_path && !data.ssl_cert_path) return false;
      return true;
    },
    {
      message: "Both ssl_cert_path and ssl_key_path must be provided together"
    }
  );
export type NginxConfig = z.infer<typeof NginxConfigSchema>;

export const DockerDeploymentSchema = z.object({
  type: z.literal("docker").default("docker"),
  enabled: z.boolean().default(true),
  host: z.string(),
  ssh: SSHConfigSchema.optional(),
  paths: withEmptyDefault(ServerPathsSchema),
  persistent_paths: PersistentPathsSchema.optional(),
  image: ImageConfigSchema,
  container: ContainerConfigSchema,
  server_auth_token: z.string().optional(),
  state: withEmptyDefault(SelfHostedStateSchema)
});
export type DockerDeployment = z.infer<typeof DockerDeploymentSchema>;

/** Get server URL for a Docker deployment. */
export function dockerDeploymentGetServerUrl(d: DockerDeployment): string {
  const hostPort = d.container.port === 7777 ? 8000 : d.container.port;
  return `http://${d.host}:${hostPort}`;
}

export type SelfHostedDeployment = DockerDeployment;

// ============================================================================
// Platform-Specific State Schemas
// ============================================================================

export const FlyStateSchema = z.object({
  last_deployed: z.string().nullable().optional().default(null),
  status: DeploymentStatusEnum.default("unknown"),
  url: z.string().nullable().optional().default(null),
  app: z.string().nullable().optional().default(null),
  region: z.string().nullable().optional().default(null)
});
export type FlyState = z.infer<typeof FlyStateSchema>;

export const RailwayStateSchema = z.object({
  last_deployed: z.string().nullable().optional().default(null),
  status: DeploymentStatusEnum.default("unknown"),
  url: z.string().nullable().optional().default(null),
  project: z.string().nullable().optional().default(null),
  service: z.string().nullable().optional().default(null),
  image_tag: z.string().nullable().optional().default(null)
});
export type RailwayState = z.infer<typeof RailwayStateSchema>;

export const HuggingFaceStateSchema = z.object({
  last_deployed: z.string().nullable().optional().default(null),
  status: DeploymentStatusEnum.default("unknown"),
  repo: z.string().nullable().optional().default(null),
  space_url: z.string().nullable().optional().default(null)
});
export type HuggingFaceState = z.infer<typeof HuggingFaceStateSchema>;

// ============================================================================
// Fly.io Deployment Schema
// ============================================================================

export const FlyDeploymentSchema = z.object({
  type: z.literal("fly").default("fly"),
  enabled: z.boolean().default(true),
  app: z.string(),
  region: z.string().default("iad"),
  image: z.string(), // path to nodetool-image.yaml
  environment: z.record(z.string(), z.string()).optional(),
  volumes: z
    .array(
      z.object({
        name: z.string(),
        mount: z.string(),
        size: z.number().int().default(10)
      })
    )
    .optional(),
  state: withEmptyDefault(FlyStateSchema)
});
export type FlyDeployment = z.infer<typeof FlyDeploymentSchema>;

// ============================================================================
// Railway Deployment Schema
// ============================================================================

export const RailwayDeploymentSchema = z.object({
  type: z.literal("railway").default("railway"),
  enabled: z.boolean().default(true),
  project: z.string(),
  service: z.string(),
  image: z.string(),
  environment: z.record(z.string(), z.string()).optional(),
  state: withEmptyDefault(RailwayStateSchema)
});
export type RailwayDeployment = z.infer<typeof RailwayDeploymentSchema>;

// ============================================================================
// HuggingFace Spaces Deployment Schema
// ============================================================================

export const HuggingFaceDeploymentSchema = z.object({
  type: z.literal("huggingface").default("huggingface"),
  enabled: z.boolean().default(true),
  repo: z.string(),
  space_type: z.literal("docker").default("docker"),
  hardware: z.string().optional(),
  image: z.string(),
  environment: z.record(z.string(), z.string()).optional(),
  state: withEmptyDefault(HuggingFaceStateSchema)
});
export type HuggingFaceDeployment = z.infer<typeof HuggingFaceDeploymentSchema>;

// ============================================================================
// RunPod Deployment Schemas
// ============================================================================

export const RunPodBuildConfigSchema = z.object({
  platform: z.string().default("linux/amd64"),
  no_cache: z.boolean().default(false)
});
export type RunPodBuildConfig = z.infer<typeof RunPodBuildConfigSchema>;

export const RunPodImageConfigSchema = z.object({
  name: z.string(),
  tag: z.string(),
  registry: z.string().default("docker.io"),
  build: withEmptyDefault(RunPodBuildConfigSchema)
});
export type RunPodImageConfig = z.infer<typeof RunPodImageConfigSchema>;

export function runPodImageConfigFullName(image: RunPodImageConfig): string {
  return `${image.name}:${image.tag}`;
}

export const RunPodTemplateConfigSchema = z.object({
  name: z.string(),
  gpu_types: z.array(z.string()).default([]),
  data_centers: z.array(z.string()).default([]),
  network_volume_id: z.string().optional(),
  allowed_cuda_versions: z.array(z.string()).default([])
});
export type RunPodTemplateConfig = z.infer<typeof RunPodTemplateConfigSchema>;

export const RunPodEndpointConfigSchema = z.object({
  name: z.string(),
  workers_min: z.number().int().default(0),
  workers_max: z.number().int().default(3),
  idle_timeout: z.number().int().default(60),
  execution_timeout: z.number().int().optional(),
  flashboot: z.boolean().default(false),
  gpu_count: z.number().int().optional()
});
export type RunPodEndpointConfig = z.infer<typeof RunPodEndpointConfigSchema>;

export const RunPodStateSchema = z.object({
  template_id: z.string().nullable().optional().default(null),
  endpoint_id: z.string().nullable().optional().default(null),
  endpoint_url: z.string().nullable().optional().default(null),
  last_deployed: z.string().nullable().optional().default(null),
  status: DeploymentStatusEnum.default("unknown"),
  last_build_hash: z.string().nullable().optional().default(null)
});
export type RunPodState = z.infer<typeof RunPodStateSchema>;

export const RunPodDockerConfigSchema = z.object({
  username: z.string().optional(),
  registry: z.string().default("docker.io")
});
export type RunPodDockerConfig = z.infer<typeof RunPodDockerConfigSchema>;

export const RunPodDeploymentSchema = z.object({
  type: z.literal("runpod").default("runpod"),
  enabled: z.boolean().default(true),
  image: RunPodImageConfigSchema,
  gpu_types: z.array(z.string()).default([]),
  gpu_count: z.number().int().optional(),
  cpu_flavors: z.array(z.string()).default([]),
  vcpu_count: z.number().int().optional(),
  data_centers: z.array(z.string()).default([]),
  network_volume_id: z.string().optional(),
  allowed_cuda_versions: z.array(z.string()).default([]),
  docker: withEmptyDefault(RunPodDockerConfigSchema),
  platform: z.string().default("linux/amd64"),
  template_name: z.string().optional(),
  compute_type: z.string().default("GPU"),
  workers_min: z.number().int().default(0),
  workers_max: z.number().int().default(3),
  idle_timeout: z.number().int().default(5),
  execution_timeout: z.number().int().optional(),
  flashboot: z.boolean().default(false),
  environment: z.record(z.string(), z.string()).optional(),
  persistent_paths: PersistentPathsSchema.optional(),
  workflows: z.array(z.string()).default([]),
  state: withEmptyDefault(RunPodStateSchema)
});
export type RunPodDeployment = z.infer<typeof RunPodDeploymentSchema>;

export function runPodDeploymentGetServerUrl(
  d: RunPodDeployment
): string | undefined {
  return d.state.endpoint_url ?? undefined;
}

// ============================================================================
// GCP Deployment Schemas
// ============================================================================

export const GCPBuildConfigSchema = z.object({
  platform: z.string().default("linux/amd64")
});
export type GCPBuildConfig = z.infer<typeof GCPBuildConfigSchema>;

export const GCPImageConfigSchema = z.object({
  registry: z.string().default("us-docker.pkg.dev"),
  repository: z.string(),
  tag: z.string(),
  build: withEmptyDefault(GCPBuildConfigSchema)
});
export type GCPImageConfig = z.infer<typeof GCPImageConfigSchema>;

export function gcpImageConfigFullName(image: GCPImageConfig): string {
  return `${image.registry}/${image.repository}:${image.tag}`;
}

export const GCPResourceConfigSchema = z.object({
  cpu: z.string().default("4"),
  memory: z.string().default("16Gi"),
  min_instances: z.number().int().default(0),
  max_instances: z.number().int().default(3),
  concurrency: z.number().int().default(80),
  timeout: z.number().int().default(3600),
  gpu_type: z.string().optional(),
  gpu_count: z.number().int().optional()
});
export type GCPResourceConfig = z.infer<typeof GCPResourceConfigSchema>;

export const GCPStorageConfigSchema = z.object({
  gcs_bucket: z.string().optional(),
  gcs_mount_path: z.string().default("/mnt/gcs")
});
export type GCPStorageConfig = z.infer<typeof GCPStorageConfigSchema>;

export const GCPIAMConfigSchema = z.object({
  service_account: z.string().optional(),
  allow_unauthenticated: z.boolean().default(false)
});
export type GCPIAMConfig = z.infer<typeof GCPIAMConfigSchema>;

export const GCPStateSchema = z.object({
  service_url: z.string().nullable().optional().default(null),
  last_deployed: z.string().nullable().optional().default(null),
  status: DeploymentStatusEnum.default("unknown"),
  revision: z.string().nullable().optional().default(null)
});
export type GCPState = z.infer<typeof GCPStateSchema>;

export const GCPDeploymentSchema = z.object({
  type: z.literal("gcp").default("gcp"),
  enabled: z.boolean().default(true),
  project_id: z.string(),
  region: z.string().default("us-central1"),
  service_name: z.string(),
  image: GCPImageConfigSchema,
  resources: withEmptyDefault(GCPResourceConfigSchema),
  storage: GCPStorageConfigSchema.optional(),
  iam: withEmptyDefault(GCPIAMConfigSchema),
  environment: z.record(z.string(), z.string()).optional(),
  persistent_paths: PersistentPathsSchema.optional(),
  workflows: z.array(z.string()).default([]),
  state: withEmptyDefault(GCPStateSchema)
});
export type GCPDeployment = z.infer<typeof GCPDeploymentSchema>;

export function gcpDeploymentGetServerUrl(
  d: GCPDeployment
): string | undefined {
  return d.state.service_url ?? undefined;
}

// ============================================================================
// Main Configuration Schemas
// ============================================================================

export const DefaultsConfigSchema = z.object({
  chat_provider: z.string().default("llama_cpp"),
  default_model: z.string().default(""),
  log_level: z.string().default("INFO"),
  auth_provider: z.string().default("local"),

  extra: z.record(z.string(), z.unknown()).default({})
});
export type DefaultsConfig = z.infer<typeof DefaultsConfigSchema>;

/**
 * Discriminated union for deployment types.
 */
const AnyDeploymentSchema = z.discriminatedUnion("type", [
  DockerDeploymentSchema,
  RunPodDeploymentSchema,
  GCPDeploymentSchema,
  FlyDeploymentSchema,
  RailwayDeploymentSchema,
  HuggingFaceDeploymentSchema
]);
export type AnyDeployment = z.infer<typeof AnyDeploymentSchema>;

function generateDeploymentMasterKey(): string {
  return crypto.randomBytes(32).toString("base64");
}

/**
 * Ensure a deployment has a SECRETS_MASTER_KEY configured in the environment
 * that will be applied to the deployed container/service.
 *
 * @returns true when the deployment was modified.
 */
export function ensureDeploymentMasterKey(
  deployment: AnyDeployment
): boolean {
  if (deployment.type === "docker") {
    const env = deployment.container.environment ?? {};
    if (env["SECRETS_MASTER_KEY"]) {
      return false;
    }
    deployment.container.environment = {
      ...env,
      SECRETS_MASTER_KEY: generateDeploymentMasterKey()
    };
    return true;
  }

  const env = deployment.environment ?? {};
  if (env["SECRETS_MASTER_KEY"]) {
    return false;
  }
  deployment.environment = {
    ...env,
    SECRETS_MASTER_KEY: generateDeploymentMasterKey()
  };
  return true;
}

export const DeploymentConfigSchema = z.object({
  version: z.string().default("2.0"),
  defaults: withEmptyDefault(DefaultsConfigSchema),

  deployments: z.record(z.string(), AnyDeploymentSchema).default({})
});
export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;

/** Parse and validate raw data into a DeploymentConfig. */
export function parseDeploymentConfig(data: unknown): DeploymentConfig {
  return DeploymentConfigSchema.parse(data);
}

// ============================================================================
// Configuration Loading and Saving
// ============================================================================

export const DEPLOYMENT_CONFIG_FILE = "deployment.yaml";

/**
 * Get the default deployment config directory.
 * Uses XDG_CONFIG_HOME on Linux, ~/Library/Application Support on macOS,
 * APPDATA on Windows, falling back to ~/.config/nodetool.
 */
function getDefaultConfigDir(): string {
  const plat = process.platform;
  if (plat === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "nodetool"
    );
  }
  if (plat === "win32") {
    return process.env.APPDATA
      ? path.join(process.env.APPDATA, "nodetool")
      : path.join(os.homedir(), ".config", "nodetool");
  }
  // Linux / other
  return process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, "nodetool")
    : path.join(os.homedir(), ".config", "nodetool");
}

/** Get the path to the deployment configuration file. */
export function getDeploymentConfigPath(): string {
  return path.join(getDefaultConfigDir(), DEPLOYMENT_CONFIG_FILE);
}

/**
 * Load deployment configuration from deployment.yaml.
 *
 * Automatically generates and saves server_auth_token for self-hosted
 * deployments that don't have one.
 */
export async function loadDeploymentConfig(): Promise<DeploymentConfig> {
  const configPath = getDeploymentConfigPath();

  try {
    const stat = await fs.stat(configPath);
    if (!stat.isFile()) {
      throw new Error(`${configPath} is not a file.`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Deployment configuration not found at ${configPath}. Run 'nodetool deploy init' to create it.`
      );
    }
    throw err;
  }

  const raw = await fs.readFile(configPath, "utf-8");
  const data = yaml.load(raw, { schema: yaml.JSON_SCHEMA });

  if (!data) {
    return parseDeploymentConfig({});
  }

  const config = parseDeploymentConfig(data);

  // Auto-generate deployment secrets that are required for headless/container
  // deployments and persist them in deployment.yaml.
  let configUpdated = false;
  for (const deployment of Object.values(config.deployments)) {
    if (ensureDeploymentMasterKey(deployment)) {
      configUpdated = true;
    }

    if (deployment.type === "docker" && !deployment.server_auth_token) {
      deployment.server_auth_token = crypto.randomBytes(32).toString("base64url");
      configUpdated = true;
    }
  }

  if (configUpdated) {
    await saveDeploymentConfig(config);
  }

  return config;
}

/**
 * Save deployment configuration to deployment.yaml.
 *
 * Performs an atomic write via a temporary file to prevent corruption.
 */
export async function saveDeploymentConfig(
  config: DeploymentConfig
): Promise<void> {
  const configPath = getDeploymentConfigPath();
  const dir = path.dirname(configPath);

  await fs.mkdir(dir, { recursive: true });

  // Serialize — strip undefined and null values via JSON round-trip
  const data = JSON.parse(
    JSON.stringify(config, (_key, value) =>
      value === null ? undefined : value
    )
  );
  const yamlStr = yaml.dump(data, {
    flowLevel: -1,
    sortKeys: false,
    noCompatMode: true
  });

  const tempPath = configPath + ".tmp";
  try {
    await fs.writeFile(tempPath, yamlStr, { encoding: "utf-8", mode: 0o600 });
    await fs.rename(tempPath, configPath);
  } catch (err) {
    await fs.unlink(tempPath).catch((cleanupErr: NodeJS.ErrnoException) => {
      // ENOENT means the temp file was never created — expected. Anything
      // else is worth knowing about.
      if (cleanupErr.code !== "ENOENT") {
        log.warn(
          `Failed to clean up temp config file ${tempPath} after write error`,
          cleanupErr
        );
      }
    });
    throw err;
  }
}

/**
 * Initialize a new deployment configuration file with defaults.
 */
export async function initDeploymentConfig(): Promise<DeploymentConfig> {
  const configPath = getDeploymentConfigPath();

  let exists = false;
  try {
    await fs.stat(configPath);
    exists = true;
  } catch {
    // file does not exist
  }
  if (exists) {
    throw new Error(`Deployment configuration already exists at ${configPath}`);
  }

  const config = parseDeploymentConfig({});
  await saveDeploymentConfig(config);
  return config;
}

/**
 * Merge default environment variables with deployment-specific overrides.
 */
export function mergeDefaultsWithEnv(
  defaults: DefaultsConfig,
  deploymentEnv?: Record<string, string>
): Record<string, string> {
  const env: Record<string, string> = {};

  env["CHAT_PROVIDER"] = defaults.chat_provider;
  env["DEFAULT_MODEL"] = defaults.default_model;
  env["LOG_LEVEL"] = defaults.log_level;
  env["AUTH_PROVIDER"] = defaults.auth_provider;

  for (const [k, v] of Object.entries(defaults.extra)) {
    if (v != null) env[k] = String(v);
  }

  if (deploymentEnv) {
    Object.assign(env, deploymentEnv);
  }

  return env;
}
