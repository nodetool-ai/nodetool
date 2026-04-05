import { describe, it, expect, vi, beforeEach } from "vitest";
import yaml from "js-yaml";
import {
  ComposeGenerator,
  generateComposeFile,
  getComposeHash
} from "../src/compose.js";
import type { DockerDeployment } from "../src/deployment-config.js";

// Mock writeFileSync
vi.mock("fs", () => ({
  writeFileSync: vi.fn()
}));

function makeDeployment(
  overrides: Partial<DockerDeployment> = {}
): DockerDeployment {
  return {
    type: "docker",
    enabled: true,
    host: "192.168.1.100",
    paths: {
      workspace: "/data/workspace",
      hf_cache: "/data/hf-cache"
    },
    image: {
      name: "nodetool/server",
      tag: "latest",
      registry: "docker.io"
    },
    container: {
      name: "worker-1",
      port: 9000
    },
    state: {
      last_deployed: null,
      status: "unknown",
      container_id: null,
      container_name: null,
      url: null,
      container_hash: null
    },
    ...overrides
  } as DockerDeployment;
}

describe("ComposeGenerator", () => {
  describe("generate()", () => {
    it("should produce valid YAML output", () => {
      const gen = new ComposeGenerator(makeDeployment());
      const output = gen.generate();
      const parsed = yaml.load(output) as Record<string, unknown>;
      expect(parsed).toBeDefined();
      expect(parsed["version"]).toBe("3.8");
    });

    it("should include version 3.8", () => {
      const gen = new ComposeGenerator(makeDeployment());
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      expect(parsed["version"]).toBe("3.8");
    });

    it("should create a service with the sanitized container name", () => {
      const gen = new ComposeGenerator(makeDeployment());
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      expect(services["worker-1"]).toBeDefined();
    });

    it("should set container_name with nodetool- prefix", () => {
      const gen = new ComposeGenerator(makeDeployment());
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      expect(svc["container_name"]).toBe("nodetool-worker-1");
    });

    it("should set the correct image name with tag", () => {
      const gen = new ComposeGenerator(makeDeployment());
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      expect(svc["image"]).toBe("nodetool/server:latest");
    });

    it("should map container port to internal API port 7777", () => {
      const gen = new ComposeGenerator(makeDeployment());
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      expect(svc["ports"]).toContain("9000:7777");
    });

    it("should include workspace volume", () => {
      const gen = new ComposeGenerator(makeDeployment());
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      const volumes = svc["volumes"] as string[];
      expect(volumes).toContain("/data/workspace:/workspace");
    });

    it("should include hf_cache volume as read-only", () => {
      const gen = new ComposeGenerator(makeDeployment());
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      const volumes = svc["volumes"] as string[];
      expect(volumes).toContain("/data/hf-cache:/hf-cache:ro");
    });

    it("should set restart policy to unless-stopped", () => {
      const gen = new ComposeGenerator(makeDeployment());
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      expect(svc["restart"]).toBe("unless-stopped");
    });

    it("should include a healthcheck", () => {
      const gen = new ComposeGenerator(makeDeployment());
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      const hc = svc["healthcheck"] as Record<string, unknown>;
      expect(hc).toBeDefined();
      expect(hc["interval"]).toBe("30s");
      expect(hc["timeout"]).toBe("10s");
      expect(hc["retries"]).toBe(3);
      expect(hc["start_period"]).toBe("40s");
    });

    it("should include curl health test against internal port", () => {
      const gen = new ComposeGenerator(makeDeployment());
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      const hc = svc["healthcheck"] as Record<string, unknown>;
      const test = hc["test"] as string[];
      expect(test).toEqual([
        "CMD",
        "curl",
        "-f",
        "http://localhost:7777/health"
      ]);
    });

    it("should set PORT environment variable to 8000", () => {
      const gen = new ComposeGenerator(makeDeployment());
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      const env = svc["environment"] as string[];
      expect(env).toContainEqual("PORT=8000");
    });

    it("should set NODETOOL_API_URL using container port", () => {
      const gen = new ComposeGenerator(makeDeployment());
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      const env = svc["environment"] as string[];
      expect(env).toContainEqual("NODETOOL_API_URL=http://localhost:9000");
    });

    it("should not include deploy section when no GPU", () => {
      const gen = new ComposeGenerator(makeDeployment());
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      expect(svc["deploy"]).toBeUndefined();
    });
  });

  describe("GPU configuration", () => {
    it("should include deploy section when GPU is specified", () => {
      const dep = makeDeployment({
        container: { name: "gpu-worker", port: 9000, gpu: "0" }
      });
      const gen = new ComposeGenerator(dep);
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["gpu-worker"] as Record<string, unknown>;
      expect(svc["deploy"]).toBeDefined();
    });

    it("should set nvidia driver", () => {
      const dep = makeDeployment({
        container: { name: "gpu-worker", port: 9000, gpu: "0" }
      });
      const gen = new ComposeGenerator(dep);
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["gpu-worker"] as Record<string, unknown>;
      const deploy = svc["deploy"] as Record<string, unknown>;
      const resources = deploy["resources"] as Record<string, unknown>;
      const reservations = resources["reservations"] as Record<string, unknown>;
      const devices = reservations["devices"] as Array<Record<string, unknown>>;
      expect(devices[0]["driver"]).toBe("nvidia");
    });

    it("should set single GPU device ID", () => {
      const dep = makeDeployment({
        container: { name: "gpu-worker", port: 9000, gpu: "0" }
      });
      const gen = new ComposeGenerator(dep);
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["gpu-worker"] as Record<string, unknown>;
      const deploy = svc["deploy"] as Record<string, unknown>;
      const resources = deploy["resources"] as Record<string, unknown>;
      const reservations = resources["reservations"] as Record<string, unknown>;
      const devices = reservations["devices"] as Array<Record<string, unknown>>;
      expect(devices[0]["device_ids"]).toEqual(["0"]);
    });

    it("should support multiple GPU device IDs", () => {
      const dep = makeDeployment({
        container: { name: "gpu-worker", port: 9000, gpu: "0, 1, 2" }
      });
      const gen = new ComposeGenerator(dep);
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["gpu-worker"] as Record<string, unknown>;
      const deploy = svc["deploy"] as Record<string, unknown>;
      const resources = deploy["resources"] as Record<string, unknown>;
      const reservations = resources["reservations"] as Record<string, unknown>;
      const devices = reservations["devices"] as Array<Record<string, unknown>>;
      expect(devices[0]["device_ids"]).toEqual(["0", "1", "2"]);
    });

    it("should set gpu capabilities", () => {
      const dep = makeDeployment({
        container: { name: "gpu-worker", port: 9000, gpu: "0" }
      });
      const gen = new ComposeGenerator(dep);
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["gpu-worker"] as Record<string, unknown>;
      const deploy = svc["deploy"] as Record<string, unknown>;
      const resources = deploy["resources"] as Record<string, unknown>;
      const reservations = resources["reservations"] as Record<string, unknown>;
      const devices = reservations["devices"] as Array<Record<string, unknown>>;
      expect(devices[0]["capabilities"]).toEqual(["gpu"]);
    });
  });

  describe("environment variables", () => {
    it("should include custom environment variables", () => {
      const dep = makeDeployment({
        container: {
          name: "worker-1",
          port: 9000,
          environment: { MY_VAR: "hello", OTHER: "world" }
        }
      });
      const gen = new ComposeGenerator(dep);
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      const env = svc["environment"] as string[];
      expect(env).toContainEqual("MY_VAR=hello");
      expect(env).toContainEqual("OTHER=world");
    });

    it("should include NODETOOL_WORKFLOWS when workflows specified", () => {
      const dep = makeDeployment({
        container: {
          name: "worker-1",
          port: 9000,
          workflows: ["wf-1", "wf-2"]
        }
      });
      const gen = new ComposeGenerator(dep);
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      const env = svc["environment"] as string[];
      expect(env).toContainEqual("NODETOOL_WORKFLOWS=wf-1,wf-2");
    });

    it("should not include NODETOOL_WORKFLOWS when workflows empty", () => {
      const dep = makeDeployment({
        container: { name: "worker-1", port: 9000, workflows: [] }
      });
      const gen = new ComposeGenerator(dep);
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      const env = svc["environment"] as string[];
      const wfEnv = env.find((e: string) =>
        e.startsWith("NODETOOL_WORKFLOWS=")
      );
      expect(wfEnv).toBeUndefined();
    });

    it("should not include NODETOOL_WORKFLOWS when workflows undefined", () => {
      const dep = makeDeployment();
      const gen = new ComposeGenerator(dep);
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      const env = svc["environment"] as string[];
      const wfEnv = env.find((e: string) =>
        e.startsWith("NODETOOL_WORKFLOWS=")
      );
      expect(wfEnv).toBeUndefined();
    });
  });

  describe("service name sanitization", () => {
    it("should lowercase service names", () => {
      const dep = makeDeployment({
        container: { name: "MyWorker", port: 9000 }
      });
      const gen = new ComposeGenerator(dep);
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      expect(services["myworker"]).toBeDefined();
    });

    it("should replace special characters with hyphens", () => {
      const dep = makeDeployment({
        container: { name: "worker@node.1", port: 9000 }
      });
      const gen = new ComposeGenerator(dep);
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      expect(services["worker-node-1"]).toBeDefined();
    });

    it("should prepend 'c' if name starts with non-alphanumeric", () => {
      const dep = makeDeployment({
        container: { name: "-worker", port: 9000 }
      });
      const gen = new ComposeGenerator(dep);
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      expect(services["c-worker"]).toBeDefined();
    });

    it("should handle underscores in names", () => {
      const dep = makeDeployment({
        container: { name: "my_worker", port: 9000 }
      });
      const gen = new ComposeGenerator(dep);
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      expect(services["my_worker"]).toBeDefined();
    });
  });

  describe("image configuration", () => {
    it("should use custom tag", () => {
      const dep = makeDeployment({
        image: { name: "nodetool/server", tag: "v2.0.0", registry: "docker.io" }
      });
      const gen = new ComposeGenerator(dep);
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      expect(svc["image"]).toBe("nodetool/server:v2.0.0");
    });

    it("should not double-add tag if image name already has colon", () => {
      const dep = makeDeployment({
        image: {
          name: "nodetool/server:beta",
          tag: "latest",
          registry: "docker.io"
        }
      });
      const gen = new ComposeGenerator(dep);
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      expect(svc["image"]).toBe("nodetool/server:beta");
    });

    it("should handle image name with @ digest", () => {
      const dep = makeDeployment({
        image: {
          name: "nodetool/server@sha256:abc123",
          tag: "latest",
          registry: "docker.io"
        }
      });
      const gen = new ComposeGenerator(dep);
      const parsed = yaml.load(gen.generate()) as Record<string, unknown>;
      const services = parsed["services"] as Record<string, unknown>;
      const svc = services["worker-1"] as Record<string, unknown>;
      expect(svc["image"]).toBe("nodetool/server@sha256:abc123");
    });
  });

  describe("generateHash()", () => {
    it("should return a hex string", () => {
      const gen = new ComposeGenerator(makeDeployment());
      const hash = gen.generateHash();
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should return the same hash for the same config", () => {
      const dep = makeDeployment();
      const gen1 = new ComposeGenerator(dep);
      const gen2 = new ComposeGenerator(dep);
      expect(gen1.generateHash()).toBe(gen2.generateHash());
    });

    it("should return different hashes for different configs", () => {
      const dep1 = makeDeployment({ host: "host-a" });
      const dep2 = makeDeployment({ host: "host-b" });
      const gen1 = new ComposeGenerator(dep1);
      const gen2 = new ComposeGenerator(dep2);
      // Different port means different env var, so hash differs
      expect(gen1.generateHash()).toBe(gen2.generateHash()); // host not in compose output
      // But different port does change it
      const dep3 = makeDeployment({
        container: { name: "worker-1", port: 9001 }
      });
      const gen3 = new ComposeGenerator(dep3);
      expect(gen1.generateHash()).not.toBe(gen3.generateHash());
    });
  });
});

describe("generateComposeFile()", () => {
  it("should return compose YAML string", () => {
    const dep = makeDeployment();
    const content = generateComposeFile(dep);
    expect(content).toContain("version:");
    expect(content).toContain("services:");
  });

  it("should write to file when outputPath is given", async () => {
    const { writeFileSync } = await import("fs");
    const dep = makeDeployment();
    generateComposeFile(dep, "/tmp/test-compose.yml");
    expect(writeFileSync).toHaveBeenCalledWith(
      "/tmp/test-compose.yml",
      expect.any(String),
      "utf-8"
    );
  });

  it("should not write to file when no outputPath", async () => {
    const { writeFileSync } = await import("fs");
    vi.mocked(writeFileSync).mockClear();
    const dep = makeDeployment();
    generateComposeFile(dep);
    expect(writeFileSync).not.toHaveBeenCalled();
  });
});

describe("getComposeHash()", () => {
  it("should return a SHA256 hex string", () => {
    const dep = makeDeployment();
    const hash = getComposeHash(dep);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should match ComposeGenerator.generateHash()", () => {
    const dep = makeDeployment();
    const hash = getComposeHash(dep);
    const gen = new ComposeGenerator(dep);
    expect(hash).toBe(gen.generateHash());
  });
});
