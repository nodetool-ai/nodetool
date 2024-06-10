/** @jsxImportSource @emotion/react */
import { css, useTheme } from "@emotion/react";
import { Typography } from "@mui/material";
import GoogleAuthButton from "./buttons/GoogleAuthButton";
import Logo from "./Logo";

const styles = (theme: any) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#222",
    height: "75vh",
    ".flex": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "center",
      gap: "1em"
    },
    h3: {
      fontFamily: theme.fontFamily,
      fontSize: "1.0em",
      color: "white",
      textAlign: "left",
      // wordSpacing: "-0.2em",
      // textTransform: "uppercase",
      lineHeight: "1.25em",
      width: "230px"
    },
    h4: {
      fontFamily: "monospace",
      fontSize: "1em",
      lineHeight: "1.25em",
      maxWidth: "250px",
      textAlign: "left",
      textTransform: "uppercase"
    },
    ".list": {
      width: "230px",
      listStyleType: "none",
      padding: "0",
      "& li": {
        padding: "0.1em 0",
        "&:before": {
          content: '"\\2022"',
          color: theme.palette.c_gray5,
          display: "inline-block",
          width: "1em",
          marginLeft: "-1em"
        }
      }
    },
    ".gsi-material-button": {
      width: "240px",
      fontSize: "1em",
      border: "none",
      background: theme.palette.c_white,
      padding: "1.5em 1em"
    },
    ".gsi-material-button:hover": {
      background: theme.palette.c_gray6
    }
  });

function Login() {
  const theme = useTheme();

  return (
    <div css={styles(theme)}>
      <div className="flex">
        <Logo
          width="250px"
          height="250px"
          fontSize="80px"
          borderRadius="1.5em"
          small={false}
        />
        <Typography component="h3">
          Node-based AI workflows for text, image, audio, and video.
        </Typography>
        <ul className="list">
          <li>OpenAI</li>
          <li>HuggingFace</li>
          <li>Replicate</li>
          <li>Anthropic</li>
          <li>ComfyUI</li>
        </ul>
      </div>
      <GoogleAuthButton />
    </div>
  );
}

export default Login;
