import React from 'react';
import { render, screen } from '@testing-library/react';
import { TestComponent } from '../../components/TestComponent';

describe('TestComponent', () => {
  test('renders with the correct text', () => {
    render(<TestComponent text="Hello World" />);
    const element = screen.getByTestId('test-component');
    expect(element).toBeInTheDocument();
    expect(element.textContent).toBe('Hello World');
  });
});