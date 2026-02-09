import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import '@testing-library/jest-dom';
import { WorkflowDocumentationPanel } from '../WorkflowDocumentationPanel';
import { useWorkflowDocumentationStore } from '../../../stores/WorkflowDocumentationStore';

// Mock the theme
jest.mock('@mui/material/styles', () => ({
  ...jest.requireActual('@mui/material/styles'),
  useTheme: () => ({
    vars: {
      palette: {
        divider: 'rgba(255, 255, 255, 0.12)',
        text: {
          secondary: 'rgba(255, 255, 255, 0.7)'
        },
        primary: {
          main: '#7c4dff'
        },
        grey: {
          800: '#424242',
          900: '#212121'
        }
      }
    },
    spacing: (n: number) => `${n * 8}px`,
    fontFamily1: 'Inter, sans-serif',
    fontSize: '14px'
  })
}));

// Mock PanelHeadline
jest.mock('../../ui/PanelHeadline', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div data-testid="panel-headline">{title}</div>
}));

// Mock ChatMarkdown
jest.mock('../../chat/message/ChatMarkdown', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="chat-markdown">{content}</div>
}));

describe('WorkflowDocumentationPanel', () => {
  const mockWorkflowId = 'test-workflow-id';

  beforeEach(() => {
    // Clear store before each test
    const store = useWorkflowDocumentationStore.getState();
    store.clearAll();
  });

  afterEach(() => {
    // Clean up after each test
    const store = useWorkflowDocumentationStore.getState();
    store.clearAll();
  });

  it('should render panel header with title', () => {
    render(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);
    expect(screen.getByText('Workflow Documentation')).toBeInTheDocument();
  });

  it('should render empty state when no workflow selected', () => {
    render(<WorkflowDocumentationPanel workflowId="" />);
    expect(screen.getByText('No workflow selected')).toBeInTheDocument();
  });

  it('should render editor with empty notes initially', () => {
    render(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);
    expect(screen.getByPlaceholderText(/Add workflow documentation here/i)).toBeInTheDocument();
  });

  it('should save notes when user types', async () => {
    const user = userEvent.setup();
    render(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

    const textarea = screen.getByPlaceholderText(/Add workflow documentation here/i);
    await user.type(textarea, 'Test documentation');

    await waitFor(() => {
      const store = useWorkflowDocumentationStore.getState();
      const doc = store.getDocumentation(mockWorkflowId);
      expect(doc?.notes).toContain('Test documentation');
    });
  });

  it('should display tabs for Edit, Preview, and Help', () => {
    render(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

    expect(screen.getByRole('tab', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /preview/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /help/i })).toBeInTheDocument();
  });

  it('should switch to preview tab when clicked', async () => {
    const user = userEvent.setup();
    render(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

    const previewTab = screen.getByRole('tab', { name: /preview/i });
    await user.click(previewTab);

    expect(screen.getByText(/Preview will appear here/i)).toBeInTheDocument();
  });

  it('should show word and character counts', () => {
    render(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

    // Check that the stats are displayed
    expect(screen.getByText(/chars/i)).toBeInTheDocument();
    expect(screen.getByText(/words/i)).toBeInTheDocument();
  });

  it('should display existing notes from store', () => {
    const store = useWorkflowDocumentationStore.getState();
    store.setDocumentation(mockWorkflowId, 'Existing documentation');

    render(<WorkflowDocumentationPanel workflowId={mockWorkflowId} />);

    const textarea = screen.getByPlaceholderText(/Add workflow documentation here/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe('Existing documentation');
  });
});
