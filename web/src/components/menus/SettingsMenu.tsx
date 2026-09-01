/** @jsxImportSource @emotion/react */
// Full-page settings (formerly a Dialog).
import React, { memo, useMemo } from "react";
import {
  useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import WarningIcon from "@mui/icons-material/Warning";
import { useSettingsStore } from "../../stores/SettingsStore";
import useAuth from "../../stores/useAuth";
import {
  SearchInput,
  LabeledSwitch,
  SelectField,
  Text,
  Caption,
  TextLink,
  Tooltip,
  EditorButton,
  FlexColumn,
  Box,
  TabGroup,
  SPACING,
  DocsHelpLink
} from "../ui_primitives";
import type { DocsTopic } from "../../config/docsLinks";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { isLocalhost, isElectron } from "../../lib/env";
import RemoteSettingsMenuComponent from "./RemoteSettingsMenu";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import FoldersSettings from "./FoldersSettingsMenu";
import AboutMenu from "./AboutMenu";
import {
  APIKeysTabContent,
  APIKeysRightSidebar,
  SecurityNotice
} from "./APIKeysTab";
import {
  getDisplayedSettingGroups
} from "./RemoteSettingsMenu";
import ServerNumberSetting from "./ServerNumberSetting";
import { getAboutSidebarSections } from "./aboutSidebarUtils";
import DefaultModelsMenu from "./DefaultModelsMenu";
import MCPSettingsMenu from "./MCPSettingsMenu";
import BrowserExtensionSettingsMenu from "./BrowserExtensionSettingsMenu";
import VaultsSettings from "./VaultsSettings";
import ConnectedAccountsSettings from "../settings/ConnectedAccountsSettings";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useState, useCallback, useEffect, useRef } from "react";
import SettingsSidebar from "./SettingsSidebar";
import useSecretsStore from "../../stores/SecretsStore";
import { settingsStyles } from "./settingsMenuStyles";
import {
  useSettingsPageStore,
  type SettingsSection
} from "../../stores/SettingsPageStore";
import { isFunction } from "../../utils/typePredicates";
import { NumberSetting } from "./NumberSetting";
import StorageHistorySettings from "../settings/StorageHistorySettings";
import {
  SETTINGS_TAB_ITEMS,
  matchesSearch,
  otherMatchingTabs,
  settingsTabLabel,
  tabHasMatches
} from "./settingsSearch";

const settingsDocsTopic = (section: SettingsSection): DocsTopic =>
  section === "providers" ? "providers" : "configuration";

const settingsDocsLabel = (section: SettingsSection): string =>
  section === "providers" ? "Models & providers" : "Configuration";

const UPDATE_CHANNEL_OPTIONS = [
  { value: "latest", label: "Stable" },
  { value: "nightly", label: "Nightly" }
] as const;

const CLOSE_BEHAVIOR_OPTIONS = [
  { value: "ask", label: "Ask Every Time" },
  { value: "quit", label: "Quit Application" },
  { value: "background", label: "Keep Running in Background" }
] as const;

const PAN_CONTROLS_OPTIONS = [
  { value: "LMB", label: "Pan canvas" },
  { value: "RMB", label: "Select nodes (box)" }
] as const;

const SELECTION_MODE_OPTIONS = [
  { value: "full", label: "Full" },
  { value: "partial", label: "Partial" }
] as const;

const AUTOSAVE_INTERVAL_OPTIONS = [
  { value: 1, label: "1 minute" },
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "60 minutes" }
] as const;

const TIME_FORMAT_OPTIONS = [
  { value: "12h", label: "12h" },
  { value: "24h", label: "24h" }
] as const;

interface TabPanelProps {
  children?: React.ReactNode;
  section: SettingsSection;
  current: SettingsSection;
}

const TabPanel = React.memo(function TabPanel(props: TabPanelProps) {
  const { children, section, current, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={section !== current}
      id={`settings-tabpanel-${section}`}
      aria-labelledby={`settings-tab-${section}`}
      className="tab-panel"
      {...other}
    >
      {section === current && <Box className="tab-panel-content">{children}</Box>}
    </div>
  );
});

