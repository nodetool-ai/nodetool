/**
 * Per-kind transport for reading and writing a document.
 *
 * Three of the five kinds ride the `resources.*` envelope, which carries a
 * numeric `revision` as its concurrency token. Scripts and JS scripts do not:
 * neither table has a `revision` column, so the `resources` provider cannot
 * represent one, and their own routers do the same job with
 * `baseUpdatedAt`. Rather than
 * migrate two schemas to unify the token, the store treats it as **opaque** —
 * a backend hands one out on read and echoes it back on write, and only the
 * backend knows whether it is a number or a timestamp.
 *
 * Both schemes are optimistic concurrency with the same contract: a write
 * carrying a stale token is rejected rather than applied.
 */

import { createMobileTRPCClient } from '../trpc/client';
import type { DocumentKind, ResourceDocumentKind } from './kinds';
import { isNumber, isString } from '../utils/typePredicates';

/** What a read or a write resolves to. `token` is only meaningful to the backend. */
interface LoadedDocument<Doc = unknown> {
  doc: Doc;
  name: string;
  token: unknown;
  updatedAt: string | null;
}

interface SaveInput<Doc = unknown> {
  doc: Doc;
  name: string;
  /** The token the caller read. A stale one must make the server reject. */
  token: unknown;
}

/** One row in the browser's list. */
export interface DocumentSummary {
  id: string;
  name: string;
  updatedAt: string;
  /** Kind-specific detail, e.g. "12 lines". Absent when the router has none. */
  detail?: string;
}

export interface DocumentBackend<Doc = unknown> {
  read: (id: string) => Promise<LoadedDocument<Doc>>;
  save: (id: string, input: SaveInput<Doc>) => Promise<LoadedDocument<Doc>>;
  list: (limit: number) => Promise<DocumentSummary[]>;
  create: (name: string) => Promise<DocumentSummary>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Whether this kind can be written at all. */
  writable: boolean;
}

/** The `resources.*` envelope: token is the row's numeric revision. */
function resourcesBackend(kind: ResourceDocumentKind): DocumentBackend {
  return {
    writable: true,
    list: async (limit) => {
      const summaries = await createMobileTRPCClient().resources.list.query({
        kind,
        limit,
      });
      return summaries.map((summary) => ({
        id: summary.ref.id,
        name: summary.name,
        updatedAt: summary.updatedAt,
      }));
    },
    create: async (name) => {
      const detail = await createMobileTRPCClient().resources.create.mutate({
        kind,
        name,
        projectId: 'default',
      });
      return {
        id: detail.ref.id,
        name: detail.name,
        updatedAt: detail.updatedAt,
      };
    },
    rename: async (id, name) => {
      // No revision: a rename from the browser has no local body to clobber,
      // and the list row does not carry one to echo back.
      await createMobileTRPCClient().resources.update.mutate({
        ref: { kind, id },
        name,
      });
    },
    remove: async (id) => {
      await createMobileTRPCClient().resources.delete.mutate({
        ref: { kind, id },
      });
    },
    read: async (id) => {
      const detail = await createMobileTRPCClient().resources.read.query({
        ref: { kind, id },
      });
      return {
        doc: detail.document,
        name: detail.name,
        token: detail.ref.revision,
        updatedAt: detail.updatedAt,
      };
    },
    save: async (id, { doc, name, token }) => {
      const detail = await createMobileTRPCClient().resources.update.mutate({
        ref: {
          kind,
          id,
          revision: isNumber(token) ? token : undefined,
        },
        name,
        document: doc,
      });
      return {
        doc: detail.document,
        name: detail.name,
        token: detail.ref.revision,
        updatedAt: detail.updatedAt,
      };
    },
  };
}

