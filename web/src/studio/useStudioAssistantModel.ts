/**
 * Pin the Studio assistants to the curated director model. Every editor's
 * agent panel reads `GlobalChatStore.selectedModel`, so inside the Studio
 * shell that selection is forced to the curated model (the model picker the
 * panels render then shows it, and turns run on it — metered like all
 * `nodetool`-provider calls). The user's own selection is restored when the
 * shell unmounts, so workspace chat is untouched.
 */

import { useEffect } from "react";
import useGlobalChatStore from "../stores/GlobalChatStore";
import { STUDIO_DIRECTOR_MODEL } from "./curatedModels";

export function useStudioAssistantModel(): void {
  useEffect(() => {
    const store = useGlobalChatStore.getState();
    const previous = store.selectedModel;
    if (previous.id !== STUDIO_DIRECTOR_MODEL.id) {
      store.setSelectedModel({ ...STUDIO_DIRECTOR_MODEL });
    }
    return () => {
      // Route swaps unmount the old shell before the next one mounts, so a
      // studio-to-studio navigation restores here and re-pins immediately.
      useGlobalChatStore.getState().setSelectedModel(previous);
    };
  }, []);
}

export default useStudioAssistantModel;
