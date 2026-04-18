/** @jsxImportSource @emotion/react */
// Dialog-based settings menu (replacing MUI Menu)
import React, { memo, useId } from "react";
import {
  Tabs,
  Tab,
  Box
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import SettingsIcon from "@mui/icons-material/Settings";
import WarningIcon from "@mui/icons-material/Warning";
import { useSettingsStore } from "../../stores/SettingsStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useAuth from "../../stores/useAuth";
import {
  CloseButton,
  SearchInput,
  TextInput,
  LabeledSwitch,
  SelectField,
  Tooltip,
  Text,
  EditorButton
} from "../ui_primitives";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { isLocalhost, isElectron } from "../../lib/env";
import RemoteSettingsMenuComponent from "./RemoteSettingsMenu";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import FoldersSettings from "./FoldersSettingsMenu";
import SecretsMenu from "./SecretsMenu";
import { getSecretsSidebarSections } from "./secretsSidebarUtils";
import AboutMenu from "./AboutMenu";
import { getAboutSidebarSections } from "./aboutSidebarUtils";
import DefaultModelsMenu from "./DefaultModelsMenu";
import MCPSettingsMenu from "./MCPSettingsMenu";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useState, useCallback, useEffect, useRef } from "react";
import SettingsSidebar from "./SettingsSidebar";
import useSecretsStore from "../../stores/SecretsStore";
import { settingsStyles } from "./settingsMenuStyles";
import { Dialog } from "../ui_primitives";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel = React.memo(function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      className="tab-panel"
      {...other}
    >
      {value === index && <Box className="tab-panel-content">{children}</Box>}
    </div>
  );
});

interface SettingsMenuProps {
  buttonText?: string;
}

