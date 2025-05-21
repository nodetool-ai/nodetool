import React from 'react';
import { render, screen } from '@testing-library/react';
import { Button } from '../../components/ui/button';
import { ChakraProvider } from '@chakra-ui/react';

// Mock next-themes to avoid errors
jest.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: jest.fn() }),
}));

describe('Button Component', () => {
  test('renders button with correct text', () => {
    render(
      <ChakraProvider>
        <Button>Test Button</Button>
      </ChakraProvider>
    );
    
    expect(screen.getByText('Test Button')).toBeInTheDocument();
  });

  test('renders button in loading state', () => {
    render(
      <ChakraProvider>
        <Button loading>Test Button</Button>
      </ChakraProvider>
    );
    
    // In loading state, the text should be hidden with opacity 0
    const hiddenText = screen.getByText('Test Button');
    expect(hiddenText).toBeInTheDocument();
    expect(hiddenText.parentElement).toHaveStyle({ opacity: 0 });
    
    // Should have a spinner
    expect(document.querySelector('div[role="status"]')).toBeInTheDocument();
  });

  test('renders button with loading text', () => {
    render(
      <ChakraProvider>
        <Button loading loadingText="Loading...">Test Button</Button>
      </ChakraProvider>
    );
    
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(document.querySelector('div[role="status"]')).toBeInTheDocument();
  });

  test('should be disabled when loading', () => {
    render(
      <ChakraProvider>
        <Button loading>Test Button</Button>
      </ChakraProvider>
    );
    
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });
});