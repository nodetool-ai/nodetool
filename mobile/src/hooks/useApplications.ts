/**
 * React Query bindings for applications — the mini apps a server hosts.
 *
 * An application is its own resource: it owns the document, the operations
 * bind workflows by id, and publishing pins the graph each operation runs.
 * Mobile reads all of that over `/api/applications/*` (the REST door onto the
 * same service the web client reaches through tRPC).
 *
 * `useApplicationApp` is what a screen wants: the document to render plus the
 * workflow to run it against, preferring the released snapshot — its pinned
 * graph is the one the app was published with — and falling back to the draft
 * document plus the live workflow.
 */

import { useMemo } from 'react';
import {
  useQuery,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  parseApplicationDocument,
  type ApplicationDocument,
} from '@nodetool-ai/app-runtime';

import {
  apiService,
  normalizeWorkflow,
  type ApplicationListItem,
  type ApplicationReleaseResponse,
  type ApplicationResponse,
} from '../services/api';
import { trpc } from '../trpc/client';
import type { Workflow } from '../types/workflow';

/** tRPC types its `error` as a plain interface, not an `Error` subtype. */
function toError(error: { message: string } | null): Error | null {
  if (!error) {
    return null;
  }
  return error instanceof Error ? error : new Error(error.message);
}

export const applicationKeys = {
  all: ['applications'] as const,
  list: (projectId?: string): QueryKey => [
    'applications',
    'list',
    projectId ?? null,
  ],
  detail: (id: string): QueryKey => ['applications', 'detail', id],
  release: (id: string): QueryKey => ['applications', 'detail', id, 'release'],
};

/** Every app on the server, newest first. */
export function useApplications(
  projectId?: string
): UseQueryResult<ApplicationListItem[], Error> {
  return useQuery({
    queryKey: applicationKeys.list(projectId),
    queryFn: async () => {
      const apps = await apiService.listApplications(projectId);
      return [...apps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
  });
}

/** One app's draft: name, description, and the document being authored. */
export function useApplication(
  id: string | undefined
): UseQueryResult<ApplicationResponse, Error> {
  return useQuery({
    queryKey: applicationKeys.detail(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => apiService.getApplication(id as string),
  });
}

/** The released snapshot, or null when the app has never been published. */
export function useApplicationRelease(
  id: string | undefined
): UseQueryResult<ApplicationReleaseResponse | null, Error> {
  return useQuery({
    queryKey: applicationKeys.release(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => apiService.getReleasedApplicationDocument(id as string),
  });
}

/**
 * What a run request has to carry so the server can meter it: the app it
 * belongs to, and the released version it executes when the released snapshot
 * is what is being rendered. A draft run carries a null version.
 */
export interface ApplicationRunIdentity {
  id: string;
  version: number | null;
}

export interface ApplicationApp {
  name: string;
  /** The document to render, once both requests have resolved. */
  document: ApplicationDocument | null;
  /** The workflow the document's first operation runs. */
  workflow: Workflow | null;
  /** Which document won: the published release or the draft. */
  source: 'release' | 'draft' | null;
  /** Release identity every run of this app must send; null until it loads. */
  application: ApplicationRunIdentity | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Everything a screen needs to run one app.
 *
 * Mobile holds one workflow per app screen, so the workflow resolved here is
 * the one the first operation binds; an operation naming another workflow
 * refuses to run rather than running this graph under its name (see
 * `useAppRuntime`).
 */
export function useApplicationApp(id: string | undefined): ApplicationApp {
  const application = useApplication(id);
  const release = useApplicationRelease(id);

  const document = useMemo(() => {
    const released = release.data
      ? parseApplicationDocument(release.data.document)
      : null;
    if (released) {
      return { document: released, source: 'release' as const };
    }
    const draft = application.data
      ? parseApplicationDocument(application.data.document)
      : null;
    return draft
      ? { document: draft, source: 'draft' as const }
      : { document: null, source: null };
  }, [application.data, release.data]);

  const workflowId = document.document?.operations[0]?.workflowId;

  // A release pins the graph of every workflow it binds, so a published app
  // needs no workflow request at all.
  const pinned = useMemo(() => {
    if (!workflowId || document.source !== 'release') {
      return null;
    }
    const entry = release.data?.workflows.find(
      (candidate) => candidate.workflowId === workflowId
    );
    return entry?.graph ?? null;
  }, [document.source, release.data, workflowId]);

  const liveWorkflow = trpc.workflows.get.useQuery(
    { id: workflowId ?? '' },
    { enabled: Boolean(workflowId) && !pinned }
  );

  const workflow = useMemo((): Workflow | null => {
    if (!workflowId) {
      return null;
    }
    if (pinned) {
      return {
        id: workflowId,
        name: application.data?.name ?? '',
        description: application.data?.description ?? '',
        graph: pinned,
      } as Workflow;
    }
    return liveWorkflow.data ? normalizeWorkflow(liveWorkflow.data) : null;
  }, [application.data, liveWorkflow.data, pinned, workflowId]);

  // The version claim follows the document that won: a run of the released
  // snapshot is a release run, a run of the draft is not.
  const runIdentity = useMemo((): ApplicationRunIdentity | null => {
    if (!id || !document.document) {
      return null;
    }
    return {
      id,
      version:
        document.source === 'release' ? release.data?.version ?? null : null,
    };
  }, [document.document, document.source, id, release.data]);

  return {
    name: application.data?.name ?? '',
    document: document.document,
    workflow,
    source: document.source,
    application: runIdentity,
    isLoading:
      application.isLoading ||
      release.isLoading ||
      (Boolean(workflowId) && !pinned && liveWorkflow.isLoading),
    error: application.error ?? release.error ?? toError(liveWorkflow.error),
  };
}
