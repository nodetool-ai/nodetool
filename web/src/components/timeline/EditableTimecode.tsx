/**
 * EditableTimecode — the playhead timecode, and Premiere's way to move it:
 * click the readout, type a timecode or a "+"/"-" offset, press Enter.
 *
 * At rest the text follows the playhead through the playback store's
 * transient channel, written straight into the DOM, so playback does not
 * re-render it. See `parseTimecodeEntry` for what a typed value means.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import type { SxProps, Theme } from "@mui/material/styles";

import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStoreApi } from "../../stores/timeline/TimelinePlaybackStore";
import { Caption, InlineEditableText } from "../ui_primitives";
import { formatTimecode } from "./Inspector/InspectorPrimitives.helpers";
import { parseTimecodeEntry } from "./timecodeEntry";

interface EditableTimecodeProps {
  /** Applied to the resting text and to the input. */
  sx?: SxProps<Theme>;
  className?: string;
  ariaLabel?: string;
  /** The frame rate to count in. Defaults to the sequence's. */
  fps?: number;
}

const restingSx: SxProps<Theme> = {
  cursor: "text",
  fontVariantNumeric: "tabular-nums"
};

export const EditableTimecode: React.FC<EditableTimecodeProps> = memo(
  ({ sx, className, ariaLabel = "Current time", fps: fpsProp }) => {
    const sequenceFps = useTimelineStore((s) => s.fps);
    const fps = fpsProp ?? sequenceFps;
    const playbackApi = useTimelinePlaybackStoreApi();
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(() =>
      formatTimecode(playbackApi.getState().getTimeMs(), fps)
    );
    const textRef = useRef<HTMLElement>(null);

    useEffect(() => {
      const write = (ms: number) => {
        const node = textRef.current;
        if (node) node.textContent = formatTimecode(ms, fps);
      };
      write(playbackApi.getState().getTimeMs());
      return playbackApi.getState().subscribeTime(write);
    }, [playbackApi, fps, editing]);

    const startEditing = useCallback(() => {
      setValue(formatTimecode(playbackApi.getState().getTimeMs(), fps));
      setEditing(true);
    }, [playbackApi, fps]);

    const commit = useCallback(
      (next: string) => {
        const playback = playbackApi.getState();
        const ms = parseTimecodeEntry(next, fps, playback.getTimeMs());
        if (ms !== null) playback.seek(ms);
      },
      [playbackApi, fps]
    );

    return (
      <InlineEditableText
        value={value}
        editing={editing}
        onEditingChange={setEditing}
        onCommit={commit}
        ariaLabel={ariaLabel}
        sx={[restingSx, ...(Array.isArray(sx) ? sx : [sx])]}
        className={className}
      >
        <Caption
          component="span"
          ref={textRef}
          role="button"
          tabIndex={0}
          aria-label={`${ariaLabel}. Click to type a time or an offset`}
          title="Click to type a timecode, or +/- frames to move"
          onClick={startEditing}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
              e.preventDefault();
              startEditing();
            }
          }}
          sx={[restingSx, ...(Array.isArray(sx) ? sx : [sx])]}
          className={className}
        >
          {value}
        </Caption>
      </InlineEditableText>
    );
  }
);

EditableTimecode.displayName = "EditableTimecode";