/** The `scripts.*` router: token is `updated_at`, sent back as `baseUpdatedAt`. */
function scriptsBackend(): DocumentBackend {
  return {
    writable: true,
    list: async () => {
      const scripts = await createMobileTRPCClient().scripts.list.query({});
      return scripts.map((script) => ({
        id: script.id,
        name: script.name,
        updatedAt: script.updatedAt,
        detail: `${script.lineCount} ${script.lineCount === 1 ? 'line' : 'lines'}`,
      }));
    },
    create: async (name) => {
      const script = await createMobileTRPCClient().scripts.create.mutate({
        name,
        projectId: 'default',
      });
      return {
        id: script.id,
        name: script.name,
        updatedAt: script.updatedAt,
      };
    },
    rename: async (id, name) => {
      await createMobileTRPCClient().scripts.update.mutate({ id, name });
    },
    remove: async (id) => {
      await createMobileTRPCClient().scripts.delete.mutate({ id });
    },
    read: async (id) => {
      const script = await createMobileTRPCClient().scripts.get.query({ id });
      return {
        doc: script.document,
        name: script.name,
        token: script.updatedAt,
        updatedAt: script.updatedAt,
      };
    },
    save: async (id, { doc, name, token }) => {
      const script = await createMobileTRPCClient().scripts.update.mutate({
        id,
        name,
        document: doc as Parameters<
          ReturnType<typeof createMobileTRPCClient>['scripts']['update']['mutate']
        >[0]['document'],
        baseUpdatedAt: isString(token) ? token : undefined,
      });
      return {
        doc: script.document,
        name: script.name,
        token: script.updatedAt,
        updatedAt: script.updatedAt,
      };
    },
  };
}

/**
 * The `jsScripts.*` router: same `baseUpdatedAt` scheme as `scripts.*`, and a
 * different table again — a JS script is a body with declared ports, not lines.
 */
function jsScriptsBackend(): DocumentBackend {
  const portSummary = (inputs: number, outputs: number): string =>
    `${inputs} in · ${outputs} out`;

  return {
    writable: true,
    list: async () => {
      const scripts = await createMobileTRPCClient().jsScripts.list.query({});
      return scripts.map((script) => ({
        id: script.id,
        name: script.name,
        updatedAt: script.updatedAt,
        detail: portSummary(script.inputs.length, script.outputs.length),
      }));
    },
    create: async (name) => {
      const script = await createMobileTRPCClient().jsScripts.create.mutate({
        name,
        projectId: 'default',
      });
      return {
        id: script.id,
        name: script.name,
        updatedAt: script.updatedAt,
      };
    },
    rename: async (id, name) => {
      await createMobileTRPCClient().jsScripts.update.mutate({ id, name });
    },
    remove: async (id) => {
      await createMobileTRPCClient().jsScripts.delete.mutate({ id });
    },
    read: async (id) => {
      const script = await createMobileTRPCClient().jsScripts.get.query({ id });
      return {
        doc: script.document,
        name: script.name,
        token: script.updatedAt,
        updatedAt: script.updatedAt,
      };
    },
    save: async (id, { doc, name, token }) => {
      const script = await createMobileTRPCClient().jsScripts.update.mutate({
        id,
        name,
        document: doc as Parameters<
          ReturnType<
            typeof createMobileTRPCClient
          >['jsScripts']['update']['mutate']
        >[0]['document'],
        baseUpdatedAt: isString(token) ? token : undefined,
      });
      return {
        doc: script.document,
        name: script.name,
        token: script.updatedAt,
        updatedAt: script.updatedAt,
      };
    },
  };
}

const backends = {
  timeline: resourcesBackend('timeline'),
  storyboard: resourcesBackend('storyboard'),
  sketch: resourcesBackend('sketch'),
  script: scriptsBackend(),
  jsscript: jsScriptsBackend(),
} satisfies Record<DocumentKind, DocumentBackend>;

export function documentBackend<Doc>(kind: DocumentKind): DocumentBackend<Doc> {
  return backends[kind] as DocumentBackend<Doc>;
}
