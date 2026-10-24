/** @jsxImportSource @emotion/react */
// Full-page settings (formerly a Dialog).
import React, { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useMediaQuery
} from "@mui/material";
import { useColorScheme, useTheme } from "@mui/material/styles";
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
import { isCloudProfile } from "../../lib/runtimeConfig";
import RemoteSettingsMenuComponent from "./RemoteSettingsMenu";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import FoldersSettings from "./FoldersSettingsMenu";
import AboutMenu from "./AboutMenu";
import PrivacyMenu from "./PrivacyMenu";
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
import {
  DEFAULT_TEXT_SIZE,
  TEXT_SIZES,
  TEXT_SIZE_LABELS,
  isTextSize
} from "../themes/textSizes";
import {
  DEFAULT_THEME_CONTRAST,
  THEME_CONTRASTS,
  THEME_CONTRAST_LABELS,
  isThemeContrast
} from "../themes/themeContrasts";
import LanguageSetting from "../settings/LanguageSetting";
import StorageHistorySettings from "../settings/StorageHistorySettings";
import {
  SETTINGS_TAB_ITEMS,
  matchesSearch,
  otherMatchingTabs,
  tabHasMatches
} from "./settingsSearch";

/** False when the element or an ancestor is `display: none`. */
const isRendered = (element: HTMLElement): boolean =>
  isFunction(element.checkVisibility) ? element.checkVisibility() : true;

const sameIds = (
  prev: ReadonlySet<string> | null,
  next: string[] | null
): boolean =>
  prev === null || next === null
    ? prev === next
    : prev.size === next.length && next.every((id) => prev.has(id));

const settingsDocsTopic = (section: SettingsSection): DocsTopic =>
  section === "providers" ? "providers" : "configuration";

const SETTINGS_TAB_KEYS = {
  general: "screens4_6.settings.tabs.general",
  providers: "screens4_6.settings.tabs.providers",
  integrations: "screens4_6.settings.tabs.integrations",
  privacy: "screens4_6.settings.tabs.privacy",
  about: "screens4_6.settings.tabs.about"
} as const;

const TEXT_SIZE_OPTIONS = TEXT_SIZES.map((size) => ({
  value: size,
  label: TEXT_SIZE_LABELS[size]
}));

