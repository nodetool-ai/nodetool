/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useEffect, useState } from "react";
import { DATA_TYPES } from "../config/data_types";

const randomDatatype = () => {
  return DATA_TYPES[Math.floor(Math.random() * DATA_TYPES.length)];
};

const logoStyles = (
  bgColor: string,
  textColor: string,
  opacity: number,
  width: string,
  height: string,
  fontSize: string,
  borderRadius: string,
  small: boolean
) =>
  css({
    ".nt": {
      color: "white",
      width: width,
      height: height,
      backgroundColor: "transparent",
      opacity: opacity,
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
      padding: "0.2em 0 0",
      color: "#222",
      borderRadius: ".1em",
      boxShadow: small ? `0` : "0 0 24px rgba(200,200,200,0.3)",
      cursor: "pointer",
      boxSizing: "border-box",
      backgroundColor: "white",
      transition: "all .4s ease-in-out"
    },
    ".nt:hover .nodetool": {
      borderRadius: borderRadius,
      backgroundColor: bgColor,
      color: textColor,
      textShadow: small ? "0" : `0 0 2px ${textColor}`,
      filter: small ? "none" : "blur(0.3px)",
      boxShadow: small ? `0` : `0 0 11px ${bgColor}`
    }
  });

type LogoProps = {
  width: string;
  height: string;
  fontSize: string;
  borderRadius: string;
  small: boolean;
};

const Logo = ({ width, height, fontSize, borderRadius, small }: LogoProps) => {
  const [rdt, setRdt] = useState(randomDatatype());
  const [hoverColor, setHoverColor] = useState(rdt.color);
  const [textColor, setTextColor] = useState(rdt.textColor);
  const [opacity, setOpacity] = useState(0);

  const handleMouseEnter = () => {
    setRdt(randomDatatype());
    setHoverColor(rdt.color);
    setTextColor(rdt.textColor);
  };

  useEffect(() => {
    setOpacity(1);
  }, []);

  return (
    <div
      css={logoStyles(
        hoverColor,
        textColor,
        opacity,
        width,
        height,
        fontSize,
        borderRadius,
        small
      )}
    >
      <div className="nt" onMouseEnter={handleMouseEnter}>
        <div className="nodetool">
          NODE <br /> TOOL
        </div>
      </div>
    </div>
  );
};

export default Logo;
