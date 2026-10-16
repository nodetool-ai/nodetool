import { useCallback, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LOCAL_PROVIDERS,
  type LocalProviderSpec
} from "@nodetool-ai/protocol";

import useRuntimePackagesStore from "../stores/RuntimePackagesStore";
import useNodePacksStore from "../stores/NodePacksStore";

export type LocalInstallStatus = "installed" | "missing" | "installing";

export interface LocalProviderInstallInfo {
  spec: LocalProviderSpec;
  status: LocalInstallStatus;
  /** Install the provider's package, then reload providers and models. */
  install: () => Promise<boolean>;
}

/** The query keys that list providers and their models. */
const isProviderOrModelQuery = (key: readonly unknown[]): boolean => {
  const head = key[0];
  return (
    typeof head === "string" &&
    (head === "providers" || head.endsWith("-models") || head.endsWith("_models"))
  );
};

const platform = (): string | undefined =>
  typeof window !== "undefined" ? window.api?.platform : undefined;

/**
 * The install state of each local provider on this desktop, keyed by
 * provider id. Empty in the browser, where nothing can be installed.
 */
export const useLocalProviderInstalls = (): Map<string, LocalProviderInstallInfo> => {
  const queryClient = useQueryClient();
  const runtimeAvailable = useRuntimePackagesStore((s) => s.available);
  const runtimeStatuses = useRuntimePackagesStore((s) => s.statuses);
  const runtimeBusy = useRuntimePackagesStore((s) => s.busyIds);
  const refreshRuntimes = useRuntimePackagesStore((s) => s.refresh);
  const installRuntime = useRuntimePackagesStore((s) => s.install);
  const packsAvailable = useNodePacksStore((s) => s.available);
  const availablePacks = useNodePacksStore((s) => s.availablePacks);
  const installedPacks = useNodePacksStore((s) => s.installed);
  const packsBusy = useNodePacksStore((s) => s.busyIds);
  const refreshPacks = useNodePacksStore((s) => s.refresh);
  const installPack = useNodePacksStore((s) => s.install);

  // Statuses load once per session; the Package Manager refreshes them too.
  useEffect(() => {
    if (runtimeAvailable && runtimeStatuses.length === 0) {
      void refreshRuntimes();
    }
  }, [runtimeAvailable, runtimeStatuses.length, refreshRuntimes]);
  useEffect(() => {
    if (packsAvailable && availablePacks.length === 0) {
      void refreshPacks();
    }
  }, [packsAvailable, availablePacks.length, refreshPacks]);

  const reload = useCallback(
    (installed: boolean): boolean => {
      if (installed) {
        void queryClient.invalidateQueries({
          predicate: (query) => isProviderOrModelQuery(query.queryKey)
        });
      }
      return installed;
    },
    [queryClient]
  );

  return useMemo(() => {
    const result = new Map<string, LocalProviderInstallInfo>();
    if (!runtimeAvailable) {
      return result;
    }
    const currentPlatform = platform();
    for (const spec of LOCAL_PROVIDERS) {
      if (spec.platforms && (!currentPlatform || !spec.platforms.includes(currentPlatform))) {
        continue;
      }
      const install = spec.install;
      if (install.kind === "runtime") {
        const status = runtimeStatuses.find((s) => s.id === install.id);
        if (!status) {
          continue;
        }
        result.set(spec.provider, {
          spec,
          status: runtimeBusy.includes(install.id) || status.installing
            ? "installing"
            : status.installed
              ? "installed"
              : "missing",
          install: async () => reload(await installRuntime(install.id))
        });
      } else {
        // The pack catalog leaves out packs this machine cannot run.
        const installed = installedPacks.some((p) => p.repo_id === install.repoId);
        if (!installed && !availablePacks.some((p) => p.repo_id === install.repoId)) {
          continue;
        }
        result.set(spec.provider, {
          spec,
          status: packsBusy.includes(install.repoId)
            ? "installing"
            : installed
              ? "installed"
              : "missing",
          install: async () => reload(await installPack(install.repoId))
        });
      }
    }
    return result;
  }, [
    runtimeAvailable,
    runtimeStatuses,
    runtimeBusy,
    installRuntime,
    availablePacks,
    installedPacks,
    packsBusy,
    installPack,
    reload
  ]);
};
