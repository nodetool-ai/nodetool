/**
 * Per-kind transport for reading and writing a document.
 *
 * Every kind mobile opens rides the `resources.*` envelope, which carries a
 * numeric `revision` as its concurrency token. The store still treats the
 * token as **opaque** — a backend hands one out on read and echoes it back on
 * write — so a kind with a different scheme can be added without touching the
 * store. A write carrying a stale token is rejected rather than applied.
 */

import { createMobileTRPCClient } from '../trpc/client';
import type { DocumentKind, ResourceDocumentKind } from './kinds';
import { isNumber } from '../utils/typePredicates';

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
function resourcesBackend(
  kind: ResourceDocumentKind,
  projectId: string | undefined
): DocumentBackend {
  return {
    writable: true,
    list: async (limit) => {
      const summaries = await createMobileTRPCClient().resources.list.query(
        projectId === undefined ? { kind, limit } : { kind, limit, projectId }
      );
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
        projectId: projectId ?? 'default',
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

const backends = {
  timeline: (projectId?: string) => resourcesBackend('timeline', projectId),
  storyboard: (projectId?: string) => resourcesBackend('storyboard', projectId),
  sketch: (projectId?: string) => resourcesBackend('sketch', projectId),
} satisfies Record<DocumentKind, (projectId?: string) => DocumentBackend>;

/**
 * Supplying a scope keeps list and creation requests in that project. Existing
 * mobile callers remain unscoped until mobile gains its own project selector.
 */
export function documentBackend<Doc>(
  kind: DocumentKind,
  projectId?: string
): DocumentBackend<Doc> {
  return backends[kind](projectId) as DocumentBackend<Doc>;
}
