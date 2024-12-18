/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Slider, SliderProps, Tooltip } from "@mui/material";

const sliderBasicStyles = (theme: any) =>
  css({
    "&": {
      marginTop: "3px",
      padding: "0"
    },
    ".MuiSlider-rail": {
      backgroundColor: theme.palette.c_gray3,
      borderRadius: "0px",
      height: "5px"
    },
    ".MuiSlider-track": {
      height: "5px",
      opacity: "1",
      left: "0",
      borderRadius: "0px"
    },
    ".MuiSlider-thumb": {
      backgroundColor: theme.palette.c_gray5,
      boxShadow: "0px 0px 5px 1px rgba(0, 0, 0, 0.25)",
      borderRadius: "0",
      width: "8px",
      height: "8px",
      "&:hover, &:focus, &:active": {
        boxShadow: "0px 0px 5px 1px rgba(0, 0, 0, 0.25)",
        backgroundColor: theme.palette.c_hl1
      },
      "&.Mui-focusVisible": {
        boxShadow: "0px 0px 5px 1px rgba(0, 0, 0, 0.25)"
      },
      "&.Mui-active": {
        boxShadow: "0px 0px 5px 1px rgba(0, 0, 0, 0.25)"
      },
      "&::before, &::after": {
        width: "12px",
        height: "12px"
      }
    }
  });

type SliderBasicProps = SliderProps & {
  tooltipText?: string;
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
};

const SliderBasic = ({
  tooltipText = "",
  tooltipPlacement = "bottom",
  ...props
}: SliderBasicProps) => {
  return (
    <Tooltip title={tooltipText} placement={tooltipPlacement}>
      <div>
        <Slider {...props} css={sliderBasicStyles} tabIndex={-1} />
      </div>
    </Tooltip>
  );
};

export default SliderBasic;
