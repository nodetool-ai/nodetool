/**
 * Capture widgets: the microphone and the camera as app inputs.
 *
 * They write the same `{type, uri, asset_id}` ref an upload writes
 * (`mediaRefFromAsset`), so a workflow input reads one value whether the user
 * dropped a file or recorded one.
 *
 * In design mode the recorder is not mounted at all: both `useWaveRecorder`
 * and `useVideoRecorder` call `getUserMedia` on mount, and the builder canvas
 * must never raise a permission prompt while an author is laying widgets out.
 */
import React, { useCallback, useMemo } from "react";

import { Asset } from "../../../stores/ApiTypes";
import WaveRecorder from "../../audio/WaveRecorder";
import VideoRecorder from "../../video/VideoRecorder";
import {
  AudioPlayback,
  Box,
  Caption,
  FlexColumn,
  Label,
  VideoPlayer,
  BORDER_RADIUS,
  SPACING
} from "../../ui_primitives";
import { mediaRefFromAsset } from "../../../utils/mediaRef";
import { isRecord, isString } from "../../../utils/typePredicates";
import { AppEvent } from "../types";
import { useAppRuntimeContext, useBindingRef } from "../runtime/AppRuntimeContext";
import { useWidgetRuntime } from "./useWidgetRuntime";

export interface RecorderWidgetProps {
  id: string;
  binding?: string;
  /** App wording for the control; the widget has no graph name to fall back on. */
  label?: string;
  events?: AppEvent[];
}

/** Height of the design-mode stand-in, so placing one does not shift the page. */
const PLACEHOLDER_HEIGHT = 72;

const DesignPlaceholder: React.FC<{ text: string }> = ({ text }) => (
  <FlexColumn
    align="center"
    justify="center"
    fullWidth
    sx={{
      height: PLACEHOLDER_HEIGHT,
      border: "1px dashed",
      borderColor: "divider",
      borderRadius: BORDER_RADIUS.md
    }}
  >
    <Caption color="secondary">{text}</Caption>
  </FlexColumn>
);

/** The locator of the ref this widget wrote, once something has been captured. */
const capturedLocator = (value: unknown): string | undefined => {
  if (isString(value)) return value || undefined;
  if (!isRecord(value)) return undefined;
  const uri = value.uri;
  return isString(uri) && uri.length > 0 ? uri : undefined;
};

/**
 * The half both widgets share: the bound slot, the workflow the capture is
 * attributed to, and the writer that turns a finished upload into a ref.
 */
const useRecorderWidget = (
  props: RecorderWidgetProps,
  type: "audio" | "video"
) => {
  const { operation, operations } = useAppRuntimeContext();
  const ref = useBindingRef(props.binding, "write");
  const { value, setValue, emit, designMode } = useWidgetRuntime({
    id: props.id,
    bindingMode: "write",
    binding: props.binding,
    events: props.events
  });

  // The asset belongs to the workflow the bound input lives in — the app's
  // default operation when the binding names none. A script operation carries
  // no workflow, so its empty id becomes "unattributed".
  const workflowId = useMemo(() => {
    const owner =
      ref?.kind === "input"
        ? operations.find((candidate) => candidate.id === ref.operationId)
        : undefined;
    return (owner ?? operation).workflowId || undefined;
  }, [operation, operations, ref]);

  const onChange = useCallback(
    (asset: Asset) => {
      setValue(mediaRefFromAsset(asset, type));
      emit("change");
    },
    [emit, setValue, type]
  );

  return {
    designMode,
    workflowId,
    onChange,
    locator: capturedLocator(value)
  };
};

export const AudioRecorderWidget: React.FC<RecorderWidgetProps> = (props) => {
  const { designMode, workflowId, onChange, locator } = useRecorderWidget(
    props,
    "audio"
  );

  return (
    <FlexColumn gap={SPACING.micro} fullWidth>
      <Label>{props.label || "Record audio"}</Label>
      {designMode ? (
        <DesignPlaceholder text="Microphone capture — records when the app runs" />
      ) : (
        <WaveRecorder onChange={onChange} workflowId={workflowId} />
      )}
      {locator && !designMode ? (
        <AudioPlayback locator={locator} label="Recorded audio" />
      ) : null}
    </FlexColumn>
  );
};

/** Height of the playback surface; `VideoPlayer` fills its container. */
const PLAYBACK_HEIGHT = 200;

export const CameraCaptureWidget: React.FC<RecorderWidgetProps> = (props) => {
  const { designMode, workflowId, onChange, locator } = useRecorderWidget(
    props,
    "video"
  );

  return (
    <FlexColumn gap={SPACING.micro} fullWidth>
      <Label>{props.label || "Record video"}</Label>
      {designMode ? (
        <DesignPlaceholder text="Camera capture — records when the app runs" />
      ) : (
        <VideoRecorder onChange={onChange} workflowId={workflowId} />
      )}
      {locator && !designMode ? (
        <Box
          sx={{
            width: "100%",
            height: PLAYBACK_HEIGHT,
            borderRadius: BORDER_RADIUS.md,
            overflow: "hidden"
          }}
        >
          <VideoPlayer locator={locator} label="Recorded video" />
        </Box>
      ) : null}
    </FlexColumn>
  );
};
