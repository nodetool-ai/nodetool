/** @jsxImportSource @emotion/react */
// Dialog-based settings menu (replacing MUI Menu)
import MenuItem from "@mui/material/MenuItem";
import {
  TextField,
  Button,
  Typography,
  InputLabel,
  FormControl,
  Tooltip,
  Switch,
  Tabs,
  Tab,
  Box,
  Dialog,
  DialogContent
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import Select from "@mui/material/Select";
import SettingsIcon from "@mui/icons-material/Settings";
import WarningIcon from "@mui/icons-material/Warning";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useNavigate } from "react-router";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useAuth from "../../stores/useAuth";
import CloseButton from "../buttons/CloseButton";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { client, isLocalhost, isElectron } from "../../stores/ApiClient";
import RemoteSettingsMenuComponent from "./RemoteSettingsMenu";
import { getRemoteSidebarSections as getApiServicesSidebarSections } from "./remoteSidebarUtils";
import FoldersSettings from "./FoldersSettingsMenu";
import { getFoldersSidebarSections } from "./foldersSidebarUtils";
import SecretsMenu from "./SecretsMenu";
import { getSecretsSidebarSections } from "./secretsSidebarUtils";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useState, useCallback, useEffect } from "react";
import SettingsSidebar from "./SettingsSidebar";
import { useMutation } from "@tanstack/react-query";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useSecretsStore from "../../stores/SecretsStore";
import { settingsStyles } from "./settingsMenuStyles";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
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
}

interface SettingsMenuProps {
  buttonText?: string;
}

