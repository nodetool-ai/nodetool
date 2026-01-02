/** @jsxImportSource @emotion/react */
import React, { useState, useRef, useEffect } from 'react';
import { Box, ClickAwayListener } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { css } from '@emotion/react';
import { KeyboardArrowDown } from '@mui/icons-material';
import type { Theme } from '@mui/material/styles';

/**
 * Select Option
 */
export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

/**
 * Select Props
 */
export interface SelectProps {
  /** Current value */
  value: string | number;
  /** Change handler */
  onChange: (value: string | number) => void;
  /** Available options */
  options: SelectOption[];
  /** Whether the value differs from default */
  changed?: boolean;
  /** Whether the select is in an invalid state */
  invalid?: boolean;
  /** Whether the select is disabled */
  disabled?: boolean;
  /** Density/size variant */
  density?: 'compact' | 'normal' | 'comfortable';
  /** Placeholder text */
  placeholder?: string;
  /** ID for accessibility */
  id?: string;
  /** Allow search/filter */
  searchable?: boolean;
}

/**
 * Select Styles
 */
const getSelectStyles = (
  theme: Theme,
  changed?: boolean,
  invalid?: boolean,
  density?: 'compact' | 'normal' | 'comfortable'
) => {
  const height = {
    compact: 28,
    normal: 36,
    comfortable: 44
  }[density || 'compact'];

  const fontSize = {
    compact: theme.fontSizeSmaller,
    normal: theme.fontSizeSmall,
    comfortable: theme.fontSizeNormal
  }[density || 'compact'];

  const padding = {
    compact: theme.spacing(0, 1),
    normal: theme.spacing(0, 1.5),
    comfortable: theme.spacing(0, 2)
  }[density || 'compact'];

  return css({
    width: '100%',
    position: 'relative',

    '.select-header': {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      height,
      padding,
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${invalid ? theme.vars.palette.error.main : theme.vars.palette.grey[700]}`,
      borderRadius: theme.rounded.buttonSmall,
      cursor: 'pointer',
      fontSize,
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      userSelect: 'none',
      transition: theme.transitions.create(['background-color', 'border-color'], {
        duration: theme.transitions.duration.short
      }),

      // Changed indicator
      ...(changed && {
        borderRight: `2px solid ${theme.vars.palette.primary.main}`
      }),

      '&:hover': {
        backgroundColor: theme.vars.palette.grey[800],
        borderColor: invalid 
          ? theme.vars.palette.error.main 
          : theme.vars.palette.grey[600]
      },

      '&.open': {
        borderColor: invalid 
          ? theme.vars.palette.error.main 
          : theme.vars.palette.grey[500],
        backgroundColor: theme.vars.palette.grey[800]
      },

      '&.disabled': {
        opacity: 0.5,
        cursor: 'not-allowed'
      }
    },

    '.select-header-text': {
      flex: 1,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },

    '.chevron': {
      marginLeft: theme.spacing(1),
      color: theme.vars.palette.grey[400],
      transition: theme.transitions.create('transform', {
        duration: theme.transitions.duration.short
      }),
      flexShrink: 0,

      '&.open': {
        transform: 'rotate(180deg)',
        color: theme.vars.palette.primary.main
      }
    },

    '.options-list': {
      position: 'absolute',
      top: '100%',
      left: 0,
      width: '100%',
      minWidth: 200,
      maxHeight: 300,
      marginTop: theme.spacing(0.5),
      padding: theme.spacing(0.5),
      listStyle: 'none',
      backgroundColor: theme.vars.palette.Paper?.overlay || theme.vars.palette.grey[900],
      backdropFilter: 'blur(10px)',
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: theme.rounded.buttonSmall,
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
      zIndex: theme.zIndex.popover,
      overflowY: 'auto',

      // Custom scrollbar
      '&::-webkit-scrollbar': {
        width: 8
      },
      '&::-webkit-scrollbar-track': {
        backgroundColor: 'transparent'
      },
      '&::-webkit-scrollbar-thumb': {
        backgroundColor: theme.vars.palette.grey[700],
        borderRadius: 4,
        '&:hover': {
          backgroundColor: theme.vars.palette.grey[600]
        }
      }
    },

    '.search-input': {
      width: '100%',
      padding: theme.spacing(1),
      marginBottom: theme.spacing(0.5),
      backgroundColor: theme.vars.palette.grey[800],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      borderRadius: theme.rounded.buttonSmall,
      color: theme.vars.palette.text.primary,
      fontSize,
      outline: 'none',

      '&:focus': {
        borderColor: theme.vars.palette.primary.main
      }
    },

    '.option': {
      padding: theme.spacing(1, 1.5),
      cursor: 'pointer',
      fontSize,
      color: theme.vars.palette.text.primary,
      borderRadius: theme.rounded.buttonSmall,
      transition: theme.transitions.create('background-color', {
        duration: theme.transitions.duration.shortest
      }),
      marginBottom: theme.spacing(0.25),

      '&:hover': {
        backgroundColor: theme.vars.palette.action?.hover || theme.vars.palette.grey[700]
      },

      '&.selected': {
        backgroundColor: theme.vars.palette.action?.selected || theme.vars.palette.grey[800],
        color: theme.vars.palette.primary.main,
        fontWeight: 500
      },

      '&.disabled': {
        opacity: 0.5,
        cursor: 'not-allowed'
      },

      '&:last-child': {
        marginBottom: 0
      }
    }
  });
};

/**
 * Select Component
 * 
 * A themeable dropdown selector primitive.
 * 
 * @example
 * ```tsx
 * <Select
 *   value={value}
 *   onChange={setValue}
 *   options={[
 *     { value: 'option1', label: 'Option 1' },
 *     { value: 'option2', label: 'Option 2' }
 *   ]}
 *   changed={value !== defaultValue}
 *   searchable
 * />
 * ```
 */
const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  changed,
  invalid,
  disabled,
  density = 'compact',
  placeholder = 'Select...',
  id,
  searchable = false
}) => {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find(opt => opt.value === value);
  
  const filteredOptions = searchable && searchQuery
    ? options.filter(opt => 
        opt.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : options;

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
      setSearchQuery('');
    }
  };

  const handleSelect = (optionValue: string | number) => {
    if (disabled) {
      return;
    }
    onChange(optionValue);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClickAway = () => {
    setIsOpen(false);
    setSearchQuery('');
  };

  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  return (
    <ClickAwayListener onClickAway={handleClickAway}>
      <Box css={getSelectStyles(theme, changed, invalid, density)}>
        <Box
          className={`select-header ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
          onClick={handleToggle}
          id={id}
        >
          <span className="select-header-text">
            {selectedOption?.label || placeholder}
          </span>
          <KeyboardArrowDown className={`chevron ${isOpen ? 'open' : ''}`} />
        </Box>

        {isOpen && (
          <Box className="options-list" component="ul">
            {searchable && (
              <input
                ref={searchInputRef}
                type="text"
                className="search-input"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            
            {filteredOptions.map((option) => (
              <Box
                key={option.value}
                component="li"
                className={`option ${option.value === value ? 'selected' : ''} ${option.disabled ? 'disabled' : ''}`}
                onClick={() => !option.disabled && handleSelect(option.value)}
              >
                {option.label}
              </Box>
            ))}

            {filteredOptions.length === 0 && (
              <Box className="option disabled">
                No options found
              </Box>
            )}
          </Box>
        )}
      </Box>
    </ClickAwayListener>
  );
};

export default Select;
