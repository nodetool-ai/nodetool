/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import GoogleAuthButton from "./buttons/GoogleAuthButton";
import {
  Text,
  Caption,
  Card,
  FlexColumn,
  ExternalLink,
  BORDER_RADIUS,
  CONTROL,
  SPACING,
  getSpacingPx
} from "./ui_primitives";

const STUDIO_URL = "https://nodetool.ai/studio";
const CONTENT_WIDTH = "380px";
const LOGO_SIZE = "64px";

const styles = (theme: Theme) =>
  css({
    minHeight: "100vh",
    textAlign: "center",
    ".login-card": {
      width: "100%",
      maxWidth: CONTENT_WIDTH
    },
    ".logo": {
      display: "block",
      width: LOGO_SIZE,
      height: LOGO_SIZE
    },
    ".alpha-badge": {
      color: theme.vars.palette.warning.main,
      border: `1px solid ${theme.vars.palette.warning.main}`,
      borderRadius: BORDER_RADIUS.pill,
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.md)}`,
      textTransform: "uppercase",
      letterSpacing: "0.08em"
    },
    ".headline": {
      color: theme.vars.palette.grey[0]
    },
    ".subhead": {
      color: theme.vars.palette.grey[200]
    },
    ".footnotes": {
      maxWidth: CONTENT_WIDTH
    },
    // The shared Google button styles set a fixed width and an uppercase
    // label. Here it fills the card and reads in sentence case.
    ".gsi-material-button": {
      width: "100%",
      maxWidth: "none",
      height: `${CONTROL.height.xl}px`,
      border: "none",
      background: theme.vars.palette.grey[0]
    },
    ".gsi-material-button:hover": {
      background: theme.vars.palette.grey[100]
    },
    ".gsi-material-button .gsi-material-button-content-wrapper": {
      justifyContent: "center"
    },
    ".gsi-material-button .gsi-material-button-contents": {
      flexGrow: 0,
      textTransform: "none"
    }
  });

function Login() {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <FlexColumn
      css={styles(theme)}
      align="center"
      justify="center"
      gap={SPACING.xl}
      padding={SPACING.xl}
    >
      <Card className="login-card" variant="outlined" padding="spacious">
        <FlexColumn align="center" gap={SPACING.xl}>
          <img className="logo" src="/logo192.png" alt="NodeTool" />
          <FlexColumn align="center" gap={SPACING.md}>
            <Caption className="alpha-badge" size="smaller" color="warning">
              {t("screen_remaining.login.cloudAlpha")}
            </Caption>
            <Text component="h1" size="big" className="headline">
              {t("screen_remaining.login.title")}
            </Text>
            <Text component="p" size="normal" className="subhead">
              {t("screen_remaining.login.description")}
            </Text>
          </FlexColumn>
          <FlexColumn fullWidth>
            <GoogleAuthButton />
          </FlexColumn>
        </FlexColumn>
      </Card>

      <FlexColumn className="footnotes" align="center" gap={SPACING.xs}>
        <Caption size="small" color="secondary">
          {t("screen_remaining.login.ownKeys")}
        </Caption>
        <Caption size="small" color="secondary">
          {t("screen_remaining.login.cloudAlphaNotice")} {" "}
          <ExternalLink href={STUDIO_URL} size="small" iconVariant="arrow">
            NodeTool Studio
          </ExternalLink>
          .
        </Caption>
      </FlexColumn>
    </FlexColumn>
  );
}

export default memo(Login);
