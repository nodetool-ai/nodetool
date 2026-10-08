/**
 * usePackageManager — the data model behind the two-pane Package Manager.
 *
 * Subscribes to the four package stores (runtimes, builtin packs, Python
 * packs, third-party packs), runs their fetch/console effects, and derives the
 * view model the UI renders: left-rail categories with counts, right-pane
 * title/subtitle/count, the status filter, and the filtered row list.
 */
import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import usePacksStore from "../../stores/PacksStore";
import useRuntimePackagesStore from "../../stores/RuntimePackagesStore";
import useNodePacksStore, {
  type InstalledPackage,
  type PackageInfo
} from "../../stores/NodePacksStore";
import useOptionalNodePacksStore from "../../stores/OptionalNodePacksStore";
import { OPTIONAL_NODE_PACKS } from "../../config/optionalNodePacks";
import { getRequiredKeyForBuiltinPack } from "../../utils/providerPacks";

/** The rail entries. Each one is a list in the right pane. */
export type PMCategory = "included" | "python" | "thirdparty" | "runtimes";

export const PM_CATEGORIES: readonly PMCategory[] = [
  "included",
  "python",
  "thirdparty",
  "runtimes"
];

/**
 * One status filter for every list. "installed" also matches a package with
 * an update, so a filter never hides a package the user has.
 */
export type PMFilter = "all" | "installed" | "available";

/** Curated display group for each runtime id (the store has no group field). */
type RuntimeGroup = "language" | "media" | "ai";
const RUNTIME_GROUP: Record<string, RuntimeGroup> = {
  python: "language",
  nodejs: "language",
  ffmpeg: "media",
  pandoc: "media",
  pdftotext: "media",
  "yt-dlp": "media",
  "transformers-js": "ai",
  "tensorflow-js": "ai",
  "node-llama-cpp": "ai",
  "whisper-cpp": "ai",
  "tesseract-ocr": "ai",
  playwright: "media"
};
const runtimeGroup = (id: string): RuntimeGroup => RUNTIME_GROUP[id] ?? "media";
const RUNTIME_GROUP_ORDER: RuntimeGroup[] = ["language", "media", "ai"];
const RUNTIME_GROUP_LABEL: Record<RuntimeGroup, string> = {
  language: "Languages",
  media: "Media & documents",
  ai: "AI runtimes"
};

/** Prefix marking an optional-node-pack (menu visibility) row id, to keep it
 *  distinct from builtin pack ids. */
const OPTIONAL_PREFIX = "optional:";

const LABELS: Record<PMCategory, string> = {
  included: "Included",
  python: "Python packs",
  thirdparty: "Third-party",
  runtimes: "Software"
};

const TITLES: Record<PMCategory, string> = {
  included: "Included packs",
  python: "Python packs",
  thirdparty: "Third-party packs",
  runtimes: "Software"
};

const SUBTITLES: Record<PMCategory, string> = {
  included:
    "Packs that ship with NodeTool. Turn a pack off to hide its nodes. A pack toggle takes effect after the server restarts. Provider nodes appear when you add their API key.",
  python:
    "Node packs from PyPI that run in the Python worker. The server restarts after you install, update or uninstall a pack.",
  thirdparty:
    "Third-party packs run in-process as the server user. Only trust packs you know.",
  runtimes:
    "Interpreters and tools NodeTool installs into your environment. Each runtime powers its own node types."
};

/** Filter labels per list. Included packs are switched, not installed. */
const FILTER_LABELS: Record<"switch" | "install", Record<PMFilter, string>> = {
  switch: { all: "All", installed: "On", available: "Off" },
  install: { all: "All", installed: "Installed", available: "Not installed" }
};

export interface PMCount {
  id: string;
  label: string;
  count: number;
}

export interface PMRow {
  key: string;
  /** Heading of the group the row belongs to, for lists shown in groups. */
  group?: string;
  name: string;
  desc: string;
  version?: string;
  badge: "alwaysOn" | "installed" | "update" | "notInstalled" | null;
  toggle?: {
    enabled: boolean;
    label: string;
    disabled: boolean;
    onChange: (next: boolean) => void;
  };
  buttons?: {
    install: boolean;
    update: boolean;
    uninstall: boolean;
    busy: boolean;
    onInstall: () => void;
    onUpdate: () => void;
    onUninstall: () => void;
  };
}

