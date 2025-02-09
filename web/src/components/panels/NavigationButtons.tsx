/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Box, Button, Tooltip, Typography } from "@mui/material";
import ExamplesIcon from "@mui/icons-material/AutoAwesome";
import ThemeNodetool from "../themes/ThemeNodetool";
import { IconForType } from "../../config/data_types";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import BackToEditorButton from "./BackToEditorButton";

const NavigationButtons: React.FC = () => {
  const navigate = useNavigate();
  const path = useLocation().pathname;

  return (
    <Box className="nav-buttons">
      <Tooltip title="Explore Examples" enterDelay={TOOLTIP_ENTER_DELAY}>
        <Button
          className={`nav-button ${path === "/examples" ? "active" : ""}`}
          onClick={() => {
            navigate("/examples");
          }}
          tabIndex={-1}
          style={{
            color: path.startsWith("/examples")
              ? ThemeNodetool.palette.c_hl1
              : ThemeNodetool.palette.c_white
          }}
        >
          <ExamplesIcon />
          Examples
        </Button>
      </Tooltip>

      <Tooltip title="View and manage Assets" enterDelay={TOOLTIP_ENTER_DELAY}>
        <Button
          className={`nav-button ${path === "/assets" ? "active" : ""}`}
          onClick={() => {
            navigate("/assets");
          }}
          tabIndex={-1}
          style={{
            color: path.startsWith("/assets")
              ? ThemeNodetool.palette.c_hl1
              : ThemeNodetool.palette.c_white
          }}
        >
          <IconForType
            iconName="asset"
            showTooltip={false}
            svgProps={{
              fill: path.startsWith("/assets")
                ? ThemeNodetool.palette.c_hl1
                : ThemeNodetool.palette.c_white
            }}
            containerStyle={{
              borderRadius: "0 0 3px 0",
              marginLeft: "0.1em",
              marginTop: "0"
            }}
            bgStyle={{
              backgroundColor: "transparent",
              width: "30px",
              height: "20px"
            }}
          />
          Assets
        </Button>
      </Tooltip>

      <Tooltip title="Model Manager" enterDelay={TOOLTIP_ENTER_DELAY}>
        <Button
          className="command-icon"
          onClick={() => navigate("/models")}
          tabIndex={-1}
          style={{
            color: path.startsWith("/models")
              ? ThemeNodetool.palette.c_hl1
              : ThemeNodetool.palette.c_white
          }}
        >
          <IconForType
            iconName="model"
            showTooltip={false}
            svgProps={{
              fill: path.startsWith("/models")
                ? ThemeNodetool.palette.c_hl1
                : ThemeNodetool.palette.c_white
            }}
            bgStyle={{
              backgroundColor: "transparent",
              width: "28px"
            }}
          />
          Models
        </Button>
      </Tooltip>

      {!path.startsWith("/editor") && (
        <Tooltip title="Back to Editor" enterDelay={TOOLTIP_ENTER_DELAY}>
          <BackToEditorButton />
        </Tooltip>
      )}
    </Box>
  );
};

export default memo(NavigationButtons);
