import { describe, it, expect } from "vitest";
import {
  INTERNAL_API_PORT,
  APP_ENV_PORT,
  imageFullName,
  DockerRunGenerator,
  generateDockerRunCommand,
  getDockerRunHash,
  getContainerName
} from "../src/docker-run.js";
import type { DockerRunDeployment } from "../src/docker-run.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeployment(
  overrides?: Partial<DockerRunDeployment>
): DockerRunDeployment {
  return {
    image: {
      name: "myuser/myapp",
      tag: "latest",
      registry: "docker.io"
    },
    container: {
      name: "test-container",
      port: 8080
    },
    paths: {
      workspace: "/srv/nodetool",
      hfCache: "/srv/hf-cache"
    },
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("constants", () => {
  it("should export INTERNAL_API_PORT as 7777", () => {
    expect(INTERNAL_API_PORT).toBe(7777);
  });

  it("should export APP_ENV_PORT as 8000", () => {
    expect(APP_ENV_PORT).toBe(8000);
  });
});

// ---------------------------------------------------------------------------
// imageFullName
// ---------------------------------------------------------------------------

describe("imageFullName", () => {
  it("should append tag to name", () => {
    expect(
      imageFullName({ name: "user/app", tag: "v1", registry: "docker.io" })
    ).toBe("user/app:v1");
  });

  it("should return name as-is if it contains @", () => {
    expect(
      imageFullName({
        name: "user/app@sha256:abc123",
        tag: "v1",
        registry: "docker.io"
      })
    ).toBe("user/app@sha256:abc123");
  });

  it("should return name as-is if last segment has colon", () => {
    expect(
      imageFullName({
        name: "registry.io/user/app:pinned",
        tag: "v1",
        registry: "docker.io"
      })
    ).toBe("registry.io/user/app:pinned");
  });

  it("should handle simple name with tag", () => {
    expect(imageFullName({ name: "nginx", tag: "alpine", registry: "" })).toBe(
      "nginx:alpine"
    );
  });

  it("should handle registry prefix in name", () => {
    expect(
      imageFullName({
        name: "ghcr.io/user/app",
        tag: "latest",
        registry: "ghcr.io"
      })
    ).toBe("ghcr.io/user/app:latest");
  });
});

// ---------------------------------------------------------------------------
// DockerRunGenerator - basic
// ---------------------------------------------------------------------------

describe("DockerRunGenerator constructor", () => {
  it("should store deployment and container", () => {
    const d = makeDeployment();
    const gen = new DockerRunGenerator(d);
    expect(gen.deployment).toBe(d);
    expect(gen.container).toBe(d.container);
    expect(gen.runtimeCommand).toBe("docker");
  });

  it("should accept custom runtime command", () => {
    const gen = new DockerRunGenerator(makeDeployment(), "podman");
    expect(gen.runtimeCommand).toBe("podman");
  });
});

// ---------------------------------------------------------------------------
// getContainerName
// ---------------------------------------------------------------------------

describe("getContainerName", () => {
  it("should prefix container name with nodetool-", () => {
    const d = makeDeployment();
    expect(getContainerName(d)).toBe("nodetool-test-container");
  });

  it("should work via generator method", () => {
    const gen = new DockerRunGenerator(makeDeployment());
    expect(gen.getContainerName()).toBe("nodetool-test-container");
  });

  it("should handle different container names", () => {
    const d = makeDeployment({
      container: { name: "prod-api", port: 80 }
    });
    expect(getContainerName(d)).toBe("nodetool-prod-api");
  });
});

// ---------------------------------------------------------------------------
// generateCommand
// ---------------------------------------------------------------------------

describe("DockerRunGenerator.generateCommand", () => {
  it("should include docker run -d", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).toContain("docker run");
    expect(cmd).toContain("-d");
  });

  it("should include container name", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).toContain("--name nodetool-test-container");
  });

  it("should include restart policy", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).toContain("--restart unless-stopped");
  });

  it("should map port to INTERNAL_API_PORT", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).toContain(`-p 8080:${INTERNAL_API_PORT}`);
  });

  it("should use APP_ENV_PORT when container port equals INTERNAL_API_PORT", () => {
    const d = makeDeployment({
      container: { name: "c", port: INTERNAL_API_PORT }
    });
    const cmd = generateDockerRunCommand(d);
    expect(cmd).toContain(`-p ${APP_ENV_PORT}:${INTERNAL_API_PORT}`);
  });

  it("should use APP_ENV_PORT when container port is 0", () => {
    const d = makeDeployment({
      container: { name: "c", port: 0 }
    });
    const cmd = generateDockerRunCommand(d);
    expect(cmd).toContain(`-p ${APP_ENV_PORT}:${INTERNAL_API_PORT}`);
  });

  it("should include workspace volume", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).toContain("/srv/nodetool:/workspace");
  });

  it("should include hf-cache volume as read-only without persistentPaths", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).toContain("/srv/hf-cache:/hf-cache:ro");
  });

  it("should include hf-cache volume read-write with persistentPaths", () => {
    const d = makeDeployment({
      persistentPaths: {
        usersFile: "/data/users.json",
        dbPath: "/data/db",
        chromaPath: "/data/chroma",
        hfCache: "/data/hf",
        assetBucket: "/data/assets"
      }
    });
    const cmd = generateDockerRunCommand(d);
    // Should NOT have :ro for hf-cache
    expect(cmd).toMatch(/hf-cache(?!:ro)/);
  });

  it("should include image reference", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).toContain("myuser/myapp:latest");
  });

  it("should include health check", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).toContain("--health-cmd=");
    expect(cmd).toContain(`http://localhost:${INTERNAL_API_PORT}/health`);
    expect(cmd).toContain("--health-interval=30s");
    expect(cmd).toContain("--health-timeout=10s");
    expect(cmd).toContain("--health-retries=3");
    expect(cmd).toContain("--health-start-period=40s");
  });

  it("should use custom runtime command", () => {
    const gen = new DockerRunGenerator(makeDeployment(), "podman");
    const cmd = gen.generateCommand();
    expect(cmd).toContain("podman run");
    expect(cmd).not.toContain("docker run");
  });
});

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

