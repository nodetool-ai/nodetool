/**
 * usePackageManager — the data model behind the two-pane Package Manager.
 *
 * Subscribes to the four package stores (runtimes, builtin packs, registry
 * packs, third-party packs), runs their fetch/console effects, and derives the
 * view model the UI renders: left-rail categories with counts, right-pane
 * title/subtitle/count, status-filter chips, and the filtered row list.
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

export type PMTab = "software" | "packs";

/** Curated display group for each runtime id (the store has no group field). */
const RUNTIME_GROUP: Record<string, "language" | "media" | "ai" | "agent"> = {
  python: "language",
  nodejs: "language",
  bash: "language",
  ruby: "language",
  lua: "language",
  ffmpeg: "media",
  pandoc: "media",
  pdftotext: "media",
  "yt-dlp": "media",
  "transformers-js": "ai",
  "tensorflow-js": "ai",
  "node-llama-cpp": "ai",
  tmux: "agent",
  claude: "agent"
};
const runtimeGroup = (id: string) => RUNTIME_GROUP[id] ?? "media";

/** Prefix marking an optional-node-pack (menu visibility) row id, to keep it
 *  distinct from builtin pack ids. */
const OPTIONAL_PREFIX = "optional:";

const TITLES: Record<string, string> = {
  all: "All runtimes",
  language: "Languages",
  media: "Media & docs",
  ai: "AI runtimes",
  agent: "Agent tools",
  included: "Included packs",
  python: "Registry packs",
  thirdparty: "Third-party packs"
};

const SUBTITLES: Record<string, string> = {
  software:
    "Interpreters and tools NodeTool installs into your environment. Each runtime powers its own node types.",
  included:
    "Reveal advanced and niche node categories, and toggle local packs. Provider nodes appear automatically once you set their API key.",
  python:
    "Install node packs from the registry. The server restarts to load or unload nodes after a change.",
  thirdparty:
    "Third-party packs run in-process as the server user. Only trust packs you know."
};

export interface PMCount {
  id: string;
  label: string;
  count: number;
}

