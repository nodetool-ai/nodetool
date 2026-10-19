/** @jsxImportSource @emotion/react */
/**
 * Plays a storyboard an operation produced as one cut: clips in shot order,
 * held stills where a shot has no clip yet. The cards view is
 * {@link StoryboardWidget}.
 *
 * The bound value is the storyboard id, or a `{ type: "storyboard", id }` ref.
 */
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
        {t(
          "i18n-next109.appbuilder.puck.storyboardPreview.designModeDescription"
        )}
      </Caption>
    );
  }
  if (!boardId) {
    return (
      <Caption color="secondary">
        {props.placeholder ??
          t("i18n-next109.appbuilder.puck.storyboardPreview.noStoryboard")}
      </Caption>
    );
  }
  return (
    <ReadOnlyBoardLoader boardId={boardId}>
      <React.Suspense
        fallback={
          <LoadingSpinner
            size="small"
            text={t(
              "i18n-next109.appbuilder.puck.storyboardPreview.loadingPreview"
            )}
          />
        }
      >
        <LazyStoryboardPreview boardId={boardId} height={props.height} />
      </React.Suspense>
    </ReadOnlyBoardLoader>
  );
};
