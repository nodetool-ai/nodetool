/**
 * Export a mini app as a standalone JavaScript project.
 *
 * The project is the app's bundle (document plus every workflow graph it
 * runs) inside a fixed template: a Vite + React UI that renders the document
 * with the shared `@nodetool-ai/app-runtime` semantics, and a small Node
 * server that runs the graphs in process through `@nodetool-ai/execution`.
 * It needs no NodeTool server: `npm install && npm run dev` runs the app,
 * with provider keys read from `.env`.
 *
 * Everything here is pure. Writing the files to disk or into a zip is the
 * caller's business (the CLI writes a folder, the server streams a zip).
 */
import { readFileSync } from "node:fs";
import {
  operationTarget,
  serializeApplicationBundle,
  WIDGET_CATALOG,
  type ApplicationBundle
} from "@nodetool-ai/app-runtime";
import { packageAssetPath, packageAssetUris, type PackageAssetFile } from "./package-assets.js";
import { TEMPLATE_FILES } from "./template-files.generated.js";

export { packageAssetPath, packageAssetUris, readPackageAssets, type PackageAssetFile } from "./package-assets.js";

export interface StandaloneProjectFile {
  /** POSIX path relative to the project root. */
  path: string;
  /** Text, or the bytes of a copied sample file. */
  content: string | Uint8Array;
}

export interface StandaloneProjectOptions {
  /**
   * Version of the `@nodetool-ai/*` packages the project depends on.
   * Defaults to this package's own version.
   */
  nodetoolVersion?: string;
  /** Credential names the app's graphs need; listed in `.env.example`. */
  secrets?: ReadonlyArray<string>;
  /**
   * Every provider's credential name. Listed commented out in `.env.example`
   * when a graph leaves a model unset, since the person picks the provider.
   */
  providerSecrets?: ReadonlyArray<string>;
  /**
   * The bytes of the `package://` files the bundle references (see
   * `packageAssetUris` and `readPackageAssets`). Copied under `assets/`.
   */
  packageAssets?: ReadonlyArray<PackageAssetFile>;
}

export interface StandaloneProject {
  /** npm-safe project name, also a sensible folder name. */
  name: string;
  files: StandaloneProjectFile[];
  /** What the exported app cannot do that it does inside NodeTool. */
  warnings: string[];
}

/** Template files the exporter writes itself or leaves out. */
const GENERATED_PATHS = new Set(["app.bundle.json"]);
const RENAMED_PATHS: Readonly<Record<string, string>> = { gitignore: ".gitignore" };

/** Widgets the exported UI renders as a pointer back to NodeTool. */
const NODETOOL_ONLY_WIDGETS = new Set([
  "Sketch",
  "Timeline",
  "Storyboard",
  "StoryboardPreview",
  "SketchPad",
  "ResourcePicker",
  "ResourceGallery",
  "StoryboardSceneList"
]);

const REACT_VERSION = "^19.2.0";
const VITE_VERSION = "^8.0.0";
const VITE_REACT_VERSION = "^6.0.0";
const TYPESCRIPT_VERSION = "^5.9.0";

/**
 * This package's version, read from its manifest (one level above both `src/`
 * and `dist/`). A bundled host that flattens the paths gets `"latest"`.
 */
export function exporterVersion(): string {
  try {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version?: unknown;
    };
    return typeof manifest.version === "string" && manifest.version ? manifest.version : "latest";
  } catch {
    return "latest";
  }
}

/** Lowercase, dash-separated, npm-safe; never empty. */
export function projectSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|-+$/g, "")
    .slice(0, 64);
  return slug || "nodetool-app";
}

