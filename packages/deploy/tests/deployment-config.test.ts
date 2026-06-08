import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import * as crypto from "crypto";

import {
  DeploymentType,
  DeploymentStatus,
  SSHConfigSchema,
  ContainerConfigSchema,
  ServerPathsSchema,
  PersistentPathsSchema,
  SelfHostedStateSchema,
  ImageConfigSchema,
  imageConfigFullName,
  NginxConfigSchema,
  DockerDeploymentSchema,
  dockerDeploymentGetServerUrl,
  DefaultsConfigSchema,
  DeploymentConfigSchema,
  parseDeploymentConfig,
  DEPLOYMENT_CONFIG_FILE,
  getDeploymentConfigPath,
  loadDeploymentConfig,
  saveDeploymentConfig,
  initDeploymentConfig,
  mergeDefaultsWithEnv,
  ensureDeploymentMasterKey
} from "../src/deployment-config.js";

// ============================================================================
// Enums
// ============================================================================

describe("DeploymentType", () => {
  it("has all expected values", () => {
    expect(DeploymentType.DOCKER).toBe("docker");
  });
});

describe("DeploymentStatus", () => {
  it("has all expected values", () => {
    expect(DeploymentStatus.UNKNOWN).toBe("unknown");
    expect(DeploymentStatus.PENDING).toBe("pending");
    expect(DeploymentStatus.DEPLOYING).toBe("deploying");
    expect(DeploymentStatus.RUNNING).toBe("running");
    expect(DeploymentStatus.ACTIVE).toBe("active");
    expect(DeploymentStatus.SERVING).toBe("serving");
    expect(DeploymentStatus.ERROR).toBe("error");
    expect(DeploymentStatus.STOPPED).toBe("stopped");
    expect(DeploymentStatus.DESTROYED).toBe("destroyed");
  });
});

// ============================================================================
// SSHConfigSchema
// ============================================================================

describe("SSHConfigSchema", () => {
  it("parses valid config with all fields", () => {
    const result = SSHConfigSchema.parse({
      user: "deploy",
      key_path: "/home/deploy/.ssh/id_rsa",
      password: "secret",
      port: 2222
    });
    expect(result.user).toBe("deploy");
    expect(result.key_path).toBe("/home/deploy/.ssh/id_rsa");
    expect(result.password).toBe("secret");
    expect(result.port).toBe(2222);
  });

  it("defaults port to 22", () => {
    const result = SSHConfigSchema.parse({ user: "root" });
    expect(result.port).toBe(22);
  });

  it("expands ~ in key_path", () => {
    const result = SSHConfigSchema.parse({
      user: "root",
      key_path: "~/.ssh/id_rsa"
    });
    expect(result.key_path).toBe(path.join(os.homedir(), ".ssh/id_rsa"));
  });

  it("leaves absolute key_path unchanged", () => {
    const result = SSHConfigSchema.parse({
      user: "root",
      key_path: "/etc/ssh/key"
    });
    expect(result.key_path).toBe("/etc/ssh/key");
  });

  it("rejects missing user", () => {
    expect(() => SSHConfigSchema.parse({})).toThrow();
  });

  it("rejects non-integer port", () => {
    expect(() => SSHConfigSchema.parse({ user: "x", port: 22.5 })).toThrow();
  });
});

// ============================================================================
// ContainerConfigSchema
// ============================================================================

describe("ContainerConfigSchema", () => {
  it("parses valid config", () => {
    const result = ContainerConfigSchema.parse({
      name: "nodetool-api",
      port: 8000,
      gpu: "nvidia",
      environment: { FOO: "bar" },
      workflows: ["wf1.json"]
    });
    expect(result.name).toBe("nodetool-api");
    expect(result.port).toBe(8000);
    expect(result.gpu).toBe("nvidia");
    expect(result.environment).toEqual({ FOO: "bar" });
    expect(result.workflows).toEqual(["wf1.json"]);
  });

  it("accepts minimal required fields", () => {
    const result = ContainerConfigSchema.parse({ name: "c", port: 3000 });
    expect(result.gpu).toBeUndefined();
    expect(result.environment).toBeUndefined();
    expect(result.workflows).toBeUndefined();
  });

  it("rejects missing name", () => {
    expect(() => ContainerConfigSchema.parse({ port: 3000 })).toThrow();
  });

  it("rejects missing port", () => {
    expect(() => ContainerConfigSchema.parse({ name: "c" })).toThrow();
  });
});

