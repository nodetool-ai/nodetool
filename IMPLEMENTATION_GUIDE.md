# Frontend Component Consolidation - Implementation Guide

## Quick Start Implementation Examples

This guide provides concrete implementation examples for the component consolidation plan. Use these as templates for creating the unified component system.

## Base Component Templates

### 1. Unified Button Component

```typescript
// web/src/components/ui/Button/Button.tsx
import React, { forwardRef } from 'react';
import { Button as MuiButton, ButtonProps as MuiButtonProps, Tooltip, CircularProgress } from '@mui/material';
import { css } from '@emotion/react';
import { useTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import { UI_CONSTANTS } from '../../../config/constants';

export interface ButtonProps extends Omit<MuiButtonProps, 'variant' | 'size'> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  tooltip?: string;
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

const buttonStyles = (theme: Theme, variant: string, size: string) => css({
  // Base styles
  fontFamily: theme.fontFamily1,
  textTransform: 'none',
  borderRadius: theme.shape.borderRadius,
  transition: `all ${UI_CONSTANTS.animations.medium} ease`,
  
  // Size variants
  ...(size === 'small' && {
    padding: UI_CONSTANTS.spacing.button.padding.small,
    fontSize: theme.fontSizeSmall,
    minHeight: '32px'
  }),
  ...(size === 'medium' && {
    padding: UI_CONSTANTS.spacing.button.padding.medium,
    fontSize: theme.fontSizeNormal,
    minHeight: '40px'
  }),
  ...(size === 'large' && {
    padding: UI_CONSTANTS.spacing.button.padding.large,
    fontSize: theme.fontSizeBig,
    minHeight: '48px'
  }),
  
  // Variant styles
  ...(variant === 'primary' && {
    backgroundColor: theme.vars.palette.primary.main,
    color: theme.vars.palette.primary.contrastText,
    '&:hover': {
      backgroundColor: theme.vars.palette.primary.dark,
      transform: 'translateY(-1px)',
      boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
    }
  }),
  ...(variant === 'secondary' && {
    backgroundColor: 'transparent',
    color: theme.vars.palette.text.primary,
    border: `1px solid ${theme.vars.palette.grey[400]}`,
    '&:hover': {
      backgroundColor: theme.vars.palette.grey[800],
      borderColor: theme.vars.palette.grey[300]
    }
  }),
  ...(variant === 'danger' && {
    backgroundColor: theme.vars.palette.error.main,
    color: theme.vars.palette.error.contrastText,
    '&:hover': {
      backgroundColor: theme.vars.palette.error.dark,
      transform: 'translateY(-1px)'
    }
  }),
  ...(variant === 'ghost' && {
    backgroundColor: 'transparent',
    color: theme.vars.palette.text.primary,
    '&:hover': {
      backgroundColor: theme.vars.palette.grey[800]
    }
  }),
  ...(variant === 'icon' && {
    minWidth: 'auto',
    padding: '8px',
    borderRadius: '50%',
    '&:hover': {
      backgroundColor: theme.vars.palette.grey[800],
      transform: 'scale(1.1)'
    }
  })
});

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'medium',
  loading = false,
  tooltip,
  tooltipPlacement = 'top',
  icon,
  iconPosition = 'left',
  children,
  disabled,
  ...props
}, ref) => {
  const theme = useTheme();
  
  const buttonContent = (
    <MuiButton
      ref={ref}
      disabled={disabled || loading}
      css={buttonStyles(theme, variant, size)}
      {...props}
    >
      {loading && (
        <CircularProgress 
          size={size === 'small' ? 16 : size === 'large' ? 24 : 20} 
          sx={{ mr: 1 }}
        />
      )}
      {icon && iconPosition === 'left' && (
        <span style={{ marginRight: children ? '8px' : 0 }}>{icon}</span>
      )}
      {children}
      {icon && iconPosition === 'right' && (
        <span style={{ marginLeft: children ? '8px' : 0 }}>{icon}</span>
      )}
    </MuiButton>
  );

  if (tooltip) {
    return (
      <Tooltip 
        title={tooltip} 
        placement={tooltipPlacement}
        enterDelay={UI_CONSTANTS.tooltips.delays.medium}
      >
        <span>{buttonContent}</span>
      </Tooltip>
    );
  }

  return buttonContent;
});

Button.displayName = 'Button';
```

