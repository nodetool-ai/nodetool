/**
 * What an app screen gets from the applications API: the released document
 * with its pinned graph when the app is published, the draft plus the live
 * workflow when it is not.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockListApplications = jest.fn();
const mockGetApplication = jest.fn();
const mockGetRelease = jest.fn();

jest.mock('../services/api', () => ({
  apiService: {
    listApplications: (...args: unknown[]) => mockListApplications(...args),
    getApplication: (...args: unknown[]) => mockGetApplication(...args),
    getReleasedApplicationDocument: (...args: unknown[]) =>
      mockGetRelease(...args),
  },
  normalizeWorkflow: <T,>(workflow: T) => workflow,
}));

/** The live-workflow query, with the `enabled` the hook passed it. */
const mockWorkflowQuery = {
  data: undefined as unknown,
  isLoading: false,
  error: null as Error | null,
  enabled: undefined as boolean | undefined,
};

jest.mock('../trpc/client', () => ({
  trpc: {
    workflows: {
      get: {
        useQuery: (
          _input: { id: string },
          options: { enabled?: boolean }
        ) => {
          mockWorkflowQuery.enabled = options.enabled;
          return mockWorkflowQuery;
        },
      },
    },
  },
}));

import { applicationKeys, useApplicationApp, useApplications } from './useApplications';

const uiDocument = {
  schemaVersion: 3,
  ui: {
    root: { props: { title: 'Greeter' } },
    content: [{ type: 'Text', props: { id: 't', binding: 'op:main/out:o1' } }],
    zones: {},
  },
  operations: [
    {
      id: 'main',
      name: 'Run',
      workflowId: 'wf-1',
      inputs: {},
      outputs: {},
      policy: 'replace',
    },
  ],
  resources: [],
  variables: [],
};

const pinnedGraph = { nodes: [{ id: 'o1', type: 'x' }], edges: [] };

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useApplications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkflowQuery.data = undefined;
    mockWorkflowQuery.error = null;
    mockWorkflowQuery.enabled = undefined;
  });

  it('keys queries hierarchically under "applications"', () => {
    expect(applicationKeys.list()).toEqual(['applications', 'list', null]);
    expect(applicationKeys.detail('a1')).toEqual([
      'applications',
      'detail',
      'a1',
    ]);
    expect(applicationKeys.release('a1')).toEqual([
      'applications',
      'detail',
      'a1',
      'release',
    ]);
  });

  it('lists apps newest first', async () => {
    mockListApplications.mockResolvedValue([
      { id: 'old', name: 'Old', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'new', name: 'New', updatedAt: '2026-07-01T00:00:00Z' },
    ]);

    const { result } = renderHook(() => useApplications(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map((app) => app.id)).toEqual(['new', 'old']);
  });

  it('runs a published app off the release and its pinned graph', async () => {
    mockGetApplication.mockResolvedValue({
      id: 'a1',
      name: 'Greeter',
      description: '',
      document: { ...uiDocument, ui: { ...uiDocument.ui, content: [] } },
    });
    mockGetRelease.mockResolvedValue({
      id: 'v1',
      applicationId: 'a1',
      version: 1,
      document: uiDocument,
      released: true,
      workflows: [
        { workflowId: 'wf-1', version: 1, graphHash: null, graph: pinnedGraph },
      ],
    });

    const { result } = renderHook(() => useApplicationApp('a1'), { wrapper });

    await waitFor(() => expect(result.current.workflow).not.toBeNull());
    expect(result.current.source).toBe('release');
    expect(result.current.document?.operations[0].workflowId).toBe('wf-1');
    expect(result.current.workflow?.graph).toEqual(pinnedGraph);
    // A pinned graph makes the workflow request unnecessary.
    expect(mockWorkflowQuery.enabled).toBe(false);
    // The identity every run of this app must send, so the server can meter it.
    expect(result.current.application).toEqual({ id: 'a1', version: 1 });
  });

  it('falls back to the draft document and the live workflow', async () => {
    mockGetApplication.mockResolvedValue({
      id: 'a1',
      name: 'Greeter',
      description: '',
      document: uiDocument,
    });
    mockGetRelease.mockResolvedValue(null);
    mockWorkflowQuery.data = { id: 'wf-1', name: 'Greeter', graph: pinnedGraph };

    const { result } = renderHook(() => useApplicationApp('a1'), { wrapper });

    await waitFor(() => expect(result.current.source).toBe('draft'));
    expect(mockWorkflowQuery.enabled).toBe(true);
    expect(result.current.workflow?.id).toBe('wf-1');
    // Still an app run — budgeted — but not a run of any released version.
    expect(result.current.application).toEqual({ id: 'a1', version: null });
  });

  it('fetches nothing until an application id is known', () => {
    renderHook(() => useApplicationApp(undefined), { wrapper });

    expect(mockGetApplication).not.toHaveBeenCalled();
    expect(mockGetRelease).not.toHaveBeenCalled();
    expect(mockWorkflowQuery.enabled).toBe(false);
  });
});
