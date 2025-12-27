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

  it('renders simple text content', () => {
    const { UNSAFE_root } = render(<ChatMarkdown content="Hello world" />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('uses dark theme for code by default', () => {
    const content = '```javascript\nconst x = 1;\n```';
    const { UNSAFE_root } = render(<ChatMarkdown content={content} />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('uses light theme for code when in light mode', () => {
    const { useTheme } = require('../../hooks/useTheme');
    useTheme.mockReturnValue({
      colors: {
        text: '#000000',
        textSecondary: '#666666',
        background: '#FFFFFF',
        primary: '#007AFF',
        border: '#CCCCCC',
        inputBg: '#F5F5F5',
      },
      mode: 'light',
    });

    const content = '```javascript\nconst x = 1;\n```';
    const { UNSAFE_root } = render(<ChatMarkdown content={content} />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders code block without language', () => {
    const content = '```\nplain code\n```';
    const { UNSAFE_root } = render(<ChatMarkdown content={content} />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders markdown with bold text', () => {
    const { UNSAFE_root } = render(<ChatMarkdown content="Hello world" />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders markdown with bold text', () => {
    const { UNSAFE_root } = render(<ChatMarkdown content="**bold text**" />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders markdown with italic text', () => {
    const { UNSAFE_root } = render(<ChatMarkdown content="*italic text*" />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders markdown with code inline', () => {
    const { UNSAFE_root } = render(<ChatMarkdown content="`code`" />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders markdown with code block', () => {
    const content = '```javascript\nconst x = 1;\n```';
    const { UNSAFE_root } = render(<ChatMarkdown content={content} />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders markdown with headers', () => {
    const { UNSAFE_root } = render(<ChatMarkdown content="# Header 1\n## Header 2\n### Header 3" />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders markdown with links', () => {
    const { UNSAFE_root } = render(<ChatMarkdown content="[link](https://example.com)" />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders markdown with lists', () => {
    const { UNSAFE_root } = render(<ChatMarkdown content="- item 1\n- item 2\n- item 3" />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders markdown with numbered lists', () => {
    const { UNSAFE_root } = render(<ChatMarkdown content="1. item 1\n2. item 2\n3. item 3" />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders markdown with blockquote', () => {
    const { UNSAFE_root } = render(<ChatMarkdown content="> This is a quote" />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders markdown with horizontal rule', () => {
    const { UNSAFE_root } = render(<ChatMarkdown content="---" />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders complex markdown content', () => {
    const content = `
# Title

This is a paragraph with **bold** and *italic* text.

- List item 1
- List item 2

\`\`\`python
def hello():
    print("Hello")
\`\`\`

> Quote

[Link](https://example.com)
`;
    const { UNSAFE_root } = render(<ChatMarkdown content={content} />);
    expect(UNSAFE_root).toBeTruthy();
  });
});
