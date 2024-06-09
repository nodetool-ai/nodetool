/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useEffect, useState } from "react";
import { DATA_TYPES } from "../config/data_types";

const randomDatatypeColor = () => {
    return DATA_TYPES[Math.floor(Math.random() * DATA_TYPES.length)].color;
};

const logoStyles = (
    col1: string,
    opacity: number,
    width: string,
    height: string,
    fontSize: string,
    borderRadius: string,
    outline: string
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
            boxShadow: "0 0 24px rgba(200,200,200,0.3)",
            cursor: "pointer",
            boxSizing: "border-box",
            backgroundColor: "white",
            transition: "all .4s ease-out",
            outline: "1px solid white"
        },
        ".nt:hover .nodetool": {
            color: "#000",
            borderRadius: borderRadius,
            backgroundColor: col1,
            textShadow: "0 0 2px rgba(0,0,0,1)",
            filter: "blur(0.3px)",
            boxShadow: `0 0 33px ${col1}`,
            outline: `${outline} solid ${col1}`
        }
    });

type LogoProps = {
    width: string;
    height: string;
    fontSize: string;
    borderRadius: string;
    outline: string;
};

const Logo = ({ width, height, fontSize, borderRadius, outline }: LogoProps) => {
    const [hoverColor, setHoverColor] = useState(randomDatatypeColor());
    const [opacity, setOpacity] = useState(0);

    const handleMouseEnter = () => {
        setHoverColor(randomDatatypeColor());
    };

    useEffect(() => {
        setOpacity(1);
    }, []);

    return (
        <div css={logoStyles(hoverColor, opacity, width, height, fontSize, borderRadius, outline)} >
            <div className="nt" onMouseEnter={handleMouseEnter}>
                <div className="nodetool">
                    NODE <br /> TOOL
                </div>
            </div>
        </div>
    );
};

export default Logo;