// ============================================================================
// ServerPathsSchema
// ============================================================================

describe("ServerPathsSchema", () => {
  it("uses defaults when parsing empty object", () => {
    const result = ServerPathsSchema.parse({});
    expect(result.workspace).toBe("~/nodetool_data/workspace");
    expect(result.hf_cache).toBe("~/nodetool_data/hf-cache");
  });

  it("allows overrides", () => {
    const result = ServerPathsSchema.parse({
      workspace: "/data/ws",
      hf_cache: "/data/hf"
    });
    expect(result.workspace).toBe("/data/ws");
    expect(result.hf_cache).toBe("/data/hf");
  });
});

// ============================================================================
// PersistentPathsSchema
// ============================================================================

describe("PersistentPathsSchema", () => {
  it("uses all defaults", () => {
    const result = PersistentPathsSchema.parse({});
    expect(result.users_file).toBe("/workspace/users.yaml");
    expect(result.db_path).toBe("/workspace/nodetool.db");
    expect(result.chroma_path).toBe("/workspace/chroma");
    expect(result.hf_cache).toBe("/workspace/hf-cache");
    expect(result.asset_bucket).toBe("/workspace/assets");
    expect(result.logs_path).toBe("/workspace/logs");
  });
});

// ============================================================================
// SelfHostedStateSchema
// ============================================================================

describe("SelfHostedStateSchema", () => {
  it("uses all defaults", () => {
    const result = SelfHostedStateSchema.parse({});
    expect(result.last_deployed).toBeNull();
    expect(result.status).toBe("unknown");
    expect(result.container_id).toBeNull();
    expect(result.container_name).toBeNull();
    expect(result.url).toBeNull();
    expect(result.container_hash).toBeNull();
  });

  it("accepts valid status values", () => {
    for (const status of [
      "unknown",
      "pending",
      "deploying",
      "running",
      "active",
      "serving",
      "error",
      "stopped",
      "destroyed"
    ]) {
      const result = SelfHostedStateSchema.parse({ status });
      expect(result.status).toBe(status);
    }
  });

  it("rejects invalid status", () => {
    expect(() => SelfHostedStateSchema.parse({ status: "invalid" })).toThrow();
  });
});

// ============================================================================
// ImageConfigSchema & imageConfigFullName
// ============================================================================

describe("ImageConfigSchema", () => {
  it("parses with defaults", () => {
    const result = ImageConfigSchema.parse({ name: "myimage" });
    expect(result.tag).toBe("latest");
    expect(result.registry).toBe("docker.io");
  });
});

describe("imageConfigFullName", () => {
  it("appends tag to name", () => {
    const image = ImageConfigSchema.parse({ name: "myimage", tag: "v1" });
    expect(imageConfigFullName(image)).toBe("myimage:v1");
  });

  it("returns name as-is if it contains @", () => {
    const image = ImageConfigSchema.parse({
      name: "myimage@sha256:abc123",
      tag: "v1"
    });
    expect(imageConfigFullName(image)).toBe("myimage@sha256:abc123");
  });

  it("returns name as-is if last segment contains :", () => {
    const image = ImageConfigSchema.parse({
      name: "registry.io/repo:v2",
      tag: "v1"
    });
    expect(imageConfigFullName(image)).toBe("registry.io/repo:v2");
  });

  it("appends default tag 'latest'", () => {
    const image = ImageConfigSchema.parse({ name: "myimage" });
    expect(imageConfigFullName(image)).toBe("myimage:latest");
  });
});

// ============================================================================
// NginxConfigSchema
// ============================================================================

