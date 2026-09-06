import {
  useQuery,
  useQueryClient,
  type UseQueryResult
} from "@tanstack/react-query";
import { useCallback } from "react";
import { trpcClient, type RouterOutputs } from "../trpc/client";

/**
 * GPU-worker provisioning surface for the UI. Wraps the `worker` tRPC router
 * (`packages/websocket`) in TanStack Query: declarative profiles plus the live,
 * billing-sensitive instance registry, with mutations that re-fetch the
 * affected query after every lifecycle action so the panel stays current.
 */

export type WorkerTarget = "runpod" | "vast";
export type TokenPolicy = "generate" | "fixed";
type WorkerStatus =
  | "provisioning"
  | "running"
  | "attached"
  | "stopping"
  // Paused: compute released, volume + model cache retained. Resumable.
  | "stopped"
  // Destroyed: pod and volume deleted. Not resumable — a tombstone.
  | "terminated"
  | "error";

// Derived from the router so a server schema change breaks the build here.
// Only the columns the DB stores as a bare `string` are re-declared, narrowed
// to the unions the UI switches on.
export interface WorkerProfile
  extends Omit<
    RouterOutputs["worker"]["profiles"]["list"][number],
    "target" | "token_policy"
  > {
  target: WorkerTarget;
  token_policy: TokenPolicy;
}

export interface WorkerInstance
  extends Omit<
    RouterOutputs["worker"]["instances"]["list"][number],
    "target" | "status"
  > {
  target: WorkerTarget;
  status: WorkerStatus;
}

/** Machine sizing a worker profile asks its target for. */
export type WorkerSpec = {
  /** Provider GPU id (RunPod), when the profile asks for a GPU machine. */
  gpu?: string;
  /** vCPU count, for a CPU-only machine. */
  vcpu?: number;
  /** Container disk size in GB. */
  disk?: number;
};

export interface CreateWorkerProfileInput {
  name: string;
  target: WorkerTarget;
  image: string;
  spec?: WorkerSpec;
  token_policy: TokenPolicy;
  idle_timeout_minutes?: number | null;
  max_lifetime_minutes?: number | null;
}

type WorkerConnection = RouterOutputs["worker"]["attach"];

/** Readiness of a `running` worker, from the backend health probe. */
export type WorkerHealth = RouterOutputs["worker"]["health"];

type ReconcileSummary = RouterOutputs["worker"]["reconcile"];

/** Hierarchical query keys so a single action can target the right cache. */
const workerQueryKeys = {
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
    queryFn: () => trpcClient.worker.health.query({ id }),
    enabled,
    refetchInterval: enabled ? HEALTH_REFETCH_INTERVAL_MS : false,
    refetchOnWindowFocus: false,
    // A failed probe (worker still booting) is an expected state, not an error
    // to surface — keep retrying on the interval.
    retry: false
  });

const instancesQueryOptions = {
  queryKey: workerQueryKeys.instances,
  queryFn: () =>
    trpcClient.worker.instances.list.query() as Promise<WorkerInstance[]>,
  refetchInterval: INSTANCES_REFETCH_INTERVAL_MS
};

const findAttached = (instances: WorkerInstance[]): WorkerInstance | null =>
  instances.find((instance) => instance.status === "attached") ?? null;

/**
 * The instance this NodeTool is attached to, or null. Mounts only the instance
 * registry query — callers that just need the active worker should use this
 * rather than `useWorkers`, which also mounts the profile and API-key queries
 * and builds the eleven lifecycle mutations.
 */
export const useActiveWorker = (): WorkerInstance | null => {
  const { data } = useQuery<WorkerInstance[], Error>(instancesQueryOptions);
  return findAttached(data ?? EMPTY_INSTANCES);
};

interface UseWorkersResult {
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

  const instancesQuery = useQuery<WorkerInstance[], Error>(
    instancesQueryOptions
  );

  const apiKeyStatusQuery = useQuery<Record<WorkerTarget, boolean>, Error>({
    queryKey: workerQueryKeys.apiKeyStatus,
    queryFn: () => trpcClient.worker.apiKeyStatus.query()
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
    async (input: CreateWorkerProfileInput): Promise<WorkerProfile> => {
      const profile = await trpcClient.worker.profiles.create.mutate(input);
      await invalidateProfiles();
      return profile as WorkerProfile;
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
    async (profileName: string): Promise<WorkerInstance> => {
      const instance = await trpcClient.worker.provision.mutate({
        profileName
      });
      await invalidateInstances();
      return instance as WorkerInstance;
    },
    [invalidateInstances]
  );

  const stop = useCallback(
    async (id: string): Promise<WorkerInstance> => {
      const instance = await trpcClient.worker.stop.mutate({ id });
      await invalidateInstances();
      return instance as WorkerInstance;
    },
    [invalidateInstances]
  );

  const resume = useCallback(
    async (id: string): Promise<WorkerInstance> => {
      const instance = await trpcClient.worker.resume.mutate({ id });
      await invalidateInstances();
      return instance as WorkerInstance;
    },
    [invalidateInstances]
  );

  const terminate = useCallback(
    async (id: string): Promise<WorkerInstance> => {
      const instance = await trpcClient.worker.terminate.mutate({ id });
      await invalidateInstances();
      return instance as WorkerInstance;
    },
    [invalidateInstances]
  );

  const stopAll = useCallback(async () => {
    await trpcClient.worker.stopAll.mutate();
    await invalidateInstances();
  }, [invalidateInstances]);

  const attach = useCallback(
    async (id: string): Promise<WorkerConnection> => {
      const connection = await trpcClient.worker.attach.mutate({ id });
      await invalidateInstances();
      return connection;
    },
    [invalidateInstances]
  );

  const detach = useCallback(async () => {
    await trpcClient.worker.detach.mutate();
    await invalidateInstances();
  }, [invalidateInstances]);

  const reconcile = useCallback(async (): Promise<ReconcileSummary> => {
    const summary = await trpcClient.worker.reconcile.mutate();
    await invalidateInstances();
    return summary;
  }, [invalidateInstances]);

  const instances = instancesQuery.data ?? EMPTY_INSTANCES;
  const activeWorker = findAttached(instances);

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