interface PackageManagerModel {
  isSoftware: boolean;
  isThirdParty: boolean;
  categories: PMCount[];
  title: string;
  subtitle: string;
  count: number;
  /** Status filter options for the active list; `[]` when not applicable. */
  filters: { id: PMFilter; label: string; count: number }[];
  rows: PMRow[];
  installLocation: string | null;
  onChangeLocation: () => void;
  /** Desktop-only notice when the active install surface needs Electron. */
  notice: string | null;
  error: string | null;
  console: { lines: string[]; onClear: () => void; busy: boolean } | null;
  thirdPartyCount: number;
  /** Bulk "update everything with an upgrade" action for the Python packs;
   *  `null` when it doesn't apply (another list, or nothing to update). */
  bulkUpdate: { count: number; busy: boolean; onUpdateAll: () => void } | null;
}

/** Join the catalog with installed records by repo_id. */
function mergePython(available: PackageInfo[], installed: InstalledPackage[]) {
  const byRepo = new Map<
    string,
    {
      repoId: string;
      name: string;
      description: string;
      installed?: InstalledPackage;
    }
  >();
  for (const pack of available) {
    byRepo.set(pack.repo_id, {
      repoId: pack.repo_id,
      name: pack.name,
      description: pack.description
    });
  }
  for (const pack of installed) {
    const existing = byRepo.get(pack.repo_id);
    if (existing) existing.installed = pack;
    else
      byRepo.set(pack.repo_id, {
        repoId: pack.repo_id,
        name: pack.name,
        description: pack.description,
        installed: pack
      });
  }
  return [...byRepo.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function usePackageManager(params: {
  cat: PMCategory;
  q: string;
  filter: PMFilter;
}): PackageManagerModel {
  const { cat, q, filter } = params;

  const {
    builtins,
    fetchBuiltins,
    setBuiltinEnabled,
    thirdPartyPacks,
    fetchThirdParty,
    builtinsError
  } = usePacksStore(
    useShallow((s) => ({
      builtins: s.builtins,
      fetchBuiltins: s.fetchBuiltins,
      setBuiltinEnabled: s.setBuiltinEnabled,
      thirdPartyPacks: s.packs,
      fetchThirdParty: s.fetch,
      builtinsError: s.error
    }))
  );

  const { optionalEnabledIds, setOptionalEnabled } = useOptionalNodePacksStore(
    useShallow((s) => ({
      optionalEnabledIds: s.enabledPackIds,
      setOptionalEnabled: s.setPackEnabled
    }))
  );

  const {
    rtAvailable,
    statuses,
    installLocation,
    rtBusy,
    rtConsole,
    rtRefresh,
    rtInstall,
    rtUninstall,
    rtUpdate,
    selectInstallLocation,
    rtSubscribe,
    rtUnsubscribe,
    rtClear,
    rtError
  } = useRuntimePackagesStore(
    useShallow((s) => ({
      rtAvailable: s.available,
      statuses: s.statuses,
      installLocation: s.installLocation,
      rtBusy: s.busyIds,
      rtConsole: s.consoleLines,
      rtRefresh: s.refresh,
      rtInstall: s.install,
      rtUninstall: s.uninstall,
      rtUpdate: s.update,
      selectInstallLocation: s.selectInstallLocation,
      rtSubscribe: s.subscribeConsole,
      rtUnsubscribe: s.unsubscribeConsole,
      rtClear: s.clearConsole,
      rtError: s.error
    }))
  );

  const {
    pyAvailable,
    availablePacks,
    installed,
    pyBusy,
    pyConsole,
    pyRefresh,
    pyInstall,
    pyUninstall,
    pyUpdate,
    pyUpdateAll,
    pySubscribe,
    pyUnsubscribe,
    pyClear,
    pyError
  } = useNodePacksStore(
    useShallow((s) => ({
      pyAvailable: s.available,
      availablePacks: s.availablePacks,
      installed: s.installed,
      pyBusy: s.busyIds,
      pyConsole: s.consoleLines,
      pyRefresh: s.refresh,
      pyInstall: s.install,
      pyUninstall: s.uninstall,
      pyUpdate: s.update,
      pyUpdateAll: s.updateAll,
      pySubscribe: s.subscribeConsole,
      pyUnsubscribe: s.unsubscribeConsole,
      pyClear: s.clearConsole,
      pyError: s.error
    }))
  );

  useEffect(() => {
    void fetchBuiltins();
  }, [fetchBuiltins]);
  useEffect(() => {
    void fetchThirdParty();
  }, [fetchThirdParty]);
  useEffect(() => {
    // Refresh in the browser too: the server reports what is on its PATH, so
    // the list shows real status even where installing needs the desktop app.
    void rtRefresh();
    if (!rtAvailable) return;
    rtSubscribe();
    return () => rtUnsubscribe();
  }, [rtAvailable, rtRefresh, rtSubscribe, rtUnsubscribe]);
  useEffect(() => {
    if (!pyAvailable) return;
    void pyRefresh();
    pySubscribe();
    return () => pyUnsubscribe();
  }, [pyAvailable, pyRefresh, pySubscribe, pyUnsubscribe]);

  const pythonPacks = useMemo(
    () => mergePython(availablePacks, installed),
    [availablePacks, installed]
  );

  return useMemo<PackageManagerModel>(() => {
    const query = q.trim().toLowerCase();
    const isSoftware = cat === "runtimes";
    const isThirdParty = cat === "thirdparty";

    // The "Included" list mirrors the node menu: the always-on core pack plus
    // keyless local packs (Transformers.js, Hugging Face) keep a manual toggle;
    // key-gated provider packs are hidden (their nodes come on with the API
    // key). The optional node-pack categories — which declutter the node menu —
    // are toggled here too.
    const includedItems: {
      id: string;
      name: string;
      description: string;
      enabled: boolean;
      required: boolean;
      onToggle: (next: boolean) => void;
    }[] = [];
    for (const pack of builtins) {
      if (pack.required) {
        includedItems.push({
          id: pack.id,
          name: pack.name,
          description: pack.description,
          enabled: pack.enabled,
          required: true,
          onToggle: () => {}
        });
      } else if (getRequiredKeyForBuiltinPack(pack.id) === null) {
        includedItems.push({
          id: pack.id,
          name: pack.name,
          description: pack.description,
          enabled: pack.enabled,
          required: false,
          onToggle: (next) => void setBuiltinEnabled(pack.id, next)
        });
      }
    }
    for (const pack of OPTIONAL_NODE_PACKS) {
      includedItems.push({
        id: `${OPTIONAL_PREFIX}${pack.id}`,
        name: pack.label,
        description: pack.description,
        enabled: optionalEnabledIds.includes(pack.id),
        required: false,
        onToggle: (next) => setOptionalEnabled(pack.id, next)
      });
    }

    const categoryCounts: Record<PMCategory, number> = {
      included: includedItems.length,
      python: pythonPacks.length,
      thirdparty: thirdPartyPacks.length,
      runtimes: statuses.length
    };
    const categories: PMCount[] = PM_CATEGORIES.map((id) => ({
      id,
      label: LABELS[id],
      count: categoryCounts[id]
    }));

    let rows: PMRow[] = [];
    let baseCount = 0;
    const filters: PackageManagerModel["filters"] = [];
    const matchesQuery = (text: string) =>
      !query || text.toLowerCase().includes(query);

    /** Count each filter option over `list`, then keep the active option. */
    const applyFilter = <T>(
      list: T[],
      kind: "switch" | "install",
      isOn: (item: T) => boolean
    ): T[] => {
      const on = list.filter(isOn);
      const labels = FILTER_LABELS[kind];
      filters.push(
        { id: "all", label: labels.all, count: list.length },
        { id: "installed", label: labels.installed, count: on.length },
        {
          id: "available",
          label: labels.available,
          count: list.length - on.length
        }
      );
      if (filter === "installed") return on;
      if (filter === "available") return list.filter((item) => !isOn(item));
      return list;
    };

    if (isSoftware) {
      baseCount = statuses.length;
      const searched = statuses.filter((p) =>
        matchesQuery(p.name + " " + p.description)
      );
      const filtered = applyFilter(searched, "install", (p) => p.installed);
      // Show the runtimes in groups: languages, then media, then AI.
      const ordered = RUNTIME_GROUP_ORDER.flatMap((group) =>
        filtered.filter((p) => runtimeGroup(p.id) === group)
      );
      rows = ordered.map((rt) => {
        const busy = rtBusy.includes(rt.id) || rt.installing;
        const hasUpdate = rt.installed && Boolean(rt.updateAvailable);
        const row: PMRow = {
          key: rt.id,
          group: RUNTIME_GROUP_LABEL[runtimeGroup(rt.id)],
          name: rt.name,
          desc: rt.description,
          badge: hasUpdate
            ? "update"
            : rt.installed
              ? "installed"
              : "notInstalled"
        };
        if (hasUpdate) {
          row.version = `v${rt.installedVersion}  →  v${rt.latestVersion}`;
        } else if (rt.installed && rt.installedVersion) {
          row.version = `v${rt.installedVersion}`;
        }
        // Installing runs through the desktop app; in the browser the row is
        // status-only.
        if (rtAvailable) {
          row.buttons = {
            install: !rt.installed,
            update: hasUpdate,
            uninstall: rt.installed,
            busy,
            onInstall: () => void rtInstall(rt.id),
            onUpdate: () => void rtUpdate(rt.id),
            onUninstall: () => void rtUninstall(rt.id)
          };
        }
        return row;
      });
    } else if (cat === "included") {
      baseCount = includedItems.length;
      const searched = includedItems.filter((p) =>
        matchesQuery(p.name + " " + p.description)
      );
      const filtered = applyFilter(searched, "switch", (p) => p.enabled);
      rows = filtered.map((item) => ({
        key: item.id,
        name: item.name,
        desc: item.description,
        badge: item.required ? "alwaysOn" : null,
        toggle: {
          enabled: item.enabled,
          label: item.enabled ? "Enabled" : "Disabled",
          disabled: item.required,
          onChange: item.onToggle
        }
      }));
    } else if (cat === "python") {
      baseCount = pythonPacks.length;
      const searched = pythonPacks.filter((p) =>
        matchesQuery(p.name + " " + p.description)
      );
      const filtered = applyFilter(searched, "install", (p) =>
        Boolean(p.installed)
      );
      rows = filtered.map((pack) => {
        const inst = pack.installed;
        const hasUpdate = Boolean(inst?.hasUpdate);
        const busy = pyBusy.includes(pack.repoId);
        const version = hasUpdate
          ? `v${inst?.version}  →  v${inst?.latestVersion}`
          : inst
            ? `v${inst.version}`
            : undefined;
        return {
          key: pack.repoId,
          name: pack.name,
          desc: pack.description,
          version,
          badge: hasUpdate ? "update" : inst ? "installed" : null,
          buttons: {
            install: !inst,
            update: hasUpdate,
            uninstall: Boolean(inst),
            busy,
            onInstall: () => void pyInstall(pack.repoId),
            onUpdate: () => void pyUpdate(pack.repoId),
            onUninstall: () => void pyUninstall(pack.repoId)
          }
        };
      });
    } else {
      baseCount = thirdPartyPacks.length;
    }

    const notice =
      isSoftware && !rtAvailable
        ? "Software installation runs in the NodeTool desktop app. Open the desktop app to install Python, FFmpeg, and other runtimes."
        : cat === "python" && !pyAvailable
          ? "Installing node packs runs in the NodeTool desktop app. Open the desktop app to install, update, and remove Python node packs."
          : null;

    const consoleModel = isSoftware
      ? rtAvailable
        ? {
            lines: rtConsole,
            onClear: rtClear,
            busy: rtBusy.length > 0 || statuses.some((s) => s.installing)
          }
        : null
      : cat === "python"
        ? pyAvailable
          ? { lines: pyConsole, onClear: pyClear, busy: pyBusy.length > 0 }
          : null
        : null;

    const updatableCount =
      cat === "python"
        ? pythonPacks.filter((p) => p.installed?.hasUpdate).length
        : 0;
    const bulkUpdate =
      cat === "python" && pyAvailable && updatableCount > 0
        ? {
            count: updatableCount,
            busy: pyBusy.length > 0,
            onUpdateAll: () => void pyUpdateAll()
          }
        : null;

    return {
      isSoftware,
      isThirdParty,
      categories,
      title: TITLES[cat],
      subtitle: SUBTITLES[cat],
      count: baseCount,
      filters: notice ? [] : filters,
      rows,
      installLocation,
      onChangeLocation: () => void selectInstallLocation(),
      notice,
      error: isSoftware ? rtError : cat === "python" ? pyError : builtinsError,
      console: consoleModel,
      thirdPartyCount: thirdPartyPacks.length,
      bulkUpdate
    };
  }, [
    cat,
    q,
    filter,
    statuses,
    builtins,
    optionalEnabledIds,
    setOptionalEnabled,
    pythonPacks,
    thirdPartyPacks,
    rtBusy,
    pyBusy,
    rtAvailable,
    pyAvailable,
    rtConsole,
    pyConsole,
    installLocation,
    rtError,
    pyError,
    builtinsError,
    setBuiltinEnabled,
    rtInstall,
    rtUninstall,
    rtUpdate,
    pyInstall,
    pyUpdate,
    pyUpdateAll,
    pyUninstall,
    selectInstallLocation,
    rtClear,
    pyClear
  ]);
}