### 2. Unified Dialog Component

```typescript
// web/src/components/ui/Dialog/Dialog.tsx
import React from 'react';
import {
  Dialog as MuiDialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Typography,
  Backdrop
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { css } from '@emotion/react';
import { useTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: 'small' | 'medium' | 'large' | 'fullscreen';
  showCloseButton?: boolean;
  backdrop?: 'blur' | 'dark' | 'transparent';
  children: React.ReactNode;
  actions?: React.ReactNode;
  maxWidth?: false | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const dialogStyles = (theme: Theme, size: string, backdrop: string) => css({
  '& .MuiDialog-paper': {
    borderRadius: theme.shape.borderRadius * 2,
    border: `1px solid ${theme.vars.palette.grey[600]}`,
    ...(size === 'small' && {
      width: '400px',
      maxWidth: '90vw'
    }),
    ...(size === 'medium' && {
      width: '600px',
      maxWidth: '90vw'
    }),
    ...(size === 'large' && {
      width: '800px',
      maxWidth: '95vw',
      height: '80vh'
    }),
    ...(size === 'fullscreen' && {
      width: '100vw',
      height: '100vh',
      maxWidth: 'none',
      maxHeight: 'none',
      margin: 0,
      borderRadius: 0
    })
  }
});

const backdropStyles = (theme: Theme, backdrop: string) => css({
  ...(backdrop === 'blur' && {
    backdropFilter: 'blur(8px)',
    backgroundColor: 'rgba(0, 0, 0, 0.5)'
  }),
  ...(backdrop === 'dark' && {
    backgroundColor: 'rgba(0, 0, 0, 0.8)'
  }),
  ...(backdrop === 'transparent' && {
    backgroundColor: 'transparent'
  })
});

export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  size = 'medium',
  showCloseButton = true,
  backdrop = 'blur',
  children,
  actions,
  maxWidth = false,
  ...props
}) => {
  const theme = useTheme();

  return (
    <MuiDialog
      open={open}
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth={maxWidth !== false}
      css={dialogStyles(theme, size, backdrop)}
      slots={{
        backdrop: (props) => (
          <Backdrop 
            {...props} 
            css={backdropStyles(theme, backdrop)}
          />
        )
      }}
      {...props}
    >
      {title && (
        <DialogTitle sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          pb: 1
        }}>
          <Typography variant="h6" component="h2">
            {title}
          </Typography>
          {showCloseButton && (
            <IconButton
              onClick={onClose}
              size="small"
              sx={{ ml: 2 }}
            >
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>
      )}
      
      <DialogContent sx={{ py: 2 }}>
        {children}
      </DialogContent>
      
      {actions && (
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {actions}
        </DialogActions>
      )}
    </MuiDialog>
  );
};
```

### 3. Unified Tooltip Component

