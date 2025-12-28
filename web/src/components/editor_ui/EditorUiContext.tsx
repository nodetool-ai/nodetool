/** @jsxImportSource @emotion/react */
/**
 * Editor UI Context
 *
 * Provides editor UI scope context so primitives can render differently
 * based on whether they're in a node or inspector context.
 */

import React, { createContext, useContext, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import {
  EditorTokens,
  EditorUiScope,
  getEditorTokens
} from "./editorTokens";

interface EditorUiContextValue {
  scope: EditorUiScope;
  tokens: EditorTokens;
}

const EditorUiContext = createContext<EditorUiContextValue | undefined>(
  undefined
);

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
  const theme = useTheme();
  const tokens = useMemo(
    () => getEditorTokens(theme, { scope }),
    [theme, scope]
  );

  const value = useMemo(() => ({ scope, tokens }), [scope, tokens]);

  return (
    <EditorUiContext.Provider value={value}>
      {children}
    </EditorUiContext.Provider>
  );
};

/**
 * Hook to access editor UI tokens.
 * Falls back to "node" scope tokens if used outside a provider.
 *
 * @returns Editor tokens for the current scope
 */
export const useEditorTokens = (): EditorTokens => {
  const context = useContext(EditorUiContext);
  const theme = useTheme();

  // Fall back to node scope if no provider
  if (!context) {
    return getEditorTokens(theme, { scope: "node" });
  }

  return context.tokens;
};

/**
 * Hook to access the current editor UI scope.
 *
 * @returns Current scope or "node" if outside provider
 */
export const useEditorScope = (): EditorUiScope => {
  const context = useContext(EditorUiContext);
  return context?.scope ?? "node";
};