function SettingsMenu({ buttonText = "" }: SettingsMenuProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    isMenuOpen,
    setMenuOpen,
    settingsTab,
    setGridSnap,
    setConnectionSnap,
    setPanControls,
    setSelectionMode,
    setTimeFormat,
    setSelectNodesOnDrag,
    setShowWelcomeOnStartup,
    setSoundNotifications,
    settings
  } = useSettingsStore((state) => ({
    isMenuOpen: state.isMenuOpen,
    settings: state.settings,
    setMenuOpen: state.setMenuOpen,
    settingsTab: state.settingsTab,
    setGridSnap: state.setGridSnap,
    setConnectionSnap: state.setConnectionSnap,
    setPanControls: state.setPanControls,
    setSelectionMode: state.setSelectionMode,
    setTimeFormat: state.setTimeFormat,
    setSelectNodesOnDrag: state.setSelectNodesOnDrag,
    setShowWelcomeOnStartup: state.setShowWelcomeOnStartup,
    setSoundNotifications: state.setSoundNotifications
  }));

  const [activeSection, setActiveSection] = useState("editor");
  const [lastExportPath, setLastExportPath] = useState<string | null>(null);
  const [, setSecretsUpdated] = useState({});
  const currentWorkflowId = useWorkflowManager((s) => s.currentWorkflowId);
  const [closeBehavior, setCloseBehavior] = useState<"ask" | "quit" | "background">("ask");

  // Load close behavior setting on mount (Electron only)
  useEffect(() => {
    if (isElectron && window.api?.settings?.getCloseBehavior) {
      window.api.settings.getCloseBehavior().then((action: "ask" | "quit" | "background") => {
        setCloseBehavior(action);
      });
    }
  }, []);

  const handleCloseBehaviorChange = useCallback((action: "ask" | "quit" | "background") => {
    setCloseBehavior(action);
    if (window.api?.settings?.setCloseBehavior) {
      window.api.settings.setCloseBehavior(action);
    }
  }, []);

  // Subscribe to secrets store changes to update sidebar when secrets are modified
  useEffect(() => {
    const unsubscribe = useSecretsStore.subscribe(() => setSecretsUpdated({}));
    return unsubscribe;
  }, []);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setMenuOpen(true, newValue);
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setMenuOpen(!isMenuOpen);
  };
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const handleClose = () => {
    setMenuOpen(false);
  };

  const id = isMenuOpen ? "docs" : undefined;

  const copyAuthToken = () => {
    if (user && (user as any).auth_token) {
      navigator.clipboard.writeText((user as any).auth_token);
      addNotification({
        type: "info",
        alert: true,
        content: "Nodetool API Token copied to Clipboard!"
      });
    }
  };

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);

    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
      const element = document.getElementById(sectionId);

      // Always use the main settings-content container as it contains both tabs
      const container = document.querySelector(".settings-content");

      if (element && container) {
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const scrollTop =
          container.scrollTop + elementRect.top - containerRect.top - 20; // 20px offset for padding

        container.scrollTo({
          top: scrollTop,
          behavior: "smooth"
        });
      } else if (element) {
        // Fallback to original method
        element.scrollIntoView({ behavior: "smooth" });
      }
    }, 10);
  };

  const exportMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        workflow_id: currentWorkflowId || undefined,
        errors: [],
        preferred_save: "downloads"
      };
      const { error, data } = await client.POST("/api/debug/export", {
        body: payload
      });
      if (error) {
        throw new Error(error.detail?.[0]?.msg || "Unknown error");
      }
      return data;
    },
    onSuccess: (data) => {
      addNotification({
        type: "success",
        content: `Debug bundle saved: ${data.file_path}`,
        alert: true
      });
      setLastExportPath(data.file_path);
      
      // Show in folder using the new shell API
      if (typeof window.api?.shell?.showItemInFolder === "function") {
        window.api.shell.showItemInFolder(data.file_path);
        
        // Play notification sound if enabled
        if (settings.soundNotifications && typeof window.api.shell.beep === "function") {
          window.api.shell.beep();
        }
      } else if (typeof window.api?.showItemInFolder === "function") {
        // Fallback to legacy API
        window.api.showItemInFolder(data.file_path);
      } else {
        addNotification({
          type: "info",
          content:
            "Electron not available to open folder. Please open it manually.",
          dismissable: true
        });
      }
    },
    onError: (err: any) => {
      addNotification({
        type: "error",
        content: `Export failed: ${err?.message || "Unknown error"}`,
        dismissable: true
      });
    }
  });

  const handleExport = useCallback(() => {
    if (exportMutation.isPending) {return;}
    exportMutation.mutate();
  }, [exportMutation]);

  const generalSidebarSections = [
    {
      category: "General",
      items: [
        { id: "editor", label: "Editor" },
        { id: "navigation", label: "Navigation" },
        { id: "grid", label: "Grid & Connections" },
        { id: "appearance", label: "Appearance" }
      ]
    }
  ];

  if (user && (user as any).auth_token) {
    generalSidebarSections.push({
      category: "API",
      items: [{ id: "api", label: "Nodetool API" }]
    });
  }

  const theme = useTheme();

  return (
    <div className="settings">
      <Tooltip title="Settings" enterDelay={TOOLTIP_ENTER_DELAY}>
        <Button
          tabIndex={-1}
          className="settings-button command-icon"
          aria-controls={isMenuOpen ? "basic-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={isMenuOpen ? "true" : undefined}
          onClick={handleClick}
        >
          <SettingsIcon />
          {buttonText}
        </Button>
      </Tooltip>
      <Dialog
        open={isMenuOpen}
        onClose={handleClose}
        fullWidth
        maxWidth="md"
        sx={{
          "& .MuiDialog-paper": {
            width: "70vw",
            minWidth: "400px",
            maxWidth: "1000px",
            height: "75vh",
            margin: "auto",
            borderRadius: 1,
            border: `1px solid ${theme.vars.palette.divider}`,
            backgroundColor:
              (theme as any)?.palette?.glass?.backgroundDialogContent ??
              "transparent",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)"
          }
        }}
        slotProps={{
          backdrop: {
            style: {
              backdropFilter: theme.vars.palette.glass.blur,
              backgroundColor: theme.vars.palette.glass.backgroundDialog
            }
          },
          paper: {
            style: {
              borderRadius: theme.vars.rounded.dialog,
              background: theme.vars.palette.glass.backgroundDialogContent
            }
          }
        }}
      >
        <DialogContent sx={{ p: 0, overflow: "hidden" }}>
          <div css={settingsStyles(theme)}>
            <div className="top">
              <Typography variant="h2">Settings</Typography>
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
                  <Tab label="API Settings" id="settings-tab-1" />
                  <Tab label="Folders" id="settings-tab-2" />
                  <Tab label="API Secrets" id="settings-tab-3" />
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
                      ? getApiServicesSidebarSections()
                      : settingsTab === 2
                      ? getFoldersSidebarSections()
                      : settingsTab === 3
                      ? getSecretsSidebarSections()
                      : []
                  }
                  onSectionClick={scrollToSection}
                />

                <div className="settings-content">
                  <TabPanel value={settingsTab} index={0}>
                    <div className="settings-section">
                      <Typography variant="h3" id="debug-tools" style={{ margin: 0, borderBottom: "none" }}>
                        Debug Tools
                      </Typography>
                      <div className="settings-item">
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.75em"
                          }}
                        >
                          <Button
                            size="small"
                            variant="contained"
                            onClick={handleExport}
                            disabled={exportMutation.isPending}
                          >
                            Export Debug Bundle
                          </Button>
                          {lastExportPath && (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.5em",
                                padding: "0.5em",
                                backgroundColor: "var(--palette-background-paper)",
                                borderRadius: "4px",
                                border: "1px solid var(--palette-divider)"
                              }}
                            >
                              <Typography
                                variant="caption"
                                style={{ color: "var(--palette-text-secondary)" }}
                              >
                                Last exported to:
                              </Typography>
                              <Typography
                                variant="body2"
                                style={{
                                  wordBreak: "break-all",
                                  fontSize: "0.8em"
                                }}
                              >
                                {lastExportPath}
                              </Typography>
                              {/* Only show Open Folder button in Electron */}
                              {isElectron && (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => {
                                    const api = (window as any)?.api;
                                    if (api?.shell?.showItemInFolder) {
                                      api.shell.showItemInFolder(lastExportPath);
                                    } else if (api?.showItemInFolder) {
                                      api.showItemInFolder(lastExportPath);
                                    }
                                  }}
                                  style={{ alignSelf: "flex-start" }}
                                >
                                  Open Folder
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                        <Typography className="description">
                          Collect logs, environment info, and the last workflow
                          context into a ZIP in your Downloads folder.
                        </Typography>
                      </div>
                    </div>

                    <div className="settings-section">
                      <div className="settings-item">
                        <FormControl>
                          <InputLabel htmlFor={id}>
                            Show Welcome Screen
                          </InputLabel>
                          <Switch
                            checked={!!settings.showWelcomeOnStartup}
                            onChange={(e) =>
                              setShowWelcomeOnStartup(e.target.checked)
                            }
                            inputProps={{ "aria-label": id }}
                          />
                        </FormControl>
                        <Typography className="description">
                          Show the welcome screen when starting the application.
                        </Typography>
                      </div>

                      <div className="settings-item">
                        <FormControl>
                          <InputLabel htmlFor={id}>
                            Select Nodes On Drag
                          </InputLabel>
                          <Switch
                            sx={{
                              "&.MuiSwitch-root": {
                                margin: "16px 0 0"
                              }
                            }}
                            checked={!!settings.selectNodesOnDrag}
                            onChange={(e) =>
                              setSelectNodesOnDrag(e.target.checked ?? false)
                            }
                            inputProps={{ "aria-label": id }}
                          />
                        </FormControl>
                        <Typography className="description">
                          Mark nodes as selected after changing a node&apos;s
                          position.
                          <br />
                          If disabled, nodes can still be selected by clicking
                          on them.
                        </Typography>
                      </div>

                      <div className="settings-item">
                        <FormControl>
                          <InputLabel htmlFor={id}>
                            Sound Notifications
                          </InputLabel>
                          <Switch
                            sx={{
                              "&.MuiSwitch-root": {
                                margin: "16px 0 0"
                              }
                            }}
                            checked={!!settings.soundNotifications}
                            onChange={(e) =>
                              setSoundNotifications(e.target.checked ?? true)
                            }
                            inputProps={{ "aria-label": id }}
                          />
                        </FormControl>
                        <Typography className="description">
                          Play a system beep sound when workflows complete,
                          exports finish, or other important events occur.
                          <br />
                          Only works in Electron app.
                        </Typography>
                      </div>

                      {isElectron && (
                        <div className="settings-item">
                          <FormControl>
                            <InputLabel htmlFor="close-behavior-select">
                              On Close Behavior
                            </InputLabel>
                            <Select
                              id="close-behavior-select"
                              value={closeBehavior}
                              variant="standard"
                              onChange={(e) =>
                                handleCloseBehaviorChange(
                                  e.target.value as "ask" | "quit" | "background"
                                )
                              }
                            >
                              <MenuItem value="ask">Ask Every Time</MenuItem>
                              <MenuItem value="quit">Quit Application</MenuItem>
                              <MenuItem value="background">
                                Keep Running in Background
                              </MenuItem>
                            </Select>
                          </FormControl>
                          <Typography className="description">
                            Choose what happens when you close the main window.
                            <br />
                            <b>Ask Every Time:</b> Shows a dialog with options.
                            <br />
                            <b>Quit:</b> Closes the application completely.
                            <br />
                            <b>Background:</b> Keeps the app running in the
                            system tray.
                          </Typography>
                        </div>
                      )}
                    </div>

                    <Typography variant="h3" id="navigation">
                      Navigation
                    </Typography>
                    <div className="settings-section">
                      <div className="settings-item">
                        <FormControl>
                          <InputLabel htmlFor={id}>Pan Controls</InputLabel>
                          <Select
                            id={id}
                            labelId={id}
                            value={settings.panControls}
                            variant="standard"
                            onChange={(e) => setPanControls(e.target.value)}
                          >
                            <MenuItem value={"LMB"}>Pan with LMB</MenuItem>
                            <MenuItem value={"RMB"}>Pan with RMB</MenuItem>
                          </Select>
                        </FormControl>

                        <div className="description">
                          <Typography>
                            Move the canvas by dragging with the left or right
                            mouse button.
                          </Typography>
                          <Typography>
                            With RMB selected, you can also pan with the Middle
                            Mouse Button.
                          </Typography>
                        </div>
                      </div>

                      <div className="settings-item">
                        <FormControl>
                          <InputLabel htmlFor={id}>
                            Node Selection Mode
                          </InputLabel>
                          <Select
                            id={id}
                            labelId={id}
                            value={settings.selectionMode}
                            variant="standard"
                            onChange={(e) => setSelectionMode(e.target.value)}
                          >
                            <MenuItem value={"full"}>Full</MenuItem>
                            <MenuItem value={"partial"}>Partial</MenuItem>
                          </Select>
                        </FormControl>
                        <Typography className="description">
                          When drawing a selection box for node selections:
                          <br />
                          <b>Full:</b> nodes have to be fully enclosed.
                          <br />
                          <b>Partial:</b> intersecting nodes will be selected.
                        </Typography>
                      </div>
                    </div>

                    <Typography variant="h3" id="grid">
                      Grid & Connections
                    </Typography>
                    <div className="settings-section">
                      <div className="settings-item">
                        <TextField
                          type="number"
                          autoComplete="off"
                          inputProps={{
                            min: 1,
                            max: 100,
                            onClick: (
                              e: React.MouseEvent<HTMLInputElement>
                            ) => {
                              e.currentTarget.select();
                            }
                          }}
                          id="grid-snap-input"
                          label="Grid Snap Precision"
                          value={settings.gridSnap}
                          onChange={(e) => setGridSnap(Number(e.target.value))}
                          variant="standard"
                        />
                        <Typography className="description">
                          Snap precision for moving nodes on the canvas.
                        </Typography>
                      </div>

                      <div className="settings-item">
                        <TextField
                          type="number"
                          autoComplete="off"
                          inputProps={{
                            min: 5,
                            max: 30,
                            onClick: (
                              e: React.MouseEvent<HTMLInputElement>
                            ) => {
                              e.currentTarget.select();
                            }
                          }}
                          id="connection-snap-input"
                          label="Connection Snap Range"
                          value={settings.connectionSnap}
                          onChange={(e) =>
                            setConnectionSnap(Number(e.target.value))
                          }
                          variant="standard"
                        />
                        <Typography className="description">
                          Snap distance for connecting nodes.
                        </Typography>
                      </div>
                    </div>

                    <Typography variant="h3" id="appearance">
                      Appearance
                    </Typography>
                    <div className="settings-section">
                      <div className="settings-item">
                        <FormControl>
                          <InputLabel htmlFor={id}>Time Format</InputLabel>
                          <Select
                            id={id}
                            labelId={id}
                            value={settings.timeFormat}
                            variant="standard"
                            onChange={(e) =>
                              setTimeFormat(
                                e.target.value === "12h" ? "12h" : "24h"
                              )
                            }
                          >
                            <MenuItem value={"12h"}>12h</MenuItem>
                            <MenuItem value={"24h"}>24h</MenuItem>
                          </Select>
                        </FormControl>
                        <Typography className="description">
                          Display time in 12h or 24h format.
                        </Typography>
                      </div>
                    </div>

                    {user && (user as any).auth_token && (
                      <>
                        <Typography variant="h3" id="api">
                          Nodetool API
                        </Typography>
                        <Typography
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
                        </Typography>
                        {!isLocalhost && (
                          <div
                            className="settings-section"
                            style={{
                              border:
                                "1px solid" + theme.vars.palette.warning.main,
                              borderRight:
                                "1px solid" + theme.vars.palette.warning.main
                            }}
                          >
                            <FormControl>
                              <InputLabel>Nodetool API Token</InputLabel>
                            </FormControl>
                            <div className="description">
                              <Typography>
                                This token is used to authenticate your
                                account with the Nodetool API.
                              </Typography>
                              <div className="secrets">
                                <WarningIcon sx={{ color: "#ff9800" }} />
                                <Typography component="span">
                                  Keep this token secure and do not share it
                                  publicly
                                </Typography>
                              </div>
                            </div>
                            <Tooltip title="Copy to clipboard">
                              <Button
                                style={{ margin: ".5em 0" }}
                                size="small"
                                variant="outlined"
                                startIcon={<ContentCopyIcon />}
                                onClick={copyAuthToken}
                              >
                                Copy Token
                              </Button>
                            </Tooltip>
                          </div>
                        )}
                      </>
                    )}
                  </TabPanel>

                  <TabPanel value={settingsTab} index={1}>
                    <RemoteSettingsMenuComponent />
                  </TabPanel>
                  <TabPanel value={settingsTab} index={2}>
                    <FoldersSettings />
                  </TabPanel>
                  <TabPanel value={settingsTab} index={3}>
                    <SecretsMenu />
                  </TabPanel>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SettingsMenu;
