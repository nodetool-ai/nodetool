import { renderHook, act } from '@testing-library/react';
import { useWorkflowDocumentationStore } from '../WorkflowDocumentationStore';

describe('WorkflowDocumentationStore', () => {
  beforeEach(() => {
    // Reset the store before each test
    const { result } = renderHook(() => useWorkflowDocumentationStore());
    act(() => {
      result.current.clearAll();
    });
  });

  it('should create empty documentation for new workflow', () => {
    const { result } = renderHook(() => useWorkflowDocumentationStore());

    act(() => {
      result.current.setDocumentation('workflow-1', 'Initial notes');
    });

    const doc = result.current.getDocumentation('workflow-1');
    expect(doc).toBeDefined();
    expect(doc?.workflowId).toBe('workflow-1');
    expect(doc?.notes).toBe('Initial notes');
  });

  it('should update notes for existing workflow', () => {
    const { result } = renderHook(() => useWorkflowDocumentationStore());

    act(() => {
      result.current.setDocumentation('workflow-1', 'Initial notes');
    });

    act(() => {
      result.current.updateNotes('workflow-1', 'Updated notes');
    });

    const doc = result.current.getDocumentation('workflow-1');
    expect(doc?.notes).toBe('Updated notes');
  });

  it('should not update state if notes are unchanged', () => {
    const { result } = renderHook(() => useWorkflowDocumentationStore());

    act(() => {
      result.current.setDocumentation('workflow-1', 'Initial notes');
    });

    const firstDoc = result.current.getDocumentation('workflow-1');
    const firstModified = firstDoc?.lastModified;

    // Wait a bit to ensure timestamp would be different
    act(() => {
      result.current.updateNotes('workflow-1', 'Initial notes');
    });

    const secondDoc = result.current.getDocumentation('workflow-1');
    expect(secondDoc?.lastModified).toBe(firstModified);
  });

  it('should handle multiple workflows independently', () => {
    const { result } = renderHook(() => useWorkflowDocumentationStore());

    act(() => {
      result.current.setDocumentation('workflow-1', 'Notes for workflow 1');
      result.current.setDocumentation('workflow-2', 'Notes for workflow 2');
    });

    const doc1 = result.current.getDocumentation('workflow-1');
    const doc2 = result.current.getDocumentation('workflow-2');

    expect(doc1?.notes).toBe('Notes for workflow 1');
    expect(doc2?.notes).toBe('Notes for workflow 2');
  });

  it('should delete documentation', () => {
    const { result } = renderHook(() => useWorkflowDocumentationStore());

    act(() => {
      result.current.setDocumentation('workflow-1', 'Notes to delete');
    });

    expect(result.current.getDocumentation('workflow-1')).toBeDefined();

    act(() => {
      result.current.deleteDocumentation('workflow-1');
    });

    expect(result.current.getDocumentation('workflow-1')).toBeUndefined();
  });

  it('should return undefined for non-existent workflow', () => {
    const { result } = renderHook(() => useWorkflowDocumentationStore());

    const doc = result.current.getDocumentation('non-existent');
    expect(doc).toBeUndefined();
  });

  it('should clear all documentations', () => {
    const { result } = renderHook(() => useWorkflowDocumentationStore());

    act(() => {
      result.current.setDocumentation('workflow-1', 'Notes 1');
      result.current.setDocumentation('workflow-2', 'Notes 2');
      result.current.setDocumentation('workflow-3', 'Notes 3');
    });

    expect(result.current.getDocumentation('workflow-1')).toBeDefined();
    expect(result.current.getDocumentation('workflow-2')).toBeDefined();
    expect(result.current.getDocumentation('workflow-3')).toBeDefined();

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.getDocumentation('workflow-1')).toBeUndefined();
    expect(result.current.getDocumentation('workflow-2')).toBeUndefined();
    expect(result.current.getDocumentation('workflow-3')).toBeUndefined();
  });
});
