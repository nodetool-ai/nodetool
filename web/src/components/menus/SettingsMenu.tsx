/** @jsxImportSource @emotion/react */
import { css, SerializedStyles } from "@emotion/react";

import { useState } from "react";

import { VERSION } from "../../config/constants";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { Link } from "react-router-dom";
import {
  TextField,
  Button,
  Typography,
  InputLabel,
  FormControl,
  Tooltip,
  Switch
} from "@mui/material";
import Select from "@mui/material/Select";
import SettingsIcon from "@mui/icons-material/Settings";
import WarningIcon from "@mui/icons-material/Warning";
import { useSettingsStore } from "../../stores/SettingsStore";
import ThemeNodetool from "../themes/ThemeNodetool";
import { useNavigate } from "react-router";
import { TOOLTIP_DELAY } from "../../config/constants";
import useAuth from "../../stores/useAuth";
import CloseButton from "../buttons/CloseButton";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { isProduction } from "../../stores/ApiClient";
import RemoteSettingsMenu from "./RemoteSettingsMenu";
import { useNotificationStore } from "../../stores/NotificationStore";

export const settingsStyles = (theme: any): any =>
  css({
    ".MuiPaper-root": {
      backgroundColor: theme.palette.c_gray0,
      border: `2px solid ${theme.palette.c_gray0}`,
      borderRadius: "1em",
      maxWidth: "1000px",
      height: "90vh",
      overflow: "hidden"
    },
    ".settings": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "1em",
      backgroundColor: theme.palette.c_gray0,
      width: "100%",
      height: "100%",
      padding: ".5em 1em"
    },
    ".top": {
      height: "50px",
      padding: "0.5em 1em",
      borderBottom: "1px solid" + theme.palette.c_gray0,
      backgroundColor: "transparent"
    },
    ".bottom": {
      height: "40px",
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      padding: "0.25em 1.5em",
      borderTop: "1px solid" + theme.palette.c_gray0
    },
    ".settings-menu": {
      flexGrow: 1,
      backgroundColor: theme.palette.c_gray0,
      width: "70vw",
      height: "75vh",
      overflowY: "auto",
      minWidth: "400px",
      maxWidth: "1000px",
      padding: "0 2em 2em 2em",
      display: "flex",
      flexDirection: "column",
      gap: "0"
    },
    ".settings-item": {
      background: theme.palette.c_gray2,
      margin: "0 0 1.5em 0",
      padding: ".5em .5em 1em .5em",
      borderRadius: ".2em",
      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      transition: "transform 0.2s ease, box-shadow 0.2s ease",
      border: "none",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: ".5em",
      "&:hover": {
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)"
      },
      ".MuiFormControl-root": {
        width: "100%",
        minWidth: "unset",
        margin: "0",
        padding: "0 .5em",
        "& .MuiInputLabel-root": {
          position: "relative",
          transform: "none",
          marginBottom: "8px"
        },
        "& .MuiInputBase-root": {
          maxWidth: "34em",
          backgroundColor: theme.palette.c_gray1,
          borderRadius: ".2em",
          margin: "0",
          padding: ".2em 1em",
          "&::before": {
            content: "none"
          },
          "&::after": {
            borderBottom: "1px solid" + theme.palette.c_gray4
          }
        }
      },
      label: {
        color: theme.palette.c_white,
        fontSize: theme.fontSizeBigger,
        fontWeight: "300",
        padding: ".5em 0 .25em 0"
      },
      ".description": {
        color: theme.palette.c_gray6,
        fontSize: theme.fontSizeNormal,
        margin: "0",
        padding: "0 1em",
        lineHeight: "1.5",
        a: {
          color: theme.palette.c_hl1,
          backgroundColor: theme.palette.c_gray1,
          padding: ".2em 1em",
          borderRadius: ".2em",
          marginTop: ".5em",
          display: "inline-block",
          textDecoration: "none",
          transition: "color 0.2s ease",
          "&:hover": {
            color: theme.palette.c_white
          }
        }
      },
      ul: {
        margin: ".5em 0 0",
        padding: "0 0 0 1em",
        listStyleType: "square"
      }
    },

    ".settings-header": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em"
    },

    ".MuiSelect-select": {
      fontSize: theme.fontSizeNormal,
      padding: "0.25em",
      marginTop: "0 ",
      backgroundColor: theme.palette.c_gray1,
      borderRadius: "8px"
    },
    ".MuiSwitch-root": {
      margin: "0"
    },
    ".secrets": {
      backgroundColor: theme.palette.c_white,
      color: theme.palette.c_black,
      fontSize: theme.fontSizeBig,
      marginTop: ".5em",
      padding: ".5em",
      borderRadius: ".2em",
      display: "flex",
      alignItems: "center",
      gap: "0.5em"
    },

    h2: {
      color: theme.palette.c_gray6,
      margin: "0",
      padding: "0"
    },
    h3: {
      fontSize: theme.fontSizeGiant,
      margin: "0 0 0.25em 0",
      padding: "0.5em 0 0",
      fontWeight: "200",
      color: theme.palette.c_white
    }
  });

