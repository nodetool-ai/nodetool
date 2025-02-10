/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { css } from "@emotion/react";

// components
import Alert from "../node_editor/Alert";
import Logo from "../Logo";

// mui icons

// nodetool icons

// mui
import {
  AppBar,
  Button,
  Tooltip,
  Toolbar,
  Typography,
  Box
} from "@mui/material";

// hooks and stores
import { useLocation, useNavigate } from "react-router-dom";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";

// constants
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import NavigationButtons from "./NavigationButtons";
import RightSideButtons from "./RightSideButtons";

const styles = (theme: any) =>
  css({
    "&": {
      width: "100%",
      // height: "40px",
      // backgroundColor: "rgba(18, 18, 24, 0.95)",
      backgroundColor: theme.palette.c_gray1,
      overflow: "visible"
    },
    ".app-bar": {
      overflow: "visible",
      boxShadow: "0 0 30px rgba(0, 0, 0, 0.2)",
      zIndex: 10000,
      "&::after": {
        content: '""',
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "1px",
        background: "rgba(255, 255, 255, 0.05)"
      }
    },
    ".toolbar": {
      overflow: "visible",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      position: "relative"
    },
    ".nodetool-logo": {
      margin: "1px 1.5em 0 0"
    },
    button: {
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.c_white,
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.1)"
      }
    },
    ".icon-container svg": {
      display: "block",
      width: "20px",
      height: "18px",
      fontSize: theme.fontSizeSmall
    },
    "button svg": {
      display: "block",
      padding: "0.1em"
    },
    ".command-icon svg": {
      display: "block !important"
    },
    "button.logo:hover": {
      backgroundColor: "transparent"
    },
    ".nav-buttons": {
      width: "100%",
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-start",
      alignItems: "center",
      gap: "0.1em",
      "& button": {
        lineHeight: "1.1em"
      }
    },
    ".nav-button svg": {
      marginRight: "0.2em"
    },
    "nav-button": {
      flexShrink: 0,
      minWidth: "5em",
      "&.active": {
        color: theme.palette.c_hl1
      }
    },
    ".back-to-editor": {
      marginLeft: "100px",
      marginRight: "auto"
    },
    ".navigate": {
      display: "flex",
      alignItems: "center",
      width: "100%"
    },
    ".buttons-right": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: 0,
      background: theme.palette.c_gray1,
      borderRadius: "12px",
      paddingLeft: "1em",
      marginLeft: "auto",
      flexShrink: 0
    }
  });

const AppHeader: React.FC = memo(function AppHeader() {
  const navigate = useNavigate();
  const path = useLocation().pathname;

  return (
    <div css={styles} className="app-header">
      <AppBar position="static" className="app-bar">
        <Toolbar variant="dense" className="toolbar">
          <div className="navigate">
            <Tooltip
              enterDelay={TOOLTIP_ENTER_DELAY}
              title={
                <div style={{ textAlign: "center" }}>
                  <Typography variant="inherit">Open Welcome Screen</Typography>
                </div>
              }
            >
              <Button
                className="logo"
                tabIndex={-1}
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/welcome");
                }}
                sx={{
                  lineHeight: "1em",
                  display: { xs: "none", sm: "block" }
                }}
              >
                <Logo
                  width="80px"
                  height="24px"
                  fontSize="1em"
                  borderRadius="20px"
                  small={true}
                  singleLine={true}
                />
              </Button>
            </Tooltip>
            <Box sx={{ flexGrow: 0.02 }} />
            <NavigationButtons />
          </div>
          <Alert />
          <RightSideButtons />
        </Toolbar>
      </AppBar>
    </div>
  );
});

AppHeader.displayName = "AppHeader";

export default AppHeader;
