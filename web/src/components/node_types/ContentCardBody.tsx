/** @jsxImportSource @emotion/react */
/**
 * ContentCardBody
 *
 * Content-forward node body for nodes registered in `CONTENT_CARD_REGISTRY`
 * (image / video / text / etc. generators and "thin" image-edit nodes).
 * Three regions per plan §6.1:
 *
 *   1. Header           — already rendered by `NodeHeader` in `BaseNode`
 *   2. Preview area     — variant dispatch by primary-output type
 *   3. Footer strip     — optional `DynamicInputButton` (RunModelButton
 *                         removed — single-node run lives in the existing
 *                         node toolbar)
 *
 * Inline fields are rendered below the preview via the existing
 * `NodeInputs` infrastructure. Input fields render as handle-only ports on
 * the left edge via `HandleColumn`. Everything else stays in the Inspector.
 *
 * PR 4 ships only the **image** variant. Other variants fall through to
 * `OutputRenderer` for now and get bespoke previews in PR 5.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";
import MovieIcon from "@mui/icons-material/Movie";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import LayersIcon from "@mui/icons-material/Layers";
import { shallow } from "zustand/shallow";

import {
  CheckerDropzone,
  DynamicInputButton,
  FlexRow,
  VideoPlayer
} from "../ui_primitives";
import { NodeInputs } from "../node/NodeInputs";
import HandleColumn from "../node/HandleColumn";
import ImageView from "../node/ImageView";
import OutputRenderer from "../node/OutputRenderer";
import { NodeOutputs } from "../node/NodeOutputs";
import NodeProgress from "../node/NodeProgress";
import { useSignedUrl, getMimeTypeFromUri, toUint8Array } from "../node/output";
import AudioPlayer from "../audio/AudioPlayer";
import { editorClassNames } from "../editor_ui";

import type { NodeMetadata } from "../../stores/ApiTypes";
import type { NodeData } from "../../stores/NodeData";
import useResultsStore from "../../stores/ResultsStore";
import { useNodes } from "../../contexts/NodeContext";

import {
  getContentCardVariant,
  getDynamicInputLabel,
  getPrimaryOutput,
  type ContentCardVariant
} from "./contentCardRegistry";
import { resolveExposedInputNames } from "../../utils/exposedInputs";

const styles = (theme: Theme) =>
  css({
    "&.content-card-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.5),
      minHeight: 0
    },
    // Preview dominates the card — fixed-min height so a freshly dropped
    // card still feels content-forward even before its first run.
    ".preview-area": {
      position: "relative",
      flex: "1 1 auto",
      minHeight: 160,
      borderRadius: "var(--rounded-sm)",
      // Allow the handle column to extend past the preview's left edge so
      // the handle dots align with the card's outer edge (compensates for
      // the body's padding).
      overflow: "visible",
      backgroundColor: theme.vars.palette.grey[900],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      // Scope the handle column to the preview area's vertical bounds so
      // handles for `exposedInputs` never overlap inline-field rows below.
      "& > .handle-column": {
        top: 0,
        bottom: 0,
        left: `calc(${theme.spacing(-0.5)})`
      },
      "& img": {
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "contain"
      },
      ".text-preview": {
        width: "100%",
        height: "100%",
        resize: "none",
        border: "none",
        outline: "none",
        background: theme.vars.palette.grey[900],
        color: theme.vars.palette.text.primary,
        fontFamily: theme.fontFamily2,
        fontSize: theme.fontSizeSmall,
        padding: theme.spacing(1),
        overflow: "auto",
        whiteSpace: "pre-wrap"
      },
      ".mask-empty": {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.spacing(0.5),
        background: theme.vars.palette.common.black,
        color: theme.vars.palette.common.white,
        opacity: 0.85,
        fontFamily: theme.fontFamily1,
        fontSize: theme.fontSizeSmall,
        ".mask-icon": { fontSize: 36, opacity: 0.85 }
      },
      ".mask-on-checker": {
        width: "100%",
        height: "100%",
        backgroundColor: theme.vars.palette.grey[900],
        backgroundImage: `
          linear-gradient(45deg, ${theme.vars.palette.grey[800]} 25%, transparent 25%),
          linear-gradient(-45deg, ${theme.vars.palette.grey[800]} 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, ${theme.vars.palette.grey[800]} 75%),
          linear-gradient(-45deg, transparent 75%, ${theme.vars.palette.grey[800]} 75%)
        `,
        backgroundSize: "24px 24px",
        backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0px"
      },
      ".model-3d-thumb": {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.spacing(0.5),
        color: theme.vars.palette.grey[300],
        fontFamily: theme.fontFamily1,
        fontSize: theme.fontSizeSmall,
        padding: theme.spacing(1),
        ".model-3d-icon": { fontSize: 48, opacity: 0.7 },
        ".model-3d-name": {
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }
      }
    },
    // Inline fields render in normal flow with visible labels and editors
    ".inline-fields": {
      flex: "0 0 auto",
      paddingTop: theme.spacing(0.5)
    },
    // Input handles are rendered by <HandleColumn /> — see HandleColumn.tsx
    // for the left-edge absolute positioning.
    ".outputs-row": {
      flex: "0 0 auto"
    },
    ".footer-strip": {
      flex: "0 0 auto",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing(1),
      paddingTop: theme.spacing(0.5)
    }
  });

export interface ContentCardBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

/**
 * Resolve the value to render in the preview area from the cached result.
 * Results may be:
 *   - A primitive / asset-ref directly, OR
 *   - A `{ [outputName]: value }` record for multi/single-output nodes.
 * We prefer the primary output's named slot when the record shape is present.
 */
