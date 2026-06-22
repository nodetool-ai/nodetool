import { createContext, useContext } from "react";

export interface PromptComposerContextValue {
  /** Names of the node's dynamic inputs — variables that resolve at runtime. */
  knownVariables: Set<string>;
  /**
   * Names of variables set by a Set Variable node upstream of this node. They
   * resolve at runtime from the shared processing context, so a `{{ name }}`
   * referencing one is valid even without a matching dynamic input.
   */
  upstreamVariables: Set<string>;
}

export const PromptComposerContext = createContext<PromptComposerContextValue>({
  knownVariables: new Set<string>(),
  upstreamVariables: new Set<string>()
});

export const usePromptComposerContext = (): PromptComposerContextValue =>
  useContext(PromptComposerContext);
