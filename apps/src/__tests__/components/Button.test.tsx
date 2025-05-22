import React from 'react';
import { render, screen } from '@testing-library/react';
import { Button } from '../../components/ui/button';
import { ChakraProvider, createSystem } from '@chakra-ui/react';
import theme from '../../styles/theme/apps_theme';

// Mock next-themes to avoid errors
jest.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: jest.fn() }),
}));

describe('Button Component', () => {
  test('renders button with correct text', () => {
    render(
      <ChakraProvider value={theme}>
        <Button>Test Button</Button>
      </ChakraProvider>
    );
    
    expect(screen.getByText('Test Button')).toBeInTheDocument();
  });

  test('renders button in loading state', () => {
    render(
      <ChakraProvider value={theme}>
        <Button loading>Test Button</Button>
      </ChakraProvider>
    );
    
    // In loading state, the text should be hidden with opacity 0
    const hiddenText = screen.getByText('Test Button');
    expect(hiddenText).toBeInTheDocument();
    expect(hiddenText).toHaveStyle({ opacity: 0 });
    
    // Should have a spinner
    expect(screen.getByText('Test Button').parentElement?.parentElement?.querySelector('.chakra-spinner')).toBeInTheDocument();
  });

  test('renders button with loading text', () => {
    render(
      <ChakraProvider value={theme}>
        <Button loading loadingText="Loading...">Test Button</Button>
      </ChakraProvider>
    );
    
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.getByText('Loading...').parentElement?.querySelector('.chakra-spinner')).toBeInTheDocument();
  });

  test('should be disabled when loading', () => {
    render(
      <ChakraProvider value={theme}>
        <Button loading>Test Button</Button>
      </ChakraProvider>
    );
    
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });
});