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
    h3: {
      fontFamily: "monospace",
      wordSpacing: "-0.2em",
      fontSize: "1.2em",
      margin: "0 0 3em",
      padding: "1em 2em",
      color: "white",
      textAlign: "center",
      textTransform: "uppercase",
      lineHeight: "1.25em"
    },
    h4: {
      fontFamily: "monospace",
      position: "fixed",
      bottom: ".2em",
      fontSize: "1em",
      padding: "1em 2em",
      color: "#777",
      lineHeight: "1.25em",
      textAlign: "center",
      textTransform: "uppercase"
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
      <Logo
        width="250px"
        height="250px"
        fontSize="80px"
        borderRadius="3em"
        small={false}
      />
      <Typography component="h3">
        Visual programming
        <br /> for generative AI
      </Typography>
      <GoogleAuthButton />
    </div>
  );
}

export default Login;
