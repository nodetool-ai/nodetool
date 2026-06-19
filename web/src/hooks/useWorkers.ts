import {
  useQuery,
  useQueryClient,
  type UseQueryResult
} from "@tanstack/react-query";
import { useCallback } from "react";
import { trpcClient } from "../trpc/client";

/**
 * GPU-worker provisioning surface for the UI. Wraps the `worker` tRPC router
 * (`packages/websocket`) in TanStack Query: declarative profiles plus the live,
 * billing-sensitive instance registry, with mutations that re-fetch the
 * affected query after every lifecycle action so the panel stays current.
 */

export type WorkerTarget = "runpod" | "vast";
export type TokenPolicy = "generate" | "fixed";
export type WorkerStatus =
  | "provisioning"
  | "running"
  | "attached"
  | "stopping"
  // Paused: compute released, volume + model cache retained. Resumable.
  | "stopped"
  // Destroyed: pod and volume deleted. Not resumable — a tombstone.
  | "terminated"
  | "error";

export interface WorkerProfile {
  id: string;
  name: string;
  target: string;
  image: string;
  spec: Record<string, unknown>;
  token_policy: string;
  idle_timeout_minutes: number | null;
  max_lifetime_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface WorkerInstance {
  id: string;
  profile_name: string;
  target: string;
  provider_ref: string;
  ws_url: string;
  token: string | null;
  status: string;
  attached_to: string | null;
  created_at: string;
  last_activity_at: string;
  estimated_cost_usd: number | null;
}

export interface CreateWorkerProfileInput {
  name: string;
  target: WorkerTarget;
  image: string;
  spec?: Record<string, unknown>;
  token_policy: TokenPolicy;
  idle_timeout_minutes?: number | null;
  max_lifetime_minutes?: number | null;
}

export interface WorkerConnection {
  wsUrl: string;
  token: string | null;
}

/** Readiness of a `running` worker, from the backend health probe. */
export interface WorkerHealth {
  /** True once the worker answered the bridge handshake (truly serving). */
  healthy: boolean;
  protocolVersion?: number;
  error?: string;
}

export interface WorkerOrphan {
  providerRef: string;
  target: string;
}

export interface ReconcileSummary {
  orphans: WorkerOrphan[];
  liveCount: number;
  estimatedCostUsd: number;
}

/** Hierarchical query keys so a single action can target the right cache. */
export const workerQueryKeys = {
  all: ["workers"] as const,
  profiles: ["workers", "profiles"] as const,
  instances: ["workers", "instances"] as const,
  apiKeyStatus: ["workers", "api-key-status"] as const,
  health: (id: string) => ["workers", "health", id] as const
};

const INSTANCES_REFETCH_INTERVAL_MS = 10_000;
/** Poll a booting worker's readiness this often until it answers. */
const HEALTH_REFETCH_INTERVAL_MS = 4_000;
const EMPTY_PROFILES: WorkerProfile[] = [];
const EMPTY_INSTANCES: WorkerInstance[] = [];

/**
 * Poll a worker's readiness while it is `running` but not yet attached. The
 * backend opens a transient bridge to the worker (the same handshake attach
 * uses), so `healthy` means the worker is genuinely serving — safe to attach.
 * Pass `enabled: false` to pause polling (e.g. once attached or stopped).
 */
export const useWorkerHealth = (
  id: string,
  enabled: boolean
): UseQueryResult<WorkerHealth, Error> =>
  useQuery<WorkerHealth, Error>({
    queryKey: workerQueryKeys.health(id),
    queryFn: () =>
      trpcClient.worker.health.query({ id }) as Promise<WorkerHealth>,
    enabled,
    refetchInterval: enabled ? HEALTH_REFETCH_INTERVAL_MS : false,
    refetchOnWindowFocus: false,
    // A failed probe (worker still booting) is an expected state, not an error
    // to surface — keep retrying on the interval.
    retry: false
  });

export interface UseWorkersResult {
  profiles: WorkerProfile[];
  instances: WorkerInstance[];
  /** The instance the local NodeTool instance has attached to, if any. */
  activeWorker: WorkerInstance | null;
  profilesQuery: UseQueryResult<WorkerProfile[], Error>;
  instancesQuery: UseQueryResult<WorkerInstance[], Error>;
  /**
   * Whether each provider's API key is available (secret store OR env), the
   * same resolution provisioning uses. `undefined` while loading.
   */
  apiKeyStatus: Record<WorkerTarget, boolean> | undefined;
  createProfile: (input: CreateWorkerProfileInput) => Promise<WorkerProfile>;
  deleteProfile: (name: string) => Promise<void>;
  provision: (profileName: string) => Promise<WorkerInstance>;
  stop: (id: string) => Promise<WorkerInstance>;
  resume: (id: string) => Promise<WorkerInstance>;
  terminate: (id: string) => Promise<WorkerInstance>;
  stopAll: () => Promise<void>;
  attach: (id: string) => Promise<WorkerConnection>;
  detach: () => Promise<void>;
  reconcile: () => Promise<ReconcileSummary>;
}

export const useWorkers = (): UseWorkersResult => {
  const queryClient = useQueryClient();

  const profilesQuery = useQuery<WorkerProfile[], Error>({
    queryKey: workerQueryKeys.profiles,
    queryFn: () =>
      trpcClient.worker.profiles.list.query() as Promise<WorkerProfile[]>
  });

  const instancesQuery = useQuery<WorkerInstance[], Error>({
    queryKey: workerQueryKeys.instances,
    queryFn: () =>
      trpcClient.worker.instances.list.query() as Promise<WorkerInstance[]>,
    refetchInterval: INSTANCES_REFETCH_INTERVAL_MS
  });

  const apiKeyStatusQuery = useQuery<Record<WorkerTarget, boolean>, Error>({
    queryKey: workerQueryKeys.apiKeyStatus,
    queryFn: () =>
      trpcClient.worker.apiKeyStatus.query() as Promise<
        Record<WorkerTarget, boolean>
      >
  });

  const invalidateInstances = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: workerQueryKeys.instances
      }),
    [queryClient]
  );

  const invalidateProfiles = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: workerQueryKeys.profiles
      }),
    [queryClient]
  );

  const createProfile = useCallback(
    async (input: CreateWorkerProfileInput) => {
      const profile = (await trpcClient.worker.profiles.create.mutate(
        input
      )) as WorkerProfile;
      await invalidateProfiles();
      return profile;
    },
    [invalidateProfiles]
  );

  const deleteProfile = useCallback(
    async (name: string) => {
      await trpcClient.worker.profiles.delete.mutate({ name });
      await invalidateProfiles();
    },
    [invalidateProfiles]
  );

  const provision = useCallback(
    async (profileName: string) => {
      const instance = (await trpcClient.worker.provision.mutate({
        profileName
      })) as WorkerInstance;
      await invalidateInstances();
      return instance;
    },
    [invalidateInstances]
  );

  const stop = useCallback(
    async (id: string) => {
      const instance = (await trpcClient.worker.stop.mutate({
        id
      })) as WorkerInstance;
      await invalidateInstances();
      return instance;
    },
    [invalidateInstances]
  );

  const resume = useCallback(
    async (id: string) => {
      const instance = (await trpcClient.worker.resume.mutate({
        id
      })) as WorkerInstance;
      await invalidateInstances();
      return instance;
    },
    [invalidateInstances]
  );

  const terminate = useCallback(
    async (id: string) => {
      const instance = (await trpcClient.worker.terminate.mutate({
        id
      })) as WorkerInstance;
      await invalidateInstances();
      return instance;
    },
    [invalidateInstances]
  );

  const stopAll = useCallback(async () => {
    await trpcClient.worker.stopAll.mutate();
    await invalidateInstances();
  }, [invalidateInstances]);

  const attach = useCallback(
    async (id: string) => {
      const connection = (await trpcClient.worker.attach.mutate({
        id
      })) as WorkerConnection;
      await invalidateInstances();
      return connection;
    },
    [invalidateInstances]
  );

  const detach = useCallback(async () => {
    await trpcClient.worker.detach.mutate();
    await invalidateInstances();
  }, [invalidateInstances]);

  const reconcile = useCallback(async () => {
    const summary =
      (await trpcClient.worker.reconcile.mutate()) as ReconcileSummary;
    await invalidateInstances();
    return summary;
  }, [invalidateInstances]);

  const instances = instancesQuery.data ?? EMPTY_INSTANCES;
  const activeWorker =
    instances.find((instance) => instance.status === "attached") ?? null;

  return {
    profiles: profilesQuery.data ?? EMPTY_PROFILES,
    instances,
    activeWorker,
    profilesQuery,
    instancesQuery,
    apiKeyStatus: apiKeyStatusQuery.data,
    createProfile,
    deleteProfile,
    provision,
    stop,
    resume,
    terminate,
    stopAll,
    attach,
    detach,
    reconcile
  };
};
