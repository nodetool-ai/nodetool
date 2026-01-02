/** @jsxImportSource @emotion/react */
import React, { useState, useCallback } from 'react';
import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { css } from '@emotion/react';
import type { Theme } from '@mui/material/styles';

/**
 * NumberField Props
 */
export interface NumberFieldProps {
  /** Current value */
  value: number;
  /** Change handler */
  onChange: (value: number) => void;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step increment */
  step?: number;
  /** Number of decimal places to display */
  precision?: number;
  /** Whether the value differs from default */
  changed?: boolean;
  /** Whether the input is in an invalid state (currently unused but reserved for future) */
  invalid?: boolean;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Density/size variant */
  density?: 'compact' | 'normal' | 'comfortable';
  /** Label text */
  label?: string;
  /** Show slider */
  showSlider?: boolean;
  /** ID for accessibility */
  id?: string;
  /** Tab index */
  tabIndex?: number;
}

/**
 * NumberField Styles
 */
const getNumberFieldStyles = (
  theme: Theme,
  changed?: boolean,
  density?: 'compact' | 'normal' | 'comfortable'
) => {
  const fontSize = {
    compact: theme.fontSizeSmall,
    normal: theme.fontSizeNormal,
    comfortable: theme.fontSizeBig
  }[density || 'compact'];

  return css({
    display: 'block',
    width: '100%',
    marginBottom: theme.spacing(2),
    
    '.slider-value': {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      minHeight: 18,
      marginBottom: theme.spacing(0.5)
    },

    '.property-label': {
      flexGrow: 1,
      width: 'auto',
      margin: 0,
      padding: 0,

      'label': {
        display: 'block',
        fontWeight: 500,
        fontSize: theme.fontSizeSmall,
        color: theme.vars.palette.grey[300],
        textTransform: 'capitalize',
        letterSpacing: '0.01em',
        lineHeight: '1.2em',
        cursor: 'ew-resize'
      }
    },

    '.value-display': {
      position: 'relative',
      color: changed 
        ? theme.vars.palette.primary.main 
        : theme.vars.palette.grey[100],
      fontFamily: theme.fontFamily2,
      fontSize,
      lineHeight: '1.2em',
      textAlign: 'right',
      flexShrink: 0,
      minWidth: 30,
      cursor: 'ew-resize',
      userSelect: 'none'
    },

    '.value-input': {
      position: 'absolute',
      top: 0,
      right: 0,
      outline: 'none',
      color: theme.vars.palette.grey[0],
      backgroundColor: theme.vars.palette.grey[800],
      border: 'none',
      borderRadius: theme.rounded.buttonSmall,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmall,
      lineHeight: '1.5em',
      padding: theme.spacing(0.5, 1),
      textAlign: 'right',
      maxWidth: 100
    },

    '.range-container': {
      backgroundColor: theme.vars.palette.grey[600],
      width: '100%',
      height: 4,
      borderRadius: 2,
      cursor: 'ew-resize',
      transition: theme.transitions.create(['background-color', 'height'], {
        duration: theme.transitions.duration.short
      }),

      '&:hover .range-indicator': {
        backgroundColor: theme.vars.palette.primary.main
      },

      '&.dragging .range-indicator': {
        backgroundColor: theme.vars.palette.primary.main
      }
    },

    '.range-indicator': {
      backgroundColor: changed 
        ? theme.vars.palette.primary.main 
        : theme.vars.palette.grey[500],
      height: '100%',
      borderRadius: 2,
      transition: theme.transitions.create('background-color', {
        duration: theme.transitions.duration.short
      })
    }
  });
};

/**
 * NumberField Component
 * 
 * A themeable numeric input with optional slider.
 * 
 * @example
 * ```tsx
 * <NumberField
 *   value={value}
 *   onChange={setValue}
 *   min={0}
 *   max={100}
 *   step={1}
 *   changed={value !== defaultValue}
 *   showSlider
 *   label="Opacity"
 * />
 * ```
 */
const NumberField: React.FC<NumberFieldProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  precision = 2,
  changed,
  invalid: _invalid, // Prefix with underscore to indicate intentionally unused
  disabled,
  density = 'compact',
  label,
  showSlider = true,
  id,
  tabIndex
}) => {
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());

  const clamp = useCallback((val: number) => Math.max(min, Math.min(max, val)), [min, max]);

  const formatValue = (val: number) => {
    if (precision === 0) {
      return Math.round(val).toString();
    }
    return val.toFixed(precision);
  };

  const handleValueClick = () => {
    setIsEditing(true);
    setEditValue(formatValue(value));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
  };

  const handleInputBlur = () => {
    const newValue = parseFloat(editValue);
    if (!isNaN(newValue)) {
      onChange(clamp(newValue));
    }
    setIsEditing(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInputBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const handleLabelDrag = useCallback((e: React.MouseEvent) => {
    if (disabled) {
      return;
    }
    
    const startX = e.clientX;
    const startValue = value;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const range = max - min;
      const deltaValue = (deltaX / 200) * range * step;
      onChange(clamp(startValue + deltaValue));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [value, min, max, step, disabled, onChange, clamp]);

  const handleSliderDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }
    
    const slider = e.currentTarget;
    const rect = slider.getBoundingClientRect();
    
    const updateValue = (clientX: number) => {
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      const newValue = min + percentage * (max - min);
      onChange(clamp(Math.round(newValue / step) * step));
    };

    setIsDragging(true);
    updateValue(e.clientX);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updateValue(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [min, max, step, disabled, onChange, clamp]);

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <Box
      css={getNumberFieldStyles(theme, changed, density)}
      className="number-input"
    >
      <Box className="slider-value">
        <Box className="property-label">
          {label && (
            <label
              htmlFor={id}
              onMouseDown={handleLabelDrag}
            >
              {label}
            </label>
          )}
        </Box>
        <Box className="value-display" onClick={handleValueClick}>
          {isEditing ? (
            <input
              type="text"
              className="value-input"
              value={editValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              autoFocus
              tabIndex={tabIndex}
            />
          ) : (
            formatValue(value)
          )}
        </Box>
      </Box>

      {showSlider && (
        <Box
          className={`range-container ${isDragging ? 'dragging' : ''}`}
          onMouseDown={handleSliderDrag}
        >
          <Box
            className="range-indicator"
            style={{ width: `${percentage}%` }}
          />
        </Box>
      )}
    </Box>
  );
};

export default NumberField;
