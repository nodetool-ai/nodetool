import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { NODE_EDITOR_SHORTCUTS } from '../../../config/shortcuts';

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('PerformanceProfiler', () => {
  const mockWorkflowId = 'test-workflow-1';
  const mockNodes = [
    { id: 'node1', type: 'nodetool.llm.LLM', data: { model: 'gpt-4', max_tokens: 1000 } },
    { id: 'node2', type: 'nodetool.embeddings.Embeddings', data: {} },
    { id: 'node3', type: 'nodetool.io.HTTPRequest', data: {} },
  ];
  const mockEdges = [
    { source: 'node1', target: 'node2' },
    { source: 'node2', target: 'node3' },
  ];

  it('should have performance profiler shortcut defined', () => {
    const perfShortcut = NODE_EDITOR_SHORTCUTS.find(
      (s: { slug: string }) => s.slug === 'performanceProfiler'
    );

    expect(perfShortcut).toBeDefined();
    expect(perfShortcut.keyCombo).toEqual(['Control', 'P']);
  });
});
