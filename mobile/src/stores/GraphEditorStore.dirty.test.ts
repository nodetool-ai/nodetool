/**
 * Tests for unsaved-changes (isDirty) tracking in GraphEditorStore.
 * services/api is mocked to avoid pulling the tRPC/auth stack.
 */

const mockSaveWorkflow = jest.fn();
const mockCreateWorkflow = jest.fn();

jest.mock('../services/api', () => ({
  apiService: {
    getNodeMetadata: jest.fn(),
    saveWorkflow: (...args: unknown[]) => mockSaveWorkflow(...args),
    createWorkflow: (...args: unknown[]) => mockCreateWorkflow(...args),
  },
}));

import { useGraphEditorStore } from './GraphEditorStore';

describe('GraphEditorStore unsaved-changes tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useGraphEditorStore.setState({
      chain: [],
      connections: [],
      workflowId: null,
      workflowName: 'Untitled Workflow',
      isDirty: false,
    });
  });

  it('starts clean', () => {
    expect(useGraphEditorStore.getState().isDirty).toBe(false);
  });

  it('marks dirty when a property is updated', () => {
    useGraphEditorStore.getState().updateProperty('n1', 'prop', 'value');
    expect(useGraphEditorStore.getState().isDirty).toBe(true);
  });

  it('does not mark dirty for a view-only toggle', () => {
    useGraphEditorStore.getState().toggleExpanded('n1');
    expect(useGraphEditorStore.getState().isDirty).toBe(false);
  });

  it('clears dirty when starting a new workflow', () => {
    useGraphEditorStore.setState({ isDirty: true });
    useGraphEditorStore.getState().newWorkflow();
    expect(useGraphEditorStore.getState().isDirty).toBe(false);
  });

  it('clears dirty after a successful save', async () => {
    mockSaveWorkflow.mockResolvedValue({ id: 'wf1' });
    useGraphEditorStore.setState({ isDirty: true, workflowId: 'wf1' });

    await useGraphEditorStore.getState().saveWorkflow();

    expect(mockSaveWorkflow).toHaveBeenCalled();
    expect(useGraphEditorStore.getState().isDirty).toBe(false);
  });

  it('keeps dirty when a save fails', async () => {
    mockSaveWorkflow.mockRejectedValue(new Error('network'));
    useGraphEditorStore.setState({ isDirty: true, workflowId: 'wf1' });

    await useGraphEditorStore.getState().saveWorkflow();

    expect(useGraphEditorStore.getState().isDirty).toBe(true);
  });
});
