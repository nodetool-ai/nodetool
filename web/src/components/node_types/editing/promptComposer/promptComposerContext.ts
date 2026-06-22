import { createContext, useContext } from "react";

export interface PromptComposerContextValue {
  /** Names of the node's dynamic inputs — variables that resolve at runtime. */
  knownVariables: Set<string>;
  /**
   * Names of variables defined by a Set Variable node anywhere in the
   * workflow. They resolve at runtime from the shared processing context, so a
   * `{{ name }}` referencing one is valid even without a matching dynamic input.
   */
  graphVariables: Set<string>;
}

export const PromptComposerContext = createContext<PromptComposerContextValue>({
  knownVariables: new Set<string>(),
  graphVariables: new Set<string>()
});

export const usePromptComposerContext = (): PromptComposerContextValue =>
  useContext(PromptComposerContext);
