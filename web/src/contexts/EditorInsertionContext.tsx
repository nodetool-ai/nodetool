import { createContext, useContext } from "react";

export type InsertIntoEditorFn = (text: string, language?: string) => void;

const EditorInsertionContext = createContext<InsertIntoEditorFn | null>(
  null
);

export const EditorInsertionProvider = EditorInsertionContext.Provider;

export const useEditorInsertion = () => useContext(EditorInsertionContext);

export default EditorInsertionContext;
