/**
 * Tests for unsaved-changes (isDirty) tracking in GraphEditorStore.
 * The two network methods are stubbed on the real `apiService` singleton so
 * nothing reaches the tRPC/auth stack.
 */

import { useGraphEditorStore } from './GraphEditorStore';
import { apiService } from '../services/api';

const mockSaveWorkflow = jest.spyOn(apiService, 'saveWorkflow');

/**
 * A full saved-workflow row, as `workflows.update` returns it. The store hands
 * this to the real `normalizeWorkflow`, so it has to carry the whole shape.
 */
const savedWorkflow: Awaited<ReturnType<typeof apiService.saveWorkflow>> = {
  id: 'wf1',
  name: 'Test',
  access: 'private',
  tool_name: null,
  thumbnail: null,
  thumbnail_url: null,
  package_name: null,
  path: null,
  run_mode: null,
  workspace_id: null,
  html_app: null,
  etag: null,
  description: '',
  graph: { nodes: [], edges: [] },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};
const mockCreateWorkflow = jest.spyOn(apiService, 'createWorkflow');

afterAll(() => {
  mockSaveWorkflow.mockRestore();
  mockCreateWorkflow.mockRestore();
});

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
    mockSaveWorkflow.mockResolvedValue(savedWorkflow);
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
