/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { Typography } from "@mui/material";
import GoogleAuthButton from "./buttons/GoogleAuthButton";

const styles = (theme: any) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#222",
    height: "75vh",
    ".nt": {
      color: theme.palette.c_hl1,
      width: "200px",
      height: "200px",
      backgroundColor: "transparent"
    },
    ".nodetool": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "200px",
      height: "200px",
      textAlign: "center",
      userSelect: "none",
      fontSize: "60px",
      lineHeight: ".9em",
      padding: "10px 0 0",
      color: "#222",
      borderRadius: ".1em",
      boxShadow: "0 0 24px rgba(200,200,200,0.3)",
      cursor: "pointer",
      border: "0px dashed #2229",
      boxSizing: "border-box",
      backgroundColor: theme.palette.c_hl1,
      transition: "all .3s ease-out",
      outline: "1px solid " + theme.palette.c_hl1
    },
    ".nt:hover .nodetool": {
      color: "#000",
      width: "200px",
      height: "200px",
      borderRadius: "1.92em",
      backgroundColor: theme.palette.c_hl1,
      border: "9px dashed #222",
      textShadow: "0 0 2px rgba(0,0,0,1)",
      fontSize: "54px",
      filter: "blur(0.3px)",
      boxShadow: "0 0 33px" + theme.palette.c_hl1,
      outline: "8px solid " + theme.palette.c_hl1
    },
    h3: {
      fontFamily: "monospace",
      wordSpacing: "-0.2em",
      fontSize: "1.2em",
      margin: "0 0 3em",
      padding: "1em 2em",
      color: theme.palette.c_hl1,
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
      fontSize: "1em",
      border: "none",
      background: "#333",
      padding: "2em 1em"
    }
  });

function Login() {
  return (
    <div css={styles}>
      <div className="nt">
        <div className="nodetool">
          {/* <div style={{ marginBottom: "-.6em" }}>´´´´´´</div> */}
          NODE <br /> TOOL
          {/* <div style={{ marginBottom: "-.75em" }}>``````</div> */}
        </div>
      </div>
      <Typography component="h3">
        Visual programming
        <br /> for generative AI
      </Typography>
      <GoogleAuthButton />
      {/* <Typography component="h4">MinimalIntelligence.com</Typography> */}
    </div>
  );
}

export default Login;
