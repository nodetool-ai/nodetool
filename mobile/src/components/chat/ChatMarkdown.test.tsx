/**
 * Tests for ChatMarkdown component
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { ChatMarkdown } from './ChatMarkdown';

// Mock useTheme hook
jest.mock('../../hooks/useTheme', () => ({
  useTheme: jest.fn(() => ({
    colors: {
      text: '#FFFFFF',
      textSecondary: '#AAAAAA',
      background: '#000000',
      primary: '#007AFF',
      border: '#444444',
      inputBg: '#1E1E1E',
    },
    mode: 'dark',
  })),
}));

describe('ChatMarkdown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders null when content is empty', () => {
    const { toJSON } = render(<ChatMarkdown content="" />);
    expect(toJSON()).toBeNull();
  });

  it('renders null when content is null', () => {
    const { toJSON } = render(<ChatMarkdown content={null as any} />);
    expect(toJSON()).toBeNull();
  });

  it('renders null when content is undefined', () => {
    const { toJSON } = render(<ChatMarkdown content={undefined as any} />);
    expect(toJSON()).toBeNull();
  });
});