describe("DockerRunGenerator environment variables", () => {
  it("should include PORT", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).toContain(`PORT=${APP_ENV_PORT}`);
  });

  it("should include NODETOOL_API_URL", () => {
    const d = makeDeployment();
    const cmd = generateDockerRunCommand(d);
    expect(cmd).toContain("NODETOOL_API_URL=http://localhost:8080");
  });

  it("should include NODETOOL_SERVER_MODE", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).toContain("NODETOOL_SERVER_MODE=private");
  });

  it("should set static AUTH_PROVIDER without persistentPaths", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).toContain("AUTH_PROVIDER=static");
  });

  it("should set multi_user AUTH_PROVIDER with persistentPaths", () => {
    const d = makeDeployment({
      persistentPaths: {
        usersFile: "/data/users.json",
        dbPath: "/data/db",
        chromaPath: "/data/chroma",
        hfCache: "/data/hf",
        assetBucket: "/data/assets"
      }
    });
    const cmd = generateDockerRunCommand(d);
    expect(cmd).toContain("AUTH_PROVIDER=multi_user");
  });

  it("should include persistent path env vars", () => {
    const d = makeDeployment({
      persistentPaths: {
        usersFile: "/data/users.json",
        dbPath: "/data/db",
        chromaPath: "/data/chroma",
        hfCache: "/data/hf",
        assetBucket: "/data/assets"
      }
    });
    const cmd = generateDockerRunCommand(d);
    expect(cmd).toContain("USERS_FILE=/data/users.json");
    expect(cmd).toContain("DB_PATH=/data/db");
    expect(cmd).toContain("CHROMA_PATH=/data/chroma");
    expect(cmd).toContain("HF_HOME=/data/hf");
    expect(cmd).toContain("ASSET_BUCKET=/data/assets");
  });

  it("should set DB_PATH and HF_HOME defaults without persistentPaths", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).toContain("DB_PATH=/workspace/nodetool.db");
    expect(cmd).toContain("HF_HOME=/hf-cache");
  });

  it("should include container environment variables", () => {
    const d = makeDeployment({
      container: {
        name: "c",
        port: 8080,
        environment: { FOO: "bar", BAZ: "qux" }
      }
    });
    const cmd = generateDockerRunCommand(d);
    expect(cmd).toContain("FOO=bar");
    expect(cmd).toContain("BAZ=qux");
  });

  it("should include workflow IDs", () => {
    const d = makeDeployment({
      container: {
        name: "c",
        port: 8080,
        workflows: ["wf1", "wf2", "wf3"]
      }
    });
    const cmd = generateDockerRunCommand(d);
    expect(cmd).toContain("NODETOOL_WORKFLOWS=wf1,wf2,wf3");
  });

  it("should not include NODETOOL_WORKFLOWS when empty", () => {
    const d = makeDeployment({
      container: { name: "c", port: 8080, workflows: [] }
    });
    const cmd = generateDockerRunCommand(d);
    expect(cmd).not.toContain("NODETOOL_WORKFLOWS");
  });

  it("should include SERVER_AUTH_TOKEN when set", () => {
    const d = makeDeployment({ serverAuthToken: "my-secret-token" });
    const cmd = generateDockerRunCommand(d);
    expect(cmd).toContain("SERVER_AUTH_TOKEN=my-secret-token");
  });

  it("should not include SERVER_AUTH_TOKEN when not set", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).not.toContain("SERVER_AUTH_TOKEN");
  });

  it("should respect existing AUTH_PROVIDER in container env without persistentPaths", () => {
    const d = makeDeployment({
      container: {
        name: "c",
        port: 8080,
        environment: { AUTH_PROVIDER: "custom" }
      }
    });
    const cmd = generateDockerRunCommand(d);
    expect(cmd).toContain("AUTH_PROVIDER=custom");
    // Should not overwrite with "static"
    expect(cmd).not.toContain("AUTH_PROVIDER=static");
  });
});