const THEME_CONTRAST_OPTIONS = THEME_CONTRASTS.map((contrast) => ({
  value: contrast,
  label: THEME_CONTRAST_LABELS[contrast]
}));

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
  const { t } = useTranslation();
  const privacySidebarSections = [
    {
      category: t("screens4_6.settings.sidebar.categories.privacy"),
      items: [
        { id: "product-analytics", label: t("screens4_6.settings.sidebar.items.productAnalytics") },
        { id: "what-is-collected", label: t("screens4_6.settings.sidebar.items.whatIsCollected") },
        { id: "diagnostics", label: t("screens4_6.settings.sidebar.items.diagnostics") },
        { id: "recent-events", label: t("screens4_6.settings.sidebar.items.recentEvents") }
      ]
    }
  ];
  const updateChannelOptions = [
    { value: "latest", label: t("screens4_6.settings.options.stable") },
    { value: "nightly", label: t("screens4_6.settings.options.nightly") }
  ] as const;
  const closeBehaviorOptions = [
    { value: "ask", label: t("screens4_6.settings.options.askEveryTime") },
    { value: "quit", label: t("screens4_6.settings.options.quitApplication") },
    { value: "background", label: t("screens4_6.settings.options.keepRunningInBackground") }
  ] as const;
  const panControlsOptions = [
    { value: "LMB", label: t("screens4_6.settings.options.panCanvas") },
    { value: "RMB", label: t("screens4_6.settings.options.selectNodesBox") }
  ] as const;
  const selectionModeOptions = [
    { value: "full", label: t("screens4_6.settings.options.full") },
    { value: "partial", label: t("screens4_6.settings.options.partial") }
  ] as const;
  const autosaveIntervalOptions = [1, 5, 10, 15, 30, 60].map((value) => ({
    value,
    label: t("screens4_6.settings.options.minutes", { count: value })
  }));
  const themeModeOptions = [
    { value: "dark", label: t("screens4_6.settings.options.dark") },
    { value: "light", label: t("screens4_6.settings.options.light") }
  ] as const;
  const timeFormatOptions = [
    { value: "12h", label: t("screens4_6.settings.options.hour12") },
    { value: "24h", label: t("screens4_6.settings.options.hour24") }
  ] as const;
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
  const setTextSize = useSettingsStore((state) => state.setTextSize);
  const setThemeContrast = useSettingsStore(
    (state) => state.setThemeContrast
  );
  const setSelectNodesOnDrag = useSettingsStore(
    (state) => state.setSelectNodesOnDrag
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const setSoundNotifications = useSettingsStore(
    (state) => state.setSoundNotifications
  );
  const setSystemNotifications = useSettingsStore(
    (state) => state.setSystemNotifications
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
  // Section ids still visible under the current search, so the sidebar only
  // lists sections the content panel actually shows. Null when not searching.
  const [visibleSectionIds, setVisibleSectionIds] =
    useState<ReadonlySet<string> | null>(null);
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
          content: t("screens4_6.settings.errors.saveAutoUpdates")
      });
    });
  }, [addNotification, autoUpdatesEnabled, desktopUpdateSettingsApi, supportsDesktopUpdateSettings, t]);

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
          content: t("screens4_6.settings.errors.saveUpdateChannel")
        });
      });
  }, [addNotification, desktopUpdateSettingsApi, supportsDesktopUpdateSettings, updateChannel, t]);

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
        next === "privacy" ||
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

  const handleSystemNotificationsChange = useCallback(
    (checked: boolean) => {
      setSystemNotifications(checked);
    },
    [setSystemNotifications]
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

  const {
    mode: themeMode,
    systemMode,
    setMode: setThemeMode
  } = useColorScheme();
  const resolvedThemeMode = themeMode === "system" ? systemMode : themeMode;
  const handleThemeModeChange = useCallback(
    (value: string) => {
      setThemeMode(value === "light" ? "light" : "dark");
    },
    [setThemeMode]
  );
  const handleTextSizeChange = useCallback(
    (value: string) => {
      setTextSize(isTextSize(value) ? value : DEFAULT_TEXT_SIZE);
    },
    [setTextSize]
  );
  const handleThemeContrastChange = useCallback(
    (value: string) => {
      setThemeContrast(isThemeContrast(value) ? value : DEFAULT_THEME_CONTRAST);
    },
    [setThemeContrast]
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
          content: t("screens4_6.settings.notifications.tokenCopied")
        });
      } catch (error) {
        console.error("Failed to copy to clipboard:", error);
        addNotification({
          type: "error",
          alert: true,
          content: t("screens4_6.settings.errors.copyToken")
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
        { id: "canvas-navigation", label: "Canvas & navigation" },
        { id: "default-models", label: "Default models" }
      ]
    },
    {
      category: "History",
      items: [{ id: "autosave", label: "Autosave & version history" }]
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
    // Folders are host paths, which the cloud neither shows nor accepts.
    const configItems = [
      ...getDisplayedSettingGroups(remoteSettings ?? []),
      ...(isCloudProfile() ? [] : [{ id: "folders", label: "Folders" }])
    ];
    return [
      { category: "Configuration", items: configItems },
      {
        category: "Accounts",
        items: [{ id: "connected-accounts", label: "Connected accounts" }]
      },
      ...(isLocalhost
        ? [
            {
              category: "Servers",
              items: [
                { id: "mcp-integration", label: "MCP integration" },
                { id: "browser-extension", label: "Browser extension" }
              ]
            }
          ]
        : []),
      ...(session?.access_token && !isLocalhost
        ? [
            {
              category: "Credentials",
              items: [
                { id: "nodetool-api-token", label: "Nodetool API" }
              ]
            }
          ]
        : [])
    ];
  }, [remoteSettings, session?.access_token]);

  const allSidebarSections =
    section === "general"
      ? generalSidebarSections
      : section === "integrations"
        ? integrationsSidebarSections
        : section === "about"
          ? getAboutSidebarSections()
          : section === "privacy"
            ? privacySidebarSections
            : [];
  const sidebarSections = visibleSectionIds
    ? allSidebarSections
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => visibleSectionIds.has(item.id))
        }))
        .filter((group) => group.items.length > 0)
    : allSidebarSections;

  useEffect(() => {
    const container = settingsContentRef.current;
    if (!container) {
      return;
    }
    const panel = container.querySelector(".tab-panel:not([hidden])");
    if (!panel) {
      return;
    }
    // A General section whose rows all miss the search is still in the DOM
    // but hidden by CSS, so filter on rendered visibility.
    const headings = [
      ...panel.querySelectorAll<HTMLElement>(".settings-heading[id]")
    ].filter((heading) => isRendered(heading));
    const ids = search ? headings.map((heading) => heading.id) : null;
    setVisibleSectionIds((prev) =>
      sameIds(prev, ids) ? prev : ids && new Set(ids)
    );
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
  }, [section, search, remoteSettings]);

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
              <h1 className="settings-page-header__title">{t("screens4_6.settings.title")}</h1>
              <DocsHelpLink
                topic={settingsDocsTopic(section)}
                label={t(section === "providers"
                  ? "screens4_6.settings.docs.modelsAndProviders"
                  : "screens4_6.settings.docs.configuration")}
              />
            </div>
          </div>
          <div className="settings-page-header__search">
            <SearchInput
              placeholder={t("screens4_6.settings.searchPlaceholder")}
              value={searchTerm}
              onChange={setSearchTerm}
              size="medium"
              fullWidth
              showClear
              ariaLabel={t("screens4_6.settings.searchLabel")}
            />
          </div>
        </header>

          <div className="settings-menu">
            <div className="sticky-header">
              <TabGroup
                className="settings-tabs"
                aria-label={t("screens4_6.settings.tabsLabel")}
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
                        {t("screens4_6.settings.noMatchesInTab", {
                          tab: t(SETTINGS_TAB_KEYS[section])
                        })}
                      </Caption>
                    )}
                    {matchingOtherTabs.length > 0 && (
                      <>
                        <Caption>
                          {currentTabHasMatches
                            ? t("screens4_6.settings.alsoIn")
                            : t("screens4_6.settings.see")}
                        </Caption>
                        {matchingOtherTabs.map((tab) => (
                          <TextLink
                            key={tab}
                            asButton
                            onClick={() => setSection(tab)}
                          >
                            {t(SETTINGS_TAB_KEYS[tab])}
                          </TextLink>
                        ))}
                      </>
                    )}
                  </div>
                )}
                {/* Tab 0: General */}
                <TabPanel section="general" current={section}>
                  <Caption className="settings-autosave-note">
                    {t("screens4_6.settings.changesApplyImmediately")}
                  </Caption>
                  <div className="general-settings">
                    <div className="settings-section">
                      <Text size="big" id="editor" className="settings-heading">
                        {t("i18n-next115.settings.editorHeading")}
                      </Text>
                      <SearchItem
                        search={search}
                        keywords="editor workspace select nodes on drag selection"
                      >
                        <LabeledSwitch
                          label={t("screens4_6.settings.editor.selectNodesOnDrag.label")}
                          checked={!!settings.selectNodesOnDrag}
                          onChange={handleSelectNodesOnDragChange}
                          description={t("screens4_6.settings.editor.selectNodesOnDrag.description")}
                        />
                      </SearchItem>

                      {isElectron && (
                        <SearchItem
                          search={search}
                          keywords="editor workspace sound notifications beep"
                        >
                          <LabeledSwitch
                            label={t("screens4_6.settings.editor.soundNotifications.label")}
                            checked={!!settings.soundNotifications}
                            onChange={handleSoundNotificationsChange}
                            description={t("screens4_6.settings.editor.soundNotifications.description")}
                          />
                        </SearchItem>
                      )}

                      <SearchItem
                        search={search}
                        keywords="editor workspace desktop system notifications alerts"
                      >
                        <LabeledSwitch
                          label={t("screens4_6.settings.editor.systemNotifications.label")}
                          checked={!!settings.systemNotifications}
                          onChange={handleSystemNotificationsChange}
                          description={t("screens4_6.settings.editor.systemNotifications.description")}
                        />
                      </SearchItem>

                    </div>

                    {isElectron && (
                      <div className="settings-section">
                        <Text size="big" id="updates" className="settings-heading">
                          {t("screens4_6.settings.sections.updates")}
                        </Text>
                        {supportsDesktopUpdateSettings && (
                          <SearchItem
                            search={search}
                            keywords="editor workspace updates automatic desktop"
                          >
                            <LabeledSwitch
                              label={t("screens4_6.settings.updates.automatic.label")}
                              checked={autoUpdatesEnabled}
                              onChange={handleAutoUpdatesChange}
                              description={t("screens4_6.settings.updates.automatic.description")}
                            />
                          </SearchItem>
                        )}
                        {supportsDesktopUpdateSettings && (
                          <SearchItem
                            search={search}
                            keywords="editor workspace update channel stable nightly"
                          >
                            <SelectField
                              label={t("screens4_6.settings.updates.channel.label")}
                              value={updateChannel}
                              onChange={handleUpdateChannelChange}
                              options={updateChannelOptions}
                              description={t("screens4_6.settings.updates.channel.description")}
                            />
                          </SearchItem>
                        )}
                        <SearchItem
                          search={search}
                          keywords="editor workspace on close behavior quit background tray"
                        >
                          <SelectField
                          label={t("screens4_6.settings.updates.closeBehavior.label")}
                            value={closeBehavior}
                            onChange={(v) =>
                              handleCloseBehaviorChange(
                                v as "ask" | "quit" | "background"
                              )
                            }
                            options={closeBehaviorOptions}
                            description={t("screens4_6.settings.updates.closeBehavior.description")}
                          />
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
                        {t("screens4_6.settings.sections.appearance")}
                      </Text>
                      <SearchItem search={search} keywords="language English Chinese 简体中文 语言 appearance">
                        <LanguageSetting />
                      </SearchItem>
                      {resolvedThemeMode && (
                        <SearchItem
                          search={search}
                          keywords="appearance theme dark light mode colors contrast readability"
                        >
                          <SelectField
                            label={t("screens4_6.settings.appearance.theme.label")}
                            value={resolvedThemeMode}
                            onChange={handleThemeModeChange}
                            options={themeModeOptions}
                            description={t("screens4_6.settings.appearance.theme.description")}
                          />
                        </SearchItem>
                      )}
                      <SearchItem
                        search={search}
                        keywords="appearance theme contrast soft dim dimmed brightness background colors readability eye strain"
                      >
                        <SelectField
                          label={t("screens4_6.settings.appearance.contrast.label")}
                          value={settings.themeContrast}
                          onChange={handleThemeContrastChange}
                          options={THEME_CONTRAST_OPTIONS}
                          description={t("screens4_6.settings.appearance.contrast.description")}
                        />
                      </SearchItem>
                      <SearchItem
                        search={search}
                        keywords="appearance text size font size zoom larger smaller bigger readability accessibility"
                      >
                        <SelectField
                          label={t("screens4_6.settings.appearance.textSize.label")}
                          value={settings.textSize}
                          onChange={handleTextSizeChange}
                          options={TEXT_SIZE_OPTIONS}
                          description={t("screens4_6.settings.appearance.textSize.description")}
                        />
                      </SearchItem>
                      <SearchItem
                        search={search}
                        keywords="appearance time format 12h 24h"
                      >
                        <SelectField
                          label={t("screens4_6.settings.appearance.timeFormat.label")}
                          value={settings.timeFormat}
                          onChange={handleTimeFormatChange}
                          options={timeFormatOptions}
                          description={t("screens4_6.settings.appearance.timeFormat.description")}
                        />
                      </SearchItem>
                    </div>

                    <div className="settings-section">
                      <Text
                        size="big"
                        id="execution"
                        className="settings-heading"
                      >
                        {t("screens4_6.settings.sections.execution")}
                      </Text>
                      <SearchItem
                        search={search}
                        keywords="execution warn before large runs confirmation"
                      >
                        <LabeledSwitch
                          label={t("screens4_6.settings.execution.warnLargeRuns.label")}
                          checked={settings.confirmLargeRun ?? true}
                          onChange={(checked) =>
                            updateSettings({ confirmLargeRun: checked })
                          }
                          description={t("screens4_6.settings.execution.warnLargeRuns.description")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="execution large-run threshold"
                      >
                        <NumberSetting
                          id="large-run-threshold-input"
                          label={t("screens4_6.settings.execution.largeRunThreshold.label")}
                          value={settings.largeRunThreshold ?? 5}
                          onCommit={handleLargeRunThresholdChange}
                          min={1}
                          max={100}
                          fallback={5}
                          disabled={!(settings.confirmLargeRun ?? true)}
                          description={t("screens4_6.settings.execution.largeRunThreshold.description")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="audio buffer latency realtime synth playback dropout"
                      >
                        <NumberSetting
                          id="audio-buffer-ms-input"
                          label={t("screens4_6.settings.execution.audioBuffer.label")}
                          value={settings.audioBufferMs ?? 100}
                          onCommit={handleAudioBufferMsChange}
                          min={20}
                          max={1000}
                          step={10}
                          fallback={100}
                          description={t("screens4_6.settings.execution.audioBuffer.description")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="timeline preview video decoder webcodecs frame exact"
                      >
                        <LabeledSwitch
                          label={t("screens4_6.settings.execution.webCodecs.label")}
                          checked={settings.timelinePreviewDecoder === "webcodecs"}
                          onChange={(checked) =>
                            updateSettings({ timelinePreviewDecoder: checked ? "webcodecs" : "element" })
                          }
                          description={t("screens4_6.settings.execution.webCodecs.description")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="execution max concurrent jobs runs queue concurrency parallel"
                      >
                        <ServerNumberSetting
                          envVar="MAX_CONCURRENT_JOBS"
                          label={t("screens4_6.settings.execution.maxConcurrentRuns.label")}
                          defaultValue={4}
                          min={1}
                          max={64}
                          description={t("screens4_6.settings.execution.maxConcurrentRuns.description")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="execution max concurrent runs per workflow same queue concurrency parallel"
                      >
                        <ServerNumberSetting
                          envVar="MAX_CONCURRENT_RUNS_PER_WORKFLOW"
                          label={t("screens4_6.settings.execution.maxConcurrentRunsPerWorkflow.label")}
                          defaultValue={4}
                          min={1}
                          max={64}
                          description={t("screens4_6.settings.execution.maxConcurrentRunsPerWorkflow.description")}
                        />
                      </SearchItem>
                    </div>

                    <div className="settings-section">
                      <Text
                        size="big"
                        id="canvas-navigation"
                        className="settings-heading"
                      >
                        {t("screens4_6.settings.sections.canvasNavigation")}
                      </Text>
                      <SearchItem
                        search={search}
                        keywords="canvas navigation pan controls mouse select left click drag"
                      >
                        <SelectField
                          label={t("screens4_6.settings.canvasNavigation.leftClickDrag.label")}
                          value={settings.panControls}
                          onChange={handlePanControlsChange}
                          options={panControlsOptions}
                          description={t("screens4_6.settings.canvasNavigation.leftClickDrag.description")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="canvas navigation node selection mode full partial"
                      >
                        <SelectField
                          label={t("screens4_6.settings.canvasNavigation.selectionMode.label")}
                          value={settings.selectionMode}
                          onChange={handleSelectionModeChange}
                          options={selectionModeOptions}
                          description={t("screens4_6.settings.canvasNavigation.selectionMode.description")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="canvas navigation grid snap align nodes"
                      >
                        <LabeledSwitch
                          label={t("screens4_6.settings.canvasNavigation.snapToGrid.label")}
                          checked={!!settings.snapToGrid}
                          onChange={handleSnapToGridChange}
                          description={t("screens4_6.settings.canvasNavigation.snapToGrid.description")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="canvas navigation grid snap precision"
                      >
                        <NumberSetting
                          id="grid-snap-input"
                          label={t("screens4_6.settings.canvasNavigation.gridSnapPrecision.label")}
                          value={settings.gridSnap}
                          onCommit={setGridSnap}
                          min={1}
                          max={100}
                          fallback={25}
                          disabled={!settings.snapToGrid}
                          description={t("screens4_6.settings.canvasNavigation.gridSnapPrecision.description")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="canvas navigation connection snap range"
                      >
                        <NumberSetting
                          id="connection-snap-input"
                          label={t("screens4_6.settings.canvasNavigation.connectionSnapRange.label")}
                          value={settings.connectionSnap}
                          onCommit={setConnectionSnap}
                          min={5}
                          max={30}
                          fallback={20}
                          description={t("screens4_6.settings.canvasNavigation.connectionSnapRange.description")}
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
                        {t("screens4_6.settings.sections.autosave")}
                      </Text>
                      <SearchItem
                        search={search}
                        keywords="autosave version history enable"
                      >
                        <LabeledSwitch
                          label={t("screens4_6.settings.autosave.enabled.label")}
                          checked={settings.autosave?.enabled ?? true}
                          onChange={(checked) =>
                            updateAutosaveSettings({ enabled: checked })
                          }
                          description={t("screens4_6.settings.autosave.enabled.description")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="autosave version history interval minutes"
                      >
                        <SelectField
                          label={t("screens4_6.settings.autosave.interval.label")}
                          value={settings.autosave?.intervalMinutes ?? 10}
                          onChange={(v) =>
                            updateAutosaveSettings({
                              intervalMinutes: Number(v)
                            })
                          }
                          options={autosaveIntervalOptions}
                          disabled={!settings.autosave?.enabled}
                          description={t("screens4_6.settings.autosave.interval.description")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="autosave version history save before running checkpoint"
                      >
                        <LabeledSwitch
                          label={t("screens4_6.settings.autosave.saveBeforeRun.label")}
                          checked={settings.autosave?.saveBeforeRun ?? true}
                          onChange={(checked) =>
                            updateAutosaveSettings({
                              saveBeforeRun: checked
                            })
                          }
                          description={t("screens4_6.settings.autosave.saveBeforeRun.description")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={search}
                        keywords="autosave version history save on window close"
                      >
                        <LabeledSwitch
                          label={t("screens4_6.settings.autosave.saveOnClose.label")}
                          checked={settings.autosave?.saveOnClose ?? true}
                          onChange={(checked) =>
                            updateAutosaveSettings({
                              saveOnClose: checked
                            })
                          }
                          description={t("screens4_6.settings.autosave.saveOnClose.description")}
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

                  {!isCloudProfile() &&
                    matchesSearch(
                    "folders assets workspace directory storage",
                    search
                  ) && (
                    <>
                      <Text size="big" id="folders" className="settings-heading">
                        {t("screens4_6.settings.sidebar.items.folders")}
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
                        {t("screens4_6.settings.sidebar.items.connectedAccounts")}
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
                        {t("screens4_6.settings.sidebar.items.mcpIntegration")}
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
                        {t("screens4_6.settings.sidebar.items.browserExtension")}
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
                        {t("screens4_6.settings.sidebar.items.nodetoolApi")}
                      </Text>
                      <div className="settings-section">
                        <div className="settings-item">
                          <Text>
                            {t("screens4_6.settings.apiToken.intro")} {" "}
                            programmatically.{" "}
                            <TextLink
                              href="https://github.com/nodetool-ai/nodetool#using-the-workflow-api-"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {t("screens4_6.settings.apiToken.documentationLink")}
                            </TextLink>
                          </Text>
                          <div className="secrets">
                            <WarningIcon
                              sx={{
                                color: (theme) =>
                                  theme.vars.palette.warning.main
                              }}
                            />
                            <Text component="span">
                              {t("screens4_6.settings.apiToken.securityNotice")}
                            </Text>
                          </div>
                          <Box>
                            <Tooltip title={t("screens4_6.settings.apiToken.copyTooltip")}>
                              <EditorButton
                                size="small"
                                variant="outlined"
                                startIcon={<ContentCopyIcon />}
                                onClick={copyAuthToken}
                              >
                                {t("screens4_6.settings.apiToken.copyButton")}
                              </EditorButton>
                            </Tooltip>
                          </Box>
                        </div>
                      </div>
                    </>
                  )}
                  </div>
                </TabPanel>

                <TabPanel section="privacy" current={section}>
                  <PrivacyMenu />
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
