/**
 * Tests for ChatMarkdown component
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { ChatMarkdown } from './ChatMarkdown';

describe('ChatMarkdown', () => {
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
