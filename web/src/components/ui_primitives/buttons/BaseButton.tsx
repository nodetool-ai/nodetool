/** @jsxImportSource @emotion/react */
import React from 'react';
import { Button as MuiButton, ButtonProps as MuiButtonProps } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { css } from '@emotion/react';
import type { Theme } from '@mui/material/styles';

/**
 * BaseButton Props
 */
export interface BaseButtonProps extends Omit<MuiButtonProps, 'size' | 'variant'> {
  /** Whether the button represents an active/selected state */
  active?: boolean;
  /** Density/size variant */
  density?: 'compact' | 'normal' | 'comfortable';
  /** Visual variant */
  variant?: 'contained' | 'outlined' | 'text' | 'ghost';
}

/**
 * BaseButton Styles
 */
const getButtonStyles = (
  theme: Theme,
  active?: boolean,
  density?: 'compact' | 'normal' | 'comfortable',
  variant?: 'contained' | 'outlined' | 'text' | 'ghost'
) => {
  const padding = {
    compact: theme.spacing(0.5, 1.5),
    normal: theme.spacing(1, 2),
    comfortable: theme.spacing(1.5, 3)
  }[density || 'normal'];

  const fontSize = {
    compact: theme.fontSizeSmaller,
    normal: theme.fontSizeSmall,
    comfortable: theme.fontSizeNormal
  }[density || 'normal'];

  const minHeight = {
    compact: 24,
    normal: 32,
    comfortable: 40
  }[density || 'normal'];

  // Base styles for all variants
  const baseStyles = {
    minWidth: 36,
    minHeight,
    padding,
    fontSize,
    fontFamily: theme.fontFamily1,
    fontWeight: 500,
    lineHeight: 1.2,
    textTransform: 'none' as const,
    borderRadius: theme.rounded.buttonSmall,
    transition: theme.transitions.create(
      ['background-color', 'border-color', 'box-shadow', 'color'],
      { duration: theme.transitions.duration.short }
    )
  };

  // Variant-specific styles
  switch (variant) {
    case 'contained':
      return css({
        ...baseStyles,
        backgroundColor: active 
          ? theme.vars.palette.primary.main 
          : theme.vars.palette.grey[700],
        color: theme.vars.palette.text.primary,
        border: 'none',

        '&:hover': {
          backgroundColor: active 
            ? theme.vars.palette.primary.dark 
            : theme.vars.palette.grey[600]
        },

        '&:active': {
          backgroundColor: active 
            ? theme.vars.palette.primary.dark 
            : theme.vars.palette.grey[800]
        },

        '&.Mui-disabled': {
          backgroundColor: theme.vars.palette.grey[800],
          color: theme.vars.palette.grey[600],
          opacity: 0.5
        }
      });

    case 'outlined':
      return css({
        ...baseStyles,
        backgroundColor: 'transparent',
        color: active 
          ? theme.vars.palette.primary.main 
          : theme.vars.palette.text.primary,
        border: `1px solid ${active ? theme.vars.palette.primary.main : theme.vars.palette.grey[600]}`,

        '&:hover': {
          backgroundColor: theme.vars.palette.grey[800],
          borderColor: active 
            ? theme.vars.palette.primary.light 
            : theme.vars.palette.grey[500]
        },

        '&:active': {
          backgroundColor: theme.vars.palette.grey[900]
        },

        '&.Mui-disabled': {
          borderColor: theme.vars.palette.grey[800],
          color: theme.vars.palette.grey[600],
          opacity: 0.5
        }
      });

    case 'text':
      return css({
        ...baseStyles,
        backgroundColor: 'transparent',
        color: active 
          ? theme.vars.palette.primary.main 
          : theme.vars.palette.text.primary,
        border: 'none',

        '&:hover': {
          backgroundColor: theme.vars.palette.grey[800]
        },

        '&:active': {
          backgroundColor: theme.vars.palette.grey[900]
        },

        '&.Mui-disabled': {
          color: theme.vars.palette.grey[600],
          opacity: 0.5
        }
      });

    case 'ghost':
      return css({
        ...baseStyles,
        backgroundColor: 'transparent',
        color: active 
          ? theme.vars.palette.primary.main 
          : theme.vars.palette.grey[400],
        border: 'none',

        '&:hover': {
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          color: active 
            ? theme.vars.palette.primary.light 
            : theme.vars.palette.text.primary
        },

        '&:active': {
          backgroundColor: 'rgba(255, 255, 255, 0.1)'
        },

        '&.Mui-disabled': {
          color: theme.vars.palette.grey[700],
          opacity: 0.5
        }
      });

    default:
      return css(baseStyles);
  }
};

/**
 * BaseButton Component
 * 
 * A themeable button primitive that uses semantic props.
 * 
 * @example
 * ```tsx
 * <BaseButton
 *   onClick={handleClick}
 *   active={isActive}
 *   variant="contained"
 *   density="compact"
 *   disabled={isDisabled}
 * >
 *   Click me
 * </BaseButton>
 * ```
 */
const BaseButton = React.forwardRef<HTMLButtonElement, BaseButtonProps>(
  (
    { active, density = 'normal', variant = 'contained', ...props },
    ref
  ) => {
    const theme = useTheme();

    return (
      <MuiButton
        ref={ref}
        css={getButtonStyles(theme, active, density, variant)}
        {...props}
      />
    );
  }
);

BaseButton.displayName = 'BaseButton';

export default BaseButton;
