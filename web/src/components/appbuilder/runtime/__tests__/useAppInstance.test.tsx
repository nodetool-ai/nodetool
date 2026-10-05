import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { appRunSnapshot } from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import type { ApplicationDocument } from "@nodetool-ai/app-runtime";
import { createAppRuntimeStore } from "../appRuntimeStore";
import { useAppInstance } from "../useAppInstance";
import {
  defaultAppInstance,
  loadAppInstance,
  saveAppInstance,
  type ServerAppInstance
} from "../appInstanceApi";
import { variableStorageKey } from "../variablePersistence";

let account = "owner";
let visitor = false;
jest.mock("../../../../stores/useAuth", () => ({
  useAuth: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: account } })
}));
jest.mock("../../../../lib/runtimeConfig", () => ({
  isAuthRequired: () => true
}));
jest.mock("../../../../lib/appSession", () => ({
  getAppSessionToken: () => (visitor ? "visitor-token" : null)
}));
jest.mock("../appInstanceApi", () => ({
  defaultAppInstance: jest.fn(),
  loadAppInstance: jest.fn(),
  saveAppInstance: jest.fn()
}));

const document: ApplicationDocument = {
  schemaVersion: 3,
  ui: { root: { props: {} }, content: [], zones: {} },
  operations: [],
  resources: [],
  variables: [
    {
      id: "checkpoint",
      name: "Checkpoint",
      type: { type: "number" },
      scope: "user",
      persist: true,
      default: 1
    },
    {
      id: "result",
      name: "Result",
      type: { type: "string" },
      scope: "instance",
      persist: false
    }
  ]
};
const instances = new Map<string, ServerAppInstance>();
const instance = (id: string): ServerAppInstance => ({
  id,
  user_id: account,
  application_id: "app",
  source_id: "fixture",
  name: "Default",
  version: null,
  is_default: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  revision: 0,
  variables: {},
  snapshot: appRunSnapshot.parse({
    document,
    workflow_graphs: {},
    script_documents: {}
  })
});
const mount = (instanceId?: string) => {
  const store = createAppRuntimeStore();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () => {
      const value = useAppInstance(undefined, false, {
        application: { id: "app" },
        document,
        instanceId
      });
      value.attach(store);
      return value;
    },
    { wrapper }
  );
  return { ...hook, store, client };
};

beforeEach(() => {
  account = "owner";
  visitor = false;
  instances.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  jest.mocked(defaultAppInstance).mockImplementation(async (body: unknown) => {
    const input = body as { variables: Record<string, unknown> };
    let found = instances.get("default");
    if (!found) {
      found = { ...instance("default"), variables: input.variables };
      instances.set("default", found);
    }
    return found;
  });
  jest.mocked(loadAppInstance).mockImplementation(async (id) => {
    const found = instances.get(id);
    if (!found) {
      throw new Error("Instance unavailable");
    }
    return found;
  });
  jest
    .mocked(saveAppInstance)
    .mockImplementation(async (id, revision, variables) => {
      const found = instances.get(id);
      if (!found || found.revision !== revision) {
        throw new Error(
          "This instance changed in another session. Reload the app."
        );
      }
      const saved = { ...found, revision: revision + 1, variables };
      instances.set(id, saved);
      return saved;
    });
});

