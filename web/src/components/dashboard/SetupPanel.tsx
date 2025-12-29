/** @jsxImportSource @emotion/react */
import React from "react";
import { Typography, Box } from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { getIsElectronDetails } from "../../utils/browser";
import { isProduction } from "../../stores/ApiClient";

const panelStyles = (theme: any) =>
  css({
    "&": {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      padding: "0.75em"
    },
    ".scrollable-content": {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden"
    },
    ".setup-container": {
      padding: "1em",
      borderRadius: "12px"
    },
    ".setup-list-title": {
      fontWeight: "bold",
      marginTop: "1em",
      marginBottom: "0.5em",
      color: "var(--palette-primary-main)"
    },
    ".step-list": {
      marginTop: "0.5em",
      paddingLeft: "1.25em",
      "& li": { marginBottom: "0.5em" }
    },
    ".fake-button": {
      color: theme.vars.palette.primary.main,
      textTransform: "uppercase",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      padding: "0 0.4em",
      margin: "0 0.2em"
    }
  });

const SetupPanel: React.FC = () => {
  const theme = useTheme();
  const shouldShowLocalModels =
    getIsElectronDetails().isElectron || !isProduction;

  return (
    <Box css={panelStyles(theme)} className="setup-panel-container">
      <div className="scrollable-content">
        <Box className="setup-container">
          <Typography variant="h6" sx={{ mb: 1.5, fontSize: "1em" }}>
            How to Use Models
          </Typography>

          <Typography variant="subtitle2" className="setup-list-title">
            Remote Models
          </Typography>
          <Box>
            <ol className="step-list">
              <li>
                Open{" "}
                <SettingsIcon
                  sx={{ verticalAlign: "middle", fontSize: "inherit" }}
                />
                <b> Settings</b> in the top-right
              </li>
              <li>Add API keys</li>
            </ol>
          </Box>
          {shouldShowLocalModels && (
            <>
              <Typography variant="subtitle2" className="setup-list-title">
                Local Models
              </Typography>
              <Box sx={{ mb: 2 }}>
                <ol className="step-list">
                  <li>
                    Download models using the{" "}
                    <span className="fake-button">Models</span> button in the
                    header
                  </li>
                  <li>
                    Or use{" "}
                    <span className="fake-button">Recommended Models</span>{" "}
                    button on nodes
                  </li>
                </ol>
              </Box>
            </>
          )}
        </Box>
      </div>
    </Box>
  );
};

export default SetupPanel;
