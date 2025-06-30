import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CloseButton from '../CloseButton';

// Create a simple theme for testing
const theme = createTheme({
  palette: {
    c_gray5: '#888888',
    grey[0]: '#ffffff',
  } as any,
});

describe('CloseButton', () => {
  it('renders correctly', () => {
    const mockOnClick = jest.fn();
    
    render(
      <ThemeProvider theme={theme}>
        <CloseButton onClick={mockOnClick} />
      </ThemeProvider>
    );
    
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('close-button');
  });

  it('applies custom className when provided', () => {
    const mockOnClick = jest.fn();
    const customClass = 'custom-class';
    
    render(
      <ThemeProvider theme={theme}>
        <CloseButton className={customClass} onClick={mockOnClick} />
      </ThemeProvider>
    );
    
    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
    expect(button).toHaveClass('close-button');
  });

  it('calls onClick when clicked', () => {
    const mockOnClick = jest.fn();
    
    render(
      <ThemeProvider theme={theme}>
        <CloseButton onClick={mockOnClick} />
      </ThemeProvider>
    );
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });
});