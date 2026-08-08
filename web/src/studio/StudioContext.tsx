/**
 * Marks the subtree rendered inside the Studio beginner shell. The Studio
 * reuses the workspace editors wholesale, and the one thing it changes about
 * them is model choice: the shared model selects collapse to a plain dropdown
 * over the curated catalog, and the LLM pickers disappear entirely. Reading
 * that from context keeps the change out of every editor's prop chain.
 */

import { createContext, useContext } from "react";

const StudioContext = createContext(false);

export const StudioProvider = ({ children }: { children: React.ReactNode }) => (
  <StudioContext.Provider value={true}>{children}</StudioContext.Provider>
);

/** True inside the Studio shell, false in the workspace editors. */
export const useInStudio = (): boolean => useContext(StudioContext);

export default StudioProvider;
