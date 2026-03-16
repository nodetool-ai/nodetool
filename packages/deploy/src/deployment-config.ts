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

// ============================================================================
// Enums
// ============================================================================

export const DeploymentType = {
  DOCKER: "docker",
  SSH: "ssh",
  LOCAL: "local",
  RUNPOD: "runpod",
  GCP: "gcp",
} as const;
export type DeploymentType = (typeof DeploymentType)[keyof typeof DeploymentType];

export const DeploymentStatus = {
  UNKNOWN: "unknown",
  PENDING: "pending",
  DEPLOYING: "deploying",
  RUNNING: "running",
  ACTIVE: "active",
  SERVING: "serving",
  ERROR: "error",
  STOPPED: "stopped",
  DESTROYED: "destroyed",
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
  "destroyed",
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
 * Helper to create a `.default({})` that satisfies Zod v4's type checker.
 * At runtime `schema.parse({})` fills in all sub-defaults; the cast is safe
 * because every field in the object schema already carries its own default.
 */
function withEmptyDefault<T extends z.ZodTypeAny>(schema: T): z.ZodDefault<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return schema.default({} as any);
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
  port: z.number().int().default(22),
});
export type SSHConfig = z.infer<typeof SSHConfigSchema>;

export const ContainerConfigSchema = z.object({
  name: z.string(),
  port: z.number().int(),
  gpu: z.string().optional(),
  environment: z.record(z.string(), z.string()).optional(),
  workflows: z.array(z.string()).optional(),
});
export type ContainerConfig = z.infer<typeof ContainerConfigSchema>;

export const ServerPathsSchema = z.object({
  workspace: z.string().default("~/nodetool_data/workspace"),
  hf_cache: z.string().default("~/nodetool_data/hf-cache"),
});
export type ServerPaths = z.infer<typeof ServerPathsSchema>;

export const PersistentPathsSchema = z.object({
  users_file: z.string().default("/workspace/users.yaml"),
  db_path: z.string().default("/workspace/nodetool.db"),
  chroma_path: z.string().default("/workspace/chroma"),
  hf_cache: z.string().default("/workspace/hf-cache"),
  asset_bucket: z.string().default("/workspace/assets"),
  logs_path: z.string().optional().default("/workspace/logs"),
});
export type PersistentPaths = z.infer<typeof PersistentPathsSchema>;

export const SelfHostedStateSchema = z.object({
  last_deployed: z.string().nullable().optional().default(null),
  status: DeploymentStatusEnum.default("unknown"),
  container_id: z.string().nullable().optional().default(null),
  container_name: z.string().nullable().optional().default(null),
  url: z.string().nullable().optional().default(null),
  container_hash: z.string().nullable().optional().default(null),
});
export type SelfHostedState = z.infer<typeof SelfHostedStateSchema>;

export const ImageConfigSchema = z.object({
  name: z.string(),
  tag: z.string().default("latest"),
  registry: z.string().default("docker.io"),
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
      .transform((v) => (v ? expandUser(v) : v)),
  })
  .refine(
    (data) => {
      if (data.ssl_cert_path && !data.ssl_key_path) return false;
      if (data.ssl_key_path && !data.ssl_cert_path) return false;
      return true;
    },
    {
      message: "Both ssl_cert_path and ssl_key_path must be provided together",
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
  state: withEmptyDefault(SelfHostedStateSchema),
});
export type DockerDeployment = z.infer<typeof DockerDeploymentSchema>;

/** Get server URL for a Docker deployment. */
export function dockerDeploymentGetServerUrl(d: DockerDeployment): string {
  const hostPort = d.container.port === 7777 ? 8000 : d.container.port;
  return `http://${d.host}:${hostPort}`;
}

