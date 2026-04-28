import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { confirm, input } from "@inquirer/prompts";
import {
  loadPythonPackageMetadata,
  fetchAvailablePackages,
  generatePackageOverviewMarkdown,
  generateAllNodeDocs,
  generateAllWorkflowDocs,
  type NodeMetadata,
  type WorkflowFile
} from "@nodetool-ai/node-sdk";
import { asJson, findWorkspaceRoots, printTable } from "./package-helpers.js";

interface ListOptions {
  available?: boolean;
  json?: boolean;
}

interface DocsOptions {
  outputDir: string;
  compact?: boolean;
  verbose?: boolean;
}

interface NodeDocsOptions {
  outputDir: string;
  packageName?: string;
  verbose?: boolean;
}

interface WorkflowDocsOptions {
  examplesDir: string;
  outputDir: string;
  packageName?: string;
  verbose?: boolean;
}

export function registerPackageCommands(program: Command): void {
  const pkg = program
    .command("package")
    .description("Manage NodeTool TypeScript node packages");

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------
  pkg
    .command("list")
    .description("List installed packages (or available with --available)")
    .option("-a, --available", "Show available packages from the registry")
    .option("--json", "Output as JSON")
    .action(async (opts: ListOptions) => {
      try {
        if (opts.available) {
          const packages = await fetchAvailablePackages();
          if (opts.json) {
            asJson(packages);
            return;
          }
          if (packages.length === 0) {
            console.log("(no packages available)");
            return;
          }
          printTable(
            packages.map((p) => ({
              name: p.name,
              repo_id: p.repo_id,
              description: p.description ?? ""
            }))
          );
          return;
        }

        const roots = findWorkspaceRoots(process.cwd());
        const result = loadPythonPackageMetadata({ roots });
        if (opts.json) {
          asJson(result.packages);
          return;
        }
        if (result.packages.length === 0) {
          console.log("(no packages installed)");
          return;
        }
        printTable(
          result.packages.map((p) => ({
            name: p.name,
            version: p.version ?? "-",
            description: p.description ?? "-",
            nodes: (p.nodes ?? []).length
          }))
        );
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // init
  // -----------------------------------------------------------------------
  pkg
    .command("init")
    .description(
      "Scaffold a new TypeScript node package in the current directory"
    )
    .action(async () => {
      try {
        const cwd = process.cwd();
        const packageJsonPath = path.join(cwd, "package.json");
        if (fs.existsSync(packageJsonPath)) {
          const overwrite = await confirm({
            message: "package.json already exists. Overwrite?",
            default: false
          });
          if (!overwrite) return;
        }

        const name = await input({
          message: "Package name (e.g. nodetool-foo):"
        });
        const description = await input({
          message: "Description:",
          default: ""
        });
        const author = await input({
          message: "Author (Name <email>):",
          default: ""
        });

        const packageJson = {
          name,
          version: "0.1.0",
          description,
          type: "module",
          main: "dist/index.js",
          types: "dist/index.d.ts",
          author,
          scripts: {
            build: "tsc"
          },
          dependencies: {
            "@nodetool-ai/node-sdk": "*",
            "@nodetool-ai/runtime": "*"
          },
          devDependencies: {
            typescript: "^5.7.2"
          },
          exports: {
            ".": {
              import: "./dist/index.js",
              types: "./dist/index.d.ts"
            }
          }
        };
        fs.writeFileSync(
          packageJsonPath,
          JSON.stringify(packageJson, null, 2) + "\n"
        );

        const tsconfig = {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "Bundler",
            declaration: true,
            outDir: "dist",
            strict: true,
            esModuleInterop: true
          },
          include: ["src/**/*"]
        };
        fs.writeFileSync(
          path.join(cwd, "tsconfig.json"),
          JSON.stringify(tsconfig, null, 2) + "\n"
        );

        fs.mkdirSync(path.join(cwd, "src"), { recursive: true });
        fs.writeFileSync(
          path.join(cwd, "src", "index.ts"),
          `import type { NodeRegistry } from "@nodetool-ai/node-sdk";\n` +
            `\n` +
            `export function registerNodes(_registry: NodeRegistry): void {\n` +
            `  // register your nodes here\n` +
            `}\n`
        );

        fs.mkdirSync(path.join(cwd, "nodetool", "package_metadata"), {
          recursive: true
        });
        fs.mkdirSync(path.join(cwd, "examples"), { recursive: true });
        fs.mkdirSync(path.join(cwd, "assets"), { recursive: true });

        console.log(`Initialized '${name}'.`);
        console.log("Next: implement nodes in src/ and run 'npm run build'.");
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // docs (package overview)
  // -----------------------------------------------------------------------
  pkg
    .command("docs")
    .description("Generate Markdown overview docs for the current package")
    .option("-o, --output-dir <dir>", "Output directory", "docs")
    .option("-c, --compact", "Produce a compact overview")
    .option("-v, --verbose", "Verbose output")
    .action(async (opts: DocsOptions) => {
      try {
        const cwd = process.cwd();
        const metadataDir = path.join(cwd, "nodetool", "package_metadata");
        if (!fs.existsSync(metadataDir)) {
          throw new Error(
            "No nodetool/package_metadata/ found. Run 'nodetool package scan' first."
          );
        }
        const loaded = loadPythonPackageMetadata({ roots: [cwd] });
        if (loaded.packages.length === 0) {
          throw new Error("No package metadata found.");
        }
        const pkgMeta = loaded.packages[0]!;

        fs.mkdirSync(opts.outputDir, { recursive: true });
        const md = generatePackageOverviewMarkdown(pkgMeta, {
          compact: opts.compact ?? false
        });
        const outPath = path.join(opts.outputDir, "index.md");
        fs.writeFileSync(outPath, md);
        console.log(`Wrote ${outPath}`);
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // node-docs (per-node)
  // -----------------------------------------------------------------------
  pkg
    .command("node-docs")
    .description("Generate per-node Markdown docs")
    .option("-o, --output-dir <dir>", "Output directory", "docs/nodes")
    .option("-p, --package-name <name>", "Filter by namespace prefix")
    .option("-v, --verbose", "Verbose output")
    .action(async (opts: NodeDocsOptions) => {
      try {
        const cwd = process.cwd();
        const loaded = loadPythonPackageMetadata({ roots: [cwd] });
        const allNodes: NodeMetadata[] = loaded.packages.flatMap(
          (p) => p.nodes ?? []
        );
        const filterOpts = opts.packageName
          ? { packageName: opts.packageName }
          : {};
        const docs = generateAllNodeDocs(allNodes, filterOpts);
        fs.mkdirSync(opts.outputDir, { recursive: true });
        for (const [filename, markdown] of docs) {
          fs.writeFileSync(path.join(opts.outputDir, filename), markdown);
        }
        console.log(`Wrote ${docs.size} node doc files to ${opts.outputDir}`);
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    });

  // -----------------------------------------------------------------------
  // workflow-docs (from examples dir)
  // -----------------------------------------------------------------------
  pkg
    .command("workflow-docs")
    .description("Generate Markdown docs for workflow JSONs")
    .requiredOption("-e, --examples-dir <dir>", "Directory containing workflow JSONs")
    .option("-o, --output-dir <dir>", "Output directory", "docs/workflows")
    .option("-p, --package-name <name>", "Filter by package_name field")
    .option("-v, --verbose", "Verbose output")
    .action(async (opts: WorkflowDocsOptions) => {
      try {
        if (!fs.existsSync(opts.examplesDir)) {
          throw new Error(`Examples dir not found: ${opts.examplesDir}`);
        }
        const files = fs
          .readdirSync(opts.examplesDir, { withFileTypes: true })
          .filter((e) => e.isFile() && e.name.endsWith(".json"))
          .map((e) => path.join(opts.examplesDir, e.name));

        const workflows: WorkflowFile[] = [];
        for (const file of files) {
          try {
            const data = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
              string,
              unknown
            >;
            workflows.push({ path: file, data });
          } catch (err) {
            console.error(`Skipping ${file}: ${String(err)}`);
          }
        }

        const filterOpts = opts.packageName
          ? { packageName: opts.packageName }
          : {};
        const docs = generateAllWorkflowDocs(workflows, filterOpts);
        fs.mkdirSync(opts.outputDir, { recursive: true });
        for (const [filename, markdown] of docs) {
          fs.writeFileSync(path.join(opts.outputDir, filename), markdown);
        }
        console.log(
          `Wrote ${docs.size} workflow doc files to ${opts.outputDir}`
        );
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    });
}
