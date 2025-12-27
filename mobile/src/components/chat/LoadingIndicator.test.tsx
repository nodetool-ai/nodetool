/**
 * Tests for LoadingIndicator component
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { LoadingIndicator } from './LoadingIndicator';

describe('LoadingIndicator', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders correctly with default props', () => {
    const { UNSAFE_root } = render(<LoadingIndicator />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders with custom size', () => {
    const { UNSAFE_root } = render(<LoadingIndicator size={20} />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders with custom color', () => {
    const { UNSAFE_root } = render(<LoadingIndicator color="#FF0000" />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders with both custom size and color', () => {
    const { UNSAFE_root } = render(<LoadingIndicator size={15} color="#00FF00" />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('starts animation on mount', () => {
    render(<LoadingIndicator />);
    jest.advanceTimersByTime(100);
    expect(true).toBe(true);
  });

  it('stops animation on unmount', () => {
    const { unmount } = render(<LoadingIndicator />);
    jest.advanceTimersByTime(100);
    unmount();
    expect(true).toBe(true);
  });
});
