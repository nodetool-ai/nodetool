// Mock tRPC client for Jest. Each procedure resolves to a sensible empty
// default so stores that import `trpcClient` at module load time don't explode
// on any random test run. Individual tests can `jest.mock("../trpc/client")`
// with their own per-test shapes for assertions.

const emptyQuery = () =>
  jest.fn(async () => ({
    messages: [],
    next: null,
    threads: [],
    workspaces: [],
    collections: [],
    calls: [],
    next_start_key: null,
    settings: [],
    secrets: [],
    fonts: [],
    targets: [],
    skills: [],
    users: [],
    ok: true,
    count: 0
  }));

const emptyMutate = () =>
  jest.fn(async () => ({
    id: "mock-id",
    title: "mock",
    message: "ok",
    ok: true
  }));

// Named exports for tests that need to configure per-test behaviour.
export const mockWorkflowsGet = jest.fn();
export const mockWorkflowsCreate = jest.fn();
export const mockTimelineClipsCreate = jest.fn();
export const mockSketchVersionsAppend = jest.fn();

// Minimal `useUtils` shim so hooks that touch the query cache after a
// mutation (`utils.sketch.get.setData`, `utils.something.invalidate`) don't
// blow up in tests. New procedures get a passthrough proxy on demand.
const makeProcedureUtils = () => ({
  setData: jest.fn(),
  setInfiniteData: jest.fn(),
  invalidate: jest.fn(async () => undefined),
  refetch: jest.fn(async () => undefined),
  reset: jest.fn(async () => undefined),
  cancel: jest.fn(async () => undefined),
  fetch: jest.fn(async () => undefined),
  prefetch: jest.fn(async () => undefined),
  getData: jest.fn(() => undefined)
});

const makeUtilsProxy = () =>
  new Proxy(
    {},
    {
      get(_target, prop) {
        const procedure = makeProcedureUtils();
        // A util read at this level ends the chain: `utils.sketch.get` hands
        // back a proxy, and `.setData` on it must be the function itself.
        // SAFETY: `prop in procedure` was just checked, and every value of
        // that object literal is a jest mock.
        if (typeof prop === "string" && prop in procedure) {
          return (procedure as Record<string, unknown>)[prop];
        }
        // Each procedure (e.g. `sketch.get`) returns its own utils object;
        // routers (e.g. `sketch`) return another proxy so chained access
        // like `utils.sketch.get.setData(...)` resolves correctly.
        return new Proxy(procedure, {
          get(procTarget, procProp) {
            if (procProp in procTarget) {
              return (procTarget as Record<string | symbol, unknown>)[procProp];
            }
            // Treat unknown chains as nested routers.
            return makeUtilsProxy();
          }
        });
      }
    }
  );

export const trpc = {
  Provider: ({ children }: { children: unknown }) => children as never,
  createClient: jest.fn(),
  useUtils: () => makeUtilsProxy() as never,
  // `useScriptLineShotLink` reads a linked board through this hook, so any test
  // that renders a script line reaches it. Answering with no data leaves the
  // hook on its `openShots` fallback — the store path those tests drive —
  // rather than standing in for a board they never set up.
  storyboards: {
    get: { useQuery: jest.fn(() => ({ data: undefined })) }
  }
};

