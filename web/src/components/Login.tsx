/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useCallback, memo } from "react";
import { Box, Typography } from "@mui/material";
import { EditorButton } from "./ui_primitives";
import GoogleAuthButton from "./buttons/GoogleAuthButton";
import Logo from "./Logo";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    marginTop: "10vh",
    height: "80vh",
    ".flex": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "center",
      gap: "1em"
    },
    h3: {
      fontFamily: theme.fontFamily1,
      fontSize: "2em",
      color: "white",
      textAlign: "center",
      lineHeight: "1.25em",
      width: "260px",
      padding: "0 0 1.5em 0"
    },
    h4: {
      fontFamily: "monospace",
      fontSize: "1em",
      lineHeight: "1.25em",
      maxWidth: "250px",
      textAlign: "left",
      textTransform: "uppercase"
    },
    ".button-group": {
      display: "flex",
      flexDirection: "row",
      gap: "0.5em",
      marginTop: "auto"
    },
    ".list-button": {
      fontSize: theme.fontSizeNormal,
      fontFamily: theme.fontFamily1,
      background: theme.vars.palette.grey[900],
      color: theme.vars.palette.grey[200],
      textTransform: "none",
      padding: "0 .5em"
    },
    ".list-button:hover": {
      color: theme.vars.palette.grey[0]
    },
    ".gsi-material-button": {
      width: "240px",
      fontSize: "1em",
      border: "none",
      background: theme.vars.palette.grey[0],
      padding: "1.5em 1em"
    },
    ".gsi-material-button:hover": {
      background: theme.vars.palette.grey[100]
    }
  });

interface LinkButtonProps {
  name: string;
  url: string;
  onClick: (url: string) => void;
}

const LinkButton = memo(({ name, url, onClick }: LinkButtonProps) => {
  const handleClick = useCallback(() => {
    onClick(url);
  }, [url, onClick]);

  return (
    <EditorButton
      onClick={handleClick}
      className="list-button"
      density="normal"
    >
      {name}
    </EditorButton>
  );
});

LinkButton.displayName = "LinkButton";

function Login() {
  const theme = useTheme();
  const linkItems = [
    { name: "Anthropic", url: "https://www.anthropic.com" },
    { name: "HuggingFace", url: "https://huggingface.co" },
    { name: "OpenAI", url: "https://openai.com" },
    { name: "Replicate", url: "https://replicate.com" },
    { name: "StabilityAI", url: "https://stability.ai/" }
  ];
  const handleClick = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <Box css={styles(theme)}>
      <div className="flex">
        <Logo
          width="250px"
          height="250px"
          fontSize="80px"
          borderRadius="1.5em"
          small={false}
        />
        <Typography component="h3">
          Node-based AI <br />
          for text, image, audio & video.
        </Typography>
      </div>
      <GoogleAuthButton />
      <div className="button-group">
        {linkItems.map((item) => (
          <LinkButton
            key={item.name}
            name={item.name}
            url={item.url}
            onClick={handleClick}
          />
        ))}
      </div>
    </Box>
  );
}

export default memo(Login);
