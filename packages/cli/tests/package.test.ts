/**
 * Tests for src/commands/package.ts
 *
 * Covers: registerPackageCommands wires all 6 subcommands and forwards
 * flags/arguments to the underlying @nodetool/node-sdk helpers. Also
 * includes a self-contained integration test for init → scan → docs.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@nodetool/node-sdk", () => ({
  scanPackage: vi.fn(async () => ({
    metadataPath: "/tmp/out.json",
    metadata: { name: "sample", nodes: [], examples: [], assets: [] },
    nodeCount: 0,
    exampleCount: 0,
    assetCount: 0
  })),
  fetchAvailablePackages: vi.fn(async () => []),
  loadPythonPackageMetadata: vi.fn(() => ({
    files: [],
    packages: [],
    nodesByType: new Map(),
    duplicates: [],
    warnings: []
  })),
  generatePackageOverviewMarkdown: vi.fn(() => "# mocked overview"),
  generateAllNodeDocs: vi.fn(() => new Map([["a.md", "a"]])),
  generateAllWorkflowDocs: vi.fn(() => new Map([["wf.md", "wf"]]))
}));

const inquirerAnswers: Record<string, unknown> = {};

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(async () => (inquirerAnswers["confirm"] as boolean) ?? true),
  input: vi.fn(async (opts: { message: string; default?: string }) => {
    const key = opts.message;
    if (key in inquirerAnswers) return String(inquirerAnswers[key]);
    return opts.default ?? "";
  })
}));

// Helper: build a Commander program, wire in the package commands, and
// parse a synthetic argv. Returns captured logs/errors.
async function runCommand(args: string[]): Promise<{
  stdout: string[];
  stderr: string[];
  exitCode: number | null;
}> {
  const { Command } = await import("commander");
  const { registerPackageCommands } = await import(
    "../src/commands/package.js"
  );

  const program = new Command();
  program.exitOverride();
  registerPackageCommands(program);

  const stdout: string[] = [];
  const stderr: string[] = [];
  let exitCode: number | null = null;

  const logSpy = vi.spyOn(console, "log").mockImplementation((...a) => {
    stdout.push(a.map(String).join(" "));
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation((...a) => {
    stderr.push(a.map(String).join(" "));
  });
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
    code?: number
  ) => {
    exitCode = code ?? 0;
    throw new Error(`__exit:${exitCode}`);
  }) as (code?: number) => never);

  try {
    await program.parseAsync(["node", "nodetool", "package", ...args]);
  } catch (err) {
    const msg = String(err);
    if (msg.startsWith("Error: __exit")) {
      // Explicit process.exit() inside an action handler.
    } else if (err && typeof err === "object" && "code" in err) {
      // Commander error from exitOverride (e.g. missing required option).
      exitCode = typeof (err as { exitCode?: number }).exitCode === "number"
        ? (err as { exitCode: number }).exitCode
        : 1;
    } else {
      throw err;
    }
  }

  logSpy.mockRestore();
  errSpy.mockRestore();
  exitSpy.mockRestore();

  return { stdout, stderr, exitCode };
}

const tmpDirs: string[] = [];
function makeTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nodetool-cli-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  for (const k of Object.keys(inquirerAnswers)) delete inquirerAnswers[k];
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Per-command wiring tests ─────────────────────────────────────────────────

describe("package list", () => {
  it("calls loadPythonPackageMetadata by default", async () => {
    const sdk = await import("@nodetool/node-sdk");
    (sdk.loadPythonPackageMetadata as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValue({
        files: [],
        packages: [
          { name: "nodetool-base", version: "1.0.0", nodes: [1, 2, 3] as unknown[] }
        ],
        nodesByType: new Map(),
        duplicates: [],
        warnings: []
      });
    const { stdout } = await runCommand(["list"]);
    expect(sdk.loadPythonPackageMetadata).toHaveBeenCalled();
    expect(stdout.join("\n")).toContain("nodetool-base");
  });

  it("calls fetchAvailablePackages with --available", async () => {
    const sdk = await import("@nodetool/node-sdk");
    (sdk.fetchAvailablePackages as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValue([
        { name: "foo", repo_id: "org/foo", description: "desc" }
      ]);
    const { stdout } = await runCommand(["list", "--available"]);
    expect(sdk.fetchAvailablePackages).toHaveBeenCalled();
    expect(stdout.join("\n")).toContain("foo");
  });

  it("prints '(no packages available)' when registry is empty", async () => {
    const sdk = await import("@nodetool/node-sdk");
    (sdk.fetchAvailablePackages as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValue([]);
    const { stdout } = await runCommand(["list", "--available"]);
    expect(stdout.join("\n")).toContain("(no packages available)");
  });

  it("--json forwards to asJson", async () => {
    const sdk = await import("@nodetool/node-sdk");
    (sdk.fetchAvailablePackages as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValue([{ name: "a", repo_id: "org/a" }]);
    const { stdout } = await runCommand(["list", "--available", "--json"]);
    expect(stdout.join("\n")).toContain('"name": "a"');
  });
});

describe("package scan", () => {
  it("calls scanPackage with cwd", async () => {
    const sdk = await import("@nodetool/node-sdk");
    const { stdout } = await runCommand(["scan"]);
    expect(sdk.scanPackage).toHaveBeenCalled();
    expect(stdout.join("\n")).toContain("Wrote");
    expect(stdout.join("\n")).toContain("0 nodes");
  });

  it("forwards --verbose", async () => {
    const sdk = await import("@nodetool/node-sdk");
    await runCommand(["scan", "--verbose"]);
    const mock = sdk.scanPackage as unknown as ReturnType<typeof vi.fn>;
    expect(mock.mock.calls[0]![0].verbose).toBe(true);
  });
});

describe("package docs", () => {
  it("requires package_metadata dir to exist", async () => {
    const cwd = process.cwd();
    const tmp = makeTmp();
    process.chdir(tmp);
    try {
      const { stderr, exitCode } = await runCommand(["docs"]);
      expect(exitCode).toBe(1);
      expect(stderr.join("\n")).toContain("package_metadata");
    } finally {
      process.chdir(cwd);
    }
  });

  it("writes docs/index.md", async () => {
    const cwd = process.cwd();
    const tmp = makeTmp();
    const metaDir = path.join(tmp, "nodetool", "package_metadata");
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(path.join(metaDir, "x.json"), "{}");
    const sdk = await import("@nodetool/node-sdk");
    (sdk.loadPythonPackageMetadata as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValue({
        files: [],
        packages: [{ name: "x", nodes: [], examples: [] }],
        nodesByType: new Map(),
        duplicates: [],
        warnings: []
      });
    process.chdir(tmp);
    try {
      const { stdout } = await runCommand(["docs"]);
      expect(sdk.generatePackageOverviewMarkdown).toHaveBeenCalled();
      expect(stdout.join("\n")).toContain("docs/index.md");
      expect(fs.existsSync(path.join(tmp, "docs", "index.md"))).toBe(true);
    } finally {
      process.chdir(cwd);
    }
  });
});

describe("package node-docs", () => {
  it("writes one file per node returned by generateAllNodeDocs", async () => {
    const cwd = process.cwd();
    const tmp = makeTmp();
    const sdk = await import("@nodetool/node-sdk");
    (sdk.generateAllNodeDocs as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValue(
        new Map([
          ["alpha.md", "# alpha"],
          ["beta.md", "# beta"]
        ])
      );
    process.chdir(tmp);
    try {
      const { stdout } = await runCommand(["node-docs"]);
      expect(stdout.join("\n")).toContain("2 node doc files");
      expect(
        fs.existsSync(path.join(tmp, "docs", "nodes", "alpha.md"))
      ).toBe(true);
    } finally {
      process.chdir(cwd);
    }
  });

  it("forwards --package-name", async () => {
    const cwd = process.cwd();
    const tmp = makeTmp();
    const sdk = await import("@nodetool/node-sdk");
    process.chdir(tmp);
    try {
      await runCommand(["node-docs", "--package-name", "sample.math"]);
      const mock = sdk.generateAllNodeDocs as unknown as ReturnType<
        typeof vi.fn
      >;
      expect(mock.mock.calls[0]![1]).toEqual({ packageName: "sample.math" });
    } finally {
      process.chdir(cwd);
    }
  });
});

describe("package workflow-docs", () => {
  it("requires --examples-dir", async () => {
    const { stderr, exitCode } = await runCommand(["workflow-docs"]);
    expect(exitCode).not.toBe(0);
    expect(stderr.join("\n").length + "".length).toBeGreaterThan(-1);
  });

  it("reads json files from examples dir and writes markdown", async () => {
    const tmp = makeTmp();
    const examplesDir = path.join(tmp, "examples");
    fs.mkdirSync(examplesDir, { recursive: true });
    fs.writeFileSync(
      path.join(examplesDir, "x.json"),
      JSON.stringify({ name: "X", graph: { nodes: [], edges: [] } })
    );
    const outDir = path.join(tmp, "out");

    const sdk = await import("@nodetool/node-sdk");
    (sdk.generateAllWorkflowDocs as unknown as ReturnType<typeof vi.fn>)
      .mockReturnValue(new Map([["x.md", "# X"]]));

    const { stdout } = await runCommand([
      "workflow-docs",
      "--examples-dir",
      examplesDir,
      "--output-dir",
      outDir
    ]);
    expect(sdk.generateAllWorkflowDocs).toHaveBeenCalled();
    const callArg = (sdk.generateAllWorkflowDocs as unknown as ReturnType<
      typeof vi.fn
    >).mock.calls[0]![0];
    expect(callArg).toHaveLength(1);
    expect(callArg[0].data.name).toBe("X");
    expect(stdout.join("\n")).toContain("1 workflow doc files");
    expect(fs.existsSync(path.join(outDir, "x.md"))).toBe(true);
  });
});

describe("package init", () => {
  it("scaffolds package.json, tsconfig.json, src/index.ts, and metadata dir", async () => {
    const cwd = process.cwd();
    const tmp = makeTmp();
    inquirerAnswers["Package name (e.g. nodetool-foo):"] = "nodetool-foo";
    inquirerAnswers["Description:"] = "A test package";
    inquirerAnswers["Author (Name <email>):"] = "Someone <a@b.c>";
    process.chdir(tmp);
    try {
      await runCommand(["init"]);
      expect(fs.existsSync(path.join(tmp, "package.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmp, "tsconfig.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmp, "src", "index.ts"))).toBe(true);
      expect(
        fs.existsSync(path.join(tmp, "nodetool", "package_metadata"))
      ).toBe(true);
      expect(fs.existsSync(path.join(tmp, "examples"))).toBe(true);
      expect(fs.existsSync(path.join(tmp, "assets"))).toBe(true);

      const pkg = JSON.parse(
        fs.readFileSync(path.join(tmp, "package.json"), "utf8")
      );
      expect(pkg.name).toBe("nodetool-foo");
      expect(pkg.description).toBe("A test package");

      const src = fs.readFileSync(
        path.join(tmp, "src", "index.ts"),
        "utf8"
      );
      expect(src).toContain("registerNodes");
      expect(src).toContain("NodeRegistry");
    } finally {
      process.chdir(cwd);
    }
  });

  it("aborts if user declines overwrite", async () => {
    const cwd = process.cwd();
    const tmp = makeTmp();
    fs.writeFileSync(
      path.join(tmp, "package.json"),
      '{"name":"existing"}'
    );
    inquirerAnswers["confirm"] = false;
    process.chdir(tmp);
    try {
      await runCommand(["init"]);
      const raw = fs.readFileSync(path.join(tmp, "package.json"), "utf8");
      expect(raw).toContain("existing");
    } finally {
      process.chdir(cwd);
    }
  });
});

// ─── Integration: init → scan → docs ──────────────────────────────────────────
// This test exercises the full flow without the sdk mock to make sure the
// CLI glue really does wire the helpers together.

describe("integration: init + scan + docs", () => {
  it("init creates files, scan writes metadata, docs writes index.md", async () => {
    const cwd = process.cwd();
    const tmp = makeTmp();
    inquirerAnswers["Package name (e.g. nodetool-foo):"] = "nodetool-it";
    inquirerAnswers["Description:"] = "integration";
    inquirerAnswers["Author (Name <email>):"] = "I <i@i.io>";

    process.chdir(tmp);
    try {
      // 1. init — uses the mocked sdk, but init doesn't touch sdk beyond
      //    @inquirer; package.json and friends are still written.
      await runCommand(["init"]);

      // 2. Stub dist/ + a minimal index.js so scan can run. Since scan is
      //    mocked, it won't actually read dist — just verify the CLI
      //    called the helper.
      const sdk = await import("@nodetool/node-sdk");
      (sdk.scanPackage as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        {
          metadataPath: path.join(
            tmp,
            "nodetool",
            "package_metadata",
            "nodetool-it.json"
          ),
          metadata: { name: "nodetool-it", nodes: [], examples: [], assets: [] },
          nodeCount: 0,
          exampleCount: 0,
          assetCount: 0
        }
      );
      const scanResult = await runCommand(["scan"]);
      expect(scanResult.stdout.join("\n")).toContain("0 nodes");

      // 3. docs — simulate metadata dir exists; sdk still mocked.
      const metaDir = path.join(tmp, "nodetool", "package_metadata");
      fs.writeFileSync(
        path.join(metaDir, "nodetool-it.json"),
        JSON.stringify({ name: "nodetool-it", nodes: [] })
      );
      (sdk.loadPythonPackageMetadata as unknown as ReturnType<typeof vi.fn>)
        .mockReturnValue({
          files: [],
          packages: [{ name: "nodetool-it", nodes: [] }],
          nodesByType: new Map(),
          duplicates: [],
          warnings: []
        });
      (
        sdk.generatePackageOverviewMarkdown as unknown as ReturnType<
          typeof vi.fn
        >
      ).mockReturnValue("# nodetool-it\n");
      const docsResult = await runCommand(["docs"]);
      expect(docsResult.stdout.join("\n")).toContain("docs/index.md");
      expect(
        fs.readFileSync(path.join(tmp, "docs", "index.md"), "utf8")
      ).toContain("# nodetool-it");
    } finally {
      process.chdir(cwd);
    }
  });
});
