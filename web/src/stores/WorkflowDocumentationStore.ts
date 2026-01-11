import { create } from "zustand";
import { EditorState } from "lexical";
import { persist, subscribeWithSelector } from "zustand/middleware";

interface WorkflowDocumentation {
  description: EditorState | null;
  inputs: EditorState | null;
  outputs: EditorState | null;
  notes: EditorState | null;
}

interface WorkflowDocumentationState {
  documentation: WorkflowDocumentation;
  isDirty: boolean;
  setDescription: (description: EditorState | null) => void;
  setInputs: (inputs: EditorState | null) => void;
  setOutputs: (outputs: EditorState | null) => void;
  setNotes: (notes: EditorState | null) => void;
  setDocumentation: (documentation: WorkflowDocumentation) => void;
  resetDocumentation: () => void;
  markClean: () => void;
}

const initialDocumentation: WorkflowDocumentation = {
  description: null,
  inputs: null,
  outputs: null,
  notes: null
};

const useWorkflowDocumentationStore = create<WorkflowDocumentationState>()(
  persist(
    subscribeWithSelector((set) => ({
      documentation: initialDocumentation,
      isDirty: false,
      setDescription: (description): void => {
        set((state) => ({
          documentation: { ...state.documentation, description },
          isDirty: true
        }));
      },
      setInputs: (inputs): void => {
        set((state) => ({
          documentation: { ...state.documentation, inputs },
          isDirty: true
        }));
      },
      setOutputs: (outputs): void => {
        set((state) => ({
          documentation: { ...state.documentation, outputs },
          isDirty: true
        }));
      },
      setNotes: (notes): void => {
        set((state) => ({
          documentation: { ...state.documentation, notes },
          isDirty: true
        }));
      },
      setDocumentation: (documentation): void => {
        set({ documentation, isDirty: true });
      },
      resetDocumentation: (): void => {
        set({ documentation: initialDocumentation, isDirty: false });
      },
      markClean: (): void => {
        set({ isDirty: false });
      }
    })),
    {
      name: "workflow-documentation-storage"
    }
  )
);

export type { WorkflowDocumentation, WorkflowDocumentationState };
export default useWorkflowDocumentationStore;
