import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseApplicationBundle,
  WIDGET_CATALOG,
  type ApplicationBundle
} from "@nodetool-ai/app-runtime";
import {
  buildStandaloneProject,
  exporterVersion,
  exportWarnings,
  hasUnsetModel,
  packageAssetPath,
  packageAssetUris,
  projectSlug,
  readPackageAssets,
  requiredSecretNames
} from "../src/index.js";
// @ts-expect-error -- plain ESM script without type declarations
import { renderTemplateModule } from "../scripts/embed-template.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const exampleApps = join(packageRoot, "..", "base-nodes", "nodetool", "examples", "apps");

function loadExample(slug: string): ApplicationBundle {
  const bundle = parseApplicationBundle(
    JSON.parse(readFileSync(join(exampleApps, `${slug}.app.json`), "utf8"))
  );
  if (!bundle) throw new Error(`${slug} is not a bundle`);
  return bundle;
}

function minimalBundle(overrides: Partial<ApplicationBundle["app"]> = {}): ApplicationBundle {
  return {
    schemaVersion: 1,
    name: "Tiny App",
    description: "",
    app: {
      schemaVersion: 5,
      ui: { root: { props: {} }, content: [] },
      operations: [],
      resources: [],
      variables: [],
      ...overrides
    },
    workflows: [],
    scripts: []
  };
}

describe("buildStandaloneProject", () => {
  const bundle = loadExample("vary-image");
  const project = buildStandaloneProject(bundle, {
    nodetoolVersion: "0.8.2",
    secrets: ["FAL_API_KEY", "OPENAI_API_KEY"]
  });
  const file = (path: string): string => {
    const found = project.files.find((entry) => entry.path === path);
    if (!found) throw new Error(`missing ${path}`);
    return found.content;
  };

  it("writes the bundle the app runs from, unchanged", () => {
    expect(parseApplicationBundle(JSON.parse(file("app.bundle.json")))).toEqual(bundle);
  });

  it("pins the NodeTool packages to the exporting version", () => {
    const pkg = JSON.parse(file("package.json")) as {
      name: string;
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(pkg.name).toBe("vary-image");
    expect(pkg.dependencies["@nodetool-ai/execution"]).toBe("0.8.2");
    expect(pkg.dependencies["@nodetool-ai/app-runtime"]).toBe("0.8.2");
    expect(pkg.scripts.dev).toBe("node server/index.mjs --dev");
  });

  it("defaults to this package's own version", () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as { version: string };
    expect(exporterVersion()).toBe(manifest.version);
    const pkg = JSON.parse(
      buildStandaloneProject(bundle).files.find((entry) => entry.path === "package.json")?.content ?? "{}"
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@nodetool-ai/runtime"]).toBe(manifest.version);
  });

  it("uses the TypeScript compiler required by the execution peer", () => {
    const execution = JSON.parse(readFileSync(join(packageRoot, "..", "execution", "package.json"), "utf8")) as {
      peerDependencies: { typescript: string };
    };
    const pkg = JSON.parse(file("package.json")) as { devDependencies: { typescript: string } };
    expect(pkg.devDependencies.typescript).toBe(execution.peerDependencies.typescript);
  });

  it("lists the app's credentials in .env.example", () => {
    expect(file(".env.example")).toContain("FAL_API_KEY=\nOPENAI_API_KEY=\n");
  });

  it("offers every other provider key, commented out, when the app picks its model", () => {
    expect(hasUnsetModel(bundle)).toBe(true);
    const env = buildStandaloneProject(bundle, {
      secrets: ["FAL_API_KEY"],
      providerSecrets: ["REPLICATE_API_TOKEN", "FAL_API_KEY", "OPENAI_API_KEY"]
    }).files.find((entry) => entry.path === ".env.example")?.content;
    expect(env).toContain("FAL_API_KEY=\n");
    expect(env).toContain("# OPENAI_API_KEY=\n# REPLICATE_API_TOKEN=\n");
    expect(env).not.toContain("# FAL_API_KEY=");
  });

  it("ships the template, with .gitignore restored and no placeholder bundle", () => {
    const paths = project.files.map((entry) => entry.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        ".gitignore",
        "README.md",
        "index.html",
        "server/index.mjs",
        "server/runner.mjs",
        "src/App.tsx",
        "src/widgets/tree.tsx",
        "vite.config.ts"
      ])
    );
    expect(paths).not.toContain("gitignore");
    expect(paths.filter((path) => path === "app.bundle.json")).toHaveLength(1);
    expect(file("README.md")).toContain(`# ${bundle.name}`);
  });
});

describe("projectSlug", () => {
  it.each([
    ["🪄 Vary Image", "vary-image"],
    ["Brand & Social", "brand-social"],
    ["  ", "nodetool-app"],
    ["Ad_Maker v2", "ad-maker-v2"]
  ])("%s → %s", (name, slug) => {
    expect(projectSlug(name)).toBe(slug);
  });
});

