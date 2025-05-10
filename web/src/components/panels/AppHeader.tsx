/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo } from "react";

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

// constants
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import RightSideButtons from "./RightSideButtons";

const styles = (theme: any) =>
  css({
    "&": {
      width: "100%",
      overflow: "visible"
    },
    ".toolbar": {
      overflow: "visible",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      position: "relative",
      backgroundColor: theme.palette.c_gray1,
      height: "40px",
      minHeight: "40px",
      padding: "0 12px",
      border: "0"
    },
    ".nodetool-logo": {
      margin: "1px 0.75em 0 0"
    },
    button: {
      color: theme.palette.c_white,
      padding: "5px 5px",
      minWidth: "auto",
      borderRadius: "6px",
      transition: "all 0.2s ease-out",
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.05)"
      },
      svg: {
        display: "block",
        width: "20px",
        height: "20px",
        fontSize: "12px"
      }
    },
    "button.logo": {
      padding: "4px 8px",
      "&:hover": {
        backgroundColor: "transparent",
        opacity: 0.8
      }
    },
    ".navigate": {
      display: "flex",
      alignItems: "center",
      flex: "1 1 auto",
      gap: "8px"
    },
    ".buttons-right": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      background: "transparent",
      flexShrink: 0
    }
  });

const AppHeader: React.FC = memo(function AppHeader() {
  const navigate = useNavigate();
  const path = useLocation().pathname;

  return (
    <div css={styles} className="app-header">
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
        </div>
        <Alert />
        <RightSideButtons />
      </Toolbar>
    </div>
  );
});

AppHeader.displayName = "AppHeader";

export default AppHeader;