describe("NginxConfigSchema", () => {
  it("parses with defaults", () => {
    const result = NginxConfigSchema.parse({});
    expect(result.enabled).toBe(false);
    expect(result.http_port).toBe(80);
    expect(result.https_port).toBe(443);
  });

  it("expands ~ in ssl paths", () => {
    const result = NginxConfigSchema.parse({
      ssl_cert_path: "~/certs/cert.pem",
      ssl_key_path: "~/certs/key.pem"
    });
    expect(result.ssl_cert_path).toBe(
      path.join(os.homedir(), "certs/cert.pem")
    );
    expect(result.ssl_key_path).toBe(path.join(os.homedir(), "certs/key.pem"));
  });

  it("rejects ssl_cert_path without ssl_key_path", () => {
    expect(() =>
      NginxConfigSchema.parse({ ssl_cert_path: "/cert.pem" })
    ).toThrow("Both ssl_cert_path and ssl_key_path must be provided together");
  });

  it("rejects ssl_key_path without ssl_cert_path", () => {
    expect(() => NginxConfigSchema.parse({ ssl_key_path: "/key.pem" })).toThrow(
      "Both ssl_cert_path and ssl_key_path must be provided together"
    );
  });

  it("expands ~ in config_dir", () => {
    const result = NginxConfigSchema.parse({});
    expect(result.config_dir).toBe(
      path.join(os.homedir(), "nodetool_data/nginx/conf.d")
    );
  });
});

// ============================================================================
// DockerDeploymentSchema & dockerDeploymentGetServerUrl
// ============================================================================

describe("DockerDeploymentSchema", () => {
  const validDocker = {
    host: "192.168.1.100",
    image: { name: "nodetool/api" },
    container: { name: "nodetool-api", port: 7777 }
  };

  it("parses valid config with defaults", () => {
    const result = DockerDeploymentSchema.parse(validDocker);
    expect(result.type).toBe("docker");
    expect(result.enabled).toBe(true);
    expect(result.paths.workspace).toBe("~/nodetool_data/workspace");
    expect(result.state.status).toBe("unknown");
  });

  it("rejects missing host", () => {
    expect(() =>
      DockerDeploymentSchema.parse({
        image: { name: "x" },
        container: { name: "c", port: 8000 }
      })
    ).toThrow();
  });
});

describe("dockerDeploymentGetServerUrl", () => {
  it("returns port 8000 when container port is 7777", () => {
    const d = DockerDeploymentSchema.parse({
      host: "myhost",
      image: { name: "img" },
      container: { name: "c", port: 7777 }
    });
    expect(dockerDeploymentGetServerUrl(d)).toBe("http://myhost:8000");
  });

  it("returns container port otherwise", () => {
    const d = DockerDeploymentSchema.parse({
      host: "myhost",
      image: { name: "img" },
      container: { name: "c", port: 9000 }
    });
    expect(dockerDeploymentGetServerUrl(d)).toBe("http://myhost:9000");
  });
});

// ============================================================================
// DefaultsConfigSchema
// ============================================================================

describe("DefaultsConfigSchema", () => {
  it("uses all defaults", () => {
    const result = DefaultsConfigSchema.parse({});
    expect(result.chat_provider).toBe("llama_cpp");
    expect(result.default_model).toBe("");
    expect(result.log_level).toBe("INFO");
    expect(result.auth_provider).toBe("local");
    expect(result.extra).toEqual({});
  });

  it("allows custom values", () => {
    const result = DefaultsConfigSchema.parse({
      chat_provider: "openai",
      default_model: "gpt-4",
      log_level: "DEBUG",
      extra: { CUSTOM_KEY: "value" }
    });
    expect(result.chat_provider).toBe("openai");
    expect(result.default_model).toBe("gpt-4");
    expect(result.extra).toEqual({ CUSTOM_KEY: "value" });
  });
});

// ============================================================================
// DeploymentConfigSchema & parseDeploymentConfig
// ============================================================================

describe("DeploymentConfigSchema", () => {
  it("parses empty object with defaults", () => {
    const result = DeploymentConfigSchema.parse({});
    expect(result.version).toBe("2.0");
    expect(result.defaults.chat_provider).toBe("llama_cpp");
    expect(result.deployments).toEqual({});
  });
});