describe("exportWarnings", () => {
  it("is empty for an app the export runs in full", () => {
    expect(exportWarnings(minimalBundle())).toEqual([]);
  });

  it("names missing workflows and scripts, resources and NodeTool-only widgets", () => {
    const warnings = exportWarnings(
      minimalBundle({
        operations: [
          {
            id: "script",
            name: "Score",
            workflowId: "",
            target: { kind: "script", scriptId: "s1" },
            inputs: {},
            outputs: {},
            policy: "replace"
          },
          { id: "main", name: "Run", workflowId: "missing", inputs: {}, outputs: {}, policy: "replace" }
        ],
        resources: [{ id: "r", name: "Boards", kind: "storyboard" }],
        ui: {
          root: { props: {} },
          content: [
            {
              type: "Container",
              props: { id: "c", content: [{ type: "Timeline", props: { id: "t" } }] }
            },
            { type: "Mystery", props: { id: "m" } }
          ]
        }
      })
    );
    expect(warnings).toEqual([
      'Operation "Score" names a script the bundle does not carry.',
      'Operation "Run" names a workflow the bundle does not carry.',
      "Resource bindings read NodeTool documents, which the exported app has no database for.",
      'Widget type "Mystery" is unknown and renders as a note.',
      "Timeline widgets show a note instead of the NodeTool editor."
    ]);
  });
});

describe("requiredSecretNames", () => {
  it("collects node settings and model provider keys", () => {
    const bundle = minimalBundle();
    bundle.workflows = [
      {
        key: "w",
        name: "W",
        graph: {
          nodes: [
            { id: "a", type: "fal.Flux", data: {} },
            {
              id: "b",
              type: "nodetool.agents.Agent",
              data: { model: { type: "language_model", provider: "openai", id: "gpt-5" } }
            },
            { id: "c", type: "unknown.Node", data: {} }
          ],
          edges: []
        }
      }
    ];
    const registry = {
      has: (type: string) => type !== "unknown.Node",
      getMetadata: (type: string) =>
        type === "fal.Flux" ? { required_settings: ["FAL_API_KEY"] } : { required_settings: [] }
    };
    expect(
      requiredSecretNames(bundle, registry, (provider) => (provider === "openai" ? "OPENAI_API_KEY" : null))
    ).toEqual(["FAL_API_KEY", "OPENAI_API_KEY"]);
  });

  it("adds the secrets a bundled script declares", () => {
    const bundle = minimalBundle();
    bundle.scripts = [
      {
        key: "s",
        name: "S",
        document: { schemaVersion: 1, code: "", inputs: [], outputs: [], secrets: ["SERP_API_KEY"] } as never
      }
    ];
    const registry = { has: () => false, getMetadata: () => null };
    expect(requiredSecretNames(bundle, registry, () => null)).toEqual(["SERP_API_KEY"]);
  });
});

describe("template", () => {
  it("is embedded in its current form", () => {
    const generated = readFileSync(join(packageRoot, "src", "template-files.generated.ts"), "utf8");
    expect(generated).toBe(renderTemplateModule());
  });

  it("renders every widget type in the catalog", () => {
    const tree = readFileSync(join(packageRoot, "template", "src", "widgets", "tree.tsx"), "utf8");
    const rendered = new Set([...tree.matchAll(/^ {2}([A-Za-z0-9]+): /gm)].map((match) => match[1]));
    expect(rendered.size).toBeGreaterThan(0);
    const missing = Object.keys(WIDGET_CATALOG).filter((type) => !rendered.has(type));
    expect(missing).toEqual([]);
  });
});

describe("package assets", () => {
  const bundle = loadExample("vary-image");

  it("finds the sample files a bundle references", () => {
    expect(packageAssetUris(bundle)).toEqual(["package://nodetool-base/recipe-inputs/coffee.jpg"]);
  });

  it("rejects URIs that leave their package", () => {
    expect(packageAssetPath("package://nodetool-base/a/b.jpg")).toBe("nodetool-base/a/b.jpg");
    expect(packageAssetPath("package://nodetool-base/../secrets.txt")).toBeNull();
    expect(packageAssetPath("package://only-a-package")).toBeNull();
    expect(packageAssetPath("asset://abc")).toBeNull();
  });

  it("reads them from the first root that has them and copies them under assets/", () => {
    const empty = mkdtempSync(join(tmpdir(), "app-export-"));
    const root = mkdtempSync(join(tmpdir(), "app-export-"));
    mkdirSync(join(root, "nodetool-base", "recipe-inputs"), { recursive: true });
    writeFileSync(join(root, "nodetool-base", "recipe-inputs", "coffee.jpg"), Uint8Array.of(1, 2, 3));

    const assets = readPackageAssets(packageAssetUris(bundle), [empty, root]);
    expect(assets).toHaveLength(1);
    const project = buildStandaloneProject(bundle, { packageAssets: assets });
    const copy = project.files.find((file) => file.path === "assets/nodetool-base/recipe-inputs/coffee.jpg");
    expect(copy?.content).toEqual(Uint8Array.of(1, 2, 3));
    expect(project.warnings.some((warning) => warning.includes("sample file"))).toBe(false);
  });

  it("warns about sample files it could not copy", () => {
    const project = buildStandaloneProject(bundle);
    expect(project.warnings).toContain(
      "1 sample file(s) from NodeTool's packages were not found and load as empty: package://nodetool-base/recipe-inputs/coffee.jpg"
    );
  });
});
