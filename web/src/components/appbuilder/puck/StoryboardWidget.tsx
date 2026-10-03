/** @jsxImportSource @emotion/react */
/**
 * Shows a storyboard an operation produced: the board's scenes and shots, read
 * only, with a link to the full editor.
 *
 * The bound value is the storyboard id, or a `{ type: "storyboard", id }` ref.
 * Without this widget the id lands in an app as an opaque JSON value.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import DocumentLoadStatus from "../../workspace/DocumentLoadStatus";
import {
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  LoadingSpinner,
  BORDER_RADIUS,
  SPACING
} from "../../ui_primitives";
import { useStoryboardServerSync } from "../../../hooks/storyboard/useStoryboardServerSync";
import { isString } from "../../../utils/typePredicates";
import { AppEvent } from "../types";
import { useWidgetRuntime } from "./useWidgetRuntime";

const LazyStoryboardBoard = React.lazy(
  () => import("../../storyboard/StoryboardBoard")
);

interface StoryboardWidgetProps {
  id: string;
  binding?: string;
  events?: AppEvent[];
  disabled?: boolean;
  height?: number;
  placeholder?: string;
}

/** The storyboard id in a bound value: a plain id or a storyboard ref. */
export const getStoryboardId = (value: unknown): string | null => {
  const bound = Array.isArray(value) ? value[value.length - 1] : value;
  if (isString(bound)) {
    return bound.trim() || null;
  }
  if (typeof bound === "object" && bound !== null) {
    const { type, id } = bound as { type?: unknown; id?: unknown };
    if (type === "storyboard" && isString(id) && id) {
      return id;
    }
  }
  return null;
};

const BoardView: React.FC<{ boardId: string; height: number }> = ({
  boardId,
  height
}) => {
  const ensureBoard = useStoryboardStore((state) => state.ensureBoard);
  useEffect(() => {
    ensureBoard(boardId);
  }, [ensureBoard, boardId]);
  const [retryToken, setRetryToken] = useState(0);
  const loadState = useStoryboardServerSync(boardId, retryToken);

  if (loadState !== "ready") {
    return (
      <DocumentLoadStatus
        state={loadState}
        label="storyboard"
        onRetry={() => setRetryToken((value) => value + 1)}
      />
    );
  }
  return (
    <Box
      sx={{
        height,
        overflow: "auto",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: BORDER_RADIUS.md
      }}
    >
      <React.Suspense
        fallback={<LoadingSpinner size="small" text="Loading storyboard" />}
      >
        <LazyStoryboardBoard boardId={boardId} readOnly />
      </React.Suspense>
    </Box>
  );
};

export const StoryboardWidget: React.FC<StoryboardWidgetProps> = (props) => {
  const navigate = useNavigate();
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
        Bind this to a storyboard output to show the board.
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
  const href = `/studio/storyboard/${encodeURIComponent(boardId)}`;
  return (
    <FlexColumn gap={SPACING.sm}>
      <BoardView boardId={boardId} height={props.height ?? 640} />
      <EditorButton
        href={href}
        onClick={(event) => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
            return;
          }
          event.preventDefault();
          navigate(href);
        }}
      >
        Open storyboard
      </EditorButton>
    </FlexColumn>
  );
};