export interface PMRow {
  key: string;
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

export interface PackageManagerModel {
  isSoftware: boolean;
  isThirdParty: boolean;
  categories: PMCount[];
  title: string;
  subtitle: string;
  count: number;
  /** Status-filter chips for the active list; `[]` when not applicable. */
  chips: PMCount[];
  rows: PMRow[];
  installLocation: string | null;
  onChangeLocation: () => void;
  /** Desktop-only notice when the active install surface needs Electron. */
  notice: string | null;
  error: string | null;
  console: { lines: string[]; onClear: () => void; busy: boolean } | null;
  thirdPartyCount: number;
}

/** Join the registry list with installed records by repo_id (see registry tab). */
function mergePython(available: PackageInfo[], installed: InstalledPackage[]) {
  const byRepo = new Map<
    string,
    { repoId: string; name: string; description: string; installed?: InstalledPackage }
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
  tab: PMTab;
  cat: string;
  q: string;
  filter: string;
}): PackageManagerModel {
  const { tab, cat, q, filter } = params;

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
    if (!rtAvailable) return;
    void rtRefresh();
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
    const isSoftware = tab === "software";
    const isThirdParty = tab === "packs" && cat === "thirdparty";

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

    const categories: PMCount[] = isSoftware
      ? [
          { id: "all", label: "All runtimes", count: statuses.length },
          {
            id: "language",
            label: "Languages",
            count: statuses.filter((p) => runtimeGroup(p.id) === "language").length
          },
          {
            id: "media",
            label: "Media & docs",
            count: statuses.filter((p) => runtimeGroup(p.id) === "media").length
          },
          {
            id: "ai",
            label: "AI runtimes",
            count: statuses.filter((p) => runtimeGroup(p.id) === "ai").length
          },
          {
            id: "agent",
            label: "Agent tools",
            count: statuses.filter((p) => runtimeGroup(p.id) === "agent").length
          }
        ]
      : [
          { id: "included", label: "Included", count: includedItems.length },
          { id: "python", label: "Registry", count: pythonPacks.length },
          { id: "thirdparty", label: "Third-party", count: thirdPartyPacks.length }
        ];

    let rows: PMRow[] = [];
    let baseCount = 0;
    const chips: PMCount[] = [];

    const applyChips = <T,>(
      list: T[],
      defs: { id: string; label: string; pred: (item: T) => boolean }[]
    ) => {
      const counts = new Map<string, number>();
      for (const d of defs) {
        counts.set(d.id, 0);
      }

      const activeDef = defs.find((d) => d.id === filter) ?? defs[0];
      const filtered: T[] = [];

      for (const item of list) {
        let isActiveMatch = false;
        for (const d of defs) {
          if (d.pred(item)) {
            counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
            if (d.id === activeDef.id) {
              isActiveMatch = true;
            }
          }
        }
        if (isActiveMatch) {
          filtered.push(item);
        }
      }

      for (const d of defs) {
        chips.push({ id: d.id, label: d.label, count: counts.get(d.id) ?? 0 });
      }

      return filtered;
    };

    if (isSoftware) {
      const inCat =
        cat === "all" || !cat
          ? statuses
          : statuses.filter((p) => runtimeGroup(p.id) === cat);
      baseCount = inCat.length;
      const searched = query
        ? inCat.filter((p) =>
            (p.name + " " + p.description).toLowerCase().includes(query)
          )
        : inCat;
      const filtered = applyChips(searched, [
        { id: "all", label: "All", pred: () => true },
        { id: "installed", label: "Installed", pred: (p) => p.installed },
        { id: "available", label: "Not installed", pred: (p) => !p.installed }
      ]);
      rows = filtered.map((rt) => {
        const busy = rtBusy.includes(rt.id) || rt.installing;
        return {
          key: rt.id,
          name: rt.name,
          desc: rt.description,
          badge: rt.installed ? "installed" : "notInstalled",
          buttons: {
            install: !rt.installed,
            update: false,
            uninstall: rt.installed,
            busy,
            onInstall: () => void rtInstall(rt.id),
            onUpdate: () => {},
            onUninstall: () => void rtUninstall(rt.id)
          }
        };
      });
    } else if (cat === "included") {
      baseCount = includedItems.length;
      const searched = query
        ? includedItems.filter((p) =>
            (p.name + " " + p.description).toLowerCase().includes(query)
          )
        : includedItems;
      const filtered = applyChips(searched, [
        { id: "all", label: "All", pred: () => true },
        { id: "enabled", label: "Enabled", pred: (p) => p.enabled },
        { id: "disabled", label: "Disabled", pred: (p) => !p.enabled }
      ]);
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
      const searched = query
        ? pythonPacks.filter((p) =>
            (p.name + " " + p.description).toLowerCase().includes(query)
          )
        : pythonPacks;
      const filtered = applyChips(searched, [
        { id: "all", label: "All", pred: () => true },
        { id: "installed", label: "Installed", pred: (p) => !!p.installed && !p.installed.hasUpdate },
        { id: "updates", label: "Updates", pred: (p) => !!p.installed?.hasUpdate },
        { id: "available", label: "Available", pred: (p) => !p.installed }
      ]);
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

    return {
      isSoftware,
      isThirdParty,
      categories,
      title: TITLES[cat] ?? "Packages",
      subtitle: isSoftware ? SUBTITLES.software : SUBTITLES[cat] ?? "",
      count: baseCount,
      chips: notice ? [] : chips,
      rows,
      installLocation,
      onChangeLocation: () => void selectInstallLocation(),
      notice,
      error: isSoftware ? rtError : cat === "python" ? pyError : builtinsError,
      console: consoleModel,
      thirdPartyCount: thirdPartyPacks.length
    };
  }, [
    tab,
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
    pyInstall,
    pyUpdate,
    pyUninstall,
    selectInstallLocation,
    rtClear,
    pyClear
  ]);
}
