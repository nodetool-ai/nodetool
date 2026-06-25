/**
 * PythonPackagesSection — the registry-installer block of the Node Packs tab.
 *
 * Lists the Python node packs offered by the nodetool registry, merged with
 * what's installed, and drives install / update / uninstall through the Electron
 * `window.api.packages` IPC, streaming the uv/pip console live. Registry
 * install is desktop-only, so in the browser this renders a notice.
 */
import { memo, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  AlertBanner,
  BORDER_RADIUS,
  Chip,
  Divider,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text
} from "../ui_primitives";
import ConsolePanel from "./ConsolePanel";
import useNodePacksStore, {
  type InstalledPackage,
  type PackageInfo
} from "../../stores/NodePacksStore";

/** A registry pack joined with its installed record (if any). */
interface MergedPack {
  repoId: string;
  name: string;
  description: string;
  installed?: InstalledPackage;
}

/**
 * Join the registry list with the installed list by repo_id. Installed-only
 * packs (no longer in the registry) still surface so they can be uninstalled.
 */
function mergePacks(
  available: PackageInfo[],
  installed: InstalledPackage[]
): MergedPack[] {
  const byRepo = new Map<string, MergedPack>();
  for (const pack of available) {
    byRepo.set(pack.repo_id, {
      repoId: pack.repo_id,
      name: pack.name,
      description: pack.description
    });
  }
  for (const pack of installed) {
    const existing = byRepo.get(pack.repo_id);
    if (existing) {
      existing.installed = pack;
    } else {
      byRepo.set(pack.repo_id, {
        repoId: pack.repo_id,
        name: pack.name,
        description: pack.description,
        installed: pack
      });
    }
  }
  return [...byRepo.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const PythonPackagesSection = () => {
  const {
    available,
    availablePacks,
    installed,
    busyIds,
    consoleLines,
    isLoading,
    error,
    refresh,
    install,
    uninstall,
    update,
    subscribeConsole,
    unsubscribeConsole,
    clearConsole
  } = useNodePacksStore(
    useShallow((s) => ({
      available: s.available,
      availablePacks: s.availablePacks,
      installed: s.installed,
      busyIds: s.busyIds,
      consoleLines: s.consoleLines,
      isLoading: s.isLoading,
      error: s.error,
      refresh: s.refresh,
      install: s.install,
      uninstall: s.uninstall,
      update: s.update,
      subscribeConsole: s.subscribeConsole,
      unsubscribeConsole: s.unsubscribeConsole,
      clearConsole: s.clearConsole
    }))
  );

  useEffect(() => {
    if (!available) return;
    void refresh();
    subscribeConsole();
    return () => unsubscribeConsole();
  }, [available, refresh, subscribeConsole, unsubscribeConsole]);

  const packs = useMemo(
    () => mergePacks(availablePacks, installed),
    [availablePacks, installed]
  );

  if (!available) {
    return (
      <AlertBanner severity="info">
        Installing node packs runs in the NodeTool desktop app. Open the desktop
        app to install, update, and remove Python node packs.
      </AlertBanner>
    );
  }

  return (
    <FlexColumn gap={1.5}>
      <FlexColumn gap={0.5}>
        <Text size="normal" weight={600}>
          Python node packs
        </Text>
        <Text size="small" color="secondary">
          Install node packs from the registry. The server restarts to load or
          unload nodes after a change.
        </Text>
      </FlexColumn>

      {error && (
        <AlertBanner severity="error" compact>
          {error}
        </AlertBanner>
      )}

      <FlexColumn gap={1}>
        {packs.map((pack) => {
          const busy = busyIds.includes(pack.repoId);
          const installedPack = pack.installed;
          const hasUpdate = Boolean(installedPack?.hasUpdate);
          return (
            <FlexRow
              key={pack.repoId}
              gap={1.5}
              align="center"
              justify="space-between"
              sx={{
                p: 1.5,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: BORDER_RADIUS.xs
              }}
            >
              <FlexColumn gap={0.25} sx={{ minWidth: 0, flex: 1 }}>
                <FlexRow gap={1} align="center" sx={{ flexWrap: "wrap" }}>
                  <Text size="normal" weight={600} truncate>
                    {pack.name}
                  </Text>
                  {installedPack && !hasUpdate && (
                    <Chip label="Installed" color="success" compact />
                  )}
                  {hasUpdate && (
                    <Chip label="Update available" color="warning" compact />
                  )}
                  {installedPack && (
                    <Text size="small" color="secondary" family="secondary">
                      v{installedPack.version}
                      {hasUpdate && installedPack.latestVersion
                        ? ` → v${installedPack.latestVersion}`
                        : ""}
                    </Text>
                  )}
                </FlexRow>
                <Text size="small" color="secondary">
                  {pack.description}
                </Text>
              </FlexColumn>
              <FlexRow gap={1} align="center">
                {hasUpdate && (
                  <EditorButton
                    variant="contained"
                    density="compact"
                    disabled={busy}
                    onClick={() => void update(pack.repoId)}
                  >
                    {busy ? "Working…" : "Update"}
                  </EditorButton>
                )}
                {installedPack ? (
                  <EditorButton
                    variant="outlined"
                    density="compact"
                    disabled={busy}
                    onClick={() => void uninstall(pack.repoId)}
                  >
                    {busy ? "Working…" : "Uninstall"}
                  </EditorButton>
                ) : (
                  <EditorButton
                    variant="contained"
                    density="compact"
                    disabled={busy}
                    onClick={() => void install(pack.repoId)}
                  >
                    {busy ? "Installing…" : "Install"}
                  </EditorButton>
                )}
              </FlexRow>
            </FlexRow>
          );
        })}
        {packs.length === 0 && !isLoading && (
          <Text size="small" color="secondary">
            No node packs available.
          </Text>
        )}
      </FlexColumn>

      <Divider />

      <ConsolePanel lines={consoleLines} onClear={clearConsole} />
    </FlexColumn>
  );
};

export default memo(PythonPackagesSection);