export const trpcClient = {
  threads: {
    list: { query: emptyQuery() },
    get: { query: emptyQuery() },
    create: { mutate: emptyMutate() },
    update: { mutate: emptyMutate() },
    delete: { mutate: emptyMutate() },
    summarize: { mutate: emptyMutate() }
  },
  messages: {
    list: { query: emptyQuery() },
    get: { query: emptyQuery() },
    create: { mutate: emptyMutate() },
    delete: { mutate: emptyMutate() }
  },
  workspace: {
    list: { query: emptyQuery() },
    get: { query: emptyQuery() },
    getDefault: { query: emptyQuery() },
    create: { mutate: emptyMutate() },
    update: { mutate: emptyMutate() },
    delete: { mutate: emptyMutate() },
    listFiles: { query: emptyQuery() }
  },
  collections: {
    list: { query: emptyQuery() },
    get: { query: emptyQuery() },
    create: { mutate: emptyMutate() },
    update: { mutate: emptyMutate() },
    delete: { mutate: emptyMutate() },
    query: { query: emptyQuery() }
  },
  settings: {
    list: { query: emptyQuery() },
    update: { mutate: emptyMutate() },
    secrets: {
      list: { query: emptyQuery() },
      get: { query: emptyQuery() },
      upsert: { mutate: emptyMutate() },
      delete: { mutate: emptyMutate() }
    }
  },
  costs: {
    list: { query: emptyQuery() },
    aggregate: { query: emptyQuery() },
    aggregateByProvider: { query: emptyQuery() },
    aggregateByModel: { query: emptyQuery() },
    summary: { query: emptyQuery() }
  },
  fonts: {
    list: { query: emptyQuery() }
  },
  integrations: {
    list: { query: jest.fn(async () => ({ identities: [] })) },
    createLinkCode: {
      mutate: jest.fn(async () => ({
        code: "mock-code",
        deep_link: null,
        expires_at: new Date(Date.now() + 600_000).toISOString()
      }))
    },
    describeLinkCode: {
      query: jest.fn(async () => ({
        provider: "telegram",
        external_id: "mock-external-id"
      }))
    },
    confirmLink: {
      mutate: jest.fn(async () => ({
        linked: true,
        external_id: "mock-external-id"
      }))
    },
    unlink: { mutate: jest.fn(async () => ({ unlinked: true })) }
  },
  mcpConfig: {
    status: { query: emptyQuery() },
    install: { mutate: emptyMutate() },
    uninstall: { mutate: emptyMutate() }
  },
  skills: {
    list: { query: emptyQuery() }
  },
  packs: {
    list: { query: emptyQuery() },
    listBuiltins: { query: emptyQuery() },
    getTrust: { query: emptyQuery() },
    runtimeStatuses: { query: jest.fn(async () => ({ statuses: [] })) },
    sandboxModules: {
      query: jest.fn(async () => ({ modules: [], diagnostics: [] }))
    },
    sandboxPackageDocs: { query: jest.fn(async () => null) }
  },
  users: {
    list: { query: emptyQuery() },
    get: { query: emptyQuery() },
    create: { mutate: emptyMutate() },
    remove: { mutate: emptyMutate() },
    resetToken: { mutate: emptyMutate() }
  },
  jobs: {
    list: { query: emptyQuery() },
    get: { query: emptyQuery() },
    cancel: { mutate: emptyMutate() }
  },
  files: {
    list: { query: jest.fn(async () => []) },
    createFolder: {
      mutate: jest.fn(async ({ path, name }: { path: string; name: string }) => ({
        name,
        path: `${path}/${name}`,
        size: 0,
        is_dir: true,
        modified_at: "2026-01-01T00:00:00.000Z"
      }))
    }
  },
  worker: {
    profiles: {
      list: { query: jest.fn(async () => []) },
      create: { mutate: emptyMutate() },
      delete: { mutate: emptyMutate() }
    },
    instances: {
      list: { query: jest.fn(async () => []) }
    },
    provision: { mutate: emptyMutate() },
    stop: { mutate: emptyMutate() },
    stopAll: { mutate: emptyMutate() },
    status: { query: emptyQuery() },
    reconcile: { mutate: emptyMutate() },
    attach: { mutate: emptyMutate() },
    detach: { mutate: emptyMutate() }
  },
  // Workflows namespace — shared mock functions exported for per-test config
  workflows: {
    get: { query: mockWorkflowsGet },
    create: { mutate: mockWorkflowsCreate }
  },
  // Timeline namespace
  timeline: {
    create: { mutate: jest.fn(async () => ({ id: "mock-seq", name: "mock" })) },
    update: { mutate: jest.fn(async () => ({ ok: true })) },
    clips: {
      create: { mutate: mockTimelineClipsCreate }
    }
  },
  // Sketch (Image Editor) namespace
  sketch: {
    list: { query: emptyQuery() },
    get: { query: emptyQuery() },
    create: { mutate: emptyMutate() },
    update: { mutate: jest.fn(async () => ({ ok: true })) },
    delete: { mutate: emptyMutate() },
    versions: {
      list: { query: emptyQuery() },
      append: { mutate: mockSketchVersionsAppend },
      setFavorite: { mutate: emptyMutate() },
      delete: { mutate: emptyMutate() }
    },
    layers: {
      create: { mutate: emptyMutate() },
      delete: { mutate: emptyMutate() },
      duplicate: { mutate: emptyMutate() }
    }
  }
};

export const createTRPCHttpClient = jest.fn(() => trpcClient);
