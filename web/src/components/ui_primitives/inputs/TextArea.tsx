/** @jsxImportSource @emotion/react */
import React from 'react';
import { TextField as MuiTextField, TextFieldProps as MuiTextFieldProps } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { css } from '@emotion/react';
import type { Theme } from '@mui/material/styles';

/**
 * TextArea Props
 * 
 * Semantic props for explicit state communication
 */
export interface TextAreaProps extends Omit<MuiTextFieldProps, 'size' | 'variant' | 'multiline'> {
  /** Whether the value differs from default */
  changed?: boolean;
  /** Whether the input is in an invalid state */
  invalid?: boolean;
  /** Density/size variant */
  density?: 'compact' | 'normal' | 'comfortable';
  /** Number of rows to display */
  rows?: number;
  /** Minimum number of rows */
  minRows?: number;
  /** Maximum number of rows */
  maxRows?: number;
}

/**
 * TextArea Styles
 */
const getTextAreaStyles = (
  theme: Theme,
  changed?: boolean,
  invalid?: boolean,
  density?: 'compact' | 'normal' | 'comfortable'
) => {
  const padding = {
    compact: '4px 8px',
    normal: '8px 12px',
    comfortable: '12px 16px'
  }[density || 'compact'];

  const fontSize = {
    compact: theme.fontSizeSmaller,
    normal: theme.fontSizeSmall,
    comfortable: theme.fontSizeNormal
  }[density || 'compact'];

  return css({
    width: '100%',
    margin: 0,

    '& .MuiInputBase-root': {
      fontSize,
      lineHeight: '1.2em',
      margin: 0,
      padding: 0,
      alignItems: 'flex-start'
    },

    '& .MuiInputBase-inputMultiline': {
      padding,
      fontFamily: theme.fontFamily1,
      fontSize,
      lineHeight: '1.2em',
      color: theme.vars.palette.text.primary,
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${invalid ? theme.vars.palette.error.main : theme.vars.palette.grey[700]}`,
      borderRadius: theme.rounded.buttonSmall,
      resize: 'vertical',
      overflow: 'auto !important',
      transition: theme.transitions.create(['border-color', 'background-color'], {
        duration: theme.transitions.duration.short
      }),

      '&:hover': {
        borderColor: invalid 
          ? theme.vars.palette.error.main 
          : theme.vars.palette.grey[600],
        backgroundColor: theme.vars.palette.grey[800]
      },

      '&:focus': {
        borderColor: invalid 
          ? theme.vars.palette.error.main 
          : theme.vars.palette.grey[500],
        backgroundColor: theme.vars.palette.grey[800],
        outline: 'none'
      },

      // Visual indicator for changed values
      ...(changed && {
        borderRight: `2px solid ${theme.vars.palette.primary.main}`
      }),

      '&::placeholder': {
        color: theme.vars.palette.text.secondary,
        opacity: 0.7
      }
    },

    '& .MuiOutlinedInput-notchedOutline': {
      border: 'none'
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
      }
    }
  });
};

/**
 * TextArea Component
 * 
 * A themeable multi-line text input primitive.
 * 
 * @example
 * ```tsx
 * <TextArea
 *   value={value}
 *   onChange={(e) => setValue(e.target.value)}
 *   changed={value !== defaultValue}
 *   invalid={!isValid}
 *   rows={3}
 *   maxRows={10}
 *   label="Description"
 * />
 * ```
 */
const TextArea = React.forwardRef<HTMLDivElement, TextAreaProps>(
  (
    { 
      changed, 
      invalid, 
      density = 'compact', 
      rows = 2,
      minRows,
      maxRows,
      ...props 
    },
    ref
  ) => {
    const theme = useTheme();

    return (
      <MuiTextField
        ref={ref}
        multiline
        rows={rows}
        minRows={minRows}
        maxRows={maxRows}
        variant="outlined"
        error={invalid || props.error}
        css={getTextAreaStyles(theme, changed, invalid, density)}
        {...props}
      />
    );
  }
);

TextArea.displayName = 'TextArea';

export default TextArea;
