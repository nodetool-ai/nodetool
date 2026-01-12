import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SaveSnippetDialog } from '../SaveSnippetDialog';

jest.mock('../../../stores/NodeMenuStore', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    openSaveSnippetDialog: jest.fn(),
    closeSaveSnippetDialog: jest.fn(),
  })),
}));

jest.mock('../../../stores/MetadataStore', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    metadata: {
      'nodetool.test.TestNode': {
        node_type: 'nodetool.test.TestNode',
        title: 'Test Node',
        description: 'Test description',
        namespace: 'test',
        properties: [
          { name: 'prop1', type: 'string', default: 'default1' },
          { name: 'prop2', type: 'number', default: 42 },
        ],
        outputs: [],
        layout: 'default',
        the_model_info: {},
      },
    },
  })),
}));

const mockOnClose = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SaveSnippetDialog', () => {
  describe('create mode', () => {
    it('should render in create mode', () => {
      render(
        <SaveSnippetDialog
          open={true}
          onClose={mockOnClose}
          mode="create"
          initialData={{
            nodeType: 'nodetool.test.TestNode',
            nodeLabel: 'Test Node',
            properties: { prop1: 'custom_value' },
          }}
        />
      );

      expect(screen.getByText('Save as Snippet')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('should close on cancel', () => {
      render(
        <SaveSnippetDialog
          open={true}
          onClose={mockOnClose}
          mode="create"
          initialData={{
            nodeType: 'nodetool.test.TestNode',
            nodeLabel: 'Test Node',
            properties: {},
          }}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('edit mode', () => {
    it('should render in edit mode with snippet data', () => {
      const mockSnippet = {
        id: 'test-id',
        name: 'Existing Snippet',
        description: 'Test description',
        nodeType: 'nodetool.test.TestNode',
        nodeLabel: 'Test Node',
        properties: { prop1: 'old_value' },
        createdAt: 1000,
        updatedAt: 2000,
        usageCount: 5,
      };

      render(
        <SaveSnippetDialog
          open={true}
          onClose={mockOnClose}
          mode="edit"
          snippet={mockSnippet}
        />
      );

      expect(screen.getByText('Edit Snippet')).toBeInTheDocument();
    });
  });

  describe('keyboard shortcuts', () => {
    it('should close on cancel button click', () => {
      render(
        <SaveSnippetDialog
          open={true}
          onClose={mockOnClose}
          mode="create"
          initialData={{
            nodeType: 'nodetool.test.TestNode',
            nodeLabel: 'Test Node',
            properties: {},
          }}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