interface SearchItemProps {
  /** Lowercased, trimmed search term. Empty string shows everything. */
  search: string;
  /** Free-text the item matches against (label + description keywords). */
  keywords: string;
  id?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * A single settings row that hides itself when it doesn't match the current
 * search. Returning null removes it from the DOM so the surrounding
 * `.settings-section`/heading can collapse via CSS `:has()`.
 */
const SearchItem = React.memo(function SearchItem({
  search,
  keywords,
  id,
  className = "settings-item",
  children
}: SearchItemProps) {
  if (search && !keywords.toLowerCase().includes(search)) {
    return null;
  }
  return (
    <div id={id} className={className}>
      {children}
    </div>
  );
});

function SettingsPage() {
  const section = useSettingsPageStore((state) => state.section);
  const setSection = useSettingsPageStore((state) => state.setSection);
  const session = useAuth((state) => state.session);

  const setSnapToGrid = useSettingsStore((state) => state.setSnapToGrid);
  const setGridSnap = useSettingsStore((state) => state.setGridSnap);
  const setConnectionSnap = useSettingsStore(
    (state) => state.setConnectionSnap
  );
  const setPanControls = useSettingsStore((state) => state.setPanControls);
  const setSelectionMode = useSettingsStore((state) => state.setSelectionMode);
  const setTimeFormat = useSettingsStore((state) => state.setTimeFormat);
  const setSelectNodesOnDrag = useSettingsStore(
    (state) => state.setSelectNodesOnDrag
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const setSoundNotifications = useSettingsStore(
    (state) => state.setSoundNotifications
  );
  const updateAutosaveSettings = useSettingsStore(
    (state) => state.updateAutosaveSettings
  );
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const settings = useSettingsStore((state) => state.settings);
  const [searchTerm, setSearchTerm] = useState("");
  const search = searchTerm.toLowerCase().trim();
  const generalMatches = useCallback(
    (keywords: string) => matchesSearch(keywords, search),
    [search]
  );

  const [activeSection, setActiveSection] = useState("editor");
  const skipScrollSpyUntilRef = useRef(0);
  const [, setSecretsUpdated] = useState(0);
  const settingsContentRef = useRef<HTMLDivElement | null>(null);
  const [closeBehavior, setCloseBehavior] = useState<
    "ask" | "quit" | "background"
  >("ask");
  const [autoUpdatesEnabled, setAutoUpdatesEnabled] = useState(false);
  const [updateChannel, setUpdateChannel] = useState<"latest" | "nightly">("latest");
  const desktopUpdateSettingsApi = useMemo(() => {
    // `isElectron` and `window.api` are static for the lifetime of the renderer session.
    if (!isElectron) {
      return null;
    }

    const api = window.api?.settings;
    if (
      !api ||
      !isFunction(api.getAutoUpdates) ||
      !isFunction(api.setAutoUpdates) ||
      !isFunction(api.getUpdateChannel) ||
      !isFunction(api.setUpdateChannel)
    ) {
      return null;
    }

    const getAutoUpdates = api.getAutoUpdates;
    const setAutoUpdates = api.setAutoUpdates;
    const getUpdateChannel = api.getUpdateChannel;
    const setUpdateChannel = api.setUpdateChannel;

    return {
      getAutoUpdates: () => getAutoUpdates(),
      setAutoUpdates: (enabled: boolean) => setAutoUpdates(enabled),
      getUpdateChannel: () => getUpdateChannel(),
      setUpdateChannel: (channel: "latest" | "nightly") =>
        setUpdateChannel(channel),
    };
  }, []);
  const supportsDesktopUpdateSettings = desktopUpdateSettingsApi !== null;

  // Load close behavior setting on mount (Electron only)
  useEffect(() => {
    if (isElectron && window.api?.settings?.getCloseBehavior) {
      window.api.settings
        .getCloseBehavior()
        .then((action: "ask" | "quit" | "background") => {
          setCloseBehavior(action);
        });
    }
    if (supportsDesktopUpdateSettings) {
      desktopUpdateSettingsApi
        .getAutoUpdates()
        .then(setAutoUpdatesEnabled)
        .catch((error: unknown) => {
          console.error("Failed to load desktop auto-update setting:", error);
        });
      desktopUpdateSettingsApi
        .getUpdateChannel()
        .then(setUpdateChannel)
        .catch((error: unknown) => {
          console.error("Failed to load desktop update channel:", error);
        });
    }
  }, [desktopUpdateSettingsApi, supportsDesktopUpdateSettings]);

  const handleCloseBehaviorChange = useCallback(
    (action: "ask" | "quit" | "background") => {
      setCloseBehavior(action);
      if (window.api?.settings?.setCloseBehavior) {
        window.api.settings.setCloseBehavior(action);
      }
    },
    []
  );

  const handleAutoUpdatesChange = useCallback((checked: boolean) => {
    if (!supportsDesktopUpdateSettings) {
      return;
    }
    const previousValue = autoUpdatesEnabled;
    setAutoUpdatesEnabled(checked);
    void desktopUpdateSettingsApi.setAutoUpdates(checked).catch((error: unknown) => {
      setAutoUpdatesEnabled(previousValue);
      console.error("Failed to update desktop auto-update setting:", error);
      addNotification({
        type: "error",
        alert: true,
        content: "Failed to save automatic update preference."
      });
    });
  }, [addNotification, autoUpdatesEnabled, desktopUpdateSettingsApi, supportsDesktopUpdateSettings]);

  const handleUpdateChannelChange = useCallback((value: string) => {
    if (!supportsDesktopUpdateSettings) {
      return;
    }
    const channel = value === "nightly" ? "nightly" : "latest";
    const previousChannel = updateChannel;
    setUpdateChannel(channel);
    void desktopUpdateSettingsApi
      .setUpdateChannel(channel)
      .catch((error: unknown) => {
        setUpdateChannel(previousChannel);
        console.error("Failed to update desktop update channel:", error);
        addNotification({
          type: "error",
          alert: true,
          content: "Failed to save update channel preference."
        });
      });
  }, [addNotification, desktopUpdateSettingsApi, supportsDesktopUpdateSettings, updateChannel]);

  // Subscribe to secrets store changes to update sidebar when secrets are modified
  useEffect(() => {
    const unsubscribe = useSecretsStore.subscribe(() => setSecretsUpdated((n) => n + 1));
    return unsubscribe;
  }, []);

  const handleSectionChange = useCallback(
    (next: string) => {
      if (
        next === "general" ||
        next === "providers" ||
        next === "integrations" ||
        next === "about"
      ) {
        setSection(next);
      }
    },
    [setSection]
  );

  // Memoized handlers for settings controls to prevent re-renders
  const handleSelectNodesOnDragChange = useCallback(
    (checked: boolean) => {
      setSelectNodesOnDrag(checked);
    },
    [setSelectNodesOnDrag]
  );

  const handleSoundNotificationsChange = useCallback(
    (checked: boolean) => {
      setSoundNotifications(checked);
    },
    [setSoundNotifications]
  );

  const handleSnapToGridChange = useCallback(
    (checked: boolean) => {
      setSnapToGrid(checked);
    },
    [setSnapToGrid]
  );

  const handleLargeRunThresholdChange = useCallback(
    (value: number) => {
      updateSettings({ largeRunThreshold: value });
    },
    [updateSettings]
  );

  const handleAudioBufferMsChange = useCallback(
    (value: number) => {
      updateSettings({ audioBufferMs: value });
    },
    [updateSettings]
  );

  const handlePanControlsChange = useCallback(
    (value: string) => {
      setPanControls(value);
    },
    [setPanControls]
  );

  const handleSelectionModeChange = useCallback(
    (value: string) => {
      setSelectionMode(value);
    },
    [setSelectionMode]
  );

  const handleTimeFormatChange = useCallback(
    (value: string) => {
      setTimeFormat(value === "12h" ? "12h" : "24h");
    },
    [setTimeFormat]
  );
  const copyAuthToken = async () => {
    const accessToken = session?.access_token;
    if (accessToken) {
      try {
        await navigator.clipboard.writeText(accessToken);
        addNotification({
          type: "info",
          alert: true,
          content: "Nodetool API Token copied to Clipboard!"
        });
      } catch (error) {
        console.error("Failed to copy to clipboard:", error);
        addNotification({
          type: "error",
          alert: true,
          content: "Failed to copy token to clipboard"
        });
      }
    }
  };

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    skipScrollSpyUntilRef.current = Date.now() + 500;

    requestAnimationFrame(() => {
      const container = settingsContentRef.current;
      if (!container) {
        return;
      }

      const activePanel = container.querySelector<HTMLElement>(
        ".tab-panel:not([hidden])"
      );
      const safeId = CSS.escape(sectionId);
      const target =
        activePanel?.querySelector<HTMLElement>(`#${safeId}`) ??
        container.querySelector<HTMLElement>(`#${safeId}`);

      if (!target) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topOffset = 20;
      const top =
        container.scrollTop + targetRect.top - containerRect.top - topOffset;

      container.scrollTo({
        top: Math.max(top, 0),
        behavior: "smooth"
      });
    });
  };

  const generalSidebarSections = [
    {
      category: "Workspace",
      items: [
        { id: "editor", label: "Editor" },
        ...(isElectron ? [{ id: "updates", label: "Updates" }] : []),
        ...(isElectron ? [{ id: "vaults", label: "Vaults" }] : []),
        { id: "appearance", label: "Appearance" }
      ]
    },
    {
      category: "Workflow",
      items: [
        { id: "execution", label: "Execution" },
        { id: "canvas-navigation", label: "Canvas" },
        { id: "default-models", label: "Default Models" }
      ]
    },
    {
      category: "History",
      items: [{ id: "autosave", label: "Autosave" }]
    }
  ];

  // Subscribe to store data so the Integrations sidebar mirrors the live
  // (registry-driven) list of setting groups rendered in the panel.
  const remoteSettings = useRemoteSettingsStore((state) => state.settings);
  const secrets = useSecretsStore((state) => state.secrets);
  void secrets;

  // Tab 2: Integrations sidebar folders — Configuration mirrors the panel
  // top-to-bottom: the registry meta-sections (Local Model Servers, Search
  // Provider, …) then Folders; Servers (localhost) and the Nodetool API token
  // (hosted) follow.
  const integrationsSidebarSections = useMemo(() => {
    const configItems = [
      ...getDisplayedSettingGroups(remoteSettings ?? []),
      { id: "folders", label: "Folders" }
    ];
    return [
      { category: "Configuration", items: configItems },
      {
        category: "Accounts",
        items: [{ id: "connected-accounts", label: "Connected Accounts" }]
      },
      ...(isLocalhost
        ? [
            {
              category: "Servers",
              items: [
                { id: "mcp-integration", label: "MCP Servers" },
                { id: "browser-extension", label: "Browser Extension" }
              ]
            }
          ]
        : []),
      ...(session?.access_token && !isLocalhost
        ? [
            {
              category: "Credentials",
              items: [
                { id: "nodetool-api-token", label: "Nodetool API Token" }
              ]
            }
          ]
        : [])
    ];
  }, [remoteSettings, session?.access_token]);

  const sidebarSections =
    section === "general"
      ? generalSidebarSections
      : section === "integrations"
        ? integrationsSidebarSections
        : section === "about"
          ? getAboutSidebarSections()
          : [];

  useEffect(() => {
    const container = settingsContentRef.current;
    if (!container) {
      return;
    }
    const panel = container.querySelector(".tab-panel:not([hidden])");
    if (!panel) {
      return;
    }
    const headings = [
      ...panel.querySelectorAll<HTMLElement>(".settings-heading[id]")
    ];
    if (headings.length === 0) {
      return;
    }
    setActiveSection(headings[0].id);

    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < skipScrollSpyUntilRef.current) {
          return;
        }
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visible[0]?.target.id;
        if (id) {
          setActiveSection(id);
        }
      },
      {
        root: container,
        rootMargin: "-8% 0px -72% 0px",
        threshold: 0
      }
    );
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [section, search]);

  const matchingOtherTabs = otherMatchingTabs(section, searchTerm);
  const currentTabHasMatches = tabHasMatches(section, searchTerm);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  // The right sidebar is wider than the search/cards layout it sits next to;
  // drop it one breakpoint earlier (`md`, ~900px) so the card list doesn't
  // compress below the threshold where it becomes unreadable.
  const isCompact = useMediaQuery(theme.breakpoints.down("md"));

  return (
    <FlexColumn
      className={`settings-page${isMobile ? " settings-page--mobile" : ""}`}
      sx={{
        flex: 1,
        minHeight: 0,
        backgroundColor: theme.vars.palette.background.default
      }}
    >
      <Box css={settingsStyles(theme)} sx={{ flex: 1, minHeight: 0 }}>
        <header className="settings-page-header">
          <div className="settings-page-header__titles">
            <div className="settings-page-header__heading">
              <h1 className="settings-page-header__title">Settings</h1>
              <DocsHelpLink
                topic={settingsDocsTopic(section)}
                label={settingsDocsLabel(section)}
              />
            </div>
          </div>
          <div className="settings-page-header__search">
            <SearchInput
              placeholder="Search settings..."
              value={searchTerm}
              onChange={setSearchTerm}
              size="medium"
              fullWidth
              showClear
              ariaLabel="Search settings"
            />
          </div>
        </header>

          <div className="settings-menu">
            <div className="sticky-header">
              <TabGroup
                className="settings-tabs"
                aria-label="settings tabs"
                tabs={[...SETTINGS_TAB_ITEMS]}
                value={section}
                onChange={handleSectionChange}
                variant={isMobile ? "scrollable" : "standard"}
                scrollButtons={false}
                size="small"
              />
            </div>

            <div className={`settings-container${section === "providers" && !isCompact ? " settings-container--api-keys" : ""}`}>
              {!isMobile && section !== "providers" && (
                  <SettingsSidebar
                    key={`sidebar-${section}`}
                    activeSection={activeSection}
                    sections={sidebarSections}
                    onSectionClick={scrollToSection}
                  />
                )}

              <div
                className={`settings-content${section === "providers" ? " settings-content--api-keys" : ""}`}
                ref={settingsContentRef}
              >
                {search && (
                  <div className="settings-search-alts">
                    {!currentTabHasMatches && (
                      <Caption>
                        No matches in {settingsTabLabel(section)}.
                      </Caption>
                    )}
                    {matchingOtherTabs.length > 0 && (
                      <>
                        <Caption>
                          {currentTabHasMatches ? "Also in" : "See"}
                        </Caption>
                        {matchingOtherTabs.map((tab) => (
                          <TextLink
                            key={tab}
                            asButton
                            onClick={() => setSection(tab)}
                          >
                            {settingsTabLabel(tab)}
                          </TextLink>
                        ))}
                      </>
                    )}
                  </div>
                )}
                {/* Tab 0: General */}
                <TabPanel section="general" current={section}>
                  <div className="general-settings">
                    <div className="settings-section">
                      <Text size="big" id="editor" className="settings-heading">
                        Editor
                      </Text>
                      <SearchItem
                        search={search}
                        keywords="editor workspace select nodes on drag selection"
                      >
                        <LabeledSwitch
                          label="Select Nodes On Drag"
                          checked={!!settings.selectNodesOnDrag}
                          onChange={handleSelectNodesOnDragChange}
                        />
                        <Text className="description">
                          Mark nodes as selected after changing a node&apos;s
                          position.
                          <br />
                          If disabled, nodes can still be selected by clicking on
                          them.
                        </Text>
                      </SearchItem>

                      {isElectron && (
                        <SearchItem
                          search={search}
                          keywords="editor workspace sound notifications beep"
                        >
                          <LabeledSwitch
                            label="Sound Notifications"
                            checked={!!settings.soundNotifications}
                            onChange={handleSoundNotificationsChange}
                            description="Play a system beep sound when workflows complete, exports finish, or other important events occur."
                          />
                        </SearchItem>
                      )}

                    </div>

                    {isElectron && (
                      <div className="settings-section">
                        <Text size="big" id="updates" className="settings-heading">
                          Updates
                        </Text>
                        {supportsDesktopUpdateSettings && (
                          <SearchItem
                            search={search}
                            keywords="editor workspace updates automatic desktop"
                          >
                            <LabeledSwitch
                              label="Automatic Updates"
                              checked={autoUpdatesEnabled}
                              onChange={handleAutoUpdatesChange}
                              description="Check for and download desktop app updates from the selected release channel."
                            />
                          </SearchItem>
                        )}
                        {supportsDesktopUpdateSettings && (
                          <SearchItem
                            search={search}
                            keywords="editor workspace update channel stable nightly"
                          >
                            <SelectField
                              label="Update Channel"
                              value={updateChannel}
                              onChange={handleUpdateChannelChange}
                              options={UPDATE_CHANNEL_OPTIONS}
                            />
                            <Text className="description">
                              Stable follows full releases. Nightly follows prerelease nightly builds.
                              Nightly builds default to the Nightly channel.
                            </Text>
                          </SearchItem>
                        )}
                        <SearchItem
                          search={search}
                          keywords="editor workspace on close behavior quit background tray"
                        >
                          <SelectField
                            label="On Close Behavior"
                            value={closeBehavior}
                            onChange={(v) =>
                              handleCloseBehaviorChange(
                                v as "ask" | "quit" | "background"
                              )
                            }
                            options={CLOSE_BEHAVIOR_OPTIONS}
                          />
                          <Text className="description">
                            Choose what happens when you close the main window.
                            <br />
                            <b>Ask Every Time:</b> Shows a dialog with options.
                            <br />
                            <b>Quit:</b> Closes the application completely.
                            <br />
                            <b>Background:</b> Keeps the app running in the system
                            tray.
                          </Text>
                        </SearchItem>
                      </div>
                    )}

                    {isElectron &&
                      generalMatches("vaults isolated database") && (
                        <VaultsSettings />
                      )}

                    <div className="settings-section">
                      <Text
                        size="big"
                        id="appearance"
                        className="settings-heading"
                      >
                        Appearance
                      </Text>
                      <SearchItem
                        search={search}
                        keywords="appearance time format 12h 24h"
                      >
                        <SelectField
                          label="Time Format"
                          value={settings.timeFormat}
                          onChange={handleTimeFormatChange}
                          options={TIME_FORMAT_OPTIONS}
                          description="Display time in 12h or 24h format."
                        />
                      </SearchItem>
                    </div>

                    <div className="settings-section">
                      <Text
                        size="big"
                        id="execution"
                        className="settings-heading"
                      >
                        Execution
                      </Text>
                      <SearchItem
                        search={search}
                        keywords="execution warn before large runs confirmation"
                      >
                        <LabeledSwitch
                          label="Warn Before Large Runs"
                          checked={settings.confirmLargeRun ?? true}
                          onChange={(checked) =>
                            updateSettings({ confirmLargeRun: checked })
                          }
                          description="Running a workflow executes every node at once. Show a confirmation when a run would launch many model/provider nodes that could overload an API."
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="execution large-run threshold"
                      >
                        <NumberSetting
                          id="large-run-threshold-input"
                          label="Large-Run Threshold"
                          value={settings.largeRunThreshold ?? 5}
                          onCommit={handleLargeRunThresholdChange}
                          min={1}
                          max={100}
                          fallback={5}
                          disabled={!(settings.confirmLargeRun ?? true)}
                          description="Warn when a run would execute more than this many model/provider nodes (LLM, image, audio, API, etc.)."
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="audio buffer latency realtime synth playback dropout"
                      >
                        <NumberSetting
                          id="audio-buffer-ms-input"
                          label="Audio Buffer (ms)"
                          value={settings.audioBufferMs ?? 100}
                          onCommit={handleAudioBufferMsChange}
                          min={20}
                          max={1000}
                          step={10}
                          fallback={100}
                          description="Playback buffer for realtime audio (modular synth patches). Lower values reduce knob-to-ear latency; higher values prevent dropouts when the editor is busy."
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="execution max concurrent jobs runs queue concurrency parallel"
                      >
                        <ServerNumberSetting
                          envVar="MAX_CONCURRENT_JOBS"
                          label="Max Concurrent Runs"
                          defaultValue={4}
                          min={1}
                          max={64}
                          description="Maximum number of workflow runs you can execute at once. Additional runs queue and start automatically as running ones finish."
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="execution max concurrent runs per workflow same queue concurrency parallel"
                      >
                        <ServerNumberSetting
                          envVar="MAX_CONCURRENT_RUNS_PER_WORKFLOW"
                          label="Max Concurrent Runs per Workflow"
                          defaultValue={4}
                          min={1}
                          max={64}
                          description="How many runs of the same workflow may run at once before further runs queue. Applies to concurrent generation (timeline, sketch); canvas runs always stay sequential."
                        />
                      </SearchItem>
                    </div>

                    <div className="settings-section">
                      <Text
                        size="big"
                        id="canvas-navigation"
                        className="settings-heading"
                      >
                        Canvas & Navigation
                      </Text>
                      <SearchItem
                        search={search}
                        keywords="canvas navigation pan controls mouse select left click drag"
                      >
                        <SelectField
                          label="Left-Click Drag"
                          value={settings.panControls}
                          onChange={handlePanControlsChange}
                          options={PAN_CONTROLS_OPTIONS}
                        />
                        <div className="description">
                          <Text>
                            What dragging with the left mouse button does on
                            empty canvas.
                          </Text>
                          <Text>
                            <b>Pan canvas:</b> left-drag moves the view.
                            <br />
                            <b>Select nodes:</b> left-drag draws a selection box;
                            pan with the right or middle mouse button (and
                            two-finger scroll on a trackpad).
                          </Text>
                        </div>
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="canvas navigation node selection mode full partial"
                      >
                        <SelectField
                          label="Node Selection Mode"
                          value={settings.selectionMode}
                          onChange={handleSelectionModeChange}
                          options={SELECTION_MODE_OPTIONS}
                        />
                        <Text className="description">
                          When drawing a selection box for node selections:
                          <br />
                          <b>Full:</b> nodes have to be fully enclosed.
                          <br />
                          <b>Partial:</b> intersecting nodes will be selected.
                        </Text>
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="canvas navigation grid snap align nodes"
                      >
                        <LabeledSwitch
                          label="Snap to Grid"
                          checked={!!settings.snapToGrid}
                          onChange={handleSnapToGridChange}
                          description="Align nodes to the canvas grid while dragging. Also in the View menu of the desktop app."
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="canvas navigation grid snap precision"
                      >
                        <NumberSetting
                          id="grid-snap-input"
                          label="Grid Snap Precision"
                          value={settings.gridSnap}
                          onCommit={setGridSnap}
                          min={1}
                          max={100}
                          fallback={25}
                          disabled={!settings.snapToGrid}
                          description="Grid size used when Snap to Grid is on. The canvas grid is drawn every 25 units."
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="canvas navigation connection snap range"
                      >
                        <NumberSetting
                          id="connection-snap-input"
                          label="Connection Snap Range"
                          value={settings.connectionSnap}
                          onCommit={setConnectionSnap}
                          min={5}
                          max={30}
                          fallback={20}
                          description="Snap distance for connecting nodes."
                        />
                      </SearchItem>
                    </div>

                    {generalMatches("ai default models provider") && (
                      <DefaultModelsMenu />
                    )}

                    <div className="settings-section">
                      <Text
                        size="big"
                        id="autosave"
                        className="settings-heading"
                      >
                        Autosave & Version History
                      </Text>
                      <SearchItem
                        search={search}
                        keywords="autosave version history enable"
                      >
                        <LabeledSwitch
                          label="Enable Autosave"
                          checked={settings.autosave?.enabled ?? true}
                          onChange={(checked) =>
                            updateAutosaveSettings({ enabled: checked })
                          }
                          description="Automatically save your workflow at regular intervals."
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="autosave version history interval minutes"
                      >
                        <SelectField
                          label="Autosave Interval (minutes)"
                          value={settings.autosave?.intervalMinutes ?? 10}
                          onChange={(v) =>
                            updateAutosaveSettings({
                              intervalMinutes: Number(v)
                            })
                          }
                          options={AUTOSAVE_INTERVAL_OPTIONS}
                          disabled={!settings.autosave?.enabled}
                          description="How often to automatically save your workflow."
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="autosave version history save before running checkpoint"
                      >
                        <LabeledSwitch
                          label="Save Before Running"
                          checked={settings.autosave?.saveBeforeRun ?? true}
                          onChange={(checked) =>
                            updateAutosaveSettings({
                              saveBeforeRun: checked
                            })
                          }
                          description="Create a checkpoint version before executing workflow."
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="autosave version history save on window close"
                      >
                        <LabeledSwitch
                          label="Save on Window Close"
                          checked={settings.autosave?.saveOnClose ?? true}
                          onChange={(checked) =>
                            updateAutosaveSettings({
                              saveOnClose: checked
                            })
                          }
                          description="Automatically save when closing the tab or window."
                        />
                      </SearchItem>

                      {generalMatches(
                        "autosave version history storage database cleanup limits runs compact"
                      ) && <StorageHistorySettings />}
                    </div>
                  </div>
                </TabPanel>

                <TabPanel section="providers" current={section}>
                  <APIKeysTabContent searchTerm={searchTerm} />
                  <Box sx={{ marginTop: theme.spacing(SPACING.xxl) }}>
                    <SecurityNotice />
                  </Box>
                </TabPanel>

                <TabPanel section="integrations" current={section}>
                  <div className="integrations-settings">
                  <RemoteSettingsMenuComponent search={searchTerm} />

                  {matchesSearch(
                    "folders assets workspace directory storage",
                    search
                  ) && (
                    <>
                      <Text size="big" id="folders" className="settings-heading">
                        Folders
                      </Text>
                      <FoldersSettings />
                    </>
                  )}

                  {matchesSearch(
                    "connected accounts telegram discord messaging",
                    search
                  ) && (
                    <>
                      <Text
                        size="big"
                        id="connected-accounts"
                        className="settings-heading"
                      >
                        Connected Accounts
                      </Text>
                      <ConnectedAccountsSettings />
                    </>
                  )}

                  {isLocalhost &&
                    matchesSearch(
                      "mcp servers claude desktop",
                      search
                    ) && (
                    <>
                      <Text
                        size="big"
                        id="mcp-integration"
                        className="settings-heading"
                      >
                        MCP Integration
                      </Text>
                      <MCPSettingsMenu />
                    </>
                  )}

                  {isLocalhost &&
                    matchesSearch(
                      "browser extension chrome",
                      search
                    ) && (
                    <>
                      <Text
                        size="big"
                        id="browser-extension"
                        className="settings-heading"
                      >
                        Browser Extension
                      </Text>
                      <BrowserExtensionSettingsMenu />
                    </>
                  )}

                  {session?.access_token &&
                    !isLocalhost &&
                    matchesSearch("nodetool api token", search) && (
                    <>
                      <Text
                        size="big"
                        id="nodetool-api-token"
                        className="settings-heading"
                      >
                        Nodetool API
                      </Text>
                      <Text
                        className="explanation"
                        sx={{ margin: "0 0 1em 0" }}
                      >
                        Use the Nodetool API to execute workflows
                        programmatically.
                        <br />
                        <br />
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          href="https://github.com/nodetool-ai/nodetool#using-the-workflow-api-"
                        >
                          API documentation on GitHub <br />
                        </a>
                      </Text>
                      <div
                        className="settings-section"
                        style={{
                          border:
                            "1px solid" + theme.vars.palette.warning.main,
                          borderRight:
                            "1px solid" + theme.vars.palette.warning.main
                        }}
                      >
                        <Text
                          sx={{
                            fontSize: "var(--fontSizeNormal)",
                            color: theme.palette.text.primary
                          }}
                        >
                          Nodetool API Token
                        </Text>
                        <div className="description">
                          <Text>
                            This token is used to authenticate your account
                            with the Nodetool API.
                          </Text>
                          <div className="secrets">
                            <WarningIcon
                              sx={{
                                color: (theme) =>
                                  theme.vars.palette.warning.main
                              }}
                            />
                            <Text component="span">
                              Keep this token secure and do not share it
                              publicly
                            </Text>
                          </div>
                        </div>
                        <Tooltip title="Copy to clipboard">
                          <EditorButton
                            style={{ margin: ".5em 0" }}
                            size="small"
                            variant="outlined"
                            startIcon={<ContentCopyIcon />}
                            onClick={copyAuthToken}
                          >
                            Copy Token
                          </EditorButton>
                        </Tooltip>
                      </div>
                    </>
                  )}
                  </div>
                </TabPanel>

                <TabPanel section="about" current={section}>
                  <AboutMenu />
                </TabPanel>
              </div>

              {section === "providers" && !isCompact && (
                <APIKeysRightSidebar />
              )}
            </div>
          </div>
      </Box>
    </FlexColumn>
  );
}

export default memo(SettingsPage);
