import React, { createContext, useContext } from "react";

/**
 * EditorUiScope defines the context in which editor UI components are rendered.
 * - "node": Rendered within the node editor canvas (smaller, more compact)
 * - "inspector": Rendered in the inspector panel (slightly larger controls)
 */
export type EditorUiScope = "node" | "inspector";

const EditorUiContext = createContext<EditorUiScope>("node");

export interface EditorUiProviderProps {
  scope?: EditorUiScope;
  children: React.ReactNode;
}

/**
 * Provider component that sets the editor UI scope context.
 * Wrap NodeEditor with scope="node" and Inspector with scope="inspector".
 */
export const EditorUiProvider: React.FC<EditorUiProviderProps> = ({
  scope = "node",
  children
}) => (
  <EditorUiContext.Provider value={scope}>{children}</EditorUiContext.Provider>
);

/**
 * Hook to access the current editor UI scope.
 * Returns "node" or "inspector" based on the context.
 */
export const useEditorScope = (): EditorUiScope => useContext(EditorUiContext);
