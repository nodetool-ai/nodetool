/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

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
import { useState } from "react";
import { useSettingsStore } from "../../stores/SettingsStore";
import ThemeNodetool from "../themes/ThemeNodetool";
import { useNavigate } from "react-router";
import { TOOLTIP_DELAY } from "../../config/constants";
import useAuth from "../../stores/useAuth";
import CloseButton from "../buttons/CloseButton";

const styles = (theme: any) =>
  css({
    ".MuiPaper-root": {
      backgroundColor: theme.palette.c_gray0,
      border: `2px solid ${theme.palette.c_gray3}`,
      borderRadius: "1em",
      height: "80vh",
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
      backgroundColor: theme.palette.c_gray1,
      width: "60vw",
      height: "70vh",
      overflowY: "auto",
      minWidth: "400px",
      maxWidth: "800px",
      padding: "1em",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "1em",
      ".settings-item": {
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        borderTop: `1px solid ${theme.palette.c_gray0}`,
        backgroundColor: theme.palette.c_gray0,
        padding: ".5em .2em",
        width: "100%",
        gap: "1.5em"
      },
      ".MuiSelect-select": {
        fontSize: theme.fontSizeBig,
        padding: "0.5em 0 0 !important",
        marginTop: "0.5em !important"
      },
      "div label": {
        transform: "none",
        margin: 0,
        fontSize: theme.fontSizeNormal,
        fontFamily: theme.fontFamily1,
        color: theme.palette.c_hl1,
        backgroundColor: "transparent",
        padding: "0 0.5em 0.5em",
        width: "100%"
      },
      ".MuiInput-root": {
        minWidth: "210px",
        width: "200px",
        padding: "0.2em 0.5em"
      },
      ".MuiFormControl-root": {
        width: "auto",
        minWidth: "200px",
        margin: 0,
        padding: "0 0 0.25em 0"
      },
      "input, label": {
        fontSize: "1em"
      },
      button: {
        height: "25px",
        fontSize: "15px"
      },
      ".description": {
        color: theme.palette.c_gray6,
        fontFamily: theme.fontFamily1,
        fontSize: theme.fontSizeNormal,
        marginTop: 0,
        flexShrink: 1,
        wordSpacing: 0
      },
      ".MuiTextField-root input": {
        padding: "0.8em 0 0.2em 0"
      },
      ul: {
        paddingLeft: "1em",
        fontSize: theme.fontSizeNormal,
        fontFamily: theme.fontFamily1,
        color: theme.palette.gray3,
        margin: "0.25em 0 0",
        listStyleType: "disc"
      }
    }
  });

function SettingsMenu() {
  const { user, signout } = useAuth();
  const navigate = useNavigate();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const {
    settings,
    setGridSnap,
    setConnectionSnap,
    setPanControls,
    setSelectionMode,
    setWorkflowLayout,
    setWorkflowOrder,
    setAssetItemSize,
    setTimeFormat,
    setButtonAppearance,
    setAlertBeforeTabClose,
    setSelectNodesOnDrag
  } = useSettingsStore((state) => ({
    settings: state.settings,
    setGridSnap: state.setGridSnap,
    setConnectionSnap: state.setConnectionSnap,
    setPanControls: state.setPanControls,
    setSelectionMode: state.setSelectionMode,
    setWorkflowLayout: state.setWorkflowLayout,
    setWorkflowOrder: state.setWorkflowOrder,
    setAssetItemSize: state.setAssetItemSize,
    setTimeFormat: state.setTimeFormat,
    setButtonAppearance: state.setButtonAppearance,
    setAlertBeforeTabClose: state.setAlertBeforeTabClose,
    setSelectNodesOnDrag: state.setSelectNodesOnDrag
  }));

  const id = open ? "docs" : undefined;

  return (
    <div className="settings">
      <Tooltip title="Settings" enterDelay={TOOLTIP_DELAY}>
        <Button
          aria-controls={open ? "basic-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={open ? "true" : undefined}
          onClick={handleClick}
        >
          <SettingsIcon />
          Settings
        </Button>
      </Tooltip>
      <Menu
        css={styles}
        className="settings-menu-container"
        open={open}
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
          <Typography variant="h4">Settings</Typography>
        </div>
        <div className="settings-menu">
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

            <Typography className="description">
              Move the canvas by dragging with the left or right mouse button.
              <br />
              With RightMouseButton selected, you can also pan with:
              <br />
            </Typography>
            <ul>
              <li> Space + LeftClick </li>
              <li> Middle Mouse Button</li>
            </ul>
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
              inputProps={{ min: 1, max: 100 }}
              id="grid-snap-input"
              label="Grid Snap Precision"
              value={settings.gridSnap}
              onChange={(e) => setGridSnap(Number(e.target.value))}
              variant="standard"
              InputLabelProps={{
                shrink: true
              }}
            />
            <Typography className="description">
              Snap precision for moving nodes on the canvas.
            </Typography>
          </div>

          <div className="settings-item">
            <TextField
              type="number"
              inputProps={{ min: 5, max: 30 }}
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
              <Link to="/workflows">Workflows</Link>.
            </Typography>
          </div>

          <div className="settings-item">
            <FormControl>
              <InputLabel htmlFor={id}>Workflow Menu Order</InputLabel>
              <Select
                id={id}
                labelId={id}
                value={settings.workflowOrder === "name" ? "name" : "date"}
                variant="standard"
                onChange={(e) =>
                  setWorkflowOrder(e.target.value === "name" ? "name" : "date")
                }
              >
                <MenuItem value={"name"}>Name</MenuItem>
                <MenuItem value={"date"}>Date</MenuItem>
              </Select>
            </FormControl>
            <Typography className="description">
              Sort <Link to="/workflows"> Workflows</Link> by name or date.
            </Typography>
          </div>

          <div className="settings-item">
            <TextField
              type="number"
              inputProps={{ min: 1, max: 10 }}
              id="asset-item-size-input"
              label="Asset item size"
              value={settings.assetItemSize}
              onChange={(e) => setAssetItemSize(Number(e.target.value))}
              variant="standard"
              InputLabelProps={{
                shrink: true
              }}
            />
            <Typography className="description">
              Default size for assets in the asset browser.
            </Typography>
          </div>

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

          <div className="settings-item">
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
              color: "#666",
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
