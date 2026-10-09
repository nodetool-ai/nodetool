import { useEffect, useRef } from "react";

/**
 * Finish a guided host whose document was already `done` when it loaded.
 *
 * A flow writes `done` before its last work ends (the build's test run, the
 * clip jobs), and the host's `onFinish` hands the tab to the document. A tab
 * reloaded in between loads a `done` document that no step answers for: the
 * shell renders nothing and nothing calls `onFinish`, so the tab stays blank.
 * This calls it once for that case. A document that reaches `done` while the
 * host is up is left to the step that wrote it.
 */
export const useFinishIfLoadedDone = (
  loaded: boolean,
  stage: string,
  onFinish: () => void
): void => {
  const loadedStageRef = useRef<string | null>(null);
  if (loaded && loadedStageRef.current === null) {
    loadedStageRef.current = stage;
  }
  const loadedDone = loadedStageRef.current === "done";
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  useEffect(() => {
    if (loadedDone) {
      onFinishRef.current();
    }
  }, [loadedDone]);
};