it("finishes instance hydration before exposing an editable runtime", async () => {
  const store = createAppRuntimeStore();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => {
    const persistence = useAppInstance(undefined, false, { application: { id: "app" }, document, previewDraft: true });
    persistence.attach(store);
    React.useLayoutEffect(() => {
      if (!persistence.loading) {
        store.getState().dispatchEvent({ type: "setVariable", variableId: "result", value: "first visible edit" });
      }
    }, [persistence.loading]);
    return persistence;
  }, { wrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  expect(store.getState().variables.result).toBe("first visible edit");
  await act(async () => { await hook.result.current.flush(); });
  expect(instances.get("default")?.variables.result).toBe("first visible edit");
  hook.unmount();
});

it("imports legacy state only into an empty default and loads shared state in a second browser", async () => {
  window.localStorage.setItem(
    variableStorageKey("application:app"),
    JSON.stringify({ checkpoint: 42 })
  );
  const first = mount();
  await waitFor(() =>
    expect(first.result.current.instance?.id).toBe("default")
  );
  expect(first.store.getState().variables.checkpoint).toBe(42);
  expect(
    window.localStorage.getItem(variableStorageKey("application:app"))
  ).toBeNull();
  await act(async () => {
    first.store.getState().dispatchEvent({
      type: "setVariable",
      variableId: "result",
      value: "finished"
    });
    await first.result.current.flush();
  });
  first.unmount();
  window.localStorage.setItem(
    variableStorageKey("application:app"),
    JSON.stringify({ checkpoint: 99 })
  );
  const second = mount();
  await waitFor(() =>
    expect(second.store.getState().variables.result).toBe("finished")
  );
  expect(second.store.getState().variables.checkpoint).toBe(42);
  second.unmount();
});

it("isolates two instances and prevents a stale session from replacing newer variables", async () => {
  instances.set("a", instance("a"));
  instances.set("b", instance("b"));
  const first = mount("a");
  const stale = mount("a");
  const other = mount("b");
  await waitFor(() => expect(first.result.current.instance?.id).toBe("a"));
  await waitFor(() => expect(stale.result.current.instance?.id).toBe("a"));
  await waitFor(() => expect(other.result.current.instance?.id).toBe("b"));
  await act(async () => {
    first.store.getState().dispatchEvent({
      type: "setVariable",
      variableId: "result",
      value: "newer"
    });
    await first.result.current.flush();
    other.store.getState().dispatchEvent({
      type: "setVariable",
      variableId: "result",
      value: "independent"
    });
    await other.result.current.flush();
  });
  await act(async () => {
    stale.store.getState().dispatchEvent({
      type: "setVariable",
      variableId: "result",
      value: "stale"
    });
    await expect(stale.result.current.flush()).rejects.toThrow("Reload");
  });
  expect(instances.get("a")?.variables.result).toBe("newer");
  expect(instances.get("b")?.variables.result).toBe("independent");
  await act(async () => {
    await stale.result.current.reload();
  });
  expect(stale.store.getState().variables.result).toBe("newer");
  await act(async () => {
    stale.store.getState().dispatchEvent({
      type: "setVariable",
      variableId: "result",
      value: "recovered"
    });
    await stale.result.current.flush();
  });
  expect(instances.get("a")?.variables.result).toBe("recovered");
  first.unmount();
  stale.unmount();
  other.unmount();
});

it("does not load or persist owner instances for deployed-app visitors", async () => {
  visitor = true;
  const hook = mount();
  await act(async () => {
    hook.store.getState().dispatchEvent({
      type: "setVariable",
      variableId: "result",
      value: "visitor"
    });
    await hook.result.current.flush();
  });
  expect(defaultAppInstance).not.toHaveBeenCalled();
  expect(loadAppInstance).not.toHaveBeenCalled();
  expect(saveAppInstance).not.toHaveBeenCalled();
  hook.unmount();
});

it("persists explicit widget edits without committing optimistic server outputs", async () => {
  const hook = mount();
  await waitFor(() => expect(hook.result.current.instance?.id).toBe("default"));
  await act(async () => {
    hook.result.current.serverFold(() =>
      hook.store.getState().dispatchEvent({
        type: "setVariable",
        variableId: "result",
        value: "server stream"
      })
    );
    hook.store.getState().dispatchEvent({
      type: "setVariable",
      variableId: "checkpoint",
      value: 12
    });
    await hook.result.current.flush();
  });
  expect(instances.get("default")?.variables.checkpoint).toBe(12);
  expect(instances.get("default")?.variables.result).toBeUndefined();
  hook.unmount();
});