// ---------------------------------------------------------------------------
// GPU configuration
// ---------------------------------------------------------------------------

describe("DockerRunGenerator GPU configuration", () => {
  it("should not include --gpus when no gpu set", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).not.toContain("--gpus");
  });

  it("should include --gpus for single GPU", () => {
    const d = makeDeployment({
      container: { name: "c", port: 8080, gpu: "0" }
    });
    const cmd = generateDockerRunCommand(d);
    expect(cmd).toContain("--gpus");
    expect(cmd).toContain("device=0");
  });

  it("should include --gpus for multiple GPUs", () => {
    const d = makeDeployment({
      container: { name: "c", port: 8080, gpu: "0,1" }
    });
    const cmd = generateDockerRunCommand(d);
    expect(cmd).toContain("--gpus");
    expect(cmd).toContain("device=0,1");
  });

  it("should handle gpu with spaces", () => {
    const d = makeDeployment({
      container: { name: "c", port: 8080, gpu: " 0 " }
    });
    const cmd = generateDockerRunCommand(d);
    expect(cmd).toContain("device=0");
  });
});

// ---------------------------------------------------------------------------
// generateHash
// ---------------------------------------------------------------------------

describe("DockerRunGenerator.generateHash", () => {
  it("should return a hex string", () => {
    const hash = getDockerRunHash(makeDeployment());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should be deterministic", () => {
    const d = makeDeployment();
    expect(getDockerRunHash(d)).toBe(getDockerRunHash(d));
  });

  it("should change when image changes", () => {
    const d1 = makeDeployment();
    const d2 = makeDeployment({
      image: { name: "other/app", tag: "v2", registry: "docker.io" }
    });
    expect(getDockerRunHash(d1)).not.toBe(getDockerRunHash(d2));
  });

  it("should change when port changes", () => {
    const d1 = makeDeployment();
    const d2 = makeDeployment({
      container: { name: "test-container", port: 9090 }
    });
    expect(getDockerRunHash(d1)).not.toBe(getDockerRunHash(d2));
  });

  it("should change when container name changes", () => {
    const d1 = makeDeployment();
    const d2 = makeDeployment({
      container: { name: "other-container", port: 8080 }
    });
    expect(getDockerRunHash(d1)).not.toBe(getDockerRunHash(d2));
  });

  it("should change when gpu changes", () => {
    const d1 = makeDeployment({
      container: { name: "c", port: 8080 }
    });
    const d2 = makeDeployment({
      container: { name: "c", port: 8080, gpu: "0" }
    });
    expect(getDockerRunHash(d1)).not.toBe(getDockerRunHash(d2));
  });

  it("should change when environment changes", () => {
    const d1 = makeDeployment();
    const d2 = makeDeployment({
      container: {
        name: "test-container",
        port: 8080,
        environment: { NEW_VAR: "value" }
      }
    });
    expect(getDockerRunHash(d1)).not.toBe(getDockerRunHash(d2));
  });
});

// ---------------------------------------------------------------------------
// Volume paths with ~
// ---------------------------------------------------------------------------

describe("DockerRunGenerator volume paths", () => {
  it("should handle tilde-prefixed workspace path", () => {
    const d = makeDeployment({
      paths: { workspace: "~/nodetool", hfCache: "~/hf" }
    });
    const cmd = generateDockerRunCommand(d);
    // safeShellQuote should preserve ~/
    expect(cmd).toContain("~/");
  });

  it("should handle absolute paths", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).toContain("/srv/nodetool:/workspace");
  });
});

// ---------------------------------------------------------------------------
// Convenience functions
// ---------------------------------------------------------------------------

describe("convenience functions", () => {
  it("generateDockerRunCommand should work", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).toBeTruthy();
    expect(cmd).toContain("docker run");
  });

  it("getDockerRunHash should work", () => {
    const hash = getDockerRunHash(makeDeployment());
    expect(hash).toHaveLength(64);
  });

  it("getContainerName should work", () => {
    const name = getContainerName(makeDeployment());
    expect(name).toBe("nodetool-test-container");
  });
});

// ---------------------------------------------------------------------------
// Command line continuation
// ---------------------------------------------------------------------------

describe("command formatting", () => {
  it("should use backslash-newline continuation", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    expect(cmd).toContain(" \\\n  ");
  });

  it("should have image as last part", () => {
    const cmd = generateDockerRunCommand(makeDeployment());
    const lines = cmd.split("\\\n").map((l) => l.trim());
    const lastLine = lines[lines.length - 1];
    expect(lastLine).toContain("myuser/myapp:latest");
  });
});
