/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";
import GoogleAuthButton from "./buttons/GoogleAuthButton";
import Logo from "./Logo";
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

const styles = (theme: Theme) =>
  css({
    minHeight: "100vh",
    textAlign: "center",
    ".login-card": {
      width: "100%",
      maxWidth: CONTENT_WIDTH
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
          <Logo
            width="80px"
            height="80px"
            fontSize="28px"
            borderRadius={BORDER_RADIUS.lg}
            small={false}
            enableText
          />
          <FlexColumn align="center" gap={SPACING.md}>
            <Caption className="alpha-badge" size="smaller" color="warning">
              Cloud alpha
            </Caption>
            <Text component="h1" size="big" className="headline">
              Sign in to NodeTool Cloud
            </Text>
            <Text component="p" size="normal" className="subhead">
              Describe what you want. The agent builds it, and you can take
              over at any step.
            </Text>
          </FlexColumn>
          <FlexColumn fullWidth>
            <GoogleAuthButton />
          </FlexColumn>
        </FlexColumn>
      </Card>

      <FlexColumn className="footnotes" align="center" gap={SPACING.xs}>
        <Caption size="small" color="secondary">
          Use your own API keys and pay providers at their list prices.
        </Caption>
        <Caption size="small" color="secondary">
          Cloud is in alpha. For production work, use{" "}
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
