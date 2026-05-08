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

export const trpc = {
  Provider: ({ children }: { children: unknown }) => children as never,
  createClient: jest.fn()
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
  }
};

export const createTRPCHttpClient = jest.fn(() => trpcClient);
