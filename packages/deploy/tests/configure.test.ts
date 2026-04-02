import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  detectHfCacheDefault,
  configureDocker,
  configureRunPod,
  configureGCP,
  type DockerConfigParams,
  type RunPodConfigParams,
  type GCPConfigParams
} from "../src/configure.js";

describe("configure", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env["HF_HUB_CACHE"];
    delete process.env["HF_HOME"];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =========================================================================
  // detectHfCacheDefault
  // =========================================================================

  describe("detectHfCacheDefault", () => {
    it("should return HF_HUB_CACHE when set", () => {
      process.env["HF_HUB_CACHE"] = "/custom/hf-cache";
      expect(detectHfCacheDefault()).toBe("/custom/hf-cache");
    });

    it("should return HF_HOME/hub when HF_HOME is set", () => {
      process.env["HF_HOME"] = "/custom/hf";
      expect(detectHfCacheDefault()).toBe(join("/custom/hf", "hub"));
    });

    it("should prioritize HF_HUB_CACHE over HF_HOME", () => {
      process.env["HF_HUB_CACHE"] = "/cache";
      process.env["HF_HOME"] = "/home";
      expect(detectHfCacheDefault()).toBe("/cache");
    });

    it("should fallback to ~/.cache/huggingface/hub", () => {
      expect(detectHfCacheDefault()).toBe(
        join(homedir(), ".cache", "huggingface", "hub")
      );
    });
  });

  // =========================================================================
  // configureDocker
  // =========================================================================

  describe("configureDocker", () => {
    it("should return a docker deployment with correct type", () => {
      const result = configureDocker("test", {
        host: "192.168.1.1",
        sshUser: "root"
      });
      expect(result.type).toBe("docker");
    });

    it("should set host from params", () => {
      const result = configureDocker("test", {
        host: "10.0.0.1",
        sshUser: "root"
      });
      expect(result.host).toBe("10.0.0.1");
    });

    it("should include SSH config for non-localhost hosts", () => {
      const result = configureDocker("test", {
        host: "remote.host",
        sshUser: "deploy",
        sshKeyPath: "~/.ssh/deploy_key"
      });
      expect(result.ssh).toBeDefined();
      expect(result.ssh!.user).toBe("deploy");
    });

    it("should not include SSH config for localhost", () => {
      const result = configureDocker("test", { host: "localhost" });
      expect(result.ssh).toBeUndefined();
    });

    it("should not include SSH for 127.0.0.1", () => {
      const result = configureDocker("test", { host: "127.0.0.1" });
      expect(result.ssh).toBeUndefined();
    });

    it("should not include SSH for ::1", () => {
      const result = configureDocker("test", { host: "::1" });
      expect(result.ssh).toBeUndefined();
    });

    it("should not include SSH for 0.0.0.0", () => {
      const result = configureDocker("test", { host: "0.0.0.0" });
      expect(result.ssh).toBeUndefined();
    });

    it("should use default image name", () => {
      const result = configureDocker("test", { host: "localhost" });
      expect(result.image.name).toBe("ghcr.io/nodetool-ai/nodetool");
    });

    it("should use custom image name", () => {
      const result = configureDocker("test", {
        host: "localhost",
        imageName: "my-image"
      });
      expect(result.image.name).toBe("my-image");
    });

    it("should use default image tag 'latest'", () => {
      const result = configureDocker("test", { host: "localhost" });
      expect(result.image.tag).toBe("latest");
    });

    it("should use custom image tag", () => {
      const result = configureDocker("test", {
        host: "localhost",
        imageTag: "v2.0"
      });
      expect(result.image.tag).toBe("v2.0");
    });

    it("should generate container name from deployment name", () => {
      const result = configureDocker("myserver", { host: "localhost" });
      expect(result.container.name).toBe("nodetool-myserver");
    });

    it("should use custom container name", () => {
      const result = configureDocker("test", {
        host: "localhost",
        containerName: "custom-container"
      });
      expect(result.container.name).toBe("custom-container");
    });

    it("should default container port to 8000", () => {
      const result = configureDocker("test", { host: "localhost" });
      expect(result.container.port).toBe(8000);
    });

    it("should use custom container port", () => {
      const result = configureDocker("test", {
        host: "localhost",
        containerPort: 9000
      });
      expect(result.container.port).toBe(9000);
    });

    it("should pass GPU setting", () => {
      const result = configureDocker("test", {
        host: "localhost",
        gpu: "0,1"
      });
      expect(result.container.gpu).toBe("0,1");
    });

    it("should pass workflows", () => {
      const result = configureDocker("test", {
        host: "localhost",
        workflows: ["wf1", "wf2"]
      });
      expect(result.container.workflows).toEqual(["wf1", "wf2"]);
    });

    it("should set default workspace path", () => {
      const result = configureDocker("test", { host: "localhost" });
      expect(result.paths.workspace).toBe(
        join(homedir(), ".nodetool-workspace")
      );
    });

    it("should use custom workspace path", () => {
      const result = configureDocker("test", {
        host: "localhost",
        workspacePath: "/data/workspace"
      });
      expect(result.paths.workspace).toBe("/data/workspace");
    });

    it("should default SSH key path to ~/.ssh/id_rsa", () => {
      const result = configureDocker("test", {
        host: "remote.com",
        sshUser: "user"
      });
      expect(result.ssh!.key_path).toContain("id_rsa");
    });
  });

  // =========================================================================
  // configureRunPod
  // =========================================================================

  describe("configureRunPod", () => {
    it("should return a runpod deployment with correct type", () => {
      const result = configureRunPod("test", { imageName: "my-img" });
      expect(result.type).toBe("runpod");
    });

    it("should set image name", () => {
      const result = configureRunPod("test", { imageName: "my-img" });
      expect(result.image.name).toBe("my-img");
    });

    it("should default image tag to latest", () => {
      const result = configureRunPod("test", { imageName: "my-img" });
      expect(result.image.tag).toBe("latest");
    });

    it("should use custom image tag", () => {
      const result = configureRunPod("test", {
        imageName: "my-img",
        imageTag: "v1.0"
      });
      expect(result.image.tag).toBe("v1.0");
    });

    it("should default registry to docker.io", () => {
      const result = configureRunPod("test", { imageName: "my-img" });
      expect(result.image.registry).toBe("docker.io");
    });

    it("should use custom registry", () => {
      const result = configureRunPod("test", {
        imageName: "my-img",
        registry: "ghcr.io"
      });
      expect(result.image.registry).toBe("ghcr.io");
    });

    it("should be enabled by default", () => {
      const result = configureRunPod("test", { imageName: "my-img" });
      expect(result.enabled).toBe(true);
    });
  });

  // =========================================================================
  // configureGCP
  // =========================================================================

  describe("configureGCP", () => {
    const baseParams: GCPConfigParams = {
      projectId: "my-project",
      imageRepository: "us-docker.pkg.dev/proj/repo/img"
    };

    it("should return a gcp deployment with correct type", () => {
      const result = configureGCP("test", baseParams);
      expect(result.type).toBe("gcp");
    });

    it("should set project_id", () => {
      const result = configureGCP("test", baseParams);
      expect(result.project_id).toBe("my-project");
    });

    it("should default region to us-central1", () => {
      const result = configureGCP("test", baseParams);
      expect(result.region).toBe("us-central1");
    });

    it("should use custom region", () => {
      const result = configureGCP("test", {
        ...baseParams,
        region: "europe-west1"
      });
      expect(result.region).toBe("europe-west1");
    });

    it("should use deployment name as default service name", () => {
      const result = configureGCP("my-service", baseParams);
      expect(result.service_name).toBe("my-service");
    });

    it("should use custom service name", () => {
      const result = configureGCP("test", {
        ...baseParams,
        serviceName: "custom-svc"
      });
      expect(result.service_name).toBe("custom-svc");
    });

    it("should set image repository", () => {
      const result = configureGCP("test", baseParams);
      expect(result.image.repository).toBe("us-docker.pkg.dev/proj/repo/img");
    });

    it("should default image tag to latest", () => {
      const result = configureGCP("test", baseParams);
      expect(result.image.tag).toBe("latest");
    });

    it("should use custom image tag", () => {
      const result = configureGCP("test", {
        ...baseParams,
        imageTag: "v3.0"
      });
      expect(result.image.tag).toBe("v3.0");
    });

    it("should default CPU to 4", () => {
      const result = configureGCP("test", baseParams);
      expect(result.resources.cpu).toBe("4");
    });

    it("should use custom CPU", () => {
      const result = configureGCP("test", { ...baseParams, cpu: "8" });
      expect(result.resources.cpu).toBe("8");
    });

    it("should default memory to 16Gi", () => {
      const result = configureGCP("test", baseParams);
      expect(result.resources.memory).toBe("16Gi");
    });

    it("should use custom memory", () => {
      const result = configureGCP("test", { ...baseParams, memory: "32Gi" });
      expect(result.resources.memory).toBe("32Gi");
    });

    it("should be enabled by default", () => {
      const result = configureGCP("test", baseParams);
      expect(result.enabled).toBe(true);
    });
  });
});
