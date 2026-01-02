/** @jsxImportSource @emotion/react */
import React from 'react';
import { TextField as MuiTextField, TextFieldProps as MuiTextFieldProps } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { css } from '@emotion/react';
import type { Theme } from '@mui/material/styles';

/**
 * TextField Props
 * 
 * Semantic props for explicit state communication
 */
export interface TextFieldProps extends Omit<MuiTextFieldProps, 'size' | 'variant'> {
  /** Whether the value differs from default */
  changed?: boolean;
  /** Whether the input is in an invalid state (in addition to error prop) */
  invalid?: boolean;
  /** Density/size variant */
  density?: 'compact' | 'normal' | 'comfortable';
  /** Visual variant */
  variant?: 'outlined' | 'filled' | 'standard';
}

/**
 * TextField Styles
 * 
 * All styling is self-contained and theme-driven.
 */
const getTextFieldStyles = (
  theme: Theme,
  changed?: boolean,
  invalid?: boolean,
  density?: 'compact' | 'normal' | 'comfortable'
) => {
  const padding = {
    compact: theme.spacing(0.5, 1),
    normal: theme.spacing(1, 1.5),
    comfortable: theme.spacing(1.5, 2)
  }[density || 'compact'];

  const fontSize = {
    compact: theme.fontSizeSmaller,
    normal: theme.fontSizeSmall,
    comfortable: theme.fontSizeNormal
  }[density || 'compact'];

  return css({
    fontFamily: theme.fontFamily1,
    fontSize,
    lineHeight: '1.2em',
    backgroundColor: 'transparent',
    margin: 0,

    '& .MuiInputBase-root': {
      fontSize,
      lineHeight: '1.2em',
      margin: 0,
      padding: 0,
      backgroundColor: theme.vars.palette.grey[900],
      borderRadius: theme.rounded.buttonSmall,
      transition: theme.transitions.create(['background-color', 'border-color'], {
        duration: theme.transitions.duration.short
      }),

      '&:hover': {
        backgroundColor: theme.vars.palette.grey[800]
      },

      '&.Mui-focused': {
        backgroundColor: theme.vars.palette.grey[800]
      },

      '&.Mui-disabled': {
        backgroundColor: theme.vars.palette.grey[900],
        opacity: 0.5
      }
    },

    '& .MuiInputBase-input': {
      padding,
      color: theme.vars.palette.text.primary,
      
      '&::placeholder': {
        color: theme.vars.palette.text.secondary,
        opacity: 0.7
      }
    },

    '& .MuiOutlinedInput-root': {
      '& fieldset': {
        borderColor: invalid 
          ? theme.vars.palette.error.main
          : theme.vars.palette.grey[700],
        borderWidth: 1,
        borderRadius: theme.rounded.buttonSmall
      },

      '&:hover fieldset': {
        borderColor: invalid
          ? theme.vars.palette.error.main
          : theme.vars.palette.grey[600]
      },

      '&.Mui-focused fieldset': {
        borderColor: invalid
          ? theme.vars.palette.error.main
          : theme.vars.palette.grey[500],
        borderWidth: 1
      },

      // Visual indicator for changed values
      ...(changed && {
        borderRight: `2px solid ${theme.vars.palette.primary.main}`,
        
        '& fieldset': {
          borderRightWidth: 0
        }
      })
    },

    '& .MuiInputLabel-root': {
      position: 'relative',
      marginBottom: theme.spacing(0.5),
      letterSpacing: '-0.02em',
      transform: 'none',
      textTransform: 'capitalize',
      fontSize: theme.fontSizeSmall,
      lineHeight: '1em',
      color: theme.vars.palette.grey[300],

      '&.Mui-focused': {
        color: theme.vars.palette.grey[0]
      },

      '&.Mui-error': {
        color: theme.vars.palette.error.main
      }
    },

    '& .MuiFormHelperText-root': {
      fontSize: theme.fontSizeTiny,
      marginTop: theme.spacing(0.5),
      marginLeft: 0,
      marginRight: 0
    }
  });
};

/**
 * TextField Component
 * 
 * A themeable text input primitive that uses semantic props
 * instead of CSS classes for state management.
 * 
 * @example
 * ```tsx
 * <TextField
 *   value={value}
 *   onChange={(e) => setValue(e.target.value)}
 *   changed={value !== defaultValue}
 *   invalid={!isValid}
 *   disabled={isDisabled}
 *   density="compact"
 *   label="Property Name"
 * />
 * ```
 */
const TextField = React.forwardRef<HTMLDivElement, TextFieldProps>(
  (
    { changed, invalid, density = 'compact', variant = 'outlined', ...props },
    ref
  ) => {
    const theme = useTheme();

    return (
      <MuiTextField
        ref={ref}
        variant={variant}
        error={invalid || props.error}
        css={getTextFieldStyles(theme, changed, invalid, density)}
        {...props}
      />
    );
  }
);

TextField.displayName = 'TextField';

export default TextField;
