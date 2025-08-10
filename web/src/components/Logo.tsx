/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useEffect, useState, useCallback } from "react";
import { DATA_TYPES } from "../config/data_types";
import { useColorScheme, useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const randomDatatype = () => {
  return DATA_TYPES[Math.floor(Math.random() * DATA_TYPES.length)];
};

const logoStyles = (
  theme: Theme,
  bgColor: string,
  textColor: string,
  opacity: number,
  width: string,
  height: string,
  fontSize: string,
  borderRadius: string,
  small: boolean,
  invertLogo: boolean
) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: "20px",
    ".nt": {
      fontFamily: theme.fontFamily1,
      fontWeight: 600,
      color: "white",
      width: width,
      height: height,
      backgroundColor: "transparent",
      opacity: opacity,
      marginTop: "1px",
      transition: "opacity 1s ease-in-out .2s"
    },
    ".nodetool": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: width,
      height: height,
      textAlign: "center",
      userSelect: "none",
      fontSize: fontSize,
      lineHeight: "1em",
      padding: "0px",
      color: theme.vars.palette.grey[0],
      borderRadius: ".1em",
      // boxShadow: small ? `0` : "0 0 24px rgba(200,200,200,0.2)",
      cursor: "pointer",
      boxSizing: "border-box",
      transition: "all .4s ease-in-out"
    },
    ".nt:hover .nodetool": {
      borderRadius: borderRadius,
      backgroundColor: bgColor,
      color: textColor,
      textShadow: small ? "0" : `0 0 2px ${textColor}`,
      filter: small ? "none" : "blur(0.3px)",
      boxShadow: small ? `0` : `0 0 11px ${bgColor}`
    },
    ".logo-image": {
      cursor: "pointer",
      width: "20px",
      height: "20px",
      filter: invertLogo ? "invert(1)" : undefined
    }
  });

type LogoProps = {
  width: string;
  height: string;
  fontSize: string;
  borderRadius: string;
  small: boolean;
  singleLine?: boolean;
  enableText?: boolean;
};

const Logo = ({
  width,
  height,
  fontSize,
  borderRadius,
  small,
  singleLine,
  enableText = false
}: LogoProps) => {
  const [rdt, setRdt] = useState(randomDatatype());
  const [hoverColor, setHoverColor] = useState(rdt.color);
  const [textColor, setTextColor] = useState(rdt.textColor);
  const [opacity, setOpacity] = useState(0);

  const handleMouseEnter = useCallback(() => {
    setRdt(randomDatatype());
    setHoverColor(rdt.color);
    setTextColor(rdt.textColor);
  }, [rdt]);

  useEffect(() => {
    setOpacity(1);
  }, []);

  const theme = useTheme();
  const { mode } = useColorScheme();


  return (
    <div
      className="nodetool-logo"
      css={logoStyles(
        theme,
        hoverColor,
        textColor,
        opacity,
        width,
        height,
        fontSize,
        borderRadius,
        small,
        mode === "light"
      )}
    >
      {small && (
        <img className="logo-image" src="/nodetool_icon.png" alt="NodeTool" />
      )}
      {enableText && (
        <div className="nt" onMouseEnter={handleMouseEnter} aria-hidden="true">
          <div className="nodetool" aria-hidden="true">
            {!singleLine && (
              <>
                {"NODE"}
                <br />
                {"TOOL"}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Logo;
