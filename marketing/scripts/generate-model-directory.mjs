// @ts-nocheck
/**
 * Generate `marketing/src/data/modelDirectory.generated.ts` — every model id
 * NodeTool ships a definition for, grouped by kind and provider, for the full
 * list on `/models`.
 *
 * Two sources, both checked into the repo:
 *
 * - The node-package and runtime model manifests (fal, Replicate, Kie,
 *   Together, AtlasCloud, Topaz, Higgsfield, Aki). These are the files
 *   `nodetool generate <provider> --list-models` reads.
 * - The static model lists in `packages/runtime/src/providers/*-provider.ts`:
 *   the `{ id, name }` entries each `getAvailable<Kind>Models()` returns, and
 *   the same-file or sibling-file constants and fallback lists it references.
 *
 * Providers that enumerate their language models from the vendor API at run
 * time (Anthropic, Groq, Mistral, OpenRouter, Ollama, …) have no list in the
 * repo. They are recorded in each group's `liveProviders` instead of being
 * given model names the repo does not contain.
 *
 * Run: `node marketing/scripts/generate-model-directory.mjs`
 * (wired as `npm run seo:model-directory`). Pass `--check` to fail when the
 * checked-in file is stale.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const PROVIDER_DIR = resolve(REPO_ROOT, "packages/runtime/src/providers");
const OUT = resolve(
  __dirname,
  "..",
  "src",
  "data",
  "modelDirectory.generated.ts"
);

const MANIFESTS = [
  { id: "fal_ai", manifest: "packages/fal-nodes/src/fal-manifest.json" },
  {
    id: "replicate",
    manifest: "packages/replicate-nodes/src/replicate-manifest.json",
  },
  { id: "kie", manifest: "packages/kie-nodes/src/kie-manifest.json" },
  {
    id: "together",
    manifest: "packages/together-nodes/src/together-manifest.json",
  },
  {
    id: "atlascloud",
    manifest: "packages/atlascloud-nodes/src/atlascloud-manifest.json",
  },
  { id: "topaz", manifest: "packages/topaz-nodes/src/topaz-manifest.json" },
  {
    id: "higgsfield",
    manifest: "packages/higgsfield-nodes/src/higgsfield-manifest.json",
  },
  { id: "aki", manifest: "packages/runtime/src/providers/aki-manifest.json" },
];

/**
 * Runtime provider source file → provider id. Test doubles, user-configured
 * endpoints (custom, Azure, Bedrock, vLLM, API route) and the Python bridge
 * are left out: they serve whatever the user points them at.
 */
const SOURCE_PROVIDERS = {
  "openai-provider.ts": "openai",
  "codex-provider.ts": "codex",
  "chatgpt-provider.ts": "chatgpt",
  "anthropic-provider.ts": "anthropic",
  "claude-agent-provider.ts": "claude_agent_sdk",
  "antigravity-provider.ts": "antigravity",
  "gemini-provider.ts": "gemini",
  "gemini-web-provider.ts": "gemini_web",
  "xai-provider.ts": "xai",
  "groq-provider.ts": "groq",
  "mistral-provider.ts": "mistral",
  "deepseek-provider.ts": "deepseek",
  "moonshot-provider.ts": "moonshot",
  "minimax-provider.ts": "minimax",
  "cerebras-provider.ts": "cerebras",
  "gmi-provider.ts": "gmi",
  "meta-provider.ts": "meta",
  "alibaba-provider.ts": "alibaba",
  "cohere-provider.ts": "cohere",
  "voyage-provider.ts": "voyage",
  "jina-provider.ts": "jina",
  "elevenlabs-provider.ts": "elevenlabs",
  "reve-provider.ts": "reve",
  "dreamina-provider.ts": "dreamina",
  "meshy-provider.ts": "meshy",
  "rodin-provider.ts": "rodin",
  "evolink-provider.ts": "evolink",
  "useapi-provider.ts": "useapi",
  "vgenv-provider.ts": "vgenv",
  "openrouter-provider.ts": "openrouter",
  "requesty-provider.ts": "requesty",
  "opper-provider.ts": "opper",
  "replicate-provider.ts": "replicate",
  "kie-provider.ts": "kie",
  "together-provider.ts": "together",
  "atlascloud-provider.ts": "atlascloud",
  "ollama-provider.ts": "ollama",
  "lmstudio-provider.ts": "lmstudio",
  "llama-provider.ts": "llama_cpp",
  "node-llama-cpp-provider.ts": "node_llama_cpp",
  "huggingface-provider.ts": "huggingface",
};

const TAB_PROVIDERS = ["chatgpt", "gemini_web"];

/** Providers that serve the models installed on the user's machine. */
const LOCAL_PROVIDERS = [
  "ollama",
  "lmstudio",
  "llama_cpp",
  "node_llama_cpp",
  "huggingface",
];