const BaseShellDeploymentFields = {
  enabled: z.boolean().default(true),
  host: z.string(),
  paths: withEmptyDefault(ServerPathsSchema),
  persistent_paths: PersistentPathsSchema.optional(),
  port: z.number().int(),
  service_name: z.string().optional(),
  gpu: z.string().optional(),
  environment: z.record(z.string(), z.string()).optional(),
  workflows: z.array(z.string()).optional(),
  server_auth_token: z.string().optional(),
  nginx: NginxConfigSchema.optional(),
  state: withEmptyDefault(SelfHostedStateSchema),
} as const;

export const SSHDeploymentSchema = z.object({
  type: z.literal("ssh").default("ssh"),
  ...BaseShellDeploymentFields,
  ssh: SSHConfigSchema,
});
export type SSHDeployment = z.infer<typeof SSHDeploymentSchema>;

export const LocalDeploymentSchema = z.object({
  type: z.literal("local").default("local"),
  ...BaseShellDeploymentFields,
  host: z.string().default("localhost"),
});
export type LocalDeployment = z.infer<typeof LocalDeploymentSchema>;

/** Get server URL for a shell-based deployment. */
export function shellDeploymentGetServerUrl(
  d: SSHDeployment | LocalDeployment
): string {
  if (d.nginx) {
    const nginx = d.nginx as { enabled: boolean; ssl_cert_path?: string; http_port: number; https_port: number };
    if (nginx.enabled) {
      if (nginx.ssl_cert_path) {
        return `https://${d.host}:${nginx.https_port}`;
      }
      return `http://${d.host}:${nginx.http_port}`;
    }
  }
  return `http://${d.host}:${d.port}`;
}

/** Backward-compatibility alias. */
export const RootDeploymentSchema = SSHDeploymentSchema;
export type RootDeployment = SSHDeployment;

export type SelfHostedDeployment =
  | DockerDeployment
  | SSHDeployment
  | LocalDeployment;

// ============================================================================
// RunPod Deployment Schemas
// ============================================================================

export const RunPodBuildConfigSchema = z.object({
  platform: z.string().default("linux/amd64"),
  no_cache: z.boolean().default(false),
});
export type RunPodBuildConfig = z.infer<typeof RunPodBuildConfigSchema>;

export const RunPodImageConfigSchema = z.object({
  name: z.string(),
  tag: z.string(),
  registry: z.string().default("docker.io"),
  build: withEmptyDefault(RunPodBuildConfigSchema),
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
  allowed_cuda_versions: z.array(z.string()).default([]),
});
export type RunPodTemplateConfig = z.infer<typeof RunPodTemplateConfigSchema>;

export const RunPodEndpointConfigSchema = z.object({
  name: z.string(),
  workers_min: z.number().int().default(0),
  workers_max: z.number().int().default(3),
  idle_timeout: z.number().int().default(60),
  execution_timeout: z.number().int().optional(),
  flashboot: z.boolean().default(false),
  gpu_count: z.number().int().optional(),
});
export type RunPodEndpointConfig = z.infer<typeof RunPodEndpointConfigSchema>;

export const RunPodStateSchema = z.object({
  template_id: z.string().nullable().optional().default(null),
  endpoint_id: z.string().nullable().optional().default(null),
  endpoint_url: z.string().nullable().optional().default(null),
  last_deployed: z.string().nullable().optional().default(null),
  status: DeploymentStatusEnum.default("unknown"),
  last_build_hash: z.string().nullable().optional().default(null),
});
export type RunPodState = z.infer<typeof RunPodStateSchema>;

export const RunPodDockerConfigSchema = z.object({
  username: z.string().optional(),
  registry: z.string().default("docker.io"),
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
  state: withEmptyDefault(RunPodStateSchema),
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
  platform: z.string().default("linux/amd64"),
});
export type GCPBuildConfig = z.infer<typeof GCPBuildConfigSchema>;

export const GCPImageConfigSchema = z.object({
  registry: z.string().default("us-docker.pkg.dev"),
  repository: z.string(),
  tag: z.string(),
  build: withEmptyDefault(GCPBuildConfigSchema),
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
  gpu_count: z.number().int().optional(),
});
export type GCPResourceConfig = z.infer<typeof GCPResourceConfigSchema>;