const extractPrimaryValue = (
  result: unknown,
  primaryOutputName: string | undefined
): unknown => {
  if (
    result &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    primaryOutputName &&
    primaryOutputName in (result as Record<string, unknown>)
  ) {
    return (result as Record<string, unknown>)[primaryOutputName];
  }
  return result;
};

/**
 * Resolve a stable URL for a media value carrying either a stored asset URI
 * or in-memory bytes. Returns a signed URL when the value has a non-memory
 * URI, or an object-URL when bytes are present, or "" while nothing is loaded.
 */
type MediaKind = "audio" | "video";

const useMediaSrc = (
  value: unknown,
  kind: MediaKind,
  fallbackMime?: string
): string => {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  // Accept either a direct URI string or an object with a `uri` field.
  const rawUri =
    typeof value === "string" && value && !value.startsWith("memory://")
      ? value
      : v && typeof v.uri === "string" && !v.uri.startsWith("memory://")
        ? (v.uri as string)
        : undefined;
  const signedUrl = useSignedUrl(rawUri);

  const data = v?.data;
  // Pick a content-type for the Blob so WaveSurfer / <video> can decode.
  // Order: explicit caller mime → MIME from URI → `<kind>/<metadata.format>`.
  // `format` is an extension ("mp4", "wav") so it must be combined with the
  // caller-supplied kind — never assume audio.
  const format = (v?.metadata as { format?: string } | undefined)?.format;
  const blobMime =
    fallbackMime ||
    (rawUri ? getMimeTypeFromUri(rawUri) : "") ||
    (format ? `${kind}/${format}` : "") ||
    "";

  const [blobUrl, setBlobUrl] = useState<string>("");
  useEffect(() => {
    // Shared helper handles Uint8Array, ArrayBuffer, ArrayBufferView, and
    // plain number[] — and returns a copy backed by a non-shared ArrayBuffer
    // suitable for Blob construction.
    const bytes = toUint8Array(data);
    if (bytes && bytes.byteLength > 0) {
      const blob = blobMime
        ? new Blob([bytes], { type: blobMime })
        : new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setBlobUrl("");
    return undefined;
  }, [data, blobMime]);

  return blobUrl || signedUrl || "";
};

const extractTextValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.value === "string") {return v.value;}
    if (typeof v.text === "string") {return v.text;}
    if (typeof v.data === "string") {return v.data;}
  }
  return "";
};

