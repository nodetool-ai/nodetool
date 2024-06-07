/** @jsxImportSource @emotion/react */
import { css, useTheme } from "@emotion/react";
import { useState, useEffect } from "react";
import { Typography } from "@mui/material";
import GoogleAuthButton from "./buttons/GoogleAuthButton";
import { DATA_TYPES } from "../config/data_types";

const randomDatatypeColor = () => {
  return DATA_TYPES[Math.floor(Math.random() * DATA_TYPES.length)].color;
};

const styles = (theme: any, col1: string, opacity: number) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#222",
    height: "75vh",
    ".nt": {
      color: "white",
      width: "250px",
      height: "250px",
      backgroundColor: "transparent",
      opacity: opacity,
      transition: "opacity 1s ease-in-out .2s"
    },
    ".nodetool": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "250px",
      height: "250px",
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
      backgroundColor: "white",
      transition: "all .4s ease-out",
      outline: "1px solid white"
    },
    ".nt:hover .nodetool": {
      color: "#000",
      borderRadius: "3em",
      backgroundColor: col1,
      // border: "6px dashed #222",
      textShadow: "0 0 2px rgba(0,0,0,1)",
      // fontSize: "54px",
      filter: "blur(0.3px)",
      boxShadow: `0 0 33px ${col1}`,
      outline: `8px solid ${col1}`
    },
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
  const [hoverColor, setHoverColor] = useState(randomDatatypeColor());
  const [opacity, setOpacity] = useState(0);
  const theme = useTheme();

  const handleMouseEnter = () => {
    setHoverColor(randomDatatypeColor());
  };
  useEffect(() => {
    setOpacity(1);
  }, []);

  return (
    <div css={styles(theme, hoverColor, opacity)}>
      <div className="nt" onMouseEnter={handleMouseEnter}>
        <div className="nodetool">
          NODE <br /> TOOL
        </div>
      </div>
      <Typography component="h3">
        Visual programming
        <br /> for generative AI
      </Typography>
      <GoogleAuthButton />
    </div>
  );
}

export default Login;
