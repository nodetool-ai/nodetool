import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  implicitOperation,
  type ApplicationDocument
} from "@nodetool-ai/app-runtime";
import type { JsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import type { Workflow } from "../../../stores/ApiTypes";
import { useAuth } from "../../../stores/useAuth";
import { isAuthRequired } from "../../../lib/runtimeConfig";
import { getAppSessionToken } from "../../../lib/appSession";
import {
  defaultAppInstance,
  loadAppInstance,
  saveAppInstance,
  type ServerAppInstance
} from "./appInstanceApi";
import {
  instanceValues,
  InstanceWriter,
  mergedInstanceState,
  restoredInstanceValues
} from "./instancePersistence";
import {
  clearPersistedVariables,
  loadPersistedVariables
} from "./variablePersistence";
import type { AppRuntimeStore } from "./appRuntimeStore";

export interface AppInstanceOptions {
  document?: ApplicationDocument;
  application?: { id: string; version?: number };
  instanceId?: string;
  previewDraft?: boolean;
  workflowOverrides?: Record<string, Workflow>;
  scriptOverrides?: Record<string, JsScriptDocument>;
}

export interface AppInstancePersistence {
  instance: ServerAppInstance | undefined;
  account: string;
  enabled: boolean;
  visitor: boolean;
  attach: (store: AppRuntimeStore) => void;
  flush: () => Promise<void>;
  serverFold: (apply: () => void) => void;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
  loading: boolean;
  error: string | undefined;
}

export const useAppInstance = (
  workflow: Workflow | undefined,
  designMode: boolean,
  options: AppInstanceOptions
): AppInstancePersistence => {
  const account =
    useAuth((state) => state.user?.id) ??
    (isAuthRequired() ? "anonymous" : "1");
  const visitor = getAppSessionToken() !== null;
  const document =
    options.document ??
    (workflow
      ? ({
          schemaVersion: 3,
          ui: { root: { props: {} }, content: [], zones: {} },
          operations: [implicitOperation(workflow.id)],
          resources: [],
          variables: []
        } satisfies ApplicationDocument)
      : undefined);
  const enabled =
    !designMode && !visitor && Boolean(document) && account !== "anonymous";
  const source = options.application?.id ?? workflow?.id ?? "draft";
  const inline = !options.application || options.previewDraft === true;
  const definitionKey = inline
    ? JSON.stringify({
        document,
        workflow: workflow?.graph,
        workflows: options.workflowOverrides,
        scripts: options.scriptOverrides
      })
    : "";
  const queryKey = [
    "app-instances",
    account,
    options.instanceId ?? source,
    definitionKey
  ];
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (options.instanceId) {
        const selected = await loadAppInstance(options.instanceId);
        if (
          options.application &&
          selected.application_id !== options.application.id
        ) {
          throw new Error("This instance belongs to another app.");
        }
        return selected;
      }
      const graphs = Object.fromEntries(
        Object.entries(options.workflowOverrides ?? {}).map(([id, graph]) => [
          id,
          graph.graph
        ])
      );
      if (workflow?.graph) {
        graphs[workflow.id] ??= workflow.graph;
      }
      const identity = options.application
        ? `application:${options.application.id}`
        : workflow
          ? `workflow:${workflow.id}`
          : null;
      const digest = inline
        ? Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(definitionKey)
              )
            ),
            (byte) => byte.toString(16).padStart(2, "0")
          ).join("")
        : "";
      const initial: {
        source_id: string;
        snapshot: unknown;
        variables: Record<string, unknown>;
        application_id?: string;
        version?: number;
      } = {
        source_id: inline
          ? `${options.previewDraft ? "preview:" : ""}${source}:${digest}`
          : `application:${source}`,
        snapshot: {
          document,
          workflow_graphs: graphs,
          script_documents: options.scriptOverrides ?? {}
        },
        variables: loadPersistedVariables(identity, document?.variables ?? [])
      };
      if (options.application) {
        initial.application_id = options.application.id;
        if (
          !options.previewDraft &&
          options.application.version !== undefined
        ) {
          initial.version = options.application.version;
        }
      }
      const created = await defaultAppInstance(initial);
      clearPersistedVariables(identity);
      return created;
    },
    enabled,
    // Always reload authoritative state on remount or window focus.
    staleTime: 0,
    retry: false
  });
  const mutation = useMutation({
    mutationFn: async ({
      id,
      revision,
      variables
    }: {
      id: string;
      revision: number;
      variables: Record<string, unknown>;
    }) => saveAppInstance(id, revision, variables),
    onSuccess: async (instance) => {
      if (
        instance.user_id !== account ||
        instanceRef.current?.id !== instance.id
      ) {
        return;
      }
      queryClient.setQueryData(queryKey, instance);
      await queryClient.invalidateQueries({ queryKey, refetchType: "none" });
    },
    retry: false
  });
  const [saveError, setSaveError] = useState<string>();
  const writerRef = useRef<InstanceWriter | null>(null);
  const persistedRef = useRef<Record<string, unknown>>({});
  const serverFoldRef = useRef(false);
  const serverFold = useCallback((apply: () => void): void => {
    serverFoldRef.current = true;
    try {
      apply();
    } finally {
      serverFoldRef.current = false;
    }
  }, []);
  const bindingRef = useRef<string | null>(null);
  const [readyBinding, setReadyBinding] = useState<string | null>(null);
  const storeRef = useRef<AppRuntimeStore | null>(null);
  const instance = query.data;
  const instanceRef = useRef(instance);
  instanceRef.current = instance;
  const attach = useCallback((store: AppRuntimeStore): void => {
    storeRef.current = store;
  }, []);
  const mutateRef = useRef(mutation.mutateAsync);
  mutateRef.current = mutation.mutateAsync;
  const queryKeyRef = useRef(queryKey);
  queryKeyRef.current = queryKey;

  /** Show merged server state without saving it back as a local edit. */
  const applyRebase = useCallback(
    (merged: Record<string, unknown>): void => {
      persistedRef.current = merged;
      const store = storeRef.current;
      if (store) {
        serverFold(() =>
          store.setState(mergedInstanceState(store.getState(), merged))
        );
      }
    },
    [serverFold]
  );
  const applyRebaseRef = useRef(applyRebase);
  applyRebaseRef.current = applyRebase;

  /** A writer for one instance that rebases onto newer server state. */
  const createWriter = useCallback(
    (target: ServerAppInstance): InstanceWriter =>
      new InstanceWriter(
        target.revision,
        target.variables,
        async (revision, variables) => {
          const saved = await mutateRef.current({
            id: target.id,
            revision,
            variables
          });
          return saved.revision;
        },
        {
          load: async () => {
            const latest = await loadAppInstance(target.id);
            queryClient.setQueryData(queryKeyRef.current, latest);
            return { revision: latest.revision, values: latest.variables };
          },
          onRebase: (merged) => applyRebaseRef.current(merged)
        }
      ),
    [queryClient]
  );
  const createWriterRef = useRef(createWriter);
  createWriterRef.current = createWriter;

  useEffect(() => {
    const store = storeRef.current;
    const instance = instanceRef.current;
    if (!instance || !store) {
      return;
    }
    const binding = `${account}:${instance.id}`;
    if (bindingRef.current !== binding) {
      bindingRef.current = binding;
      persistedRef.current = instance.variables;
      store.setState(restoredInstanceValues(instance.variables));
      writerRef.current = createWriterRef.current(instance);
      setSaveError(undefined);
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      const writer = writerRef.current;
      writer?.stage(persistedRef.current);
      void writer?.flush().catch((error: unknown) => {
        if (active) {
          setSaveError(error instanceof Error ? error.message : String(error));
        }
      });
    };
    const unsubscribe = store.subscribe((state, previous) => {
      if (serverFoldRef.current || state.invocations !== previous.invocations) {
        return;
      }
      if (
        state.inputs === previous.inputs &&
        state.outputs === previous.outputs &&
        state.variables === previous.variables
      ) {
        return;
      }
      const values = instanceValues(state);
      const next = { ...persistedRef.current };
      for (const key of new Set([
        ...Object.keys(state.variables),
        ...Object.keys(previous.variables)
      ])) {
        if (state.variables[key] === previous.variables[key]) {
          continue;
        }
        if (state.variables[key] === undefined) {
          delete next[key];
        } else {
          next[key] = state.variables[key];
        }
      }
      if (state.inputs !== previous.inputs) {
        next.__app_inputs = values.__app_inputs;
      }
      if (state.outputs !== previous.outputs) {
        next.__app_outputs = values.__app_outputs;
      }
      persistedRef.current = next;
      writerRef.current?.stage(next);
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(flush, 150);
    });
    setReadyBinding(binding);
    return () => {
      active = false;
      unsubscribe();
      if (timer) {
        clearTimeout(timer);
      }
      // Pending edits belong to this instance even when its view closes.
      flush();
    };
  }, [account, instance?.id]);

  useEffect(() => {
    const store = storeRef.current;
    const instance = instanceRef.current;
    const writer = writerRef.current;
    if (!store || !instance || !writer) {
      return;
    }
    // An external refresh can replace only an unchanged, idle local state.
    if (
      writer.adopt(instance.revision, instance.variables, persistedRef.current)
    ) {
      persistedRef.current = instance.variables;
      serverFold(() =>
        store.setState(restoredInstanceValues(instance.variables))
      );
    }
  }, [instance?.revision, serverFold]);

  const flush = useCallback(async (): Promise<void> => {
    if (!enabled) {
      return;
    }
    if (!writerRef.current || !storeRef.current) {
      throw new Error(
        query.error?.message ??
          "The app instance is still loading. Wait before running again."
      );
    }
    writerRef.current.stage(persistedRef.current);
    await writerRef.current.flush();
  }, [enabled, query.error]);

  const refetch = query.refetch;
  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) {
      return;
    }
    const result = await refetch();
    if (result.error) {
      throw result.error;
    }
    const store = storeRef.current;
    const latest = result.data;
    if (!latest || !store || !writerRef.current) {
      return;
    }
    const writer = writerRef.current;
    if (
      writer.adopt(latest.revision, latest.variables, persistedRef.current)
    ) {
      persistedRef.current = latest.variables;
      serverFold(() =>
        store.setState(restoredInstanceValues(latest.variables))
      );
      return;
    }
    // Local edits are not saved yet: keep them on top of the server state.
    if (
      writer.rebase(
        { revision: latest.revision, values: latest.variables },
        persistedRef.current
      )
    ) {
      await writer.flush();
    }
  }, [enabled, refetch, serverFold]);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const result = await refetch();
      if (result.error) {
        throw result.error;
      }
      const latest = result.data;
      const store = storeRef.current;
      if (!latest || !store) {
        return;
      }
      persistedRef.current = latest.variables;
      writerRef.current = createWriterRef.current(latest);
      serverFold(() =>
        store.setState(restoredInstanceValues(latest.variables))
      );
      setSaveError(undefined);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }, [refetch, serverFold]);

  return {
    instance,
    account,
    enabled,
    visitor,
    attach,
    flush,
    serverFold,
    refresh,
    reload,
    loading:
      enabled &&
      (query.isPending ||
        Boolean(instance && readyBinding !== `${account}:${instance.id}`)),
    error:
      account === "anonymous" && !visitor && !designMode
        ? "Sign in to load this app instance."
        : (query.error?.message ?? saveError)
  };
};