```typescript
// web/src/components/ui/Tooltip/Tooltip.tsx
import React from 'react';
import { Tooltip as MuiTooltip, TooltipProps as MuiTooltipProps } from '@mui/material';
import { css } from '@emotion/react';
import { useTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import { UI_CONSTANTS } from '../../../config/constants';

export interface TooltipProps extends Omit<MuiTooltipProps, 'title'> {
  content: React.ReactNode;
  delay?: 'short' | 'medium' | 'long' | number;
  variant?: 'default' | 'info' | 'warning' | 'error';
  size?: 'small' | 'medium' | 'large';
}

const tooltipStyles = (theme: Theme, variant: string, size: string) => css({
  '& .MuiTooltip-tooltip': {
    borderRadius: theme.shape.borderRadius,
    fontFamily: theme.fontFamily1,
    ...(size === 'small' && {
      fontSize: theme.fontSizeSmaller,
      padding: '4px 8px'
    }),
    ...(size === 'medium' && {
      fontSize: theme.fontSizeSmall,
      padding: '6px 12px'
    }),
    ...(size === 'large' && {
      fontSize: theme.fontSizeNormal,
      padding: '8px 16px'
    }),
    ...(variant === 'default' && {
      backgroundColor: theme.vars.palette.grey[800],
      color: theme.vars.palette.grey[100]
    }),
    ...(variant === 'info' && {
      backgroundColor: theme.vars.palette.info.main,
      color: theme.vars.palette.info.contrastText
    }),
    ...(variant === 'warning' && {
      backgroundColor: theme.vars.palette.warning.main,
      color: theme.vars.palette.warning.contrastText
    }),
    ...(variant === 'error' && {
      backgroundColor: theme.vars.palette.error.main,
      color: theme.vars.palette.error.contrastText
    })
  }
});

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  delay = 'medium',
  variant = 'default',
  size = 'medium',
  children,
  ...props
}) => {
  const theme = useTheme();
  
  const getDelay = () => {
    if (typeof delay === 'number') return delay;
    return UI_CONSTANTS.tooltips.delays[delay];
  };

  return (
    <MuiTooltip
      title={content}
      enterDelay={getDelay()}
      css={tooltipStyles(theme, variant, size)}
      {...props}
    >
      {children}
    </MuiTooltip>
  );
};
```

## Specialized Component Examples

### 1. Danger Button with Confirmation

```typescript
// web/src/components/ui/Button/variants/DangerButton.tsx
import React, { useState } from 'react';
import { Button, ButtonProps } from '../Button';
import { Dialog } from '../../Dialog/Dialog';
import { Typography } from '@mui/material';

export interface DangerButtonProps extends Omit<ButtonProps, 'variant'> {
  confirmDialog?: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
  };
}

export const DangerButton: React.FC<DangerButtonProps> = ({
  children,
  confirmDialog,
  onClick,
  ...props
}) => {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (confirmDialog) {
      setShowConfirm(true);
    } else {
      onClick?.(e);
    }
  };

  const handleConfirm = () => {
    onClick?.({} as React.MouseEvent<HTMLButtonElement>);
    setShowConfirm(false);
  };

  return (
    <>
      <Button
        variant="danger"
        onClick={handleClick}
        {...props}
      >
        {children}
      </Button>
      
      {confirmDialog && (
        <Dialog
          open={showConfirm}
          onClose={() => setShowConfirm(false)}
          title={confirmDialog.title}
          size="small"
          actions={
            <>
              <Button
                variant="ghost"
                onClick={() => setShowConfirm(false)}
              >
                {confirmDialog.cancelText || 'Cancel'}
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirm}
              >
                {confirmDialog.confirmText || 'Confirm'}
              </Button>
            </>
          }
        >
          <Typography>{confirmDialog.message}</Typography>
        </Dialog>
      )}
    </>
  );
};
```

### 2. Standardized Context Menu

```typescript
// web/src/components/ui/Menu/ContextMenu.tsx
import React, { useState, useRef } from 'react';
import { Menu, MenuItem, Divider, ListItemIcon, ListItemText } from '@mui/material';
import { css } from '@emotion/react';
import { useTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  divider?: boolean;
  danger?: boolean;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  children: React.ReactNode;
}

const contextMenuStyles = (theme: Theme) => css({
  '& .MuiPaper-root': {
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.vars.palette.grey[600]}`,
    backgroundColor: theme.vars.palette.grey[800],
    minWidth: '200px'
  },
  '& .MuiMenuItem-root': {
    fontSize: theme.fontSizeNormal,
    fontFamily: theme.fontFamily1,
    '&:hover': {
      backgroundColor: theme.vars.palette.grey[700]
    },
    '&.danger': {
      color: theme.vars.palette.error.main,
      '&:hover': {
        backgroundColor: `${theme.vars.palette.error.main}20`
      }
    }
  }
});