describe("parseDeploymentConfig", () => {
  it("parses empty object", () => {
    const result = parseDeploymentConfig({});
    expect(result.version).toBe("2.0");
    expect(result.deployments).toEqual({});
  });

  it("parses config with docker deployment", () => {
    const result = parseDeploymentConfig({
      deployments: {
        prod: {
          type: "docker",
          host: "server1",
          image: { name: "img" },
          container: { name: "c", port: 8000 }
        }
      }
    });
    expect(result.deployments.prod.type).toBe("docker");
  });

  it("rejects null input", () => {
    expect(() => parseDeploymentConfig(null)).toThrow();
  });

  it("rejects string input", () => {
    expect(() => parseDeploymentConfig("string")).toThrow();
  });

  it("parses config with multiple docker deployments", () => {
    const result = parseDeploymentConfig({
      deployments: {
        docker1: {
          type: "docker",
          host: "h1",
          image: { name: "img" },
          container: { name: "c", port: 8000 }
        },
        docker2: {
          type: "docker",
          host: "h2",
          image: { name: "img2" },
          container: { name: "c2", port: 9000 }
        }
      }
    });
    expect(Object.keys(result.deployments)).toHaveLength(2);
    expect(result.deployments.docker1.type).toBe("docker");
    expect(result.deployments.docker2.type).toBe("docker");
  });

  it("rejects the removed non-Docker targets", () => {
    for (const type of ["runpod", "gcp", "fly", "railway", "huggingface"]) {
      expect(() =>
        parseDeploymentConfig({
          deployments: {
            bad: { type, image: { name: "img", tag: "v1" } }
          }
        })
      ).toThrow();
    }
  });

  it("rejects invalid deployment type", () => {
    expect(() =>
      parseDeploymentConfig({
        deployments: {
          bad: { type: "invalid_type", host: "h" }
        }
      })
    ).toThrow();
  });
});

// ============================================================================
// getDeploymentConfigPath
// ============================================================================

describe("getDeploymentConfigPath", () => {
  it("returns a path ending with deployment.yaml", () => {
    const p = getDeploymentConfigPath();
    expect(p.endsWith(DEPLOYMENT_CONFIG_FILE)).toBe(true);
  });

  it("includes nodetool in the path", () => {
    const p = getDeploymentConfigPath();
    expect(p).toContain("nodetool");
  });
});

// ============================================================================
// loadDeploymentConfig / saveDeploymentConfig / initDeploymentConfig (with real temp dir)
// ============================================================================

describe("DEPLOYMENT_CONFIG_FILE constant", () => {
  it("is deployment.yaml", () => {
    expect(DEPLOYMENT_CONFIG_FILE).toBe("deployment.yaml");
  });
});

// ============================================================================
// ensureDeploymentMasterKey / mergeDefaultsWithEnv
// ============================================================================

describe("ensureDeploymentMasterKey", () => {
  it("adds SECRETS_MASTER_KEY to Docker container environment", () => {
    const deployment = DockerDeploymentSchema.parse({
      host: "localhost",
      image: { name: "ghcr.io/nodetool-ai/nodetool", tag: "latest" },
      container: { name: "nodetool-dev", port: 8000 }
    });

    expect(ensureDeploymentMasterKey(deployment)).toBe(true);
    const key = deployment.container.environment?.SECRETS_MASTER_KEY;
    expect(Buffer.from(key ?? "", "base64")).toHaveLength(32);
  });

  it("preserves an existing master key", () => {
    const deployment = DockerDeploymentSchema.parse({
      host: "localhost",
      image: { name: "ghcr.io/nodetool-ai/nodetool", tag: "latest" },
      container: {
        name: "nodetool-dev",
        port: 8000,
        environment: { SECRETS_MASTER_KEY: "existing" }
      }
    });

    expect(ensureDeploymentMasterKey(deployment)).toBe(false);
    expect(deployment.container.environment?.SECRETS_MASTER_KEY).toBe(
      "existing"
    );
  });
});

