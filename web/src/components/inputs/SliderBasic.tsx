/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { SliderProps } from "../ui_primitives";
import {
  Tooltip,
  SHADOW,
  SPACING,
  getSpacingPx,
  Slider
} from "../ui_primitives";
import type { Theme } from "@mui/material/styles";

const sliderBasicStyles = (theme: Theme) =>
  css({
    "&": {
      marginTop: getSpacingPx(SPACING.xs), // was 3px
      padding: "0"
    },
    ".MuiSlider-rail": {
      backgroundColor: theme.vars.palette.grey[500],
      borderRadius: 0,
      height: "5px"
    },
    ".MuiSlider-track": {
      height: "5px",
      opacity: "1",
      left: "0",
      borderRadius: 0
    },
    ".MuiSlider-thumb": {
      backgroundColor: theme.vars.palette.grey[200],
      boxShadow: SHADOW(theme).ambient,
      borderRadius: "0",
      width: "8px",
      height: "8px",
      "&:hover, &:focus, &:active": {
        boxShadow: SHADOW(theme).ambient,
        backgroundColor: "var(--palette-primary-main)"
      },
      "&.Mui-focusVisible": {
        boxShadow: SHADOW(theme).ambient
      },
      "&.Mui-active": {
        boxShadow: SHADOW(theme).ambient
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
