/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { VERSION } from "../../config/constants";
import Menu from "@mui/material/Menu";
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
  Box
} from "@mui/material";
import Select from "@mui/material/Select";
import SettingsIcon from "@mui/icons-material/Settings";
import WarningIcon from "@mui/icons-material/Warning";
import { useSettingsStore } from "../../stores/SettingsStore";
import ThemeNodetool from "../themes/ThemeNodetool";
import { useNavigate } from "react-router";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useAuth from "../../stores/useAuth";
import CloseButton from "../buttons/CloseButton";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { isLocalhost, isProduction } from "../../stores/ApiClient";
import RemoteSettingsMenu from "./RemoteSettingsMenu";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useState } from "react";
import SettingsSidebar from "./SettingsSidebar";

export const settingsStyles = (theme: any): any =>
  css({
    ".MuiBackdrop-root": {
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      backdropFilter: "blur(5px)"
    },
    ".MuiPaper-root": {
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      backdropFilter: "blur(10px)",
      border: `1px solid ${theme.palette.c_gray2}`,
      borderRadius: ".5em",
      maxWidth: "1000px",
      overflow: "hidden",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
      fontSize: theme.fontSizeNormal
    },
    ".settings-tabs": {
      marginBottom: "1em",
      paddingTop: "0em",
      lineHeight: "1.5",
      "& .MuiTabs-indicator": {
        backgroundColor: theme.palette.c_hl1,
        height: "3px",
        borderRadius: "1.5px"
      },
      "& .MuiTab-root": {
        color: theme.palette.c_gray5,
        transition: "color 0.2s ease",
        paddingBottom: "0em",
        "&.Mui-selected": {
          color: theme.palette.c_white
        },
        "&:hover": {
          color: theme.palette.c_white
        }
      }
    },
    ".tab-panel": {
      padding: "0",
      height: "100%",
      fontSize: theme.fontSizeNormal
    },
    ".tab-panel-content": {
      paddingBottom: "1em"
    },

    ".settings": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "1em",
      width: "100%",
      height: "100%",
      padding: ".5em 1em"
    },
    ".top": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "0em 1em",
      borderBottom: `1px solid ${theme.palette.c_gray2}`,
      h2: {
        marginTop: "0",
        marginBottom: "0.5em",
        padding: "0",
        color: theme.palette.c_white,
        fontSize: theme.fontSizeBigger,
        lineHeight: "1.5",
        fontWeight: "500"
      }
    },
    ".settings-menu": {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      height: "75vh",
      width: "70vw",
      minWidth: "400px",
      maxWidth: "1000px",
      fontSize: theme.fontSizeNormal
    },
    ".settings-container": {
      display: "flex",
      flexDirection: "row",
      flex: 1,
      overflow: "hidden",
      height: "70vh"
    },
    ".settings-sidebar": {
      width: "220px",
      minWidth: "220px",
      background: "rgba(0, 0, 0, 0.2)",
      padding: "1.5em 0",
      height: "calc(75vh - 48px)",
      overflowY: "auto",
      borderRight: `1px solid ${theme.palette.c_gray2}`
    },
    ".settings-sidebar-item": {
      padding: "0.75em 1.5em",
      cursor: "pointer",
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.c_white,
      opacity: "0.7",
      transition: "all 0.2s ease",
      borderLeft: "3px solid transparent",
      "&:hover": {
        opacity: 1,
        backgroundColor: "rgba(255, 255, 255, 0.05)"
      },
      "&.active": {
        opacity: 1,
        borderLeftColor: theme.palette.c_hl1,
        backgroundColor: "rgba(255, 255, 255, 0.05)"
      }
    },
    ".settings-sidebar-category": {
      padding: "1em 1.5em 0.5em",
      color: theme.palette.c_hl1,
      fontSize: theme.fontSizeSmaller,
      fontWeight: "500",
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      opacity: "0.8"
    },
    ".sticky-header": {
      position: "sticky",
      top: 0,
      zIndex: 100,
      padding: "0 1em",
      display: "block",
      backgroundColor: "rgba(0, 0, 0, 0.4)",
      borderBottom: `1px solid ${theme.palette.c_gray2}`
    },
    ".settings-content": {
      flex: 1,
      padding: "0 1em",
      overflowY: "auto",
      height: "70vh",
      "&::-webkit-scrollbar": {
        width: "8px"
      },
      "&::-webkit-scrollbar-track": {
        background: theme.palette.c_gray1
      },
      "&::-webkit-scrollbar-thumb": {
        background: theme.palette.c_gray3,
        borderRadius: "4px"
      },
      "&::-webkit-scrollbar-thumb:hover": {
        background: theme.palette.c_gray4
      }
    },
    ".settings-section": {
      backgroundColor: "rgba(30, 30, 30, 0.4)",
      backdropFilter: "blur(5px)",
      borderRadius: "8px",
      padding: "1.2em",
      margin: "1.5em 0 1.5em 0",
      boxShadow: "0 2px 12px rgba(0, 0, 0, 0.2)",
      border: `1px solid ${theme.palette.c_gray2}`,
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: ".8em"
    },
    ".settings-item": {
      padding: "1em 0",
      borderBottom: `1px solid ${theme.palette.c_gray2}`,
      "&:last-child": {
        borderBottom: "none",
        paddingBottom: "0"
      },
      "&:first-child": {
        paddingTop: "0"
      },
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: ".8em",
      ".MuiFormControl-root": {
        width: "100%",
        minWidth: "unset",
        margin: "0",
        padding: "0 .5em",
        "& .MuiInputLabel-root": {
          position: "relative",
          transform: "none",
          marginBottom: "8px",
          fontWeight: "500",
          color: theme.palette.c_white,
          fontSize: theme.fontSizeNormal
        },
        "& .MuiInputBase-root": {
          maxWidth: "34em",
          backgroundColor: theme.palette.c_gray1,
          borderRadius: ".3em",
          margin: "0",
          padding: ".3em 1em",
          transition: "background-color 0.2s ease",
          fontSize: theme.fontSizeNormal,
          "&::before": {
            content: "none"
          }
        }
      },
      label: {
        color: theme.palette.c_white,
        fontSize: theme.fontSizeBig,
        fontWeight: "500",
        padding: ".5em 0 .25em 0"
      },
      ".description": {
        color: theme.palette.c_gray6,
        fontSize: theme.fontSizeNormal,
        margin: "0",
        padding: "0 1em 0 0.5em",
        lineHeight: "1.6",
        a: {
          color: theme.palette.c_hl1,
          backgroundColor: theme.palette.c_gray1,
          padding: ".3em 1em",
          borderRadius: ".3em",
          marginTop: ".5em",
          display: "inline-block",
          textDecoration: "none",
          transition: "all 0.2s ease"
        }
      },
      ul: {
        margin: ".5em 0 0",
        padding: "0 0 0 1.2em",
        listStyleType: "square",
        li: {
          margin: "0.3em 0",
          color: theme.palette.c_gray6
        }
      }
    },

    ".settings-header": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em"
    },

    ".MuiSelect-select": {
      fontSize: theme.fontSizeNormal,
      padding: "0.4em 0.6em",
      marginTop: "0",
      backgroundColor: "rgba(30, 30, 30, 0.6)",
      borderRadius: "8px",
      transition: "background-color 0.2s ease",
      "&:hover": {
        backgroundColor: "rgba(40, 40, 40, 0.8)"
      }
    },
    ".MuiSwitch-root": {
      margin: "0"
    },
    ".secrets": {
      backgroundColor: "rgba(30, 30, 30, 0.6)",
      backdropFilter: "blur(5px)",
      color: theme.palette.c_white,
      fontSize: theme.fontSizeBig,
      marginTop: ".8em",
      padding: ".8em 1em",
      borderRadius: ".3em",
      display: "flex",
      alignItems: "center",
      gap: "0.8em",
      border: `1px solid ${theme.palette.c_warning}`,
      boxShadow: "0 2px 8px rgba(255, 152, 0, 0.1)"
    },

    h2: {
      fontSize: theme.fontSizeHuge,
      color: theme.palette.c_white,
      margin: "0.5em 0 0.25em 0",
      padding: "0",
      fontWeight: "500"
    },
    h3: {
      fontSize: theme.fontSizeBigger,
      margin: "2em 0 0.5em 0",
      padding: "0.5em 0 0",
      fontWeight: "500",
      color: theme.palette.c_white,
      borderBottom: `1px solid ${theme.palette.c_gray3}`,
      paddingBottom: "0.3em"
    },

    ".settings-button": {
      transition: "transform 0.2s ease",
      "&:hover": {
        transform: "rotate(30deg)"
      }
    },

    "button.MuiButton-root": {
      borderRadius: ".3em",
      transition: "all 0.2s ease",
      "&:hover": {
        transform: "translateY(-2px)",
        boxShadow: "0 4px 8px rgba(0,0,0,0.2)"
      }
    },

    ".MuiTypography-root": {
      fontSize: theme.fontSizeNormal
    },
    ".MuiMenuItem-root": {
      fontSize: theme.fontSizeNormal
    },
    ".MuiButton-root": {
      fontSize: theme.fontSizeNormal
    }
  });

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
    setWorkflowLayout,
    setTimeFormat,
    setSelectNodesOnDrag,
    setShowWelcomeOnStartup,
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
    setWorkflowLayout: state.setWorkflowLayout,
    setTimeFormat: state.setTimeFormat,
    setSelectNodesOnDrag: state.setSelectNodesOnDrag,
    setShowWelcomeOnStartup: state.setShowWelcomeOnStartup
  }));

  const [activeSection, setActiveSection] = useState("editor");

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
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

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

  const remoteSidebarSections = [
    {
      category: "API Providers",
      items: [
        { id: "openai", label: "OpenAI" },
        { id: "google", label: "Google" },
        { id: "anthropic", label: "Anthropic" },
        { id: "replicate", label: "Replicate" },
        { id: "huggingface", label: "HuggingFace" },
        { id: "aime", label: "AIME" },
        { id: "falai", label: "Fal.ai" },
        { id: "elevenlabs", label: "Eleven Labs" },
        { id: "brightdata", label: "Brightdata" }
      ]
    },
    {
      category: "Folder Settings",
      items: [
        { id: "comfyui", label: "ComfyUI" },
        { id: "chromadb", label: "ChromaDB" }
      ]
    }
  ];

  if (user && (user as any).auth_token) {
    generalSidebarSections.push({
      category: "API",
      items: [{ id: "api", label: "Nodetool API" }]
    });
  }

  return (
    <div className="settings">
      <Tooltip title="Settings" enterDelay={TOOLTIP_ENTER_DELAY}>
        <Button
          tabIndex={-1}
          className="settings-button"
          aria-controls={isMenuOpen ? "basic-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={isMenuOpen ? "true" : undefined}
          onClick={handleClick}
        >
          <SettingsIcon />
          {buttonText}
        </Button>
      </Tooltip>
      <Menu
        css={settingsStyles(ThemeNodetool)}
        className="settings-menu-container"
        open={isMenuOpen}
        onContextMenu={(event) => event.preventDefault()}
        onClose={handleClose}
        MenuListProps={{
          "aria-labelledby": "basic-button"
        }}
        anchorReference="anchorPosition"
        anchorPosition={{
          top: window.innerHeight / 2,
          left: window.innerWidth / 2
        }}
        transformOrigin={{
          vertical: "center",
          horizontal: "center"
        }}
        BackdropProps={{
          sx: { backdropFilter: "blur(5px)" }
        }}
      >
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
              <Tab label="External Services" id="settings-tab-1" />
            </Tabs>
          </div>

          <div className="settings-container">
            <SettingsSidebar
              activeSection={activeSection}
              sections={
                settingsTab === 0
                  ? generalSidebarSections
                  : remoteSidebarSections
              }
              onSectionClick={scrollToSection}
            />

            <div className="settings-content">
              <TabPanel value={settingsTab} index={0}>
                <Typography variant="h3" id="editor">
                  Editor
                </Typography>

                <div className="settings-section">
                  <div className="settings-item">
                    <FormControl>
                      <InputLabel htmlFor={id}>Show Welcome Screen</InputLabel>
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
                      <InputLabel htmlFor={id}>Select Nodes On Drag</InputLabel>
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
                      Select nodes when dragging.
                    </Typography>
                  </div>
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
                        Move the canvas by dragging with the left or right mouse
                        button.
                      </Typography>
                      <Typography>
                        With RightMouseButton selected, you can also pan with:
                      </Typography>
                      <ul>
                        <li>Space + LeftClick</li>
                        <li>Middle Mouse Button</li>
                      </ul>
                    </div>
                  </div>

                  <div className="settings-item">
                    <FormControl>
                      <InputLabel htmlFor={id}>Node Selection Mode</InputLabel>
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
                        onClick: (e: React.MouseEvent<HTMLInputElement>) => {
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
                        onClick: (e: React.MouseEvent<HTMLInputElement>) => {
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

                  <div className="settings-item">
                    <FormControl>
                      <InputLabel htmlFor={id}>Workflow Menu Layout</InputLabel>
                      <Select
                        id={id}
                        labelId={id}
                        value={
                          settings.workflowLayout === "grid" ? "grid" : "list"
                        }
                        variant="standard"
                        onChange={(e) =>
                          setWorkflowLayout(
                            e.target.value === "grid" ? "grid" : "list"
                          )
                        }
                      >
                        <MenuItem value={"grid"}>Grid</MenuItem>
                        <MenuItem value={"list"}>List</MenuItem>
                      </Select>
                    </FormControl>
                    <Typography className="description">
                      Choose grid or list layout for the Workflow menu.
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
                          border: "1px solid" + ThemeNodetool.palette.c_warning,
                          borderRight:
                            "1px solid" + ThemeNodetool.palette.c_warning
                        }}
                      >
                        {isProduction && (
                          <>
                            <FormControl>
                              <InputLabel>Nodetool API Token</InputLabel>
                            </FormControl>
                            <div className="description">
                              <Typography>
                                This token is used to authenticate your account
                                with the Nodetool API.
                              </Typography>
                              <div className="secrets">
                                <WarningIcon sx={{ color: "#ff9800" }} />
                                <Typography component="span">
                                  Keep this token secure and do not share it
                                  publicly
                                </Typography>
                              </div>
                            </div>
                          </>
                        )}
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
                {!isProduction && <RemoteSettingsMenu />}
              </TabPanel>
            </div>
          </div>
        </div>
      </Menu>
    </div>
  );
}

export default SettingsMenu;
