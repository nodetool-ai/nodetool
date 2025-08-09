/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { Slider, SliderProps, Tooltip } from "@mui/material";
import type { Theme } from "@mui/material/styles";

const sliderBasicStyles = (theme: Theme) =>
  css({
    "&": {
      marginTop: "3px",
      padding: "0"
    },
    ".MuiSlider-rail": {
      backgroundColor: theme.vars.palette.grey[500],
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
      backgroundColor: theme.vars.palette.grey[200],
      boxShadow: "0px 0px 5px 1px rgba(0, 0, 0, 0.25)",
      borderRadius: "0",
      width: "8px",
      height: "8px",
      "&:hover, &:focus, &:active": {
        boxShadow: "0px 0px 5px 1px rgba(0, 0, 0, 0.25)",
        backgroundColor: "var(--palette-primary-main)"
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
  const theme = useTheme();
  return (
    <Tooltip title={tooltipText} placement={tooltipPlacement}>
      <div className="slider-basic">
        <Slider {...props} css={sliderBasicStyles(theme)} tabIndex={-1} />
      </div>
    </Tooltip>
  );
};

export default SliderBasic;
