import { useEffect, useMemo, useRef, useState } from "react";
import { isModelSelected } from "@nodetool-ai/protocol";
import {
  decodeSketchLayerData,
  encodeSketchLayerData
} from "@nodetool-ai/protocol/api-schemas/sketch.js";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { useSketchStore } from "../state";
import type { Layer } from "../types";
import { formatSvgSource, getVectorSource } from "../vectorLayer";
import { dataUrlToCanvas } from "../serialization";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import {
  AlertBanner,
  Caption,
  Divider,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  TextInput
} from "../../ui_primitives";
import {
  useGenerateSvg,
  type GenerateSvgTarget
} from "../../../hooks/sketch/useGenerateSvg";

const isSubmitShortcut = (event: React.KeyboardEvent): boolean =>
  event.key === "Enter" && (event.metaKey || event.ctrlKey);

const errorMessage = (cause: unknown, fallback: string): string =>
  cause instanceof Error ? cause.message : fallback;

/** The chat model, which `useGenerateSvg` sends with each request. */
function SvgModelSelect({ disabled }: { disabled: boolean }): React.JSX.Element {
  const model = useGlobalChatStore((state) => state.selectedModel);
  const setSelectedModel = useGlobalChatStore((state) => state.setSelectedModel);
  return (
    <LanguageModelSelect
      value={isModelSelected(model) ? model.id : ""}
      provider={model?.provider}
      onChange={setSelectedModel}
      placeholder="Model"
      disabled={disabled}
    />
  );
}

interface SvgPromptFormProps {
  label: string;
  placeholder: string;
  submitLabel: string;
  target: GenerateSvgTarget;
  /** Receives the generated markup. A thrown error is shown under the form. */
  onSvg: (svg: string, request: string) => void;
}