export const ContextMenu: React.FC<ContextMenuProps> = ({
  items,
  children
}) => {
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const theme = useTheme();

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu(
      contextMenu === null
        ? { mouseX: event.clientX + 2, mouseY: event.clientY - 6 }
        : null
    );
  };

  const handleClose = () => {
    setContextMenu(null);
  };

  const handleItemClick = (item: ContextMenuItem) => {
    item.onClick();
    handleClose();
  };

  return (
    <>
      <div onContextMenu={handleContextMenu} style={{ cursor: 'context-menu' }}>
        {children}
      </div>
      
      <Menu
        open={contextMenu !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        css={contextMenuStyles(theme)}
      >
        {items.map((item, index) => (
          <React.Fragment key={item.id}>
            <MenuItem
              onClick={() => handleItemClick(item)}
              disabled={item.disabled}
              className={item.danger ? 'danger' : ''}
            >
              {item.icon && (
                <ListItemIcon sx={{ minWidth: '36px' }}>
                  {item.icon}
                </ListItemIcon>
              )}
              <ListItemText>{item.label}</ListItemText>
            </MenuItem>
            {item.divider && <Divider />}
          </React.Fragment>
        ))}
      </Menu>
    </>
  );
};
```

## Migration Examples

### 1. Before/After Button Migration

**Before (CloseButton.tsx)**:
```typescript
// OLD: web/src/components/buttons/CloseButton.tsx
const CloseButton = ({ onClick, className = "" }) => {
  const theme = useTheme();
  return (
    <div css={styles(theme)}>
      <Button
        className={`${className} close-button`}
        onClick={(e) => {
          e.stopPropagation();
          onClick(e);
        }}
      >
        <ClearIcon />
      </Button>
    </div>
  );
};
```

**After (using new system)**:
```typescript
// NEW: Using unified Button component
import { Button } from '../ui/Button/Button';
import CloseIcon from '@mui/icons-material/Close';