export const GCPStorageConfigSchema = z.object({
  gcs_bucket: z.string().optional(),
  gcs_mount_path: z.string().default("/mnt/gcs"),
});
export type GCPStorageConfig = z.infer<typeof GCPStorageConfigSchema>;

export const GCPIAMConfigSchema = z.object({
  service_account: z.string().optional(),
  allow_unauthenticated: z.boolean().default(false),
});
export type GCPIAMConfig = z.infer<typeof GCPIAMConfigSchema>;

export const GCPStateSchema = z.object({
  service_url: z.string().nullable().optional().default(null),
  last_deployed: z.string().nullable().optional().default(null),
  status: DeploymentStatusEnum.default("unknown"),
  revision: z.string().nullable().optional().default(null),
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
  persistent_paths: PersistentPathsSchema.optional(),
  workflows: z.array(z.string()).default([]),
  state: withEmptyDefault(GCPStateSchema),
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra: z.record(z.string(), z.unknown()).default({} as any),
});
export type DefaultsConfig = z.infer<typeof DefaultsConfigSchema>;

/**
 * Discriminated union for deployment types.
 */
const AnyDeploymentSchema = z.discriminatedUnion("type", [
  DockerDeploymentSchema,
  SSHDeploymentSchema,
  LocalDeploymentSchema,
  RunPodDeploymentSchema,
  GCPDeploymentSchema,
]);
export type AnyDeployment = z.infer<typeof AnyDeploymentSchema>;

export const DeploymentConfigSchema = z.object({
  version: z.string().default("1.0"),
  defaults: withEmptyDefault(DefaultsConfigSchema),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deployments: z.record(z.string(), AnyDeploymentSchema).default({} as any),
});
export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;

// ============================================================================
// Pre-parse transform: normalize legacy "root" type to "ssh"
// ============================================================================

function normalizeLegacyRootType(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return data;
  const obj = data as Record<string, unknown>;
  const deployments = obj.deployments;
  if (typeof deployments !== "object" || deployments === null) return data;

  for (const deployment of Object.values(
    deployments as Record<string, unknown>
  )) {
    if (
      typeof deployment === "object" &&
      deployment !== null &&
      (deployment as Record<string, unknown>).type === "root"
    ) {
      (deployment as Record<string, unknown>).type = "ssh";
    }
  }
  return data;
}

/** Parse and validate raw data into a DeploymentConfig. */
export function parseDeploymentConfig(data: unknown): DeploymentConfig {
  const normalized = normalizeLegacyRootType(data);
  return DeploymentConfigSchema.parse(normalized);
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
    return path.join(os.homedir(), "Library", "Application Support", "nodetool");
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

  // Auto-generate server_auth_token for self-hosted deployments
  let configUpdated = false;
  for (const deployment of Object.values(config.deployments)) {
    if (
      deployment.type === "docker" ||
      deployment.type === "ssh" ||
      deployment.type === "local"
    ) {
      if (!deployment.server_auth_token) {
        deployment.server_auth_token = crypto
          .randomBytes(32)
          .toString("base64url");
        configUpdated = true;
      }
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
  const data = JSON.parse(JSON.stringify(config, (_key, value) => value === null ? undefined : value));
  const yamlStr = yaml.dump(data, {
    flowLevel: -1,
    sortKeys: false,
    noCompatMode: true,
  });

  const tempPath = configPath + ".tmp";
  try {
    await fs.writeFile(tempPath, yamlStr, { encoding: "utf-8", mode: 0o600 });
    await fs.rename(tempPath, configPath);
  } catch (err) {
    try {
      await fs.unlink(tempPath);
    } catch {
      // ignore cleanup errors
    }
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
    throw new Error(
      `Deployment configuration already exists at ${configPath}`
    );
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
