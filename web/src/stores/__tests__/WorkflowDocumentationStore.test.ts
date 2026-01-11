import { act } from "@testing-library/react";
import useWorkflowDocumentationStore, {
  WorkflowDocumentation
} from "../WorkflowDocumentationStore";

describe("WorkflowDocumentationStore", () => {
  beforeEach(() => {
    act(() => {
      useWorkflowDocumentationStore.getState().resetDocumentation();
    });
  });

  it("should initialize with default values", () => {
    const store = useWorkflowDocumentationStore.getState();
    
    expect(store.documentation).toEqual({
      description: null,
      inputs: null,
      outputs: null,
      notes: null
    });
    expect(store.isDirty).toBe(false);
  });

  it("should set description and mark dirty", () => {
    const mockEditorState = { root: { children: [] } } as any;
    
    act(() => {
      useWorkflowDocumentationStore.getState().setDescription(mockEditorState);
    });
    
    const store = useWorkflowDocumentationStore.getState();
    expect(store.documentation.description).toBe(mockEditorState);
    expect(store.isDirty).toBe(true);
  });

  it("should set inputs and mark dirty", () => {
    const mockEditorState = { root: { children: [] } } as any;
    
    act(() => {
      useWorkflowDocumentationStore.getState().setInputs(mockEditorState);
    });
    
    const store = useWorkflowDocumentationStore.getState();
    expect(store.documentation.inputs).toBe(mockEditorState);
    expect(store.isDirty).toBe(true);
  });

  it("should set outputs and mark dirty", () => {
    const mockEditorState = { root: { children: [] } } as any;
    
    act(() => {
      useWorkflowDocumentationStore.getState().setOutputs(mockEditorState);
    });
    
    const store = useWorkflowDocumentationStore.getState();
    expect(store.documentation.outputs).toBe(mockEditorState);
    expect(store.isDirty).toBe(true);
  });

  it("should set notes and mark dirty", () => {
    const mockEditorState = { root: { children: [] } } as any;
    
    act(() => {
      useWorkflowDocumentationStore.getState().setNotes(mockEditorState);
    });
    
    const store = useWorkflowDocumentationStore.getState();
    expect(store.documentation.notes).toBe(mockEditorState);
    expect(store.isDirty).toBe(true);
  });

  it("should set all documentation at once", () => {
    const newDocumentation: WorkflowDocumentation = {
      description: { root: { children: [] } } as any,
      inputs: { root: { children: [] } } as any,
      outputs: { root: { children: [] } } as any,
      notes: { root: { children: [] } } as any
    };
    
    act(() => {
      useWorkflowDocumentationStore.getState().setDocumentation(newDocumentation);
    });
    
    const store = useWorkflowDocumentationStore.getState();
    expect(store.documentation).toEqual(newDocumentation);
    expect(store.isDirty).toBe(true);
  });

  it("should reset documentation to initial state", () => {
    const mockEditorState = { root: { children: [] } } as any;
    
    act(() => {
      useWorkflowDocumentationStore.getState().setDescription(mockEditorState);
      useWorkflowDocumentationStore.getState().setNotes(mockEditorState);
    });
    
    act(() => {
      useWorkflowDocumentationStore.getState().resetDocumentation();
    });
    
    const store = useWorkflowDocumentationStore.getState();
    expect(store.documentation).toEqual({
      description: null,
      inputs: null,
      outputs: null,
      notes: null
    });
    expect(store.isDirty).toBe(false);
  });

  it("should mark store as clean", () => {
    const mockEditorState = { root: { children: [] } } as any;
    
    act(() => {
      useWorkflowDocumentationStore.getState().setDescription(mockEditorState);
    });
    
    expect(useWorkflowDocumentationStore.getState().isDirty).toBe(true);
    
    act(() => {
      useWorkflowDocumentationStore.getState().markClean();
    });
    
    expect(useWorkflowDocumentationStore.getState().isDirty).toBe(false);
  });

  it("should update different documentation fields independently", () => {
    const descState = { root: { children: [{ type: "paragraph" }] } } as any;
    const inputsState = { root: { children: [{ type: "list" }] } } as any;
    const outputsState = { root: { children: [{ type: "heading" }] } } as any;
    const notesState = { root: { children: [{ type: "quote" }] } } as any;
    
    act(() => {
      useWorkflowDocumentationStore.getState().setDescription(descState);
    });
    
    act(() => {
      useWorkflowDocumentationStore.getState().setInputs(inputsState);
    });
    
    act(() => {
      useWorkflowDocumentationStore.getState().setOutputs(outputsState);
    });
    
    act(() => {
      useWorkflowDocumentationStore.getState().setNotes(notesState);
    });
    
    const store = useWorkflowDocumentationStore.getState();
    expect(store.documentation.description).toBe(descState);
    expect(store.documentation.inputs).toBe(inputsState);
    expect(store.documentation.outputs).toBe(outputsState);
    expect(store.documentation.notes).toBe(notesState);
  });
});
