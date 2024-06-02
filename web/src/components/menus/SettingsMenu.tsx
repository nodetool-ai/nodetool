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
  Tooltip
} from "@mui/material";
import Select from "@mui/material/Select";
import SettingsIcon from "@mui/icons-material/Settings";
import { useState } from "react";
import { useSettingsStore } from "../../stores/SettingsStore";
import ThemeNodetool from "../themes/ThemeNodetool";
import { useNavigate } from "react-router";
import { TOOLTIP_DELAY } from "../../config/constants";
import useAuth from "../../stores/useAuth";

const styles = (theme: any) =>
  css({
    ".MuiPaper-root": {
      backgroundColor: theme.palette.c_gray0,
      border: `2px solid ${theme.palette.c_gray3}`,
      borderRadius: "1em"
    },
    ".settings-menu": {
      width: "60vw",
      minWidth: "400px",
      maxWidth: "800px",
      padding: "0 1.5em",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "1.5em",
      ".settings-item": {
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
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
        fontSize: theme.fontSizeSmall,
        fontFamily: theme.fontFamily1,
        fontWeight: 500,
        color: theme.palette.c_gray1,
        backgroundColor: theme.palette.c_hl1,
        padding: "0.5em 0.5em",
        width: "100%"
      },
      ".MuiInput-root": {
        minWidth: "200px",
        width: "200px",
        padding: "0.2em 0.5em"
      },
      ".MuiFormControl-root": {
        width: "auto",
        minWidth: "200px"
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
    setTimeFormat
  } = useSettingsStore();

  const id = open ? "docs" : undefined;

  return (
    <>
      <Tooltip title="Settings" enterDelay={TOOLTIP_DELAY}>
        <Button
          aria-controls={open ? "basic-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={open ? "true" : undefined}
          onClick={handleClick}
        >
          <SettingsIcon />
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
        <div className="settings-menu">
          <Typography variant="h4">Settings</Typography>
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
              <ul>
                <li> Space + LeftClick </li>
                <li> Middle Mouse Button</li>
              </ul>
            </Typography>
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
              <InputLabel htmlFor={id}>Timeformat</InputLabel>
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

          {user && (
            <div>
              <hr />
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
                    navigate("/");
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
    </>
  );
}

export default SettingsMenu;