/** Kinds in page order. */
const KINDS = [
  "language",
  "image",
  "video",
  "audio",
  "transcription",
  "3d",
  "embedding",
];

const KIND_BY_OUTPUT = {
  image: "image",
  dict: "image", // fal returns some image endpoints as a dict payload
  video: "video",
  audio: "audio",
  model_3d: "3d",
  str: "language",
  string: "language",
  text: "language",
};

const KIND_BY_METHOD = {
  Language: "language",
  Image: "image",
  Video: "video",
  TTS: "audio",
  Music: "audio",
  AudioToAudio: "audio",
  ASR: "transcription",
  "3D": "3d",
  Embedding: "embedding",
  Rerank: "embedding",
};

function byCodeUnit(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function loadJson(relPath) {
  const data = JSON.parse(readFileSync(resolve(REPO_ROOT, relPath), "utf8"));
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`${relPath}: expected a non-empty manifest array`);
  }
  return data;
}

/** Text of the bracketed block opening at `open` (a `{` or `[`). */
function block(src, open) {
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    const c = src[k];
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return src.slice(open, k + 1);
    }
  }
  return "";
}

const SIBLING_SOURCES = readdirSync(PROVIDER_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => readFileSync(resolve(PROVIDER_DIR, f), "utf8"));

/** Find `const NAME = <literal>` in `src`, then in the sibling sources. */
function constValue(name, src) {
  const re = new RegExp(`const ${name}\\b[^=]*=\\s*\\(?\\s*`);
  for (const s of [src, ...SIBLING_SOURCES]) {
    const m = re.exec(s);
    if (!m) continue;
    const start = m.index + m[0].length;
    // `const X = ROWS.map(…)` lists whatever ROWS holds.
    const mapped = /^([A-Z][A-Z0-9_]+)\.map\(/.exec(s.slice(start));
    if (mapped) return constValue(mapped[1], s);
    if (s[start] === '"') return { src: s, string: /^"([^"]*)"/.exec(s.slice(start))[1] };
    if (s[start] === "[" || s[start] === "{")
      return { src: s, literal: block(s, start) };
  }
  return null;
}

function resolveString(token, src) {
  if (token.startsWith('"')) return token.slice(1, -1);
  const v = constValue(token, src);
  return v?.string ?? null;
}

