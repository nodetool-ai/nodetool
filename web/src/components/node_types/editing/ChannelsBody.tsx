/** @jsxImportSource @emotion/react */
/**
 * ChannelsBody — bespoke body for `nodetool.image.Channels` (plan §9.E3,
 * PR 13).
 *
 * Top: image preview rendered through the currently selected channel
 * (the server output is already single-channel grayscale; we just show it).
 * Bottom: segmented control to pick R / G / B / A / Luminance.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";
import { shallow } from "zustand/shallow";

import {
  CheckerDropzone,
  FlexColumn,
  FlexRow,
  ToggleGroup,
  ToggleOption
} from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import ImageView from "../../node/ImageView";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import useResultsStore from "../../../stores/ResultsStore";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";

const CHANNELS_NODE_TYPE = "nodetool.image.Channels";

type Channel = "red" | "green" | "blue" | "alpha" | "luminance";

const CHANNELS: ReadonlyArray<{ value: Channel; short: string; label: string }> = [
  { value: "red", short: "R", label: "Red" },
  { value: "green", short: "G", label: "Green" },
  { value: "blue", short: "B", label: "Blue" },
  { value: "alpha", short: "A", label: "Alpha" },
  { value: "luminance", short: "L", label: "Luminance" }
];

const CHANNEL_VALUES = new Set<Channel>(CHANNELS.map((c) => c.value));

const styles = (theme: Theme) =>
  css({
    "&.channels-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.5),
      minHeight: 0
    },
    ".preview-area": {
      position: "relative",
      flex: "1 1 auto",
      minHeight: 160,
      borderRadius: "var(--rounded-sm)",
      overflow: "hidden",
      backgroundColor: theme.vars.palette.grey[900],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "& > .handle-column": {
        top: 0,
        bottom: 0,
        left: `calc(${theme.spacing(-0.5)})`
      },
      "& img": {
        display: "block",
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain"
      }
    },
    ".controls": {
      flex: "0 0 auto",
      paddingTop: theme.spacing(0.25)
    },
    ".channel-toggle": {
      width: "100%"
    },
    ".outputs-row": {
      flex: "0 0 auto"
    }
  });

const ImagePreview: React.FC<{ value: unknown }> = ({ value }) => {
  if (typeof value === "string" && value) {
    return <ImageView source={value} />;
  }
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    const uri = typeof v.uri === "string" ? v.uri : undefined;
    if (uri) {
      return <ImageView source={uri} />;
    }
    const data = v.data;
    if (typeof data === "string" && data) {
      return <ImageView source={data} />;
    }
    if (data instanceof Uint8Array) {
      return <ImageView source={data} />;
    }
    if (Array.isArray(data)) {
      return <ImageView source={new Uint8Array(data as number[])} />;
    }
  }
  return (
    <CheckerDropzone
      message="Connect an image, then run"
      icon={<ImageIcon />}
    />
  );
};

export interface ChannelsBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const ChannelsBodyInner: React.FC<ChannelsBodyProps> = ({
  id,
  nodeType,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const properties = nodeMetadata.properties ?? [];
  const imageProperty = useMemo(
    () => properties.filter((p) => p.name === "image"),
    [properties]
  );

  const props = data.properties ?? {};
  const rawChannel = String(props.channel ?? "luminance");
  const channel: Channel = (CHANNEL_VALUES.has(rawChannel as Channel)
    ? (rawChannel as Channel)
    : "luminance");

  const result = useResultsStore(
    (state) => state.getResult(workflowId, id),
    shallow
  );
  const previewValue = useMemo(() => {
    if (result && typeof result === "object" && !Array.isArray(result)) {
      const r = result as Record<string, unknown>;
      if ("output" in r) {
        return r.output;
      }
    }
    return result;
  }, [result]);

  const { setProperty, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const handleChannelChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, next: string | string[] | null) => {
      const selected = Array.isArray(next) ? next[0] : next;
      if (!selected || !CHANNEL_VALUES.has(selected as Channel)) return;
      setProperty("channel", selected);
      setPropertyComplete();
    },
    [setProperty, setPropertyComplete]
  );

  return (
    <div
      css={cssStyles}
      className="channels-body"
      data-bespoke-body="Channels"
    >
      <div className="preview-area">
        <ImagePreview value={previewValue} />
        <HandleColumn id={id} properties={imageProperty} />
      </div>

      <FlexColumn className="controls" gap={0.5}>
        <FlexRow align="center" gap={0.25}>
          <ToggleGroup
            className="channel-toggle"
            size="small"
            value={channel}
            exclusive
            onChange={handleChannelChange}
            aria-label="Channel"
            fullWidth
            compact
          >
            {CHANNELS.map((c) => (
              <ToggleOption
                key={c.value}
                value={c.value}
                aria-label={c.label}
                title={c.label}
              >
                {c.short}
              </ToggleOption>
            ))}
          </ToggleGroup>
        </FlexRow>
      </FlexColumn>

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs
            id={id}
            outputs={nodeMetadata.outputs}
            isStreamingOutput={nodeMetadata.is_streaming_output}
          />
        </div>
      )}

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const ChannelsBody = memo(ChannelsBodyInner);
ChannelsBody.displayName = "ChannelsBody";

export { CHANNELS_NODE_TYPE };
export default ChannelsBody;
