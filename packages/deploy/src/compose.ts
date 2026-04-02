/**
 * Docker Compose file generation for self-hosted deployments.
 *
 * This module generates docker-compose.yml files from deployment configuration,
 * supporting multi-container setups with GPU assignments, volume mounts, and
 * environment variables.
 */

import { createHash } from "crypto";
import { writeFileSync } from "fs";
import yaml from "js-yaml";
import type { ContainerConfig, DockerDeployment } from "./deployment-config.js";
import { imageConfigFullName } from "./deployment-config.js";
import { INTERNAL_API_PORT, APP_ENV_PORT } from "./docker-run.js";

interface ComposeService {
  image: string;
  container_name: string;
  ports: string[];
  volumes: string[];
  environment: string[];
  restart: string;
  healthcheck: {
    test: string[];
    interval: string;
    timeout: string;
    retries: number;
    start_period: string;
  };
  deploy?: {
    resources: {
      reservations: {
        devices: Array<{
          driver: string;
          device_ids: string[];
          capabilities: string[];
        }>;
      };
    };
  };
}

interface ComposeDict {
  version: string;
  services: Record<string, ComposeService>;
}

/**
 * Generates docker-compose.yml configuration from deployment settings.
 *
 * This class handles the conversion of NodeTool deployment configuration
 * into a docker-compose.yml file suitable for deployment.
 */
export class ComposeGenerator {
  private deployment: DockerDeployment;

  constructor(deployment: DockerDeployment) {
    this.deployment = deployment;
  }

  /**
   * Generate docker-compose.yml content as a string.
   */
  generate(): string {
    const composeDict = this.buildComposeDict();
    return yaml.dump(composeDict, {
      flowLevel: -1,
      sortKeys: false
    });
  }

  /**
   * Generate a SHA256 hash of the compose configuration.
   * This can be used to detect changes in the configuration.
   */
  generateHash(): string {
    const content = this.generate();
    return createHash("sha256").update(content).digest("hex");
  }

  private buildComposeDict(): ComposeDict {
    const compose: ComposeDict = {
      version: "3.8",
      services: {}
    };

    const container = this.deployment.container;
    const serviceName = this.sanitizeServiceName(container.name);
    compose.services[serviceName] = this.buildService(container);

    return compose;
  }

  /**
   * Sanitize container name for use as docker-compose service name.
   */
  private sanitizeServiceName(name: string): string {
    let sanitized = name
      .split("")
      .map((c) => (/[a-zA-Z0-9\-_]/.test(c) ? c : "-"))
      .join("");

    if (sanitized.length > 0 && !/[a-zA-Z0-9]/.test(sanitized[0])) {
      sanitized = "c" + sanitized;
    }

    return sanitized.toLowerCase();
  }

  private buildService(container: ContainerConfig): ComposeService {
    const service: ComposeService = {
      image: imageConfigFullName(this.deployment.image),
      container_name: `nodetool-${container.name}`,
      ports: [`${container.port}:${INTERNAL_API_PORT}`],
      volumes: this.buildVolumes(),
      environment: this.buildEnvironment(container),
      restart: "unless-stopped",
      healthcheck: {
        test: [
          "CMD",
          "curl",
          "-f",
          `http://localhost:${INTERNAL_API_PORT}/health`
        ],
        interval: "30s",
        timeout: "10s",
        retries: 3,
        start_period: "40s"
      }
    };

    if (container.gpu) {
      service.deploy = this.buildDeployConfig(container);
    }

    return service;
  }

  private buildVolumes(): string[] {
    const volumes: string[] = [];
    volumes.push(`${this.deployment.paths.workspace}:/workspace`);
    volumes.push(`${this.deployment.paths.hf_cache}:/hf-cache:ro`);
    return volumes;
  }

  private buildEnvironment(container: ContainerConfig): string[] {
    const env: Record<string, string> = container.environment
      ? { ...container.environment }
      : {};

    env["PORT"] = String(APP_ENV_PORT);
    env["NODETOOL_API_URL"] = `http://localhost:${container.port}`;

    if (container.workflows && container.workflows.length > 0) {
      env["NODETOOL_WORKFLOWS"] = container.workflows.join(",");
    }

    return Object.entries(env).map(([key, value]) => `${key}=${value}`);
  }

  private buildDeployConfig(
    container: ContainerConfig
  ): ComposeService["deploy"] {
    if (!container.gpu) {
      return undefined;
    }

    const gpuIds = container.gpu.split(",").map((g) => g.trim());

    return {
      resources: {
        reservations: {
          devices: [
            {
              driver: "nvidia",
              device_ids: gpuIds,
              capabilities: ["gpu"]
            }
          ]
        }
      }
    };
  }
}

/**
 * Generate docker-compose.yml file from deployment configuration.
 *
 * @param deployment - Docker deployment configuration
 * @param outputPath - Optional path to write the compose file to
 * @returns Generated docker-compose.yml content as string
 */
export function generateComposeFile(
  deployment: DockerDeployment,
  outputPath?: string
): string {
  const generator = new ComposeGenerator(deployment);
  const content = generator.generate();

  if (outputPath) {
    writeFileSync(outputPath, content, "utf-8");
  }

  return content;
}

/**
 * Get hash of the compose configuration for change detection.
 *
 * @param deployment - Docker deployment configuration
 * @returns SHA256 hash of the compose configuration
 */
export function getComposeHash(deployment: DockerDeployment): string {
  const generator = new ComposeGenerator(deployment);
  return generator.generateHash();
}