/** `{ id, name }` objects, `[id, name]` tuples and bare string ids in a span. */
function entriesIn(span, src) {
  const out = [];
  for (const m of span.matchAll(
    /\{[^{}]*?\bid:\s*("[^"]+"|[A-Z][A-Z0-9_]+)[^{}]*?\}/g
  )) {
    const id = resolveString(m[1], src);
    const name = /\bname:\s*"([^"]+)"/.exec(m[0]);
    if (id && name) out.push({ id, name: name[1] });
  }
  if (out.length > 0) return out;
  if (/^\[\s*\[/.test(span)) {
    // `[[id, name], …]`, mapped through a template id such as
    // `${API_MODEL}-${tier}` by the method that reads it.
    const template = /id:\s*`\$\{([A-Z][A-Z0-9_]+)\}-\$\{\w+\}`/.exec(src);
    const prefix = template ? `${resolveString(template[1], src)}-` : "";
    for (let k = 1; k < span.length - 1; k++) {
      if (span[k] !== "[") continue;
      const row = block(span, k);
      const m = /^\[\s*"([^"]+)",\s*"([^"]+)"/.exec(row);
      if (m) out.push({ id: `${prefix}${m[1]}`, name: m[2] });
      k += row.length - 1;
    }
    return out;
  }
  if (/^\[\s*"/.test(span)) {
    for (const m of span.matchAll(/"([^"]+)"/g)) out.push({ id: m[1], name: null });
  }
  return out;
}

/** Models a listing method body returns without calling the network. */
function staticModels(body, src, seen = new Set()) {
  let out = entriesIn(body, src);
  // A constant used as a property value (`voices: MINIMAX_VOICES`) describes
  // a model; only follow constants the method returns or spreads.
  const propertyValues = new Set(
    [...body.matchAll(/\w+:\s*([A-Z][A-Z0-9_]+)\b/g)].map((m) => m[1])
  );
  for (const ref of new Set(body.match(/\b[A-Z][A-Z0-9_]{3,}\b/g) ?? [])) {
    if (seen.has(ref) || propertyValues.has(ref)) continue;
    seen.add(ref);
    const v = constValue(ref, src);
    if (v?.literal) out = out.concat(staticModels(v.literal, v.src, seen));
  }
  for (const m of body.matchAll(/this\.(\w+)\(\)/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const def = new RegExp(`\\n\\s*(?:private |protected )?${m[1]}\\(\\)[^{]*\\{`).exec(src);
    if (def) out = out.concat(staticModels(block(src, def.index + def[0].length - 1), src, seen));
  }
  return out;
}

function collect() {
  /** kind → provider → Map(id → name) */
  const table = {};
  const add = (kind, provider, id, name) => {
    const byProvider = (table[kind] ??= {});
    const models = (byProvider[provider] ??= new Map());
    if (!models.has(id) || (!models.get(id) && name)) models.set(id, name ?? null);
  };

  for (const { id: provider, manifest } of MANIFESTS) {
    for (const n of loadJson(manifest)) {
      const tasks = [n.modality, n.task, ...(n.supportedTasks ?? [])];
      const kind = tasks.includes("automatic_speech_recognition")
        ? "transcription"
        : KIND_BY_OUTPUT[n.outputType];
      const id = n.modelId ?? n.endpointId;
      if (!kind || !id) continue;
      add(kind, provider, id, n.title ?? null);
    }
  }

  /** kind → providers whose list for that kind comes from the vendor at run time. */
  const live = {};
  for (const [file, provider] of Object.entries(SOURCE_PROVIDERS)) {
    const src = readFileSync(resolve(PROVIDER_DIR, file), "utf8");
    for (const m of src.matchAll(/async getAvailable(\w+?)Models\(\)[^{]*\{/g)) {
      const kind = KIND_BY_METHOD[m[1]];
      if (!kind) continue;
      const body = block(src, m.index + m[0].length - 1);
      const models = staticModels(body, src);
      for (const { id, name } of models) add(kind, provider, id, name);
      const empty = /^\{\s*return \[\];\s*\}$/.test(body);
      if (models.length === 0 && !empty) (live[kind] ??= new Set()).add(provider);
    }
  }
  // The browser-tab providers return one "current mode" placeholder and then
  // whatever the signed-in web app offers.
  for (const provider of TAB_PROVIDERS) {
    delete table.language?.[provider];
    (live.language ??= new Set()).add(provider);
  }
  for (const [kind, providers] of Object.entries(live)) {
    for (const provider of providers) {
      const local = LOCAL_PROVIDERS.includes(provider);
      if (table[kind]?.[provider] || (local && kind !== "language")) {
        providers.delete(provider);
      }
    }
  }

  const kinds = KINDS.filter((k) => table[k]).map((kind) => {
    const providers = Object.entries(table[kind])
      .map(([provider, models]) => ({
        provider,
        models: [...models]
          .map(([id, name]) => (name && name !== id ? { id, name } : { id }))
          .sort((a, b) => byCodeUnit(a.id, b.id)),
      }))
      .sort((a, b) => b.models.length - a.models.length || byCodeUnit(a.provider, b.provider));
    const total = providers.reduce((sum, p) => sum + p.models.length, 0);
    const liveProviders = [...(live[kind] ?? [])].sort(byCodeUnit);
    return { kind, total, providers, liveProviders };
  });

  return kinds;
}

function render(directory) {
  return `// AUTO-GENERATED by marketing/scripts/generate-model-directory.mjs — do not edit by hand.
// Regenerate: node marketing/scripts/generate-model-directory.mjs
//
// Every model id NodeTool ships a definition for, from the provider manifests
// and the static model lists in packages/runtime/src/providers.

export type ModelDirectoryKind =
  | "language"
  | "image"
  | "video"
  | "audio"
  | "transcription"
  | "3d"
  | "embedding";

export interface ModelDirectoryModel {
  /** Model id passed to the provider at call time. */
  id: string;
  /** Display name, when the source gives one that differs from the id. */
  name?: string;
}

export interface ModelDirectoryProvider {
  /** Runtime provider id (matches \`providerDisplay.ts\`). */
  provider: string;
  models: ModelDirectoryModel[];
}

export interface ModelDirectoryGroup {
  kind: ModelDirectoryKind;
  /** Model ids across providers. One model served by two providers counts twice. */
  total: number;
  providers: ModelDirectoryProvider[];
  /**
   * Providers that list this kind's models from the vendor API, or from the
   * user's machine, at run time. The repo holds no names for them.
   */
  liveProviders: string[];
}

export const modelDirectory: ModelDirectoryGroup[] = ${JSON.stringify(directory, null, 2)};
`;
}

function main() {
  const out = render(collect());
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(OUT, "utf8");
    } catch {
      // missing file → stale
    }
    if (current !== out) {
      console.error(`[model-directory] ${OUT} is stale. Run: npm run seo:model-directory`);
      process.exit(1);
    }
    console.log("[model-directory] up to date.");
    return;
  }
  writeFileSync(OUT, out);
  console.log(`Wrote ${OUT}`);
}

main();
