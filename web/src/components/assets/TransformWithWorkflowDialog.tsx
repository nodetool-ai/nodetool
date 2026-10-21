/**
 * "Transform with workflow": runs one asset through a saved workflow.
 *
 * The dialog lists the workflows with an input node of the asset's kind
 * (an image input for an image, a video input for a video), searchable by
 * name. Running one shows the run's progress and node updates in place, and
 * each output can be saved to the asset library or transformed again with
 * another workflow. An editor that opens the dialog can also take an output
 * back, for example as a new sketch layer or as a clip's media.
 */
import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import CheckIcon from "@mui/icons-material/Check";
import InputIcon from "@mui/icons-material/Input";

import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetStore } from "../../stores/AssetStore";
import type { Asset, Workflow } from "../../stores/ApiTypes";
import { trpcClient } from "../../trpc/client";
import {
  AlertBanner,
  Box,
  Caption,
  Dialog,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner,
  MediaThumbnail,
  ProgressBar,
  ScrollArea,
  SearchInput,
  SelectableListItem,
  SPACING,
  StatusPill,
  Text,
  type StatusPillTone
} from "../ui_primitives";
import { useAutoFocusEnabled } from "../../hooks/useAutoFocusEnabled";
import { createAssetFile } from "../../utils/createAssetFile";
import { assetLocator } from "../../utils/mediaRef";
import { isString } from "../../utils/typePredicates";
import { useTransformRun } from "./hooks/useTransformRun";
import {
  transformCandidates,
  transformProgress,
  transformSourceFromAsset,
  transformSourceFromAssetId,
  type TransformApplyAction,
  type TransformCandidate,
  type TransformKind,
  type TransformOutput,
  type TransformRunStatus,
  type TransformSource
} from "./transformWorkflow";

const STATUS_TONE: Record<TransformRunStatus, StatusPillTone> = {
  idle: "neutral",
  running: "rendering",
  completed: "done",
  failed: "failed",
  cancelled: "warning"
};

const UPDATE_TONE: Record<string, StatusPillTone> = {
  running: "rendering",
  completed: "done",
  error: "failed",
  cancelled: "warning"
};

const THUMBNAIL_KIND: Record<TransformKind, "image" | "video" | "audio" | "other"> = {
  image: "image",
  video: "video",
  audio: "audio",
  model3d: "other",
  document: "other"
};

const useKindLabel = (): ((kind: TransformKind) => string) => {
  const { t } = useTranslation();
  return useCallback(
    (kind: TransformKind) => t(`transformWithWorkflow.kind.${kind}`),
    [t]
  );
};

const SourceSummary: React.FC<{ source: TransformSource }> = memo(({ source }) => {
  const { t } = useTranslation();
  const kindLabel = useKindLabel();
  return (
    <FlexRow align="center" gap={SPACING.sm}>
      <Box sx={{ width: 56, flexShrink: 0 }}>
        <MediaThumbnail
          locator={source.uri}
          kind={THUMBNAIL_KIND[source.kind]}
          alt={source.name}
        />
      </Box>
      <FlexColumn gap={SPACING.micro} sx={{ minWidth: 0 }}>
        <Label noWrap>{source.name}</Label>
        <Caption color="secondary">
          {t("transformWithWorkflow.sourceKind", { kind: kindLabel(source.kind) })}
        </Caption>
      </FlexColumn>
    </FlexRow>
  );
});
SourceSummary.displayName = "SourceSummary";

const OutputValue: React.FC<{ output: TransformOutput }> = memo(({ output }) => {
  if (output.kind) {
    return (
      <MediaThumbnail
        locator={output.value as Parameters<typeof MediaThumbnail>[0]["locator"]}
        kind={THUMBNAIL_KIND[output.kind]}
        alt={output.nodeName}
        fit="contain"
        aspectRatio="4/3"
        interactive
      />
    );
  }
  const text = isString(output.value)
    ? output.value
    : JSON.stringify(output.value, null, 2);
  return (
    <ScrollArea maxHeight={200} thin>
      <Text size="small" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {text}
      </Text>
    </ScrollArea>
  );
});
OutputValue.displayName = "OutputValue";

