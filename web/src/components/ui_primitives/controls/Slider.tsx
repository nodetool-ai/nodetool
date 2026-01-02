/** @jsxImportSource @emotion/react */
import React from 'react';
import { Slider as MuiSlider, SliderProps as MuiSliderProps } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { css } from '@emotion/react';
import type { Theme } from '@mui/material/styles';

/**
 * Slider Props
 */
export interface SliderProps extends MuiSliderProps {
  /** Whether the value differs from default */
  changed?: boolean;
  /** Whether the slider is in an invalid state */
  invalid?: boolean;
  /** Density/size variant */
  density?: 'compact' | 'normal' | 'comfortable';
  /** Visual variant */
  variant?: 'default' | 'inline';
}

/**
 * Slider Styles
 */
const getSliderStyles = (
  theme: Theme,
  changed?: boolean,
  invalid?: boolean,
  density?: 'compact' | 'normal' | 'comfortable',
  variant?: 'default' | 'inline'
) => {
  const height = {
    compact: 4,
    normal: 6,
    comfortable: 8
  }[density || 'compact'];

  const thumbSize = {
    compact: 12,
    normal: 16,
    comfortable: 20
  }[density || 'compact'];

  // Inline variant for nodes - minimal visual weight
  if (variant === 'inline') {
    return css({
      position: 'absolute',
      left: '1em',
      bottom: '0.3em',
      width: 'calc(100% - 2em)',
      maxWidth: '300px',
      margin: 0,
      padding: '0 !important',

      '& .MuiSlider-rail': {
        width: '100%',
        height: '14px',
        backgroundColor: 'transparent',
        marginLeft: 0,
        top: '-5px',
        left: 0,
        borderRadius: '1px',
        opacity: 1
      },

      '& .MuiSlider-track': {
        height: '14px',
        backgroundColor: 'transparent',
        borderBottom: `2px solid ${changed ? theme.vars.palette.primary.main : theme.vars.palette.grey[500]}`,
        borderRadius: '1px 0px 0px 1px',
        opacity: 1,
        top: '-7px',
        left: 0,
        border: 'none'
      },

      '& .MuiSlider-thumb': {
        visibility: 'hidden',
        display: 'none'
      }
    });
  }

  // Default variant - standard slider
  return css({
    color: changed 
      ? theme.vars.palette.primary.main 
      : theme.vars.palette.grey[500],
    height,
    padding: theme.spacing(1.5, 0),

    '& .MuiSlider-rail': {
      backgroundColor: theme.vars.palette.grey[700],
      opacity: 1,
      height,
      borderRadius: height / 2,
      border: invalid ? `1px solid ${theme.vars.palette.error.main}` : 'none'
    },

    '& .MuiSlider-track': {
      backgroundColor: changed 
        ? theme.vars.palette.primary.main 
        : theme.vars.palette.grey[500],
      height,
      borderRadius: height / 2,
      border: 'none',
      transition: theme.transitions.create('background-color', {
        duration: theme.transitions.duration.shortest
      })
    },

    '& .MuiSlider-thumb': {
      width: thumbSize,
      height: thumbSize,
      backgroundColor: theme.vars.palette.grey[100],
      border: changed 
        ? `2px solid ${theme.vars.palette.primary.main}` 
        : `2px solid ${theme.vars.palette.grey[500]}`,
      transition: theme.transitions.create(['border-color', 'box-shadow'], {
        duration: theme.transitions.duration.shortest
      }),

      '&:hover, &.Mui-focusVisible': {
        boxShadow: changed
          ? `0 0 0 8px ${theme.vars.palette.primary.main}1a`
          : `0 0 0 8px ${theme.vars.palette.grey[500]}1a`
      },

      '&.Mui-active': {
        boxShadow: changed
          ? `0 0 0 14px ${theme.vars.palette.primary.main}1a`
          : `0 0 0 14px ${theme.vars.palette.grey[500]}1a`
      }
    },

    '& .MuiSlider-valueLabel': {
      backgroundColor: theme.vars.palette.grey[900],
      borderRadius: theme.rounded.buttonSmall,
      padding: theme.spacing(0.5, 1),
      fontSize: theme.fontSizeTiny
    },

    '&.Mui-disabled': {
      color: theme.vars.palette.grey[800],

      '& .MuiSlider-thumb': {
        backgroundColor: theme.vars.palette.grey[700],
        border: `2px solid ${theme.vars.palette.grey[800]}`
      }
    }
  });
};

/**
 * Slider Component
 * 
 * A themeable slider primitive that uses semantic props.
 * Supports both standard and inline (node) variants.
 * 
 * @example
 * ```tsx
 * <Slider
 *   value={value}
 *   onChange={(e, val) => setValue(val as number)}
 *   min={0}
 *   max={100}
 *   step={1}
 *   changed={value !== defaultValue}
 *   density="compact"
 * />
 * ```
 */
const Slider = React.forwardRef<HTMLSpanElement, SliderProps>(
  (
    { changed, invalid, density = 'compact', variant = 'default', ...props },
    ref
  ) => {
    const theme = useTheme();

    return (
      <MuiSlider
        ref={ref}
        css={getSliderStyles(theme, changed, invalid, density, variant)}
        {...props}
      />
    );
  }
);

Slider.displayName = 'Slider';

export default Slider;
