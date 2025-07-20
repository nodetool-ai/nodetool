/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import Slider from "@mui/material/Slider";
import React from "react";

const sliderStyles = (theme: Theme) =>
  css({
    "&": {
      position: "absolute",
      left: "1em",
      bottom: "0.3em",
      width: "calc(100% - 2em)",
      maxWidth: "300px",
      margin: 0,
      padding: "0 !important"
    },
    ".MuiSlider-rail": {
      width: "100%",
      height: "14px",
      backgroundColor: "transparent",
      marginLeft: 0,
      top: "-5px",
      left: 0,
      borderRadius: "1px"
    },
    ".MuiSlider-track": {
      height: "14px",
      backgroundColor: "transparent",
      borderBottom: `2px solid ${theme.vars.palette.grey[500]}`,
      borderRadius: "1px 0px 0px 1px",
      opacity: 1,
      top: "-7px",
      left: 0
    },
    ".MuiSlider-thumb": {
      visibility: "hidden",
      display: "none"
    }
  });

const SliderNodes = (props: any) => {
  return <Slider {...props} css={sliderStyles} />;
  // return <React.Fragment />;
};
export default SliderNodes;