const ImagePreview: React.FC<{ value: unknown }> = ({ value }) => {
  if (typeof value === "string") {
    return <ImageView source={value} />;
  }
  if (value && typeof value === "object") {
    const v = value as { uri?: string; data?: unknown };
    if (typeof v.uri === "string" && v.uri) {
      return <ImageView source={v.uri} />;
    }
    if (v.data) {
      const source =
        v.data instanceof Uint8Array
          ? v.data
          : Array.isArray(v.data)
            ? new Uint8Array(v.data as number[])
            : undefined;
      if (source) {
        return <ImageView source={source} />;
      }
    }
  }
  return <OutputRenderer value={value} showTextActions={false} />;
};

const VideoPreview: React.FC<{ value: unknown }> = ({ value }) => {
  const src = useMediaSrc(value, "video");
  if (!src) {
    return <OutputRenderer value={value} showTextActions={false} />;
  }
  // nodrag/nopan keep ReactFlow from hijacking click-to-play and seek drag.
  return <VideoPlayer src={src} className="nodrag nopan" />;
};

const AudioPreview: React.FC<{ value: unknown }> = ({ value }) => {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  const inlineFormat = (v?.metadata as { format?: string } | undefined)?.format;
  const mimeType =
    getMimeTypeFromUri(typeof v?.uri === "string" ? (v.uri as string) : "") ||
    (inlineFormat === "wav" ? "audio/wav" : "audio/mp3");
  // Pass mimeType so the in-memory blob is tagged for WaveSurfer to decode.
  const src = useMediaSrc(value, "audio", mimeType);
  if (!src) {
    return <OutputRenderer value={value} showTextActions={false} />;
  }
  // Wrap so ReactFlow doesn't pan the canvas when interacting with controls.
  return (
    <div className="audio-preview nodrag nopan">
      <AudioPlayer
        source={src}
        mimeType={mimeType}
        height={80}
        waveformHeight={80}
      />
    </div>
  );
};

const TextPreview: React.FC<{ value: unknown }> = ({ value }) => {
  const text = extractTextValue(value);
  const [isFocused, setIsFocused] = useState(false);
  return (
    <textarea
      className={`text-preview nodrag nopan${
        isFocused ? ` ${editorClassNames.nowheel}` : ""
      }`}
      readOnly
      value={text}
      spellCheck={false}
      aria-label="Generated text"
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    />
  );
};

const Model3DPreview: React.FC<{ value: unknown }> = ({ value }) => {
  // Per plan §6.2: static thumbnail only — no interactive viewer.
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  const name =
    (typeof v?.name === "string" && (v.name as string)) ||
    (typeof v?.uri === "string" && (v.uri as string).split("/").pop()) ||
    "3D model";
  return (
    <div className="model-3d-thumb">
      <ViewInArIcon className="model-3d-icon" />
      <span className="model-3d-name" title={String(name)}>
        {String(name)}
      </span>
    </div>
  );
};

const PreviewArea: React.FC<{
  variant: ContentCardVariant;
  value: unknown;
}> = ({ variant, value }) => {
  // Empty state — variant-specific empty surface.
  if (value === undefined || value === null) {
    if (variant === "image_mask") {
      return (
        <div className="mask-empty">
          <LayersIcon className="mask-icon" />
          <span>No mask yet</span>
        </div>
      );
    }
    const empty: Record<
      Exclude<ContentCardVariant, "image_mask">,
      { message: string; icon: React.ReactNode }
    > = {
      image: { message: "Run to generate", icon: <ImageIcon /> },
      video: { message: "Run to generate video", icon: <MovieIcon /> },
      text: { message: "Run to generate text", icon: <TextFieldsIcon /> },
      audio: { message: "Run to generate audio", icon: <AudiotrackIcon /> },
      model_3d: { message: "Run to generate 3D", icon: <ViewInArIcon /> },
      generic: { message: "Run Model", icon: undefined }
    };
    const { message, icon } = empty[variant];
    return <CheckerDropzone message={message} icon={icon} />;
  }

  switch (variant) {
    case "image":
      return <ImagePreview value={value} />;
    case "image_mask":
      // Render the alpha image against a checker so transparency reads clearly.
      return (
        <div className="mask-on-checker">
          <ImagePreview value={value} />
        </div>
      );
    case "video":
      return <VideoPreview value={value} />;
    case "audio":
      return <AudioPreview value={value} />;
    case "text":
      return <TextPreview value={value} />;
    case "model_3d":
      return <Model3DPreview value={value} />;
    default:
      return <OutputRenderer value={value} showTextActions={false} />;
  }
};