interface RegistryLike {
  has: (nodeType: string) => boolean;
  getMetadata: (nodeType: string) => { required_settings?: string[] } | null | undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The credential names an app's graphs need: every `required_settings` entry
 * of the node types they use, plus the key of every provider a model
 * reference names. The caller supplies the registry and the provider lookup,
 * so this package needs neither.
 */
export function requiredSecretNames(
  bundle: ApplicationBundle,
  registry: RegistryLike,
  providerSecretKey: (provider: string) => string | null
): string[] {
  const names = new Set<string>();
  const visitValue = (value: unknown, depth: number): void => {
    if (depth > 8) return;
    if (Array.isArray(value)) {
      for (const item of value) visitValue(item, depth + 1);
      return;
    }
    if (!isRecord(value)) return;
    if (
      typeof value.type === "string" &&
      value.type.endsWith("_model") &&
      typeof value.provider === "string" &&
      value.provider !== ""
    ) {
      const key = providerSecretKey(value.provider);
      if (key) names.add(key);
    }
    for (const entry of Object.values(value)) visitValue(entry, depth + 1);
  };
  for (const workflow of bundle.workflows) {
    for (const node of workflow.graph.nodes) {
      if (!isRecord(node)) continue;
      const type = typeof node.type === "string" ? node.type : "";
      if (type && registry.has(type)) {
        for (const key of registry.getMetadata(type)?.required_settings ?? []) {
          if (key) names.add(key);
        }
      }
      visitValue(node.data ?? node.properties, 0);
    }
  }
  // A script reads only the secrets its document declares.
  for (const script of bundle.scripts) {
    const declared: unknown = (script.document as { secrets?: unknown }).secrets;
    if (!Array.isArray(declared)) continue;
    for (const key of declared) {
      if (typeof key === "string" && key) names.add(key);
    }
  }
  return [...names].sort();
}

/** True when a graph carries a model reference with no model chosen. */
export function hasUnsetModel(bundle: ApplicationBundle): boolean {
  const visit = (value: unknown, depth: number): boolean => {
    if (depth > 8) return false;
    if (Array.isArray(value)) return value.some((item) => visit(item, depth + 1));
    if (!isRecord(value)) return false;
    if (typeof value.type === "string" && value.type.endsWith("_model") && "id" in value) {
      return typeof value.id !== "string" || value.id === "";
    }
    return Object.values(value).some((entry) => visit(entry, depth + 1));
  };
  return bundle.workflows.some((workflow) => visit(workflow.graph.nodes, 0));
}

function collectWidgetTypes(value: unknown, into: Set<string>, depth = 0): void {
  if (depth > 64) return;
  if (Array.isArray(value)) {
    for (const item of value) collectWidgetTypes(item, into, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  if (typeof value.type === "string" && isRecord(value.props)) into.add(value.type);
  for (const entry of Object.values(isRecord(value.props) ? value.props : value)) {
    collectWidgetTypes(entry, into, depth + 1);
  }
}

/** Limitations worth telling the person exporting, before they find them. */
export function exportWarnings(bundle: ApplicationBundle): string[] {
  const warnings: string[] = [];
  const workflowKeys = new Set(bundle.workflows.map((workflow) => workflow.key));
  const scriptKeys = new Set(bundle.scripts.map((script) => script.key));
  for (const operation of bundle.app.operations) {
    const target = operationTarget(operation);
    if (target.kind === "script" ? !scriptKeys.has(target.scriptId) : !workflowKeys.has(target.workflowId)) {
      warnings.push(`Operation "${operation.name}" names a ${target.kind} the bundle does not carry.`);
    }
  }
  if (bundle.app.resources.length > 0) {
    warnings.push("Resource bindings read NodeTool documents, which the exported app has no database for.");
  }
  const types = new Set<string>();
  collectWidgetTypes(bundle.app.ui.content, types);
  for (const type of [...types].sort()) {
    if (NODETOOL_ONLY_WIDGETS.has(type)) {
      warnings.push(`${WIDGET_CATALOG[type]?.label ?? type} widgets show a note instead of the NodeTool editor.`);
    } else if (!(type in WIDGET_CATALOG)) {
      warnings.push(`Widget type "${type}" is unknown and renders as a note.`);
    }
  }
  return warnings;
}

function packageJson(name: string, version: string): string {
  const nodetool = version === "latest" ? version : `^${version}`;
  return `${JSON.stringify(
    {
      name,
      private: true,
      version: "0.1.0",
      type: "module",
      engines: { node: ">=22.0.0" },
      scripts: {
        dev: "node server/index.mjs --dev",
        build: "vite build",
        start: "node server/index.mjs",
        typecheck: "tsc --noEmit"
      },
      dependencies: {
        "@nodetool-ai/agents": nodetool,
        "@nodetool-ai/app-runtime": nodetool,
        "@nodetool-ai/base-nodes": nodetool,
        "@nodetool-ai/execution": nodetool,
        "@nodetool-ai/node-sdk": nodetool,
        "@nodetool-ai/runtime": nodetool,
        "@nodetool-ai/storage": nodetool,
        react: REACT_VERSION,
        "react-dom": REACT_VERSION
      },
      devDependencies: {
        "@types/react": REACT_VERSION,
        "@types/react-dom": REACT_VERSION,
        "@vitejs/plugin-react": VITE_REACT_VERSION,
        typescript: TYPESCRIPT_VERSION,
        vite: VITE_VERSION
      }
    },
    null,
    2
  )}\n`;
}

function envExample(secrets: ReadonlyArray<string>, providerSecrets: ReadonlyArray<string>): string {
  const optional = providerSecrets.filter((name) => !secrets.includes(name));
  const lines = [
    "# Provider keys this app's workflows use. Copy to .env and fill in.",
    "# The server reads .env at startup; keys never reach the browser.",
    ...(secrets.length > 0 ? secrets.map((name) => `${name}=`) : optional.length > 0 ? [] : ["# (none detected)"]),
    ...(optional.length > 0
      ? [
          "",
          "# The app lets you pick a model. Set the key of each provider you want",
          "# to offer; the model menus list what those providers serve.",
          ...optional.map((name) => `# ${name}=`)
        ]
      : []),
    "",
    "# Server options",
    "# PORT=5180",
    "# HOST=127.0.0.1",
    ""
  ];
  return lines.join("\n");
}

function readme(bundle: ApplicationBundle, warnings: ReadonlyArray<string>): string {
  const description = bundle.description.trim();
  return [
    `# ${bundle.name}`,
    "",
    ...(description ? [description, ""] : []),
    "A NodeTool mini app exported as a standalone project. The UI is a Vite +",
    "React app; `server/` runs the app's workflows and JS scripts in this",
    "process, so no NodeTool server is needed.",
    "",
    "## Run it",
    "",
    "```bash",
    "npm install",
    "cp .env.example .env   # then add your provider keys",
    "npm run dev            # http://127.0.0.1:5180",
    "```",
    "",
    "For a production build, run `npm run build` once, then `npm start`.",
    "",
    "## How it works",
    "",
    "- `app.bundle.json` is the whole app: the UI document and every workflow",
    "  graph and JS script it runs. Re-export from NodeTool to update it.",
    "- `server/index.mjs` serves the UI and four endpoints: `POST /api/run`",
    "  streams a workflow or script run as Server-Sent Events, `POST /api/upload`",
    "  stores a picked file, `GET /api/storage/<key>` serves uploads and outputs,",
    "  and `GET /api/models` lists the models of the providers with a key in",
    "  `.env`.",
    "- `server/runner.mjs` runs a graph or script from the bundle by its key.",
    "  The browser cannot send code of its own.",
    "- `server/store.mjs` keeps what NodeTool keeps in its database (generated",
    "  assets, timelines, scripts, storyboards, sketches) as files. Everything",
    "  lives in `.nodetool-data/`.",
    "- `src/` renders the document. Bindings, run policies, conditions and the",
    "  message fold come from `@nodetool-ai/app-runtime`, the same package the",
    "  NodeTool app uses, so the app behaves as it does there.",
    "",
    "The server listens on 127.0.0.1. Every run spends the keys in `.env`, so",
    "put authentication in front of it before setting `HOST=0.0.0.0`.",
    ...(warnings.length > 0
      ? ["", "## Differences from NodeTool", "", ...warnings.map((warning) => `- ${warning}`)]
      : []),
    ""
  ].join("\n");
}

export function buildStandaloneProject(
  bundle: ApplicationBundle,
  options: StandaloneProjectOptions = {}
): StandaloneProject {
  const name = projectSlug(bundle.name);
  const warnings = exportWarnings(bundle);
  const files: StandaloneProjectFile[] = [];
  const copied = new Set<string>();
  for (const asset of options.packageAssets ?? []) {
    const path = packageAssetPath(asset.uri);
    if (!path || copied.has(path)) continue;
    copied.add(path);
    files.push({ path: `assets/${path}`, content: asset.bytes });
  }
  const missing = packageAssetUris(bundle).filter((uri) => !copied.has(packageAssetPath(uri) ?? ""));
  if (missing.length > 0) {
    warnings.push(
      `${missing.length} sample file(s) from NodeTool's packages were not found and load as empty: ${missing.join(", ")}`
    );
  }
  for (const [path, content] of Object.entries(TEMPLATE_FILES)) {
    if (GENERATED_PATHS.has(path)) continue;
    files.push({ path: RENAMED_PATHS[path] ?? path, content });
  }
  files.push(
    { path: "package.json", content: packageJson(name, options.nodetoolVersion ?? exporterVersion()) },
    { path: "app.bundle.json", content: serializeApplicationBundle(bundle) },
    {
      path: ".env.example",
      content: envExample(
        options.secrets ?? [],
        hasUnsetModel(bundle) ? [...new Set(options.providerSecrets ?? [])].sort() : []
      )
    },
    { path: "README.md", content: readme(bundle, warnings) }
  );
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { name, files, warnings };
}