function SettingsMenu({ buttonText = "" }: SettingsMenuProps) {
  const session = useAuth((state) => state.session);
  const isMenuOpen = useSettingsStore((state) => state.isMenuOpen);
  const setMenuOpen = useSettingsStore((state) => state.setMenuOpen);
  const settingsTab = useSettingsStore((state) => state.settingsTab);
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
  const setShowWelcomeOnStartup = useSettingsStore(
    (state) => state.setShowWelcomeOnStartup
  );
  const setSoundNotifications = useSettingsStore(
    (state) => state.setSoundNotifications
  );
  const updateAutosaveSettings = useSettingsStore(
    (state) => state.updateAutosaveSettings
  );
  const settings = useSettingsStore((state) => state.settings);
  const [apiSearchTerm, setApiSearchTerm] = useState("");

  // Generate unique IDs for form controls
  const baseId = useId();

  const [activeSection, setActiveSection] = useState("editor");
  const [, setSecretsUpdated] = useState({});
  const settingsContentRef = useRef<HTMLDivElement | null>(null);
  const [closeBehavior, setCloseBehavior] = useState<
    "ask" | "quit" | "background"
  >("ask");

  // Load close behavior setting on mount (Electron only)
  useEffect(() => {
    if (isElectron && window.api?.settings?.getCloseBehavior) {
      window.api.settings
        .getCloseBehavior()
        .then((action: "ask" | "quit" | "background") => {
          setCloseBehavior(action);
        });
    }
  }, []);

  const handleCloseBehaviorChange = useCallback(
    (action: "ask" | "quit" | "background") => {
      setCloseBehavior(action);
      if (window.api?.settings?.setCloseBehavior) {
        window.api.settings.setCloseBehavior(action);
      }
    },
    []
  );

  // Subscribe to secrets store changes to update sidebar when secrets are modified
  useEffect(() => {
    const unsubscribe = useSecretsStore.subscribe(() => setSecretsUpdated({}));
    return unsubscribe;
  }, []);

  const handleTabChange = useCallback(
    (event: React.SyntheticEvent, newValue: number) => {
      setMenuOpen(true, newValue);
      setApiSearchTerm("");
    },
    [setMenuOpen]
  );

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setMenuOpen(!isMenuOpen);
    },
    [isMenuOpen, setMenuOpen]
  );

  // Memoized handlers for settings controls to prevent re-renders
  const handleShowWelcomeChange = useCallback(
    (checked: boolean) => {
      setShowWelcomeOnStartup(checked);
    },
    [setShowWelcomeOnStartup]
  );

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

  const handleGridSnapChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setGridSnap(Number(e.target.value));
    },
    [setGridSnap]
  );

  const handleConnectionSnapChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setConnectionSnap(Number(e.target.value));
    },
    [setConnectionSnap]
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
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const handleClose = () => {
    setMenuOpen(false);
  };

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

    // Scope scrolling to this component's visible tab panel.
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

  // Tab 0: General sidebar folders
  const generalSidebarSections = [
    {
      category: "Workspace",
      items: [
        { id: "editor", label: "Editor" },
        { id: "appearance", label: "Appearance" }
      ]
    },
    {
      category: "Canvas",
      items: [{ id: "canvas-navigation", label: "Canvas & Navigation" }]
    },
    {
      category: "AI",
      items: [{ id: "default-models", label: "Default Models" }]
    },
    {
      category: "History",
      items: [{ id: "autosave", label: "Autosave" }]
    }
  ];

  // Tab 1: API & Keys sidebar folders
  const apiKeysSidebarSections = [
    {
      category: "Credentials",
      items: [
        { id: "api-keys", label: "API Keys" },
        ...(session?.access_token && !isLocalhost
          ? [{ id: "nodetool-api-token", label: "Nodetool API Token" }]
          : [])
      ]
    },
    {
      category: "Configuration",
      items: [{ id: "api-settings", label: "API Settings" }]
    },
    ...(isLocalhost
      ? [
          {
            category: "Integrations",
            items: [{ id: "mcp-integration", label: "MCP Servers" }]
          }
        ]
      : []),
    {
      category: "Storage",
      items: [{ id: "folders", label: "Folders" }]
    }
  ];

  // Subscribe to store data for sidebar sections to enable memoization
  const remoteSettings = useRemoteSettingsStore((state) => state.settings);
  const secrets = useSecretsStore((state) => state.secrets);

  // Keep secrets sidebar sections for potential future use
  void remoteSettings;
  void secrets;

  const theme = useTheme();

  return (
    <div className="settings">
      <Tooltip title="Settings" delay={TOOLTIP_ENTER_DELAY}>
        <EditorButton
          tabIndex={-1}
          className="settings-button command-icon"
          aria-controls={isMenuOpen ? "basic-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={isMenuOpen ? "true" : undefined}
          onClick={handleClick}
        >
          <SettingsIcon />
          {buttonText}
        </EditorButton>
      </Tooltip>
      <Dialog
        open={isMenuOpen}
        onClose={handleClose}
        fullWidth
        maxWidth="lg"
        sx={{
          "& .MuiPaper-root": {
            height: "85vh",
            overflow: "hidden"
          },
          "& .dialog-content": {
            padding: 0,
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
            overflow: "hidden"
          }
        }}
      >
        <div css={settingsStyles(theme)}>
          <div className="top">
            <Text size="bigger">Settings</Text>
            <CloseButton onClick={handleClose} />
          </div>

          <div className="settings-menu">
            <div className="sticky-header">
              <Tabs
                value={settingsTab}
                onChange={handleTabChange}
                className="settings-tabs"
                aria-label="settings tabs"
              >
                <Tab label="General" id="settings-tab-0" />
                <Tab label="API & Keys" id="settings-tab-1" />
                <Tab label="About" id="settings-tab-2" />
              </Tabs>
            </div>

            <div className="settings-container">
              <SettingsSidebar
                key={`sidebar-${settingsTab}`}
                activeSection={activeSection}
                sections={
                  settingsTab === 0
                    ? generalSidebarSections
                    : settingsTab === 1
                      ? apiKeysSidebarSections
                      : settingsTab === 2
                        ? getAboutSidebarSections()
                        : []
                }
                onSectionClick={scrollToSection}
              />

              <div className="settings-content" ref={settingsContentRef}>
                {/* Tab 0: General */}
                <TabPanel value={settingsTab} index={0}>
                  <div id="editor" className="settings-section">
                    <div className="settings-item">
                      <LabeledSwitch
                        label="Show Welcome Screen"
                        checked={!!settings.showWelcomeOnStartup}
                        onChange={handleShowWelcomeChange}
                        description="Show the welcome screen when starting the application."
                      />
                    </div>

                    <div className="settings-item">
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
                    </div>

                    {isElectron && (
                      <div className="settings-item">
                        <LabeledSwitch
                          label="Sound Notifications"
                          checked={!!settings.soundNotifications}
                          onChange={handleSoundNotificationsChange}
                          description="Play a system beep sound when workflows complete, exports finish, or other important events occur."
                        />
                      </div>
                    )}

                    {isElectron && (
                      <div className="settings-item">
                        <SelectField
                          label="On Close Behavior"
                          value={closeBehavior}
                          variant="standard"
                          onChange={(v) =>
                            handleCloseBehaviorChange(
                              v as "ask" | "quit" | "background"
                            )
                          }
                          options={[
                            { value: "ask", label: "Ask Every Time" },
                            { value: "quit", label: "Quit Application" },
                            {
                              value: "background",
                              label: "Keep Running in Background"
                            }
                          ]}
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
                      </div>
                    )}
                  </div>

                  <Text size="big" id="canvas-navigation">
                    Canvas & Navigation
                  </Text>
                  <div className="settings-section">
                    <div className="settings-item">
                      <SelectField
                        label="Pan Controls"
                        value={settings.panControls}
                        variant="standard"
                        onChange={handlePanControlsChange}
                        options={[
                          { value: "LMB", label: "Pan with LMB" },
                          { value: "RMB", label: "Pan with RMB" }
                        ]}
                      />
                      <div className="description">
                        <Text>
                          Move the canvas by dragging with the left or right
                          mouse button.
                        </Text>
                        <Text>
                          With RMB selected, you can also pan with the Middle
                          Mouse Button.
                        </Text>
                      </div>
                    </div>

                    <div className="settings-item">
                      <SelectField
                        label="Node Selection Mode"
                        value={settings.selectionMode}
                        variant="standard"
                        onChange={handleSelectionModeChange}
                        options={[
                          { value: "full", label: "Full" },
                          { value: "partial", label: "Partial" }
                        ]}
                      />
                      <Text className="description">
                        When drawing a selection box for node selections:
                        <br />
                        <b>Full:</b> nodes have to be fully enclosed.
                        <br />
                        <b>Partial:</b> intersecting nodes will be selected.
                      </Text>
                    </div>

                    <div className="settings-item">
                      <TextInput
                        type="number"
                        autoComplete="off"
                        slotProps={{ htmlInput: { min: 1, max: 100 } }}
                        id="grid-snap-input"
                        label="Grid Snap Precision"
                        value={settings.gridSnap}
                        onChange={handleGridSnapChange}
                        variant="standard"
                        size="small"
                      />
                      <Text className="description">
                        Snap precision for moving nodes on the canvas.
                      </Text>
                    </div>

                    <div className="settings-item">
                      <TextInput
                        type="number"
                        autoComplete="off"
                        slotProps={{ htmlInput: { min: 5, max: 30 } }}
                        id="connection-snap-input"
                        label="Connection Snap Range"
                        value={settings.connectionSnap}
                        onChange={handleConnectionSnapChange}
                        variant="standard"
                        size="small"
                      />
                      <Text className="description">
                        Snap distance for connecting nodes.
                      </Text>
                    </div>
                  </div>

                  <DefaultModelsMenu />

                  <Text size="big" id="autosave">
                    Autosave & Version History
                  </Text>
                  <div className="settings-section">
                    <div className="settings-item">
                      <LabeledSwitch
                        label="Enable Autosave"
                        checked={settings.autosave?.enabled ?? true}
                        onChange={(checked) =>
                          updateAutosaveSettings({ enabled: checked })
                        }
                        description="Automatically save your workflow at regular intervals."
                      />
                    </div>

                    <div className="settings-item">
                      <SelectField
                        label="Autosave Interval (minutes)"
                        value={settings.autosave?.intervalMinutes ?? 10}
                        variant="standard"
                        onChange={(v) =>
                          updateAutosaveSettings({
                            intervalMinutes: Number(v)
                          })
                        }
                        options={[
                          { value: 1, label: "1 minute" },
                          { value: 5, label: "5 minutes" },
                          { value: 10, label: "10 minutes" },
                          { value: 15, label: "15 minutes" },
                          { value: 30, label: "30 minutes" },
                          { value: 60, label: "60 minutes" }
                        ]}
                        disabled={!settings.autosave?.enabled}
                        description="How often to automatically save your workflow."
                      />
                    </div>

                    <div className="settings-item">
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
                    </div>

                    <div className="settings-item">
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
                    </div>

                    <div className="settings-item">
                      <SelectField
                        label="Max Versions per Workflow"
                        value={
                          settings.autosave?.maxVersionsPerWorkflow ?? 50
                        }
                        variant="standard"
                        onChange={(v) =>
                          updateAutosaveSettings({
                            maxVersionsPerWorkflow: Number(v)
                          })
                        }
                        options={[
                          { value: 10, label: "10 versions" },
                          { value: 25, label: "25 versions" },
                          { value: 50, label: "50 versions" },
                          { value: 100, label: "100 versions" }
                        ]}
                        description="Maximum number of versions to keep per workflow."
                      />
                    </div>
                  </div>

                  <Text size="big" id="appearance">
                    Appearance
                  </Text>
                  <div className="settings-section">
                    <div className="settings-item">
                      <SelectField
                        label="Time Format"
                        value={settings.timeFormat}
                        variant="standard"
                        onChange={handleTimeFormatChange}
                        options={[
                          { value: "12h", label: "12h" },
                          { value: "24h", label: "24h" }
                        ]}
                        description="Display time in 12h or 24h format."
                      />
                    </div>
                  </div>
                </TabPanel>

                {/* Tab 1: API & Keys */}
                <TabPanel value={settingsTab} index={1}>
                  <div style={{ marginBottom: "1.5em" }}>
                    <SearchInput
                      placeholder="Search API keys, settings, and folders..."
                      value={apiSearchTerm}
                      onChange={setApiSearchTerm}
                      size="small"
                      showClear
                    />
                  </div>

                  <Text size="big" id="api-keys" sx={{ marginBottom: "0.25em" }}>
                    API Keys
                  </Text>
                  <SecretsMenu searchTerm={apiSearchTerm} />

                  {session?.access_token && !isLocalhost && (
                    <>
                      <Text size="big" id="nodetool-api-token">
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
                            fontSize: "1rem",
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

                  <Text size="big" id="api-settings">
                    API Settings
                  </Text>
                  <RemoteSettingsMenuComponent />

                  {isLocalhost && (
                    <>
                      <Text size="big" id="mcp-integration">
                        MCP Integration
                      </Text>
                      <MCPSettingsMenu />
                    </>
                  )}

                  <Text size="big" id="folders">
                    Folders
                  </Text>
                  <FoldersSettings />
                </TabPanel>

                {/* Tab 2: About */}
                <TabPanel value={settingsTab} index={2}>
                  <AboutMenu />
                </TabPanel>
              </div>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default memo(SettingsMenu);