const CloseButton = ({ onClick, className = "" }) => (
  <Button
    variant="icon"
    size="small"
    icon={<CloseIcon />}
    onClick={(e) => {
      e.stopPropagation();
      onClick(e);
    }}
    className={className}
    tooltip="Close"
  />
);
```

### 2. Before/After Dialog Migration

**Before (ConfirmDialog.tsx)**:
```typescript
// OLD: Complex custom dialog with inline styles
const ConfirmDialog = ({ open, onClose, onConfirm, title, content, ... }) => {
  return (
    <Dialog
      style={{ minWidth: "100%", minHeight: "100%" }}
      css={dialogStyles(theme)}
      className="dialog"
      open={open}
      onClose={onClose}
    >
      <DialogTitle className="dialog-title">
        {title}
      </DialogTitle>
      {content && <DialogContent>{content}</DialogContent>}
      <DialogActions className="dialog-actions">
        <Button className="button-cancel" onClick={onClose}>
          {cancelText}
        </Button>
        <Button className="button-confirm" onClick={handleConfirm}>
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
```

**After (using new system)**:
```typescript
// NEW: Using unified Dialog and Button components
import { Dialog } from '../ui/Dialog/Dialog';
import { Button } from '../ui/Button/Button';

const ConfirmDialog = ({ 
  open, 
  onClose, 
  onConfirm, 
  title, 
  content, 
  confirmText = 'Confirm',
  cancelText = 'Cancel'
}) => (
  <Dialog
    open={open}
    onClose={onClose}
    title={title}
    size="small"
    actions={
      <>
        <Button variant="ghost" onClick={onClose}>
          {cancelText}
        </Button>
        <Button variant="primary" onClick={onConfirm}>
          {confirmText}
        </Button>
      </>
    }
  >
    {content}
  </Dialog>
);
```

## File Structure

```
web/src/components/ui/
├── Button/
│   ├── Button.tsx                 # Base button component
│   ├── Button.stories.tsx         # Storybook stories
│   ├── Button.test.tsx           # Unit tests
│   ├── index.ts                  # Exports
│   └── variants/
│       ├── DangerButton.tsx
│       ├── IconButton.tsx
│       ├── LoadingButton.tsx
│       └── index.ts
├── Dialog/
│   ├── Dialog.tsx                # Base dialog component
│   ├── Dialog.stories.tsx
│   ├── Dialog.test.tsx
│   ├── index.ts
│   └── variants/
│       ├── ConfirmDialog.tsx
│       ├── FormDialog.tsx
│       └── index.ts
├── Menu/
│   ├── Menu.tsx                  # Base menu component
│   ├── ContextMenu.tsx
│   ├── DropdownMenu.tsx
│   └── index.ts
├── Tooltip/
│   ├── Tooltip.tsx
│   ├── index.ts
│   └── Tooltip.test.tsx
└── index.ts                      # Main exports
```

## Usage Examples

### 1. Basic Usage

```typescript
import { Button, Dialog, Tooltip } from '../components/ui';

// Simple button
<Button variant="primary" onClick={handleClick}>
  Save Changes
</Button>

// Button with tooltip
<Button 
  variant="secondary" 
  tooltip="This will reset all settings"
  onClick={handleReset}
>
  Reset
</Button>

// Dialog with actions
<Dialog
  open={isOpen}
  onClose={handleClose}
  title="Confirm Action"
  actions={
    <>
      <Button variant="ghost" onClick={handleClose}>Cancel</Button>
      <Button variant="primary" onClick={handleConfirm}>Confirm</Button>
    </>
  }
>
  Are you sure you want to proceed?
</Dialog>
```

### 2. Advanced Usage

```typescript
import { DangerButton, ContextMenu } from '../components/ui';

// Danger button with confirmation
<DangerButton
  confirmDialog={{
    title: 'Delete Item',
    message: 'This action cannot be undone.',
    confirmText: 'Delete',
    cancelText: 'Cancel'
  }}
  onClick={handleDelete}
>
  Delete Item
</DangerButton>

// Context menu
<ContextMenu
  items={[
    { id: 'edit', label: 'Edit', icon: <EditIcon />, onClick: handleEdit },
    { id: 'delete', label: 'Delete', icon: <DeleteIcon />, onClick: handleDelete, danger: true }
  ]}
>
  <div>Right-click me</div>
</ContextMenu>
```

## Testing Strategy

### 1. Component Tests

```typescript
// web/src/components/ui/Button/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders with correct variant styles', () => {
    render(<Button variant="primary">Test</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('MuiButton-root');
  });

  it('shows loading state', () => {
    render(<Button loading>Test</Button>);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows tooltip when provided', async () => {
    render(<Button tooltip="Test tooltip">Test</Button>);
    fireEvent.mouseOver(screen.getByRole('button'));
    expect(await screen.findByText('Test tooltip')).toBeInTheDocument();
  });
});
```

### 2. Integration Tests

```typescript
// web/src/components/ui/Dialog/Dialog.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Dialog } from './Dialog';
import { Button } from '../Button/Button';

describe('Dialog', () => {
  it('renders with actions', () => {
    render(
      <Dialog
        open={true}
        onClose={jest.fn()}
        title="Test Dialog"
        actions={
          <Button variant="primary">Action</Button>
        }
      >
        Content
      </Dialog>
    );
    
    expect(screen.getByText('Test Dialog')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
  });
});
```

This implementation guide provides concrete examples and templates that can be used to start the component consolidation process. Each component is designed to be flexible, consistent, and maintainable while providing a unified API across the application.