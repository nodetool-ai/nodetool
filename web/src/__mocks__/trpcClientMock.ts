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
const makeProcedureUtils = (): Record<string, unknown> => ({
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

const makeUtilsProxy = (): unknown =>
  new Proxy(
    {},
    {
      get(_target, _prop) {
        // Each procedure (e.g. `sketch.get`) returns its own utils object;
        // routers (e.g. `sketch`) return another proxy so chained access
        // like `utils.sketch.get.setData(...)` resolves correctly.
        return new Proxy(makeProcedureUtils(), {
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
  useUtils: () => makeUtilsProxy() as never
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
  mcpConfig: {
    status: { query: emptyQuery() },
    install: { mutate: emptyMutate() },
    uninstall: { mutate: emptyMutate() }
  },
  skills: {
    list: { query: emptyQuery() }
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
  // Workflows namespace — shared mock functions exported for per-test config
  workflows: {
    get: { query: mockWorkflowsGet },
    create: { mutate: mockWorkflowsCreate }
  },
  // Timeline namespace
  timeline: {
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
