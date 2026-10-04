/** @jsxImportSource @emotion/react */
/**
 * Plays a storyboard an operation produced as one cut: clips in shot order,
 * held stills where a shot has no clip yet. The cards view is
 * {@link StoryboardWidget}.
 *
 * The bound value is the storyboard id, or a `{ type: "storyboard", id }` ref.
 */
import React, { useMemo } from "react";

import { Caption, LoadingSpinner } from "../../ui_primitives";
import { AppEvent } from "../types";
import { getStoryboardId, ReadOnlyBoardLoader } from "./StoryboardWidget";
import { useWidgetRuntime } from "./useWidgetRuntime";

const LazyStoryboardPreview = React.lazy(
  () => import("../../storyboard/StoryboardPreview")
);

interface StoryboardPreviewWidgetProps {
  id: string;
  binding?: string;
  events?: AppEvent[];
  disabled?: boolean;
  height?: number;
  placeholder?: string;
}

export const StoryboardPreviewWidget: React.FC<StoryboardPreviewWidgetProps> = (
  props
) => {
  const { value, designMode } = useWidgetRuntime({
    id: props.id,
    bindingMode: "read",
    binding: props.binding,
    events: props.events
  });
  const boardId = useMemo(() => getStoryboardId(value), [value]);

  if (designMode) {
    return (
      <Caption color="secondary">
        Bind this to a storyboard output to play the board.
      </Caption>
    );
  }
  if (!boardId) {
    return (
      <Caption color="secondary">
        {props.placeholder ?? "No storyboard yet"}
      </Caption>
    );
  }
  return (
    <ReadOnlyBoardLoader boardId={boardId}>
      <React.Suspense
        fallback={<LoadingSpinner size="small" text="Loading preview" />}
      >
        <LazyStoryboardPreview boardId={boardId} height={props.height} />
      </React.Suspense>
    </ReadOnlyBoardLoader>
  );
};
