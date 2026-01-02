import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import Switch from '../Switch';
import mockTheme from '../../../../__mocks__/themeMock';

// Add rounded property to mock theme for primitives
(mockTheme as any).rounded = {
  dialog: '20px',
  node: '8px',
  buttonSmall: '4px',
  buttonLarge: '6px'
};
(mockTheme as any).vars.rounded = {
  dialog: '20px',
  node: '8px',
  buttonSmall: '4px',
  buttonLarge: '6px'
};

// Add transitions property for MUI Switch
(mockTheme as any).transitions = {
  create: () => 'all 0.2s ease',
  duration: {
    shortest: 150,
    shorter: 200,
    short: 250,
    standard: 300,
    complex: 375,
    enteringScreen: 225,
    leavingScreen: 195
  }
};
(mockTheme as any).vars.transitions = (mockTheme as any).transitions;

describe('Switch Component', () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  it('renders unchecked switch by default', () => {
    renderWithTheme(<Switch />);
    const switchElement = screen.getByRole('checkbox');
    expect(switchElement).not.toBeChecked();
  });

  it('renders checked switch when checked prop is true', () => {
    renderWithTheme(<Switch checked />);
    const switchElement = screen.getByRole('checkbox');
    expect(switchElement).toBeChecked();
  });

  it('calls onChange when clicked', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    renderWithTheme(<Switch onChange={handleChange} />);
    
    const switchElement = screen.getByRole('checkbox');
    await user.click(switchElement);
    
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('does not call onChange when disabled', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    renderWithTheme(<Switch disabled onChange={handleChange} />);
    
    const switchElement = screen.getByRole('checkbox');
    await user.click(switchElement);
    
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('accepts changed prop without error', () => {
    expect(() => {
      renderWithTheme(<Switch changed />);
    }).not.toThrow();
  });

  it('accepts invalid prop without error', () => {
    expect(() => {
      renderWithTheme(<Switch invalid />);
    }).not.toThrow();
  });

  it('accepts density prop without error', () => {
    expect(() => {
      renderWithTheme(<Switch density="compact" />);
      renderWithTheme(<Switch density="normal" />);
      renderWithTheme(<Switch density="comfortable" />);
    }).not.toThrow();
  });

  it('accepts variant prop without error', () => {
    expect(() => {
      renderWithTheme(<Switch variant="default" />);
      renderWithTheme(<Switch variant="emphasized" />);
    }).not.toThrow();
  });
});
