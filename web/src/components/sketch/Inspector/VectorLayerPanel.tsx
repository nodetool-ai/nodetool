import { useEffect, useRef, useState } from "react";
import {
  decodeSketchLayerData,
  encodeSketchLayerData
} from "@nodetool-ai/protocol/api-schemas/sketch.js";
import { useSketchStore } from "../state";
import type { Layer } from "../types";
import { getVectorSource } from "../vectorLayer";
import { dataUrlToCanvas } from "../serialization";
import {
  AlertBanner,
  Caption,
  EditorButton,
  FlexColumn,
  SPACING,
  TextInput
} from "../../ui_primitives";

export function ImportVectorLayer(): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  const addVectorLayer = useSketchStore((state) => state.addVectorLayer);
  const [error, setError] = useState("");
  const importFile = async (file: File): Promise<void> => {
    try {
      addVectorLayer(file.name.replace(/\.svg$/i, ""), await file.text());
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not import SVG."
      );
    }
  };
  return (
    <FlexColumn gap={SPACING.xs} sx={{ p: SPACING.md }}>
      <input
        ref={input}
        type="file"
        accept=".svg,image/svg+xml"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            void importFile(file);
          }
        }}
      />
      <EditorButton onClick={() => input.current?.click()}>
        Import SVG layer
      </EditorButton>
      {error && <AlertBanner severity="error">{error}</AlertBanner>}
    </FlexColumn>
  );
}

interface VectorLayerPanelProps {
  layer: Layer;
}

export function VectorLayerPanel({
  layer
}: VectorLayerPanelProps): React.JSX.Element {
  const [source, setSource] = useState(() => getVectorSource(layer));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setVectorLayerSource = useSketchStore(
    (state) => state.setVectorLayerSource
  );
  const rasterizeVectorLayer = useSketchStore(
    (state) => state.rasterizeVectorLayer
  );
  const savedSource = getVectorSource(layer);
  useEffect(() => {
    setSource(savedSource);
    setError("");
  }, [savedSource]);

  const apply = (): void => {
    try {
      setVectorLayerSource(layer.id, source);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update SVG."
      );
    }
  };
  const rasterize = async (): Promise<void> => {
    setBusy(true);
    try {
      const decoded = decodeSketchLayerData(
        layer.data,
        layer.contentBounds.width,
        layer.contentBounds.height
      );
      if (!decoded.image) {
        throw new Error("This layer has no SVG source.");
      }
      const canvas = await dataUrlToCanvas(
        decoded.image,
        decoded.bounds.width,
        decoded.bounds.height
      );
      rasterizeVectorLayer(
        layer.id,
        encodeSketchLayerData(canvas.toDataURL("image/png"), decoded.bounds),
        layer.data
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not rasterize SVG."
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <FlexColumn gap={SPACING.md} sx={{ p: SPACING.md }}>
      <Caption>
        Vector layer · {layer.contentBounds.width} ×{" "}
        {layer.contentBounds.height}
      </Caption>
      <Caption>
        Move and transform this layer, or edit its SVG. Rasterize to paint on
        it.
      </Caption>
      <TextInput
        label="SVG source"
        multiline
        minRows={8}
        maxRows={18}
        value={source}
        onChange={(event) => setSource(event.target.value)}
      />
      {error && <AlertBanner severity="error">{error}</AlertBanner>}
      <EditorButton onClick={apply} disabled={busy || source === savedSource}>
        Apply SVG
      </EditorButton>
      <EditorButton
        disabled={busy}
        onClick={() => {
          void rasterize();
        }}
      >
        Rasterize layer
      </EditorButton>
      <EditorButton
        onClick={() => {
          const link = document.createElement("a");
          link.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(getVectorSource(layer))}`;
          link.download = `${layer.name}.svg`;
          link.click();
        }}
      >
        Download SVG source
      </EditorButton>
    </FlexColumn>
  );
}