function SettingsMenu() {
  const { user, signout } = useAuth();
  const navigate = useNavigate();

  const {
    isMenuOpen,
    setMenuOpen,
    setGridSnap,
    setConnectionSnap,
    setPanControls,
    setSelectionMode,
    setWorkflowLayout,
    setWorkflowOrder,
    setAssetItemSize,
    setTimeFormat,
    setButtonAppearance,
    setSelectNodesOnDrag,
    setShowWelcomeOnStartup,
    settings
    // setAlertBeforeTabClose,
  } = useSettingsStore();

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
    if (user && user.auth_token) {
      navigator.clipboard.writeText(user.auth_token);
      addNotification({
        type: "info",
        alert: true,
        content: "Nodetool API Token copied to Clipboard!"
      });
    }
  };
  return (
    <div className="settings">
      <Tooltip title="Settings" enterDelay={TOOLTIP_DELAY}>
        <Button
          aria-controls={isMenuOpen ? "basic-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={isMenuOpen ? "true" : undefined}
          onClick={handleClick}
        >
          <SettingsIcon />
          Settings
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
      >
        <div className="top">
          <CloseButton onClick={handleClose} />
          <Typography variant="h2">Settings</Typography>
        </div>

        <div className="settings-menu">
          {!isProduction && <RemoteSettingsMenu />}

          <Typography variant="h3">Editor</Typography>

          <div className="settings-item">
            <FormControl>
              <InputLabel htmlFor={id}>Show Welcome Screen</InputLabel>
              <Switch
                checked={!!settings.showWelcomeOnStartup}
                onChange={(e) => setShowWelcomeOnStartup(e.target.checked)}
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
                Move the canvas by dragging with the left or right mouse button.
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
              onChange={(e) => setConnectionSnap(Number(e.target.value))}
              variant="standard"
            />
            <Typography className="description">
              Snap distance for connecting nodes.
            </Typography>
          </div>
          <Typography variant="h3">Workflows</Typography>
          <div className="settings-item">
            <FormControl>
              <InputLabel htmlFor={id}>Workflow Menu Layout</InputLabel>
              <Select
                id={id}
                labelId={id}
                value={settings.workflowLayout === "grid" ? "grid" : "list"}
                variant="standard"
                onChange={(e) =>
                  setWorkflowLayout(e.target.value === "grid" ? "grid" : "list")
                }
              >
                <MenuItem value={"grid"}>Grid</MenuItem>
                <MenuItem value={"list"}>List</MenuItem>
              </Select>
            </FormControl>
            <Typography className="description">
              Choose grid or list layout for{" "}
              <Link to="/workflows">Workflows</Link>
            </Typography>
          </div>

          <Typography variant="h3">Assets</Typography>

          <Typography variant="h3">Appearance</Typography>
          <div className="settings-item">
            <FormControl>
              <InputLabel htmlFor={id}>Time Format</InputLabel>
              <Select
                id={id}
                labelId={id}
                value={settings.timeFormat}
                variant="standard"
                onChange={(e) =>
                  setTimeFormat(e.target.value === "12h" ? "12h" : "24h")
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
              <InputLabel htmlFor={id}>Button Appearance</InputLabel>
              <Select
                id={id}
                labelId={id}
                value={settings.buttonAppearance || "both"}
                variant="standard"
                onChange={(e) =>
                  setButtonAppearance(
                    e.target.value as "text" | "icon" | "both"
                  )
                }
              >
                <MenuItem value={"text"}>Text</MenuItem>
                <MenuItem value={"icon"}>Icon</MenuItem>
                <MenuItem value={"both"}>Both</MenuItem>
              </Select>
            </FormControl>
            <Typography className="description">
              Display the buttons in the top panel as text, icon or both.
            </Typography>
          </div>

          {/* <div className="settings-item">
            <FormControl>
              <InputLabel htmlFor={id}>Show alert on close</InputLabel>
              <Switch
                sx={{
                  "&.MuiSwitch-root": {
                    margin: "16px 0 0"
                  }
                }}
                checked={!!settings.alertBeforeTabClose}
                onChange={(e) =>
                  setAlertBeforeTabClose(e.target.checked ?? false)
                }
                inputProps={{ "aria-label": id }}
              />
            </FormControl>
            <Typography className="description">
              Prevent closing of the browser tab when there are unsaved changes.
            </Typography>
          </div> */}

          {user && user.auth_token && (
            <div
              className="settings-item"
              style={{
                border: "1px solid" + ThemeNodetool.palette.c_warning,
                borderRight: "1px solid" + ThemeNodetool.palette.c_warning
              }}
            >
              <FormControl>
                <InputLabel>Nodetool API Token</InputLabel>
              </FormControl>
              <Typography className="description">
                This token is used to authenticate your account with the
                Nodetool API. <br />
                <div className="secrets">
                  <WarningIcon sx={{ color: "#ff9800" }} />
                  <Typography>
                    Keep this token secure and do not share it publicly
                  </Typography>
                </div>
                <br />
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
              </Typography>
            </div>
          )}
        </div>
        <div className="bottom">
          {user && (
            <div>
              <Typography
                style={{
                  display: "inline-block",
                  margin: "0 10px 0 0",
                  fontSize: "0.9em"
                }}
              >
                {user.email}
              </Typography>
              {user.email && (
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  onClick={() => {
                    signout();
                    navigate("/login");
                  }}
                >
                  Logout
                </Button>
              )}
            </div>
          )}
          <Typography
            variant="body2"
            style={{
              color: ThemeNodetool.palette.c_gray6,
              marginTop: "2em",
              fontSize: ThemeNodetool.fontSizeSmaller
            }}
          >
            NODETOOL {VERSION}
          </Typography>
        </div>
      </Menu>
    </div>
  );
}

export default SettingsMenu;