interface OutputCardProps {
  output: TransformOutput;
  savedAssetId?: string;
  busy: boolean;
  /** The host editor's action label, when it can take this output. */
  applyLabel?: string;
  onSave: (output: TransformOutput) => void;
  onTransform: (output: TransformOutput) => void;
  onApply: (output: TransformOutput) => void;
}

const OutputCard: React.FC<OutputCardProps> = memo(
  ({ output, savedAssetId, busy, applyLabel, onSave, onTransform, onApply }) => {
    const { t } = useTranslation();
    const stored = output.assetId ?? savedAssetId;
    return (
      <FlexColumn gap={SPACING.xs} data-testid="transform-output">
        <Caption color="secondary" noWrap>
          {output.nodeName}
        </Caption>
        <OutputValue output={output} />
        {output.kind && (
          <FlexRow gap={SPACING.xs} wrap>
            {applyLabel && (
              <EditorButton
                size="small"
                variant="contained"
                startIcon={<InputIcon />}
                disabled={busy}
                onClick={() => onApply(output)}
              >
                {applyLabel}
              </EditorButton>
            )}
            <EditorButton
              size="small"
              variant="outlined"
              startIcon={<AutoFixHighOutlinedIcon />}
              disabled={busy}
              onClick={() => onTransform(output)}
            >
              {t("transformWithWorkflow.transformOutput")}
            </EditorButton>
            {stored ? (
              <StatusPill tone="done">
                <FlexRow align="center" gap={SPACING.micro}>
                  <CheckIcon fontSize="inherit" />
                  {t("transformWithWorkflow.inAssets")}
                </FlexRow>
              </StatusPill>
            ) : (
              <EditorButton
                size="small"
                variant="text"
                startIcon={<SaveAltIcon />}
                disabled={busy}
                onClick={() => onSave(output)}
              >
                {t("transformWithWorkflow.saveToAssets")}
              </EditorButton>
            )}
          </FlexRow>
        )}
      </FlexColumn>
    );
  }
);
OutputCard.displayName = "OutputCard";

export interface TransformWithWorkflowViewProps {
  /** What to transform; null shows that nothing can run. */
  source: TransformSource | null;
  onClose: () => void;
  /** How the editor that opened the dialog takes an output back. */
  apply?: TransformApplyAction;
  /** Stack above floating surfaces, such as the full-screen asset viewer. */
  aboveFloating?: boolean;
}

/**
 * The dialog itself. Editors mount it with their current media as `source`;
 * the asset grid mounts it through the store-driven default export.
 */
