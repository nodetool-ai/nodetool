/**
 * Tests for ChatMarkdown component
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { ChatMarkdown } from './ChatMarkdown';

// Mock useTheme hook
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
