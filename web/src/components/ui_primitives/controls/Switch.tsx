import * as React from 'react';
import { Switch as MuiSwitch, SwitchProps as MuiSwitchProps } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { css } from '@emotion/react';
import type { Theme } from '@mui/material/styles';

/**
 * Switch Props
 * 
 * Semantic props for explicit state communication
 */
export interface SwitchProps extends Omit<MuiSwitchProps, 'size'> {
  /** Whether the value differs from default */
  changed?: boolean;
  /** Whether the switch is in an invalid state */
  invalid?: boolean;
  /** Density/size variant */
  density?: 'compact' | 'normal' | 'comfortable';
  /** Visual variant */
  variant?: 'default' | 'emphasized';
}

/**
 * Switch Styles
 * 
 * All styling is self-contained and theme-driven.
 * No descendant selectors or DOM reach-in patterns.
 */
const getSwitchStyles = (
  theme: Theme,
  changed?: boolean,
  invalid?: boolean,
  density?: 'compact' | 'normal' | 'comfortable',
  variant?: 'default' | 'emphasized'
) => {
  // Determine dimensions based on density
  const dimensions = {
    compact: { width: 24, height: 12, thumbSize: 12, translateX: 12 },
    normal: { width: 32, height: 16, thumbSize: 16, translateX: 16 },
    comfortable: { width: 40, height: 20, thumbSize: 20, translateX: 20 }
  }[density || 'compact'];

  return css({
    margin: 0,
    padding: 0,
    width: dimensions.width,
    height: dimensions.height,
    overflow: 'visible',

    '& .MuiSwitch-switchBase': {
      margin: 0,
      padding: 0,
      color: theme.vars.palette.grey[400],
      
      '&.Mui-checked': {
        color: changed 
          ? theme.vars.palette.primary.main
          : theme.vars.palette.grey[100],
        transform: `translateX(${dimensions.translateX}px)`,

        '& + .MuiSwitch-track': {
          backgroundColor: changed
            ? theme.vars.palette.primary.main
            : theme.vars.palette.grey[100],
          opacity: 1,
          border: invalid ? `1px solid ${theme.vars.palette.error.main}` : 'none'
        }
      },

      '&.Mui-disabled': {
        color: theme.vars.palette.grey[700]
      }
    },

    '& .MuiSwitch-thumb': {
      width: dimensions.thumbSize,
      height: dimensions.thumbSize,
      borderRadius: theme.rounded.buttonSmall,
      margin: 0,
      padding: 0,
      boxShadow: 'none'
    },

    '& .MuiSwitch-track': {
      borderRadius: theme.rounded.buttonSmall,
      backgroundColor: theme.vars.palette.grey[600],
      opacity: 1,
      border: invalid ? `1px solid ${theme.vars.palette.error.main}` : 'none',
      transition: theme.transitions.create(['background-color', 'border'], {
        duration: theme.transitions.duration.shortest
      })
    },

    // Emphasized variant shows more visual weight when changed
    ...(variant === 'emphasized' && changed && {
      '& .MuiSwitch-switchBase.Mui-checked': {
        '& + .MuiSwitch-track': {
          boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}33`
        }
      }
    })
  });
};

/**
 * Switch Component
 * 
 * A themeable toggle switch primitive that uses semantic props
 * instead of CSS classes for state management.
 * 
 * @example
 * ```tsx
 * <Switch
 *   checked={value}
 *   onChange={(e) => setValue(e.target.checked)}
 *   changed={value !== defaultValue}
 *   invalid={!isValid}
 *   disabled={isDisabled}
 *   density="compact"
 * />
 * ```
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    { changed, invalid, density = 'compact', variant = 'default', ...props },
    ref
  ) => {
    const theme = useTheme();

    return (
      <MuiSwitch
        ref={ref}
        css={getSwitchStyles(theme, changed, invalid, density, variant)}
        {...props}
      />
    );
  }
);

Switch.displayName = 'Switch';

export default Switch;