export const TransformWithWorkflowView: React.FC<TransformWithWorkflowViewProps> = ({
  source: initialSource,
  onClose,
  apply,
  aboveFloating = false
}) => {
  const { t, i18n } = useTranslation();
  const kindLabel = useKindLabel();
  const autoFocusEnabled = useAutoFocusEnabled();
  const createAsset = useAssetStore((state) => state.createAsset);

  const [source, setSource] = useState<TransformSource | null>(initialSource);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inputName, setInputName] = useState<string | null>(null);
  const [runWorkflow, setRunWorkflow] = useState<TransformCandidate | null>(null);
  const [savedAssets, setSavedAssets] = useState<Record<string, string>>({});
  const [busyOutput, setBusyOutput] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const run = useTransformRun();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["transform-with-workflow-workflows"],
    queryFn: async () => {
      const result = await trpcClient.workflows.list.query({ limit: 500 });
      return result.workflows as Workflow[];
    },
    staleTime: 30_000
  });

  const locale = i18n.resolvedLanguage ?? i18n.language;
  const allCandidates = useMemo(
    () => (source ? transformCandidates(data ?? [], source.kind, "", locale) : []),
    [data, source, locale]
  );
  const candidates = useMemo(
    () => (source ? transformCandidates(data ?? [], source.kind, query, locale) : []),
    [data, source, query, locale]
  );
  const selected = candidates.find((c) => c.workflow.id === selectedId) ?? null;
  const selectedInput =
    selected?.inputs.find((i) => i.input.name === inputName) ?? selected?.inputs[0];

  const select = useCallback((candidate: TransformCandidate) => {
    setSelectedId(candidate.workflow.id);
    setInputName(candidate.inputs[0]?.input.name ?? null);
  }, []);

  const startRun = useCallback(() => {
    if (!source || !selected || !selectedInput) {
      return;
    }
    setActionError(null);
    setRunWorkflow(selected);
    run.start(selected.workflow, source, selectedInput);
  }, [run, selected, selectedInput, source]);

  const runAgain = useCallback(() => {
    const target =
      runWorkflow?.inputs.find((i) => i.input.name === inputName) ??
      runWorkflow?.inputs[0];
    if (!source || !runWorkflow || !target) {
      return;
    }
    setActionError(null);
    run.start(runWorkflow.workflow, source, target);
  }, [inputName, run, runWorkflow, source]);

  const backToWorkflows = useCallback(() => {
    run.reset();
    setRunWorkflow(null);
    setActionError(null);
  }, [run]);

  /** The asset behind an output, saving the output first when it has none. */
  const ensureAsset = useCallback(
    async (output: TransformOutput): Promise<Asset | string | null> => {
      const existing = output.assetId ?? savedAssets[output.key];
      if (existing) {
        return existing;
      }
      const files = await createAssetFile(
        output.value as Parameters<typeof createAssetFile>[0],
        output.nodeName
      );
      const file = files[0]?.file;
      if (!file) {
        return null;
      }
      const created = await createAsset(
        file,
        runWorkflow?.workflow.id,
        source?.parentId,
        undefined,
        "file",
        source?.projectId
      );
      setSavedAssets((prev) => ({ ...prev, [output.key]: created.id }));
      return created;
    },
    [createAsset, runWorkflow, savedAssets, source]
  );

  const saveOutput = useCallback(
    async (output: TransformOutput) => {
      setBusyOutput(output.key);
      setActionError(null);
      try {
        await ensureAsset(output);
      } catch (error) {
        console.error("Transform with workflow: saving output failed", error);
        setActionError(t("transformWithWorkflow.saveFailed"));
      } finally {
        setBusyOutput(null);
      }
    },
    [ensureAsset, t]
  );

  const transformOutput = useCallback(
    async (output: TransformOutput) => {
      if (!output.kind) {
        return;
      }
      setBusyOutput(output.key);
      setActionError(null);
      try {
        const stored = await ensureAsset(output);
        if (!stored) {
          setActionError(t("transformWithWorkflow.saveFailed"));
          return;
        }
        const assetId = isString(stored) ? stored : stored.id;
        setSource({
          ...transformSourceFromAssetId(
            assetId,
            output.kind,
            isString(stored) ? output.nodeName : stored.name
          ),
          parentId: source?.parentId,
          projectId: source?.projectId
        });
        setQuery("");
        setSelectedId(null);
        setInputName(null);
        setSavedAssets({});
        backToWorkflows();
      } catch (error) {
        console.error("Transform with workflow: saving output failed", error);
        setActionError(t("transformWithWorkflow.saveFailed"));
      } finally {
        setBusyOutput(null);
      }
    },
    [backToWorkflows, ensureAsset, source, t]
  );

  const handleClose = useCallback(() => {
    run.cancel();
    onClose();
  }, [onClose, run]);

  /** Store the output, hand it to the host editor, and close. */
  const applyOutput = useCallback(
    async (output: TransformOutput) => {
      if (!apply || !output.kind) {
        return;
      }
      setBusyOutput(output.key);
      setActionError(null);
      try {
        const stored = await ensureAsset(output);
        if (!stored) {
          setActionError(t("transformWithWorkflow.saveFailed"));
          return;
        }
        const assetId = isString(stored) ? stored : stored.id;
        await apply.onApply({
          assetId,
          kind: output.kind,
          name: isString(stored) ? output.nodeName : stored.name,
          uri: assetLocator(assetId)
        });
        handleClose();
      } catch (error) {
        console.error("Transform with workflow: applying output failed", error);
        setActionError(t("transformWithWorkflow.applyFailed"));
      } finally {
        setBusyOutput(null);
      }
    },
    [apply, ensureAsset, handleClose, t]
  );

  const { state } = run;
  const running = state.status === "running";

  let content: React.ReactNode;
  let actions: React.ReactNode;

  if (!source) {
    content = (
      <EmptyState
        variant="empty"
        size="small"
        title={t("transformWithWorkflow.unsupportedTitle")}
        description={t("transformWithWorkflow.unsupportedDescription")}
      />
    );
    actions = (
      <EditorButton variant="text" onClick={handleClose}>
        {t("transformWithWorkflow.close")}
      </EditorButton>
    );
  } else if (runWorkflow) {
    const currentNode = state.updates.findLast((u) => u.status === "running");
    content = (
      <FlexColumn gap={SPACING.md}>
        <SourceSummary source={source} />
        <FlexRow align="center" gap={SPACING.sm}>
          <Label noWrap sx={{ flex: 1 }}>
            {runWorkflow.workflow.name}
          </Label>
          <StatusPill tone={STATUS_TONE[state.status]}>
            {t(`transformWithWorkflow.status.${state.status}`)}
          </StatusPill>
        </FlexRow>
        {(running || state.status === "completed") && (
          <ProgressBar
            value={transformProgress(state)}
            label={
              currentNode
                ? t("transformWithWorkflow.runningNode", { node: currentNode.nodeName })
                : t("transformWithWorkflow.progress")
            }
          />
        )}
        {running && state.nodeProgress && (
          <ProgressBar
            size="small"
            value={state.nodeProgress.percent}
            label={t("transformWithWorkflow.nodeProgress")}
          />
        )}
        {state.error && <AlertBanner severity="error">{state.error}</AlertBanner>}
        {actionError && (
          <AlertBanner severity="error" onClose={() => setActionError(null)}>
            {actionError}
          </AlertBanner>
        )}
        {state.updates.length > 0 && (
          <FlexColumn gap={SPACING.xs}>
            <Text size="small">{t("transformWithWorkflow.updates")}</Text>
            <ScrollArea maxHeight={140} thin>
              <FlexColumn gap={SPACING.micro} aria-live="polite">
                {state.updates.map((update) => (
                  <FlexRow key={update.nodeId} align="center" gap={SPACING.sm}>
                    <Caption noWrap sx={{ flex: 1 }}>
                      {update.error
                        ? `${update.nodeName}: ${update.error}`
                        : update.nodeName}
                    </Caption>
                    <StatusPill tone={UPDATE_TONE[update.status] ?? "neutral"}>
                      {update.status}
                    </StatusPill>
                  </FlexRow>
                ))}
              </FlexColumn>
            </ScrollArea>
          </FlexColumn>
        )}
        {state.outputs.length > 0 && (
          <FlexColumn gap={SPACING.xs}>
            <Text size="small">{t("transformWithWorkflow.outputs")}</Text>
            <Box
              sx={{
                display: "grid",
                gap: SPACING.md,
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))"
              }}
            >
              {state.outputs.map((output) => (
                <OutputCard
                  key={output.key}
                  output={output}
                  savedAssetId={savedAssets[output.key]}
                  busy={busyOutput !== null}
                  applyLabel={
                    apply && output.kind && apply.kinds.includes(output.kind)
                      ? apply.label
                      : undefined
                  }
                  onSave={(o) => void saveOutput(o)}
                  onTransform={(o) => void transformOutput(o)}
                  onApply={(o) => void applyOutput(o)}
                />
              ))}
            </Box>
          </FlexColumn>
        )}
        {state.status === "completed" && state.outputs.length === 0 && (
          <Caption color="secondary">{t("transformWithWorkflow.noOutputs")}</Caption>
        )}
      </FlexColumn>
    );
    actions = running ? (
      <EditorButton variant="outlined" onClick={run.cancel}>
        {t("transformWithWorkflow.cancelRun")}
      </EditorButton>
    ) : (
      <>
        <EditorButton variant="text" onClick={backToWorkflows}>
          {t("transformWithWorkflow.chooseAnother")}
        </EditorButton>
        <EditorButton variant="outlined" onClick={runAgain}>
          {t("transformWithWorkflow.runAgain")}
        </EditorButton>
        <EditorButton variant="contained" onClick={handleClose}>
          {t("transformWithWorkflow.done")}
        </EditorButton>
      </>
    );
  } else {
    content = (
      <FlexColumn gap={SPACING.sm}>
        <SourceSummary source={source} />
        <Caption color="secondary">
          {t("transformWithWorkflow.pickDescription", { kind: kindLabel(source.kind) })}
        </Caption>
        {/* autoFocus is skipped on touch, where the virtual keyboard would
            cover the workflow list below. */}
        <SearchInput
          autoFocus={autoFocusEnabled}
          placeholder={t("transformWithWorkflow.searchPlaceholder")}
          ariaLabel={t("transformWithWorkflow.searchLabel")}
          value={query}
          onChange={setQuery}
          fullWidth
        />
        {isLoading && (
          <FlexRow justify="center" sx={{ py: SPACING.lg }}>
            <LoadingSpinner size="small" />
          </FlexRow>
        )}
        {isError && (
          <EmptyState
            variant="error"
            size="small"
            description={t("transformWithWorkflow.loadFailed")}
          />
        )}
        {!isLoading && !isError && allCandidates.length === 0 && (
          <EmptyState
            variant="empty"
            size="small"
            title={t("transformWithWorkflow.noWorkflowsTitle")}
            description={t("transformWithWorkflow.noWorkflowsDescription", {
              kind: kindLabel(source.kind)
            })}
          />
        )}
        {!isLoading && !isError && allCandidates.length > 0 && candidates.length === 0 && (
          <Caption color="secondary">
            {t("transformWithWorkflow.noSearchResults", { query })}
          </Caption>
        )}
        {candidates.length > 0 && (
          <ScrollArea maxHeight={320} thin>
            <FlexColumn gap={SPACING.micro} role="listbox" aria-label={t("transformWithWorkflow.searchLabel")}>
              {candidates.map((candidate) => (
                <SelectableListItem
                  key={candidate.workflow.id}
                  selected={candidate.workflow.id === selectedId}
                  onClick={() => select(candidate)}
                  role="option"
                  aria-selected={candidate.workflow.id === selectedId}
                  data-testid="transform-workflow-row"
                >
                  <FlexColumn gap={SPACING.micro} sx={{ minWidth: 0, flex: 1 }}>
                    <Label noWrap>{candidate.workflow.name}</Label>
                    {candidate.workflow.description && (
                      <Caption color="secondary" noWrap>
                        {candidate.workflow.description}
                      </Caption>
                    )}
                  </FlexColumn>
                </SelectableListItem>
              ))}
            </FlexColumn>
          </ScrollArea>
        )}
        {selected && selected.inputs.length > 1 && (
          <FlexColumn gap={SPACING.xs}>
            <Text size="small">{t("transformWithWorkflow.chooseInput")}</Text>
            <FlexRow gap={SPACING.micro} wrap>
              {selected.inputs.map(({ input }) => (
                <EditorButton
                  key={input.nodeId}
                  size="small"
                  variant={input.name === selectedInput?.input.name ? "contained" : "outlined"}
                  onClick={() => setInputName(input.name)}
                >
                  {input.label}
                </EditorButton>
              ))}
            </FlexRow>
          </FlexColumn>
        )}
      </FlexColumn>
    );
    actions = (
      <>
        <EditorButton variant="text" onClick={handleClose}>
          {t("transformWithWorkflow.cancel")}
        </EditorButton>
        <EditorButton
          variant="contained"
          disabled={!selected || !selectedInput}
          onClick={startRun}
        >
          {t("transformWithWorkflow.run")}
        </EditorButton>
      </>
    );
  }

  return (
    <Dialog
      open
      onClose={handleClose}
      title={t("transformWithWorkflow.title")}
      maxWidth="md"
      fullWidth
      actions={actions}
      sx={aboveFloating ? { zIndex: (theme) => theme.zIndex.floatingPanel } : undefined}
    >
      {content}
    </Dialog>
  );
};

/** Mounted beside the asset grid; opens from the asset context menu. */
const TransformWithWorkflowDialog: React.FC = () => {
  const asset = useAssetGridStore((state) => state.transformAsset);
  const close = useAssetGridStore((state) => state.closeTransformDialog);
  if (!asset) {
    return null;
  }
  return (
    <TransformWithWorkflowView
      key={asset.id}
      source={transformSourceFromAsset(asset)}
      onClose={close}
    />
  );
};

export default memo(TransformWithWorkflowDialog);
