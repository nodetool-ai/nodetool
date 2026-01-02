/** @jsxImportSource @emotion/react */
import React from 'react';
import { IconButton as MuiIconButton, IconButtonProps as MuiIconButtonProps } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { css } from '@emotion/react';
import type { Theme } from '@mui/material/styles';

/**
 * IconButton Props
 */
export interface IconButtonProps extends Omit<MuiIconButtonProps, 'size'> {
  /** Whether the button represents an active/selected state */
  active?: boolean;
  /** Density/size variant */
  density?: 'compact' | 'normal' | 'comfortable';
}

/**
 * IconButton Styles
 */
const getIconButtonStyles = (
  theme: Theme,
  active?: boolean,
  density?: 'compact' | 'normal' | 'comfortable'
) => {
  const size = {
    compact: 24,
    normal: 32,
    comfortable: 40
  }[density || 'normal'];

  const iconSize = {
    compact: '0.875rem',
    normal: '1.25rem',
    comfortable: '1.5rem'
  }[density || 'normal'];

  return css({
    width: size,
    height: size,
    padding: 0,
    borderRadius: theme.rounded.buttonSmall,
    backgroundColor: active 
      ? theme.vars.palette.primary.main 
      : 'transparent',
    color: active 
      ? theme.vars.palette.primary.contrastText 
      : theme.vars.palette.text.secondary,
    transition: theme.transitions.create(['background-color', 'color'], {
      duration: theme.transitions.duration.short
    }),

    '& svg': {
      fontSize: iconSize
    },

    '&:hover': {
      backgroundColor: active 
        ? theme.vars.palette.primary.dark 
        : theme.vars.palette.grey[800],
      color: active 
        ? theme.vars.palette.primary.contrastText 
        : theme.vars.palette.text.primary
    },

    '&:active': {
      backgroundColor: active 
        ? theme.vars.palette.primary.dark 
        : theme.vars.palette.grey[900]
    },

    '&.Mui-disabled': {
      backgroundColor: 'transparent',
      color: theme.vars.palette.grey[700],
      opacity: 0.5
    }
  });
};

/**
 * IconButton Component
 * 
 * A themeable icon button primitive.
 * 
 * @example
 * ```tsx
 * <IconButton
 *   onClick={handleClick}
 *   active={isActive}
 *   density="compact"
 *   disabled={isDisabled}
 *   aria-label="Delete"
 * >
 *   <DeleteIcon />
 * </IconButton>
 * ```
 */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { active, density = 'normal', ...props },
    ref
  ) => {
    const theme = useTheme();

    return (
      <MuiIconButton
        ref={ref}
        css={getIconButtonStyles(theme, active, density)}
        {...props}
      />
    );
  }
);

IconButton.displayName = 'IconButton';

export default IconButton;