/** A prompt, a model picker and a Generate button that yield SVG markup. */
function SvgPromptForm({
  label,
  placeholder,
  submitLabel,
  target,
  onSvg
}: SvgPromptFormProps): React.JSX.Element {
  const [request, setRequest] = useState("");
  const [applyError, setApplyError] = useState("");
  const { generate, cancel, generating, error, clearError } = useGenerateSvg();
  const submit = async (): Promise<void> => {
    if (generating || request.trim() === "") {
      return;
    }
    setApplyError("");
    const svg = await generate(request, target);
    if (!svg) {
      return;
    }
    try {
      onSvg(svg, request.trim());
    } catch (cause) {
      setApplyError(
        `${errorMessage(cause, "The SVG could not be used.")} Try again or rephrase the request.`
      );
    }
  };
  const shownError = error ?? applyError;
  return (
    <FlexColumn gap={SPACING.sm}>
      <TextInput
        label={label}
        placeholder={placeholder}
        multiline
        minRows={2}
        maxRows={6}
        value={request}
        disabled={generating}
        onChange={(event) => {
          setRequest(event.target.value);
          clearError();
          setApplyError("");
        }}
        onKeyDown={(event) => {
          if (isSubmitShortcut(event)) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <FlexRow gap={SPACING.sm} align="center" justify="space-between">
        <SvgModelSelect disabled={generating} />
        {generating ? (
          <EditorButton variant="outlined" onClick={cancel}>
            Cancel
          </EditorButton>
        ) : (
          <EditorButton
            variant="contained"
            disabled={request.trim() === ""}
            onClick={() => {
              void submit();
            }}
          >
            {submitLabel}
          </EditorButton>
        )}
      </FlexRow>
      {generating && <Caption role="status">Generating SVG…</Caption>}
      {shownError && <AlertBanner severity="error">{shownError}</AlertBanner>}
    </FlexColumn>
  );
}

const layerNameFromRequest = (request: string): string => {
  const name = request.replace(/\s+/g, " ").trim();
  return name.length > 40 ? `${name.slice(0, 39).trimEnd()}…` : name || "SVG";
};

export function ImportVectorLayer(): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  const addVectorLayer = useSketchStore((state) => state.addVectorLayer);
  const canvasWidth = useSketchStore((state) => state.document.canvas.width);
  const canvasHeight = useSketchStore((state) => state.document.canvas.height);
  const [error, setError] = useState("");
  const [generateOpen, setGenerateOpen] = useState(false);
  const importFile = async (file: File): Promise<void> => {
    try {
      addVectorLayer(file.name.replace(/\.svg$/i, ""), await file.text());
      setError("");
    } catch (cause) {
      setError(errorMessage(cause, "Could not import SVG."));
    }
  };
  const target = useMemo(
    () => ({ width: canvasWidth, height: canvasHeight }),
    [canvasWidth, canvasHeight]
  );
  return (
    <FlexColumn gap={SPACING.sm} sx={{ p: SPACING.md }}>
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
      <FlexRow gap={SPACING.sm} justify="center" wrap>
        <EditorButton onClick={() => input.current?.click()}>
          Import SVG layer
        </EditorButton>
        <EditorButton
          aria-expanded={generateOpen}
          onClick={() => setGenerateOpen((open) => !open)}
        >
          Generate SVG layer
        </EditorButton>
      </FlexRow>
      {error && <AlertBanner severity="error">{error}</AlertBanner>}
      {generateOpen && (
        <SvgPromptForm
          label="Describe the new SVG layer"
          placeholder="A flat line icon of a paper plane"
          submitLabel="Generate"
          target={target}
          onSvg={(svg, request) => {
            addVectorLayer(layerNameFromRequest(request), svg);
            setGenerateOpen(false);
          }}
        />
      )}
    </FlexColumn>
  );
}

interface VectorLayerPanelProps {
  layer: Layer;
}

export function VectorLayerPanel({
  layer
}: VectorLayerPanelProps): React.JSX.Element {
  const savedSource = getVectorSource(layer);
  // The stored markup is minified; show it one element per line.
  const savedText = useMemo(() => formatSvgSource(savedSource), [savedSource]);
  const [source, setSource] = useState(savedText);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setVectorLayerSource = useSketchStore(
    (state) => state.setVectorLayerSource
  );
  const rasterizeVectorLayer = useSketchStore(
    (state) => state.rasterizeVectorLayer
  );
  useEffect(() => {
    setSource(savedText);
    setError("");
  }, [savedText]);
  const dirty = source !== savedText;
  const { width, height } = layer.contentBounds;
  const target = useMemo(
    () => ({ width, height, currentSvg: savedSource }),
    [width, height, savedSource]
  );

  const apply = (): void => {
    if (busy || !dirty) {
      return;
    }
    try {
      setVectorLayerSource(layer.id, source);
      setError("");
    } catch (cause) {
      setError(errorMessage(cause, "Could not update SVG."));
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
      setError(errorMessage(cause, "Could not rasterize SVG."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <FlexColumn gap={SPACING.lg} sx={{ p: SPACING.md }}>
      <Caption>
        {width} × {height} px. Move and transform this layer, or edit its SVG.
        Rasterize to paint on it.
      </Caption>

      <FlexColumn gap={SPACING.sm}>
        <SvgPromptForm
          label="Generate with AI"
          placeholder="Make the leaves autumn orange"
          submitLabel="Generate"
          target={target}
          onSvg={(svg) => setVectorLayerSource(layer.id, svg)}
        />
        <Caption>Replaces this layer&apos;s SVG. Undo restores it.</Caption>
      </FlexColumn>

      <FlexColumn gap={SPACING.sm}>
        <TextInput
          label="SVG source"
          multiline
          monospace
          minRows={8}
          maxRows={18}
          value={source}
          spellCheck={false}
          onChange={(event) => setSource(event.target.value)}
          onKeyDown={(event) => {
            if (isSubmitShortcut(event)) {
              event.preventDefault();
              apply();
            }
          }}
        />
        {error && <AlertBanner severity="error">{error}</AlertBanner>}
        <FlexRow gap={SPACING.sm} justify="flex-end">
          <EditorButton
            disabled={busy || !dirty}
            onClick={() => {
              setSource(savedText);
              setError("");
            }}
          >
            Revert
          </EditorButton>
          <EditorButton
            variant="contained"
            title="Apply SVG (Ctrl+Enter)"
            onClick={apply}
            disabled={busy || !dirty}
          >
            Apply SVG
          </EditorButton>
        </FlexRow>
      </FlexColumn>

      <Divider />
      <FlexRow gap={SPACING.sm} justify="space-between" wrap>
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
            link.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(savedSource)}`;
            link.download = `${layer.name}.svg`;
            link.click();
          }}
        >
          Download SVG
        </EditorButton>
      </FlexRow>
    </FlexColumn>
  );
}
