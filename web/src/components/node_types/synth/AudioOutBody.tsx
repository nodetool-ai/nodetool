/** @jsxImportSource @emotion/react */
/**
 * AudioOutBody — bespoke body for `nodetool.audio.realtime.AudioOutput`,
 * the modular patch's speaker module. The node passes chunks through
 * verbatim; this body reads the node's live stream buffer (`outputResults`,
 * appended per `output_update` during the run — the same mechanism
 * OutputNode uses) and plays it via the realtime playback hook, with
 * transport buttons and a visualizer on the faceplate.
 */

import React, { memo, useCallback, useMemo, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import HandleColumn from "../../node/HandleColumn";
import { NodeOutputs } from "../../node/NodeOutputs";
import RealtimeAudioOutput from "../../node/output/RealtimeAudioOutput";

import type { Chunk, NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import useResultsStore from "../../../stores/ResultsStore";
import useWorkflowRunsStore from "../../../stores/WorkflowRunsStore";

const styles = (theme: Theme) =>
  css({
    "&.audio-out-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.75),
      padding: theme.spacing(1),
      minHeight: 0,
      borderRadius: "var(--rounded-sm)",
      backgroundColor: theme.vars.palette.grey[900]
    },
    "& > .handle-column": {
      top: theme.spacing(1),
      bottom: theme.spacing(1),
      left: 0
    },
    ".module-label": {
      alignSelf: "center",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeTiny,
      fontWeight: 700,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      lineHeight: 1,
      color: theme.vars.palette.text.secondary,
      padding: `2px ${theme.spacing(1)}`,
      borderRadius: "var(--rounded-sm)",
      border: `1px solid ${theme.vars.palette.grey[800]}`
    },
    ".player": {
      flex: "1 1 auto",
      minHeight: 0,
      padding: `0 ${theme.spacing(0.5)}`
    },
    ".idle-hint": {
      flex: "1 1 auto",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: theme.fontSizeTiny,
      color: theme.vars.palette.text.secondary,
      textAlign: "center"
    },
    ".outputs-row": {
      flex: "0 0 auto"
    },
    ".node-body.collapsed &.audio-out-body": {
      padding: 0,
      gap: 0,
      minHeight: 0,
      height: 0,
      overflow: "visible",
      "& > .module-label, & > .player, & > .idle-hint": {
        display: "none"
      },
      "& > .outputs-row": {
        height: 0,
        minHeight: 0,
        padding: 0
      }
    }
  });

const isAudioChunk = (v: unknown): v is Chunk => {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  if (c.type !== "chunk" || c.content_type !== "audio") return false;
  // Payload is either a native Float32Array (in-process) or a non-empty
  // base64 string (wire form / external sources).
  return (
    (c.content instanceof Float32Array && c.content.length > 0) ||
    (typeof c.content === "string" && c.content !== "")
  );
};

export interface AudioOutBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const AudioOutBodyInner: React.FC<AudioOutBodyProps> = ({
  id,
  nodeMetadata,
  workflowId,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const chunkProperty = useMemo(
    () => (nodeMetadata.properties ?? []).filter((p) => p.name === "chunk"),
    [nodeMetadata.properties]
  );

  const focusedJob = useWorkflowRunsStore((s) => s.focusedJob[workflowId]);
  const streamBuffer = useResultsStore((s) =>
    focusedJob ? s.getOutputResult(workflowId, focusedJob, id) : undefined
  );

  const chunks = useMemo(() => {
    if (Array.isArray(streamBuffer)) {
      return streamBuffer.filter(isAudioChunk);
    }
    return isAudioChunk(streamBuffer) ? [streamBuffer] : [];
  }, [streamBuffer]);

  // Hand the buffer to the player as getter+version, never as a prop: the
  // full rolling window (1024 chunks × sample payloads) as a React prop gets
  // deep-serialized by react-dom's dev performance instrumentation on every
  // commit — the GC storm behind "dropouts after ~30s".
  const chunksRef = useRef(chunks);
  const versionRef = useRef(0);
  if (chunksRef.current !== chunks) {
    chunksRef.current = chunks;
    versionRef.current++;
  }
  const getChunks = useCallback(() => chunksRef.current, []);

  const firstMeta = chunks[0]?.content_metadata;

  return (
    <div css={cssStyles} className="audio-out-body" data-bespoke-body="AudioOut">
      <HandleColumn id={id} properties={chunkProperty} />
      <span className="module-label">Out</span>

      {chunks.length > 0 ? (
        <div className="player nodrag">
          <RealtimeAudioOutput
            getChunks={getChunks}
            chunksVersion={versionRef.current}
            sampleRate={(firstMeta?.sample_rate as number | undefined) ?? 24000}
            channels={(firstMeta?.channels as number | undefined) ?? 1}
            nodeId={id}
            live
          />
        </div>
      ) : (
        <div className="idle-hint">Run the patch to hear it</div>
      )}

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
        </div>
      )}
    </div>
  );
};

export const AUDIO_OUT_NODE_TYPE = "nodetool.audio.realtime.AudioOutput";
export const AudioOutBody = memo(AudioOutBodyInner);
AudioOutBody.displayName = "AudioOutBody";
export default AudioOutBody;
