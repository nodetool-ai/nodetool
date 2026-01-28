/** @jsxImportSource @emotion/react */
/**
 * Editor UI Context
 *
 * Provides editor UI scope context so primitives can render differently
 * based on whether they're in a node or inspector context.
 */

import React, { createContext, useContext, useMemo } from "react";

export type EditorUiScope = "node" | "inspector";

const EditorUiContext = createContext<EditorUiScope | undefined>(undefined);

interface EditorUiProviderProps {
  scope?: EditorUiScope;
  children: React.ReactNode;
}

/**
 * Provider for editor UI context.
 * Wraps editor components to provide scope-aware tokens.
 *
 * @example
 * // In NodeEditor
 * <EditorUiProvider scope="node">
 *   <NodeProperties />
 * </EditorUiProvider>
 *
 * // In Inspector
 * <EditorUiProvider scope="inspector">
 *   <PropertyField />
 * </EditorUiProvider>
 */
export const EditorUiProvider: React.FC<EditorUiProviderProps> = ({
  scope = "node",
  children
}) => {
  const value = useMemo(() => scope, [scope]);

  return (
    <EditorUiContext.Provider value={value}>
      {children}
    </EditorUiContext.Provider>
  );
};

/**
 * Hook to access the current editor UI scope.
 *
 * @returns Current scope or "node" if outside provider
 */
export const useEditorScope = (): EditorUiScope => {
  const context = useContext(EditorUiContext);
  return context ?? "node";
};
