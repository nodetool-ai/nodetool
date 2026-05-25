import { createContext, useContext } from "react";

export interface PromptComposerContextValue {
  /** Names of the node's dynamic inputs — variables that resolve at runtime. */
  knownVariables: Set<string>;
}

export const PromptComposerContext = createContext<PromptComposerContextValue>({
  knownVariables: new Set<string>()
});

export const usePromptComposerContext = (): PromptComposerContextValue =>
  useContext(PromptComposerContext);
