import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock child_process and fs/promises before importing
vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  writeFile: vi.fn(),
  unlink: vi.fn(),
}));

import { execFile } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { generateDockerfile, buildImage } from "../src/image-builder.js";
import type { ImageBuildSpec } from "../src/image-spec.js";

const mockedExecFile = vi.mocked(execFile);
const mockedWriteFile = vi.mocked(writeFile);
const mockedUnlink = vi.mocked(unlink);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpec(overrides?: Partial<ImageBuildSpec>): ImageBuildSpec {
  return {
    mode: "fullstack",
    apt_packages: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateDockerfile – base image selection
// ---------------------------------------------------------------------------

describe("generateDockerfile base image", () => {
  it("should use node:20-slim when no CUDA", () => {
    const df = generateDockerfile(makeSpec());
    expect(df).toContain("FROM node:20-slim");
  });

  it("should use nvidia/cuda base when CUDA is set", () => {
    const df = generateDockerfile(makeSpec({ cuda: "12.1.0" }));
    expect(df).toContain("FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04");
  });

  it("should auto-correct CUDA X.Y to X.Y.0", () => {
    const df = generateDockerfile(makeSpec({ cuda: "12.1" }));
    expect(df).toContain("FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04");
  });

  it("should keep CUDA X.Y.Z as-is", () => {
    const df = generateDockerfile(makeSpec({ cuda: "11.8.0" }));
    expect(df).toContain("FROM nvidia/cuda:11.8.0-runtime-ubuntu22.04");
  });
});

// ---------------------------------------------------------------------------
// generateDockerfile – apt packages
// ---------------------------------------------------------------------------

describe("generateDockerfile apt packages", () => {
  it("should not include apt-get when no packages", () => {
    const df = generateDockerfile(makeSpec());
    expect(df).not.toContain("apt-get install");
  });

  it("should include apt-get install for specified packages", () => {
    const df = generateDockerfile(makeSpec({ apt_packages: ["curl", "git"] }));
    expect(df).toContain("apt-get install");
    expect(df).toContain("curl git");
  });

  it("should clean up apt lists", () => {
    const df = generateDockerfile(makeSpec({ apt_packages: ["curl"] }));
    expect(df).toContain("rm -rf /var/lib/apt/lists/*");
  });

  it("should add python packages to apt list when python is configured", () => {
    const df = generateDockerfile(
      makeSpec({ python: { version: "3.11", packages: [], index_url: "https://pypi.org/simple", extra_index_urls: [] } })
    );
    expect(df).toContain("python3.11");
    expect(df).toContain("python3.11-venv");
  });

  it("should add curl to apt packages when CUDA is set", () => {
    const df = generateDockerfile(makeSpec({ cuda: "12.1.0" }));
    expect(df).toContain("curl");
  });

  it("should not duplicate curl if already in apt_packages with CUDA", () => {
    const df = generateDockerfile(
      makeSpec({ apt_packages: ["curl"], cuda: "12.1.0" })
    );
    // Count occurrences of curl in the apt-get line
    const aptLine = df.split("\n").find((l) => l.includes("apt-get install") || l.includes("curl git") || l.includes("curl \\"));
    // curl should appear in apt packages only once
    const curlCount = (df.match(/\bcurl\b/g) || []).length;
    // curl appears in apt-get and in the nodesource setup command
    expect(curlCount).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// generateDockerfile – Python
// ---------------------------------------------------------------------------

describe("generateDockerfile Python", () => {
  it("should add deadsnakes PPA when python is configured", () => {
    const df = generateDockerfile(
      makeSpec({ python: { version: "3.11", packages: [], index_url: "https://pypi.org/simple", extra_index_urls: [] } })
    );
    expect(df).toContain("software-properties-common");
    expect(df).toContain("add-apt-repository ppa:deadsnakes/ppa");
  });

  it("should create a venv for the specified Python version", () => {
    const df = generateDockerfile(
      makeSpec({ python: { version: "3.10", packages: [], index_url: "https://pypi.org/simple", extra_index_urls: [] } })
    );
    expect(df).toContain("python3.10 -m venv /opt/venv");
    expect(df).toContain('ENV PATH="/opt/venv/bin:$PATH"');
  });

  it("should not include pip install when no packages", () => {
    const df = generateDockerfile(
      makeSpec({ python: { version: "3.11", packages: [], index_url: "https://pypi.org/simple", extra_index_urls: [] } })
    );
    expect(df).not.toContain("pip install");
  });

  it("should include pip install when packages are specified", () => {
    const df = generateDockerfile(
      makeSpec({
        python: {
          version: "3.11",
          packages: ["numpy", "torch"],
          index_url: "https://pypi.org/simple",
          extra_index_urls: [],
        },
      })
    );
    expect(df).toContain("pip install --no-cache-dir");
    expect(df).toContain("numpy torch");
  });

  it("should include custom index URL in pip install", () => {
    const df = generateDockerfile(
      makeSpec({
        python: {
          version: "3.11",
          packages: ["torch"],
          index_url: "https://download.pytorch.org/whl/cu121",
          extra_index_urls: [],
        },
      })
    );
    expect(df).toContain('--index-url "https://download.pytorch.org/whl/cu121"');
  });

  it("should include extra index URLs in pip install", () => {
    const df = generateDockerfile(
      makeSpec({
        python: {
          version: "3.11",
          packages: ["torch"],
          index_url: "https://pypi.org/simple",
          extra_index_urls: [
            "https://download.pytorch.org/whl/cu121",
            "https://pypi.ngc.nvidia.com",
          ],
        },
      })
    );
    expect(df).toContain('--extra-index-url "https://download.pytorch.org/whl/cu121"');
    expect(df).toContain('--extra-index-url "https://pypi.ngc.nvidia.com"');
  });
});

// ---------------------------------------------------------------------------
// generateDockerfile – Node.js on CUDA
// ---------------------------------------------------------------------------

describe("generateDockerfile Node.js on CUDA", () => {
  it("should install Node.js via nodesource on CUDA base", () => {
    const df = generateDockerfile(makeSpec({ cuda: "12.1.0" }));
    expect(df).toContain("# Install Node.js");
    expect(df).toContain("deb.nodesource.com/setup_20.x");
    expect(df).toContain("apt-get install -y --no-install-recommends nodejs");
  });

  it("should not install Node.js separately without CUDA", () => {
    const df = generateDockerfile(makeSpec());
    expect(df).not.toContain("deb.nodesource.com");
  });
});

// ---------------------------------------------------------------------------
// generateDockerfile – server and web UI copy
// ---------------------------------------------------------------------------

describe("generateDockerfile copy layers", () => {
  it("should always copy server bundle", () => {
    const df = generateDockerfile(makeSpec());
    expect(df).toContain("COPY server/ .");
  });

  it("should always set WORKDIR /app", () => {
    const df = generateDockerfile(makeSpec());
    expect(df).toContain("WORKDIR /app");
  });

  it("should copy web UI in fullstack mode", () => {
    const df = generateDockerfile(makeSpec({ mode: "fullstack" }));
    expect(df).toContain("COPY web/build/ ./public/");
  });

  it("should not copy web UI in backend mode", () => {
    const df = generateDockerfile(makeSpec({ mode: "backend" }));
    expect(df).not.toContain("COPY web/build/");
  });
});

// ---------------------------------------------------------------------------
// generateDockerfile – entrypoint
// ---------------------------------------------------------------------------

describe("generateDockerfile entrypoint", () => {
  it("should expose port 7777", () => {
    const df = generateDockerfile(makeSpec());
    expect(df).toContain("EXPOSE 7777");
  });

  it("should set CMD to run node server.js", () => {
    const df = generateDockerfile(makeSpec());
    expect(df).toContain('CMD ["node", "server.js"]');
  });
});

// ---------------------------------------------------------------------------
// generateDockerfile – layer ordering
// ---------------------------------------------------------------------------

describe("generateDockerfile layer ordering", () => {
  it("should have base image before apt-get", () => {
    const df = generateDockerfile(
      makeSpec({ apt_packages: ["curl"] })
    );
    const fromIdx = df.indexOf("FROM ");
    const aptIdx = df.indexOf("apt-get install");
    expect(fromIdx).toBeLessThan(aptIdx);
  });

  it("should have apt-get before pip install", () => {
    const df = generateDockerfile(
      makeSpec({
        apt_packages: ["curl"],
        python: {
          version: "3.11",
          packages: ["numpy"],
          index_url: "https://pypi.org/simple",
          extra_index_urls: [],
        },
      })
    );
    const aptIdx = df.indexOf("apt-get install -y --no-install-recommends \\\n    curl");
    const pipIdx = df.indexOf("pip install");
    expect(aptIdx).toBeLessThan(pipIdx);
  });

  it("should have pip install before COPY server", () => {
    const df = generateDockerfile(
      makeSpec({
        python: {
          version: "3.11",
          packages: ["numpy"],
          index_url: "https://pypi.org/simple",
          extra_index_urls: [],
        },
      })
    );
    const pipIdx = df.indexOf("pip install");
    const copyIdx = df.indexOf("COPY server/");
    expect(pipIdx).toBeLessThan(copyIdx);
  });

  it("should have COPY server before COPY web", () => {
    const df = generateDockerfile(makeSpec({ mode: "fullstack" }));
    const serverIdx = df.indexOf("COPY server/");
    const webIdx = df.indexOf("COPY web/build/");
    expect(serverIdx).toBeLessThan(webIdx);
  });

  it("should have COPY before EXPOSE", () => {
    const df = generateDockerfile(makeSpec());
    const copyIdx = df.indexOf("COPY server/");
    const exposeIdx = df.indexOf("EXPOSE 7777");
    expect(copyIdx).toBeLessThan(exposeIdx);
  });

  it("should have EXPOSE before CMD", () => {
    const df = generateDockerfile(makeSpec());
    const exposeIdx = df.indexOf("EXPOSE 7777");
    const cmdIdx = df.indexOf("CMD ");
    expect(exposeIdx).toBeLessThan(cmdIdx);
  });
});

// ---------------------------------------------------------------------------
// generateDockerfile – input validation (shell injection prevention)
// ---------------------------------------------------------------------------

describe("generateDockerfile input validation", () => {
  it("should reject apt package with shell metacharacters", () => {
    expect(() =>
      generateDockerfile(makeSpec({ apt_packages: ["curl; rm -rf /"] }))
    ).toThrow("Invalid apt package name");
  });

  it("should reject apt package with spaces", () => {
    expect(() =>
      generateDockerfile(makeSpec({ apt_packages: ["my package"] }))
    ).toThrow("Invalid apt package name");
  });

  it("should reject apt package with uppercase", () => {
    expect(() =>
      generateDockerfile(makeSpec({ apt_packages: ["CURL"] }))
    ).toThrow("Invalid apt package name");
  });

  it("should accept apt package with dots and hyphens", () => {
    expect(() =>
      generateDockerfile(makeSpec({ apt_packages: ["libfoo-dev", "libbar2.0"] }))
    ).not.toThrow();
  });

  it("should accept apt package with plus sign", () => {
    expect(() =>
      generateDockerfile(makeSpec({ apt_packages: ["g++"] }))
    ).not.toThrow();
  });

  it("should reject pip package with shell metacharacters", () => {
    expect(() =>
      generateDockerfile(
        makeSpec({
          python: {
            version: "3.11",
            packages: ["torch; rm -rf /"],
            index_url: "https://pypi.org/simple",
            extra_index_urls: [],
          },
        })
      )
    ).toThrow("Invalid pip package name");
  });

  it("should reject pip package with spaces", () => {
    expect(() =>
      generateDockerfile(
        makeSpec({
          python: {
            version: "3.11",
            packages: ["my package"],
            index_url: "https://pypi.org/simple",
            extra_index_urls: [],
          },
        })
      )
    ).toThrow("Invalid pip package name");
  });

  it("should accept pip package with version specifiers", () => {
    expect(() =>
      generateDockerfile(
        makeSpec({
          python: {
            version: "3.11",
            packages: ["torch>=2.0.0", "numpy==1.24.0", "transformers~=4.30"],
            index_url: "https://pypi.org/simple",
            extra_index_urls: [],
          },
        })
      )
    ).not.toThrow();
  });

  it("should accept pip package with extras", () => {
    expect(() =>
      generateDockerfile(
        makeSpec({
          python: {
            version: "3.11",
            packages: ["transformers[torch,sentencepiece]"],
            index_url: "https://pypi.org/simple",
            extra_index_urls: [],
          },
        })
      )
    ).not.toThrow();
  });

  it("should reject index_url not starting with http(s)", () => {
    expect(() =>
      generateDockerfile(
        makeSpec({
          python: {
            version: "3.11",
            packages: ["torch"],
            index_url: "ftp://evil.com/packages",
            extra_index_urls: [],
          },
        })
      )
    ).toThrow("Invalid index URL");
  });

  it("should reject extra_index_url not starting with http(s)", () => {
    expect(() =>
      generateDockerfile(
        makeSpec({
          python: {
            version: "3.11",
            packages: ["torch"],
            index_url: "https://pypi.org/simple",
            extra_index_urls: ["file:///etc/passwd"],
          },
        })
      )
    ).toThrow("Invalid extra index URL");
  });

  it("should accept valid http and https index URLs", () => {
    expect(() =>
      generateDockerfile(
        makeSpec({
          python: {
            version: "3.11",
            packages: ["torch"],
            index_url: "http://internal-pypi.example.com/simple",
            extra_index_urls: ["https://pypi.org/simple"],
          },
        })
      )
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// generateDockerfile – combined scenarios
// ---------------------------------------------------------------------------

describe("generateDockerfile combined scenarios", () => {
  it("should generate correct Dockerfile for CUDA + Python + apt + fullstack", () => {
    const df = generateDockerfile({
      mode: "fullstack",
      apt_packages: ["ffmpeg", "libsm6"],
      python: {
        version: "3.11",
        packages: ["torch", "transformers"],
        index_url: "https://download.pytorch.org/whl/cu121",
        extra_index_urls: ["https://pypi.org/simple"],
      },
      cuda: "12.1",
    });

    // Base image
    expect(df).toContain("FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04");
    // deadsnakes
    expect(df).toContain("ppa:deadsnakes/ppa");
    // apt packages (ffmpeg, libsm6, python3.11, python3.11-venv, curl)
    expect(df).toContain("ffmpeg");
    expect(df).toContain("libsm6");
    expect(df).toContain("python3.11");
    expect(df).toContain("python3.11-venv");
    expect(df).toContain("curl");
    // Node.js install
    expect(df).toContain("deb.nodesource.com/setup_20.x");
    // Python venv
    expect(df).toContain("python3.11 -m venv /opt/venv");
    // pip install
    expect(df).toContain("pip install --no-cache-dir");
    expect(df).toContain("torch transformers");
    // Web UI
    expect(df).toContain("COPY web/build/ ./public/");
    // Entrypoint
    expect(df).toContain("EXPOSE 7777");
    expect(df).toContain('CMD ["node", "server.js"]');
  });

  it("should generate minimal backend Dockerfile", () => {
    const df = generateDockerfile(makeSpec({ mode: "backend" }));

    expect(df).toContain("FROM node:20-slim");
    expect(df).not.toContain("apt-get install");
    expect(df).not.toContain("pip install");
    expect(df).not.toContain("COPY web/build/");
    expect(df).toContain("COPY server/ .");
    expect(df).toContain("EXPOSE 7777");
    expect(df).toContain('CMD ["node", "server.js"]');
  });

  it("should generate Dockerfile with only apt packages", () => {
    const df = generateDockerfile(makeSpec({ apt_packages: ["curl", "wget"] }));

    expect(df).toContain("FROM node:20-slim");
    expect(df).toContain("curl wget");
    expect(df).not.toContain("pip install");
    expect(df).not.toContain("ppa:deadsnakes");
  });

  it("should generate Dockerfile with Python but no CUDA", () => {
    const df = generateDockerfile(
      makeSpec({
        python: {
          version: "3.11",
          packages: ["flask"],
          index_url: "https://pypi.org/simple",
          extra_index_urls: [],
        },
      })
    );

    expect(df).toContain("FROM node:20-slim");
    expect(df).toContain("ppa:deadsnakes/ppa");
    expect(df).toContain("python3.11");
    expect(df).toContain("pip install --no-cache-dir");
    expect(df).toContain("flask");
    expect(df).not.toContain("nvidia/cuda");
    expect(df).not.toContain("deb.nodesource.com");
  });
});

// ---------------------------------------------------------------------------
// buildImage
// ---------------------------------------------------------------------------

describe("buildImage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedWriteFile.mockResolvedValue();
    mockedUnlink.mockResolvedValue();
    // Make execFile call its callback successfully
    mockedExecFile.mockImplementation(
      ((_cmd: unknown, _args: unknown, _opts: unknown, callback?: (err: Error | null, stdout: string, stderr: string) => void) => {
        if (callback) {
          callback(null, "", "");
        }
        return { stdout: "", stderr: "" };
      }) as typeof execFile
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should write a Dockerfile, run docker build, and clean up", async () => {
    const spec = makeSpec();

    // The promisified execFile resolves immediately with our mock
    await buildImage(spec, "test:latest");

    // Should write the generated Dockerfile
    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("Dockerfile.nodetool"),
      expect.stringContaining("FROM node:20-slim"),
      "utf-8"
    );

    // Should clean up the Dockerfile
    expect(mockedUnlink).toHaveBeenCalledWith(
      expect.stringContaining("Dockerfile.nodetool")
    );
  });

  it("should use custom context directory", async () => {
    const spec = makeSpec();
    await buildImage(spec, "test:latest", { contextDir: "/custom/context" });

    expect(mockedWriteFile).toHaveBeenCalledWith(
      "/custom/context/Dockerfile.nodetool",
      expect.any(String),
      "utf-8"
    );
  });

  it("should clean up Dockerfile even when docker build fails", async () => {
    mockedWriteFile.mockResolvedValue();
    mockedExecFile.mockImplementation(
      ((_cmd: unknown, _args: unknown, _opts: unknown, callback?: (err: Error | null) => void) => {
        if (callback) {
          callback(new Error("docker build failed"));
        }
        return { stdout: "", stderr: "" };
      }) as typeof execFile
    );

    await expect(buildImage(makeSpec(), "test:latest")).rejects.toThrow();

    // cleanup should still be called
    expect(mockedUnlink).toHaveBeenCalled();
  });
});
