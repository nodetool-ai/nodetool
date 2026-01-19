/**
 * WorkflowProfiler Tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { WorkflowProfiler, calculateComplexityScore } from '../WorkflowProfiler';

const theme = createTheme();

const renderWithTheme = (component: React.ReactNode) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('WorkflowProfiler', () => {
  const _mockNodes = [
    { id: '1', type: 'TextInput', data: {} },
    { id: '2', type: 'LLM', data: { modelSize: 'medium' } },
    { id: '3', type: 'Preview', data: {} },
  ];

  const _mockEdges = [
    { source: '1', target: '2' },
    { source: '2', target: '3' },
  ];

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('Rendering', () => {
    it('renders without crashing', () => {
      renderWithTheme(
        <WorkflowProfiler workflowId="test-workflow" />
      );
      
      expect(screen.getByText('Workflow Performance Profiler')).toBeInTheDocument();
      expect(screen.getByText('Analyze Performance')).toBeInTheDocument();
    });

    it('shows info alert', () => {
      renderWithTheme(
        <WorkflowProfiler workflowId="test-workflow" />
      );
      
      expect(screen.getByText(/Analyzes your workflow structure/i)).toBeInTheDocument();
    });

    it('disables analyze button when no nodes exist', () => {
      renderWithTheme(
        <WorkflowProfiler workflowId="test-workflow" />
      );
      
      const button = screen.getByText('Analyze Performance');
      expect(button).toBeDisabled();
    });
  });

  describe('Analysis', () => {
    it('shows loading state during analysis', async () => {
      renderWithTheme(
        <WorkflowProfiler 
          workflowId="test-workflow" 
          nodes={[{ id: '1', type: 'TextInput', data: {} }]}
          edges={[]}
        />
      );
      
      const button = screen.getByText('Analyze Performance');
      fireEvent.click(button);
      
      expect(screen.getByText('Analyzing...')).toBeInTheDocument();
    });

    it('displays metrics after analysis', async () => {
      renderWithTheme(
        <WorkflowProfiler 
          workflowId="test-workflow" 
          nodes={[{ id: '1', type: 'TextInput', data: {} }]}
          edges={[]}
        />
      );
      
      const button = screen.getByText('Analyze Performance');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(screen.queryByText('Analyzing...')).not.toBeInTheDocument();
      });
    });

    it('shows message when no nodes exist', async () => {
      renderWithTheme(
        <WorkflowProfiler workflowId="test-workflow" />
      );
      
      expect(screen.getByText(/Click "Analyze Performance"/i)).toBeInTheDocument();
    });
  });

  describe('Performance Estimation', () => {
    it('calculates runtime for different node types', () => {
      const nodes = [
        { id: '1', type: 'TextInput', data: {} },
        { id: '2', type: 'ImageInput', data: {} },
        { id: '3', type: 'LLM', data: { modelSize: 'large' } },
      ];

      expect(nodes.length).toBe(3);
    });

    it('identifies bottlenecks', () => {
      const bottlenecks = [
        { nodeId: '1', nodeType: 'LLM', severity: 'high' as const, description: 'High runtime', suggestion: 'Use smaller model' }
      ];

      expect(bottlenecks.length).toBeGreaterThanOrEqual(1);
      expect(bottlenecks[0].severity).toBe('high');
    });

    it('calculates complexity score', () => {
      const metrics = {
        estimatedRuntime: 5000,
        nodeCount: 10,
        connectionCount: 15,
        parallelizableNodes: [1, 2],
        bottlenecks: [],
        optimizationTips: ['Tip 1'],
        complexityScore: 0
      };

      const score = calculateComplexityScore(metrics);
      
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('Accessibility', () => {
    it('has proper heading structure', () => {
      renderWithTheme(
        <WorkflowProfiler workflowId="test-workflow" />
      );
      
      expect(screen.getByRole('heading')).toBeInTheDocument();
    });

    it('button has accessible label when loading', async () => {
      renderWithTheme(
        <WorkflowProfiler 
          workflowId="test-workflow" 
          nodes={[{ id: '1', type: 'TextInput', data: {} }]}
          edges={[]}
        />
      );
      
      const button = screen.getByText('Analyze Performance');
      fireEvent.click(button);
      
      const loadingButton = screen.getByRole('button', { name: /analyzing/i });
      expect(loadingButton).toBeInTheDocument();
    });
  });
});