const ContentCardBodyInner: React.FC<ContentCardBodyProps> = ({
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

  const primaryOutput = useMemo(
    () => getPrimaryOutput(nodeMetadata),
    [nodeMetadata]
  );
  const variant = useMemo(
    () => getContentCardVariant(primaryOutput),
    [primaryOutput]
  );

  const result = useResultsStore(
    (state) => state.getResult(workflowId, id),
    shallow
  );
  const previewValue = useMemo(
    () => extractPrimaryValue(result, primaryOutput?.name),
    [result, primaryOutput?.name]
  );

  const isDynamic = !!nodeMetadata.is_dynamic;

  // Two-pass field classification per field-classification.md:
  // 1. inlineFields: rendered as full editors in normal flow
  // 2. inputFields ∪ exposedInputs: rendered as handle-only on left edge
  // Fallback when neither is set: all properties render as handles (old behavior)
  // `!== undefined` so a node with explicitly empty arrays ("send everything
  // to the Inspector") is honored — not treated as legacy.
  const useNewLayout =
    nodeMetadata.inline_fields !== undefined ||
    nodeMetadata.input_fields !== undefined;
  const inlineFields = nodeMetadata.inline_fields ?? [];

  const properties = nodeMetadata.properties ?? [];
  // Handle column = metadata input_fields ∪ user-promoted exposedInputs.
  const handleNames = useMemo(
    () =>
      useNewLayout
        ? new Set(resolveExposedInputNames(nodeMetadata, data))
        : null,
    [useNewLayout, nodeMetadata, data]
  );
  const inlineProps = useMemo(
    () =>
      useNewLayout
        ? properties.filter((p) => inlineFields.includes(p.name))
        : [],
    [useNewLayout, properties, inlineFields]
  );
  const handleProps = useMemo(
    () =>
      useNewLayout
        ? properties.filter((p) => handleNames!.has(p.name))
        : properties,
    [useNewLayout, properties, handleNames]
  );

  // Adding a dynamic property is the responsibility of dynamic-input wiring
  // landed in earlier work (NodeInputs / NodePropertyForm). For PR 4 we
  // expose a placeholder onAdd that delegates to the same store flow used
  // by NodePropertyForm — but we only render the button when the node opts
  // into `is_dynamic`. If no add handler is wired, the button is disabled.
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const handleAddDynamicInput = useCallback(() => {
    const existing = data.dynamic_properties ?? {};
    let i = 1;
    while (`input_${i}` in existing) {
      i += 1;
    }
    updateNodeData(id, {
      dynamic_properties: { ...existing, [`input_${i}`]: "" }
    });
  }, [data.dynamic_properties, id, updateNodeData]);

  return (
    <div
      css={cssStyles}
      className="content-card-body node-drag-handle"
      data-content-card-variant={variant}
    >
      <div className="preview-area">
        <PreviewArea variant={variant} value={previewValue} />
        {/* Handle column lives inside the preview so its vertical extent
            is bounded by the preview — keeps `exposedInputs` handles from
            colliding with inline-field rows below. */}
        <HandleColumn id={id} properties={handleProps} />
      </div>

      {/* Inline fields: rendered as full editors in normal flow under preview.
          Labels are visible here (no display: none). */}
      {useNewLayout && inlineProps.length > 0 && (
        <div className="inline-fields">
          <NodeInputs
            id={id}
            nodeMetadata={nodeMetadata}
            layout={nodeMetadata.layout}
            properties={inlineProps}
            nodeType={nodeType}
            data={data}
            editableDynamicInputs={false}
            showFields={true}
          />
        </div>
      )}

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs
            id={id}
            outputs={nodeMetadata.outputs}
          />
        </div>
      )}

      {isDynamic && (
        <FlexRow className="footer-strip" align="center" justify="flex-start">
          <DynamicInputButton
            itemLabel={getDynamicInputLabel(nodeMetadata)}
            onAdd={handleAddDynamicInput}
          />
        </FlexRow>
      )}

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const ContentCardBody = memo(ContentCardBodyInner);
ContentCardBody.displayName = "ContentCardBody";

export default ContentCardBody;