// ============================================================================
// mergeDefaultsWithEnv
// ============================================================================

describe("mergeDefaultsWithEnv", () => {
  it("sets default env vars from defaults config", () => {
    const defaults = DefaultsConfigSchema.parse({});
    const env = mergeDefaultsWithEnv(defaults);
    expect(env.CHAT_PROVIDER).toBe("llama_cpp");
    expect(env.DEFAULT_MODEL).toBe("");
    expect(env.LOG_LEVEL).toBe("INFO");
    expect(env.AUTH_PROVIDER).toBe("local");
  });

  it("includes extra fields from defaults", () => {
    const defaults = DefaultsConfigSchema.parse({
      extra: { MY_VAR: "hello", NUM: 42 }
    });
    const env = mergeDefaultsWithEnv(defaults);
    expect(env.MY_VAR).toBe("hello");
    expect(env.NUM).toBe("42");
  });

  it("merges deployment env overrides", () => {
    const defaults = DefaultsConfigSchema.parse({});
    const env = mergeDefaultsWithEnv(defaults, {
      CHAT_PROVIDER: "openai",
      CUSTOM: "value"
    });
    expect(env.CHAT_PROVIDER).toBe("openai");
    expect(env.CUSTOM).toBe("value");
  });

  it("deployment env overrides default values", () => {
    const defaults = DefaultsConfigSchema.parse({
      log_level: "DEBUG"
    });
    const env = mergeDefaultsWithEnv(defaults, { LOG_LEVEL: "WARN" });
    expect(env.LOG_LEVEL).toBe("WARN");
  });

  it("returns only defaults when no deployment env", () => {
    const defaults = DefaultsConfigSchema.parse({ chat_provider: "anthropic" });
    const env = mergeDefaultsWithEnv(defaults);
    expect(env.CHAT_PROVIDER).toBe("anthropic");
    expect(Object.keys(env)).toEqual([
      "CHAT_PROVIDER",
      "DEFAULT_MODEL",
      "LOG_LEVEL",
      "AUTH_PROVIDER"
    ]);
  });

  it("handles undefined deploymentEnv", () => {
    const defaults = DefaultsConfigSchema.parse({});
    const env = mergeDefaultsWithEnv(defaults, undefined);
    expect(env.CHAT_PROVIDER).toBe("llama_cpp");
  });

  it("handles empty deploymentEnv", () => {
    const defaults = DefaultsConfigSchema.parse({});
    const env = mergeDefaultsWithEnv(defaults, {});
    expect(Object.keys(env)).toHaveLength(4);
  });
});

// ============================================================================
// Edge cases and boundary conditions
// ============================================================================

describe("Edge cases", () => {
  it("SSHConfig with empty string password is valid", () => {
    const result = SSHConfigSchema.parse({ user: "root", password: "" });
    expect(result.password).toBe("");
  });

  it("ContainerConfig with port 0", () => {
    const result = ContainerConfigSchema.parse({ name: "c", port: 0 });
    expect(result.port).toBe(0);
  });

  it("ImageConfig with complex registry name", () => {
    const result = ImageConfigSchema.parse({
      name: "us-docker.pkg.dev/project/repo/image",
      tag: "sha-abc123",
      registry: "us-docker.pkg.dev"
    });
    expect(imageConfigFullName(result)).toBe(
      "us-docker.pkg.dev/project/repo/image:sha-abc123"
    );
  });

  it("parseDeploymentConfig with version override", () => {
    const result = parseDeploymentConfig({ version: "2.0" });
    expect(result.version).toBe("2.0");
  });

  it("parseDeploymentConfig with custom defaults", () => {
    const result = parseDeploymentConfig({
      defaults: {
        chat_provider: "openai",
        default_model: "gpt-4o",
        log_level: "DEBUG",
        auth_provider: "supabase",
        extra: { SPECIAL: "true" }
      }
    });
    expect(result.defaults.chat_provider).toBe("openai");
    expect(result.defaults.extra.SPECIAL).toBe("true");
  });
});
