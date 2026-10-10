/**
 * Read and write `.metrics/mutate` snapshots.
 *
 * Each file holds one namespace, as in unclebob/mutator, written as JSON
 * instead of EDN. The keys match mutator's snapshot so a converter or viewer
 * can read both.
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { mutationFile } from "./forms.js";
import type { FormResult, Outcome } from "./model.js";

export const SNAPSHOT_VERSION = 1;

export interface SnapshotForm {
  id: string;
  kind: "defn" | "defn-";
  file: string;
  line: number;
  "end-line": number;
  hash: string;
  killed: number;
  survived: number;
  uncovered: number;
  sites: number;
}

export interface Snapshot {
  version: number;
  "tested-at": string;
  source: string;
  namespace: string;
  outcomes: Record<string, Outcome>;
  forms: SnapshotForm[];
}

export interface History {
  /** form key -> digest */
  forms: Map<string, string>;
  outcomes: Map<string, Outcome>;
}

export const DEFAULT_METRICS_DIR = join(".metrics", "mutate");

export function snapshotPath(directory: string, namespace: string): string {
  const parts = namespace.replace(/\\/g, "/").replace(/::/g, "/").split("/");
  for (const part of parts) {
    if (part === "" || part === "." || part === "..") {
      throw new Error(`unsafe namespace ${JSON.stringify(namespace)}`);
    }
  }
  return join(directory, ...parts.slice(0, -1), `${parts[parts.length - 1]}.json`);
}

function walk(directory: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries.sort()) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...walk(path));
    } else if (entry.endsWith(".json")) {
      found.push(path);
    }
  }
  return found;
}

function isOutcome(value: unknown): value is Outcome {
  return value === "killed" || value === "survived";
}

function parseSnapshot(text: string): Snapshot | null {
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return null;
    }
    const raw = data as Partial<Snapshot>;
    if (typeof raw.namespace !== "string") {
      return null;
    }
    const outcomes: Record<string, Outcome> = {};
    for (const [key, value] of Object.entries(raw.outcomes ?? {})) {
      if (isOutcome(value)) {
        outcomes[key] = value;
      }
    }
    const forms = Array.isArray(raw.forms)
      ? raw.forms.filter((form): form is SnapshotForm => typeof form === "object" && form !== null)
      : [];
    return {
      version: raw.version ?? SNAPSHOT_VERSION,
      "tested-at": raw["tested-at"] ?? "",
      source: typeof raw.source === "string" ? raw.source : "",
      namespace: raw.namespace,
      outcomes,
      forms
    };
  } catch {
    return null;
  }
}

function formFile(form: SnapshotForm, snapshot: Snapshot): string {
  return typeof form.file === "string" && form.file !== "" ? form.file : snapshot.source;
}

/** Every snapshot under `.metrics/mutate`, loaded once per run. */
export class SnapshotStore {
  private readonly snapshots = new Map<string, Snapshot>();
  private readonly directory: string;

  constructor(
    private readonly root: string,
    metricsDir = DEFAULT_METRICS_DIR
  ) {
    this.directory = resolve(root, metricsDir);
    for (const path of walk(this.directory)) {
      const snapshot = parseSnapshot(readFileSync(path, "utf8"));
      if (snapshot !== null) {
        this.snapshots.set(path, snapshot);
      }
    }
  }

  all(): Snapshot[] {
    return [...this.snapshots.values()];
  }

  /** Prior form digests and outcomes recorded for `fileKey`. */
  history(fileKey: string, keyOf: (namespace: string, id: string) => string): History {
    const history: History = { forms: new Map(), outcomes: new Map() };
    for (const snapshot of this.snapshots.values()) {
      for (const form of snapshot.forms) {
        if (formFile(form, snapshot) === fileKey && typeof form.hash === "string") {
          history.forms.set(keyOf(snapshot.namespace, form.id), form.hash);
        }
      }
      for (const [mutation, status] of Object.entries(snapshot.outcomes)) {
        if (mutationFile(mutation) === fileKey) {
          history.outcomes.set(mutation, status);
        }
      }
    }
    return history;
  }

  /**
   * Replace `fileKey`'s forms and outcomes. Other files' entries in the same
   * namespaces are kept. Returns the paths written, relative to the root.
   */
  write(fileKey: string, forms: FormResult[], outcomes: Map<string, Outcome>, now = new Date()): string[] {
    const byNamespace = new Map<string, FormResult[]>();
    for (const form of forms) {
      byNamespace.set(form.namespace, [...(byNamespace.get(form.namespace) ?? []), form]);
    }
    const touched = new Set<string>();
    for (const [path, snapshot] of this.snapshots) {
      const mentions =
        snapshot.forms.some((form) => formFile(form, snapshot) === fileKey) ||
        Object.keys(snapshot.outcomes).some((mutation) => mutationFile(mutation) === fileKey);
      if (mentions || byNamespace.has(snapshot.namespace)) {
        touched.add(path);
      }
    }
    for (const namespace of byNamespace.keys()) {
      touched.add(snapshotPath(this.directory, namespace));
    }
    const written: string[] = [];
    for (const path of [...touched].sort()) {
      const prior = this.snapshots.get(path);
      const namespace = prior?.namespace ?? this.namespaceFor(path, byNamespace);
      const keptForms = (prior?.forms ?? []).filter((form) => prior && formFile(form, prior) !== fileKey);
      const keptOutcomes = Object.entries(prior?.outcomes ?? {}).filter(
        ([mutation]) => mutationFile(mutation) !== fileKey
      );
      const fresh = (byNamespace.get(namespace) ?? []).map(renderForm);
      const freshOutcomes = [...outcomes].filter(([mutation]) => {
        const parsed = parseMutation(mutation);
        return parsed !== null && parsed.file === fileKey && parsed.namespace === namespace;
      });
      const merged: Record<string, Outcome> = {};
      for (const [key, value] of [...keptOutcomes, ...freshOutcomes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
        merged[key] = value;
      }
      const snapshot: Snapshot = {
        version: SNAPSHOT_VERSION,
        "tested-at": now.toISOString(),
        source: prior?.source || fileKey,
        namespace,
        outcomes: merged,
        forms: [...keptForms, ...fresh]
      };
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
      this.snapshots.set(path, snapshot);
      written.push(relative(this.root, path).split("\\").join("/"));
    }
    return written;
  }

  private namespaceFor(path: string, byNamespace: Map<string, FormResult[]>): string {
    for (const namespace of byNamespace.keys()) {
      if (snapshotPath(this.directory, namespace) === path) {
        return namespace;
      }
    }
    throw new Error(`no namespace for ${path}`);
  }
}

function parseMutation(mutation: string): { file: string; namespace: string } | null {
  try {
    const value: unknown = JSON.parse(mutation);
    if (Array.isArray(value) && typeof value[0] === "string" && typeof value[1] === "string") {
      return { file: value[0], namespace: value[1] };
    }
  } catch {
    return null;
  }
  return null;
}

function renderForm(form: FormResult): SnapshotForm {
  return {
    id: form.id,
    kind: form.private ? "defn-" : "defn",
    file: form.file,
    line: form.line,
    "end-line": form.endLine,
    hash: form.digest,
    killed: form.killed,
    survived: form.survived,
    uncovered: form.uncovered,
    sites: form.sites
  };
}
