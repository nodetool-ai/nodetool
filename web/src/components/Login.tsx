/** @jsxImportSource @emotion/react */
import { Box, Typography } from "@mui/material";
import GoogleAuthButton from "./buttons/GoogleAuthButton";
import { css } from "@emotion/react";

const styles = (theme: any) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#222",
    height: "75vh",
    h1: {
      fontSize: "1.5em",
      margin: ".1em 0",
      padding: "1em 2em",
      backgroundColor: "#bcdaba",
      color: "#111",
      borderRadius: ".1em",
      border: "1px solid #111",
      lineHeight: "1.2em",
      textAlign: "center"
    },
    ".nt": {
      lineHeight: "0.3em",
      fontWeight: "bold"
    },
    h3: {
      fontFamily: "monospace",
      wordSpacing: "-0.2em",
      fontSize: "1.2em",
      margin: ".25em 0 3em",
      padding: "1em 2em",
      color: "#999",
      lineHeight: "1.25em",
      textAlign: "center"
    },
    h4: {
      fontFamily: "monospace",
      position: "fixed",
      bottom: ".2em",
      fontSize: "1em",
      padding: "1em 2em",
      color: "#777",
      lineHeight: "1.25em",
      textAlign: "center"
    },
    ".gsi-material-button": {
      fontSize: "1em",
      border: "none",
      background: "#333",
      padding: "2em 1em"
    }
  });

function Login() {
  return (
    <div css={styles}>
      <Typography component="h1">
        <div style={{ marginBottom: "-.6em" }}>´´´´´´</div>
        <span className="nt">
          NODE
          <br />
          TOOL
        </span>
        <div style={{ marginBottom: "-.75em" }}>``````</div>
      </Typography>
      <Typography component="h3">
        Visual programming
        <br /> for generative AI
      </Typography>
      <GoogleAuthButton />
      <Typography component="h4">MinimalIntelligence.com</Typography>
    </div>
  );
}

export default Login;
