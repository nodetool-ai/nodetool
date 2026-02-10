/** @jsxImportSource @emotion/react */
import React from "react";
import { Typography } from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { getIsElectronDetails } from "../../utils/browser";
import { isProduction } from "../../stores/ApiClient";
import { FlexColumn, Card } from "../ui_primitives";

const panelStyles = (theme: any) =>
  css({
    "&": {
      height: "100%"
    },
    ".scrollable-content": {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden"
    },
    ".setup-list-title": {
      fontWeight: "bold",
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
    <FlexColumn gap={0} padding={3} fullHeight css={panelStyles(theme)} className="setup-panel-container">
      <div className="scrollable-content">
        <Card padding="comfortable">
          <FlexColumn gap={2}>
            <Typography variant="h6" sx={{ fontSize: "1em" }}>
              How to Use Models
            </Typography>

            <FlexColumn gap={1}>
              <Typography variant="subtitle2" className="setup-list-title">
                Remote Models
              </Typography>
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
            </FlexColumn>

            {shouldShowLocalModels && (
              <FlexColumn gap={1}>
                <Typography variant="subtitle2" className="setup-list-title">
                  Local Models
                </Typography>
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
              </FlexColumn>
            )}
          </FlexColumn>
        </Card>
      </div>
    </FlexColumn>
  );
};

export default SetupPanel;
