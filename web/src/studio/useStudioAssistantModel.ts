/**
 * Pin the Studio assistants to the curated director model. Inside the Studio
 * shell every agent panel runs on that model and hides its model chip —
 * picking the brain behind the assistants is not a beginner's decision. Turns
 * run on it, metered like all `nodetool`-provider calls. The force is store
 * state, not a write to the user's selection, so workspace chat and the
 * per-conversation model pins are untouched.
 */

import { useEffect } from "react";
import useGlobalChatStore from "../stores/GlobalChatStore";
import { STUDIO_DIRECTOR_MODEL } from "./curatedModels";

export function useStudioAssistantModel(): void {
  useEffect(() => {
    useGlobalChatStore.getState().setForcedModel({ ...STUDIO_DIRECTOR_MODEL });
    return () => {
      // Route swaps unmount the old shell before the next one mounts, so a
      // studio-to-studio navigation clears here and re-forces immediately.
      useGlobalChatStore.getState().setForcedModel(null);
    };
  }, []);
}

export default useStudioAssistantModel;
