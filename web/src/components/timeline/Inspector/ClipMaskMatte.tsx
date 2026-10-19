/**
 * Mask, matte and subject-matte sections (D6, D2).
 *
 * A mask is a shape in the layer's own normalized 0..1 space, so it rotates
 * and scales with the clip. A matte names another clip whose pixels drive this
 * layer's alpha; that source stops drawing itself, which is why the picker
 * lists every other clip in the sequence rather than only the ones on
 * neighbouring tracks. A *subject* matte is neither: it is cut from this
 * clip's own source, so it carries no source picker and no alignment to keep —
 * only the model that cuts it, the look knobs, and which run is current.
 *
 * Mask and matte are absent-or-present rather than enabled/disabled, so the
 * section header's activation checkbox adds the field with defaults and
 * removes it again.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import CropFreeOutlinedIcon from "@mui/icons-material/CropFreeOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import FilterOutlinedIcon from "@mui/icons-material/FilterOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import { isGeneratedMatteStale } from "@nodetool-ai/timeline";
import type { ClipMask, ClipMatte, TimelineClip } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useVideoModelsByProvider } from "../../../hooks/useModelsByProvider";
import ErrorBanner from "../../support/ErrorBanner";
import {
  Caption,
  CollapsibleSection,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  SPACING
} from "../../ui_primitives";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSelect,
  InspectorSliderRow,
  InspectorToggleRow,
  INSPECTOR_SECTION_CONTENT_SX
} from "./InspectorPrimitives";
import { TextCommitField } from "./InspectorMotionFields";
import type { BugReportContext } from "../../../utils/bugReportBundle";

const DEFAULT_MASK: ClipMask = {
  kind: "rect",
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  featherPx: 0,
  invert: false
};

const NO_MATTE = "none";
const SCRUB_UNIT = { step: 0.01, min: 0, max: 1 };
const SCRUB_PX = { step: 1, min: 0 };

/** One picker value per model, since two providers can list the same id. */
const matteModelKey = (model: { provider: string; id: string }): string =>
  `${model.provider}:${model.id}`;

interface ClipMaskMatteProps {
  clip: TimelineClip;
  /**
   * Hides the Matte section. An `adjustment` clip is never a matte target —
   * it treats the composite beneath it rather than drawing its own alpha —
   * so its mask still limits where the treatment lands, but there is no
   * matte to configure.
   */
  hideMatte?: boolean;
}

export const ClipMaskMatte: React.FC<ClipMaskMatteProps> = memo(
  ({ clip, hideMatte = false }) => {
    const { t } = useTranslation();
    const patchClip = useTimelineStore((s) => s.patchClip);
    const [maskOpen, setMaskOpen] = usePersistedFold("mask");
    const [matteOpen, setMatteOpen] = usePersistedFold("matte");

    // Every other clip is a candidate matte source; a clip cannot matte itself.
    // Only the id and the name reach the option list, so a shallow-compared
    // projection keeps a keyframe scrub on another clip from re-rendering this
    // section.
    const clipNames = useTimelineStore(
      useShallow((s) =>
        s.clips.flatMap((candidate) =>
          candidate.id === clip.id
            ? []
            : [{ id: candidate.id, name: candidate.name }]
        )
      )
    );

    const clipRef = useRef(clip);
    clipRef.current = clip;

    const patchMask = useCallback(
      (patch: Partial<ClipMask>) => {
        const current = clipRef.current.mask ?? DEFAULT_MASK;
        patchClip(clipRef.current.id, { mask: { ...current, ...patch } });
      },
      [patchClip]
    );

    const handleMaskEnabled = useCallback(
      (next: boolean) => {
        patchClip(clipRef.current.id, {
          mask: next ? (clipRef.current.mask ?? DEFAULT_MASK) : undefined
        });
      },
      [patchClip]
    );

    const patchMatte = useCallback(
      (patch: Partial<ClipMatte>) => {
        const current = clipRef.current.matte;
        if (!current) return;
        patchClip(clipRef.current.id, { matte: { ...current, ...patch } });
      },
      [patchClip]
    );

    const handleMatteSourceChange = useCallback(
      (value: string) => {
        if (value === NO_MATTE) {
          patchClip(clipRef.current.id, { matte: undefined });
          return;
        }
        const current = clipRef.current.matte;
        patchClip(clipRef.current.id, {
          matte: {
            sourceClipId: value,
            mode: current?.mode ?? "alpha",
            invert: current?.invert
          }
        });
      },
      [patchClip]
    );

    // A stable callback per field, so an edit re-renders only the field whose
    // value changed rather than every memoized control in the section.
    const handleMaskKindChange = useCallback(
      (kind: string) => patchMask({ kind: kind as ClipMask["kind"] }),
      [patchMask]
    );
    const handleMaskPathCommit = useCallback(
      (d: string) => patchMask({ d: d.trim() || undefined }),
      [patchMask]
    );
    const handleMaskXCommit = useCallback(
      (raw: string) => commitUnit(raw, (x) => patchMask({ x })),
      [patchMask]
    );
    const handleMaskYCommit = useCallback(
      (raw: string) => commitUnit(raw, (y) => patchMask({ y })),
      [patchMask]
    );
    const handleMaskWidthCommit = useCallback(
      (raw: string) => commitUnit(raw, (width) => patchMask({ width })),
      [patchMask]
    );
    const handleMaskHeightCommit = useCallback(
      (raw: string) => commitUnit(raw, (height) => patchMask({ height })),
      [patchMask]
    );
    const handleMaskFeatherCommit = useCallback(
      (raw: string) => {
        const featherPx = Number(raw);
        if (!Number.isFinite(featherPx) || featherPx < 0) return;
        patchMask({ featherPx });
      },
      [patchMask]
    );
    const handleMaskInvertChange = useCallback(
      (invert: boolean) => patchMask({ invert }),
      [patchMask]
    );
    const handleMatteModeChange = useCallback(
      (mode: string) => patchMatte({ mode: mode as ClipMatte["mode"] }),
      [patchMatte]
    );
    const handleMatteInvertChange = useCallback(
      (invert: boolean) => patchMatte({ invert }),
      [patchMatte]
    );

    const sourceOptions = useMemo(
      () => [
        {
          value: NO_MATTE,
          label: t("pass3_25.timeline.inspector.maskMatte.none")
        },
        ...clipNames.map((candidate) => ({
          value: candidate.id,
          label: candidate.name || candidate.id
        }))
      ],
      [clipNames, t]
    );
    const maskKinds = [
      {
        value: "rect",
        label: t("pass3_25.timeline.inspector.maskMatte.shapes.rectangle")
      },
      {
        value: "ellipse",
        label: t("pass3_25.timeline.inspector.maskMatte.shapes.ellipse")
      },
      {
        value: "path",
        label: t("pass3_25.timeline.inspector.maskMatte.shapes.path")
      }
    ] as const;
    const matteModes = [
      {
        value: "alpha",
        label: t("pass3_25.timeline.inspector.maskMatte.modes.alpha")
      },
      {
        value: "luma",
        label: t("pass3_25.timeline.inspector.maskMatte.modes.luma")
      }
    ] as const;

    const mask = clip.mask;
    const matte = clip.matte;

    return (
      <>
        <InspectorDivider />
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title={t("pass3_25.timeline.inspector.maskMatte.mask")}
              icon={<CropFreeOutlinedIcon />}
              checked={mask !== undefined}
              onCheckedChange={handleMaskEnabled}
            />
          }
          open={maskOpen}
          onToggle={setMaskOpen}
          unmountOnExit
        >
          <FlexColumn sx={INSPECTOR_SECTION_CONTENT_SX}>
            {mask === undefined ? (
              <Caption color="muted">
                {t("pass3_25.timeline.inspector.maskMatte.enableMask")}
              </Caption>
            ) : (
              <>
                <InspectorRow
                  label={t("pass3_25.timeline.inspector.maskMatte.shape")}
                >
                  <InspectorSelect
                    label={t("pass3_25.timeline.inspector.maskMatte.maskShape")}
                    value={mask.kind}
                    options={maskKinds}
                    onChange={handleMaskKindChange}
                  />
                </InspectorRow>
                {mask.kind === "path" ? (
                  <>
                    <InspectorRow
                      label={t("pass3_25.timeline.inspector.maskMatte.path")}
                    >
                      <TextCommitField
                        value={mask.d ?? ""}
                        ariaLabel={t(
                          "pass3_25.timeline.inspector.maskMatte.pathData"
                        )}
                        placeholder="M 0 0 L 1 0 L 1 1 Z"
                        onCommit={handleMaskPathCommit}
                      />
                    </InspectorRow>
                    <Caption color="muted">
                      {t("pass3_25.timeline.inspector.maskMatte.pathHelp")}
                    </Caption>
                  </>
                ) : (
                  <>
                    <InspectorRow
                      label={t(
                        "pass3_25.timeline.inspector.maskMatte.position"
                      )}
                    >
                      <InspectorPillInput
                        value={(mask.x ?? 0).toFixed(2)}
                        minWidth={64}
                        scrub={SCRUB_UNIT}
                        onCommit={handleMaskXCommit}
                        ariaLabel={t(
                          "pass3_25.timeline.inspector.maskMatte.maskX"
                        )}
                      />
                      <InspectorPillInput
                        value={(mask.y ?? 0).toFixed(2)}
                        minWidth={64}
                        scrub={SCRUB_UNIT}
                        onCommit={handleMaskYCommit}
                        ariaLabel={t(
                          "pass3_25.timeline.inspector.maskMatte.maskY"
                        )}
                      />
                    </InspectorRow>
                    <InspectorRow
                      label={t("pass3_25.timeline.inspector.maskMatte.size")}
                    >
                      <InspectorPillInput
                        value={(mask.width ?? 1).toFixed(2)}
                        minWidth={64}
                        scrub={SCRUB_UNIT}
                        onCommit={handleMaskWidthCommit}
                        ariaLabel={t(
                          "pass3_25.timeline.inspector.maskMatte.maskWidth"
                        )}
                      />
                      <InspectorPillInput
                        value={(mask.height ?? 1).toFixed(2)}
                        minWidth={64}
                        scrub={SCRUB_UNIT}
                        onCommit={handleMaskHeightCommit}
                        ariaLabel={t(
                          "pass3_25.timeline.inspector.maskMatte.maskHeight"
                        )}
                      />
                    </InspectorRow>
                  </>
                )}
                <InspectorRow
                  label={t("pass3_25.timeline.inspector.maskMatte.feather")}
                >
                  <InspectorPillInput
                    value={String(mask.featherPx ?? 0)}
                    unit="px"
                    scrub={SCRUB_PX}
                    onCommit={handleMaskFeatherCommit}
                    ariaLabel={t(
                      "pass3_25.timeline.inspector.maskMatte.maskFeather"
                    )}
                  />
                </InspectorRow>
                <InspectorToggleRow
                  label={t("pass3_25.timeline.inspector.maskMatte.invert")}
                  checked={mask.invert === true}
                  onChange={handleMaskInvertChange}
                />
              </>
            )}
          </FlexColumn>
        </CollapsibleSection>

        {!hideMatte && (
          <>
            <InspectorDivider />
            <CollapsibleSection
              title={
                <InspectorSectionTitle
                  title={t("pass3_25.timeline.inspector.maskMatte.matte")}
                  icon={<FilterOutlinedIcon />}
                />
              }
              open={matteOpen}
              onToggle={setMatteOpen}
              unmountOnExit
            >
              <FlexColumn sx={INSPECTOR_SECTION_CONTENT_SX}>
                <InspectorRow
                  label={t("pass3_25.timeline.inspector.maskMatte.source")}
                >
                  <InspectorSelect
                    label={t(
                      "pass3_25.timeline.inspector.maskMatte.matteSourceClip"
                    )}
                    value={matte?.sourceClipId ?? NO_MATTE}
                    options={sourceOptions}
                    onChange={handleMatteSourceChange}
                    grow
                  />
                </InspectorRow>
                {matte && (
                  <>
                    <InspectorRow
                      label={t("pass3_25.timeline.inspector.maskMatte.mode")}
                    >
                      <InspectorSelect
                        label={t(
                          "pass3_25.timeline.inspector.maskMatte.matteMode"
                        )}
                        value={matte.mode}
                        options={matteModes}
                        onChange={handleMatteModeChange}
                      />
                    </InspectorRow>
                    <InspectorToggleRow
                      label={t("pass3_25.timeline.inspector.maskMatte.invert")}
                      checked={matte.invert === true}
                      onChange={handleMatteInvertChange}
                    />
                  </>
                )}
                <Caption color="muted">
                  {t("pass3_25.timeline.inspector.maskMatte.sourceHelp")}
                </Caption>
              </FlexColumn>
            </CollapsibleSection>
          </>
        )}

        {/* Only a moving picture has a subject to isolate — and the matte is
            cut from the clip's own source, which a text or shape clip has
            none of. */}
        {!hideMatte && clip.mediaType === "video" && (
          <SubjectMatteSection clip={clip} />
        )}
      </>
    );
  }
);

// ── Subject matte ──────────────────────────────────────────────────────────

/** Readable stamp for one stored run; the raw value if it is not a date. */
function versionLabel(createdAt: string): string {
  const at = Date.parse(createdAt);
  return Number.isNaN(at) ? createdAt : new Date(at).toLocaleString();
}

/** Clips with an isolate request in flight, kept across inspector remounts. */
const subjectMatteRuns = new Set<string>();

/**
 * "Isolate subject": cut a matte from this clip's own source and dial in how
 * it reads. Four states — none, generating, ready and failed — because that is
 * what the clip's `generatedMatte.status` says, and each one offers only what
 * can be done in it.
 */
const SubjectMatteSection: React.FC<{ clip: TimelineClip }> = memo(
  ({ clip }) => {
    const { t } = useTranslation();
    const [open, setOpen] = usePersistedFold("subjectMatte");
    const isolateSubject = useTimelineStore((s) => s.isolateSubject);
    const setKnobs = useTimelineStore((s) => s.setGeneratedMatteKnobs);
    const selectVersion = useTimelineStore(
      (s) => s.selectGeneratedMatteVersion
    );
    const clearMatte = useTimelineStore((s) => s.clearGeneratedMatte);

    // Whatever any configured provider lists for `matte_video`; the first
    // one is the default until the user picks another.
    const {
      models: matteModels,
      isLoading: modelsLoading,
      error: modelsError
    } = useVideoModelsByProvider({ task: "matte_video" });
    const [modelKey, setModelKey] = useState("");
    const model =
      matteModels.find((item) => matteModelKey(item) === modelKey) ??
      matteModels[0];
    const modelOptions = useMemo(() => {
      const providers = new Set(matteModels.map((item) => item.provider));
      return matteModels.map((item) => ({
        value: matteModelKey(item),
        label:
          providers.size > 1 ? `${item.name} (${item.provider})` : item.name
      }));
    }, [matteModels]);
    // Held between the click and the store's own `generating` mark, which only
    // lands after the document has been saved. Per clip, so it never shows on
    // (or blocks) another selected clip.
    const [pendingClipIds, setPendingClipIds] = useState<ReadonlySet<string>>(
      () => new Set()
    );

    const clipRef = useRef(clip);
    clipRef.current = clip;

    const matte = clip.generatedMatte;
    const status = matte?.status ?? (matte ? "ready" : undefined);
    const generating = pendingClipIds.has(clip.id) || status === "generating";
    // A failed first run leaves a marker carrying no mask, so there is a matte
    // record with nothing to dial in. Everything after this reads "is there a
    // result", not "is there a record".
    const result = matte && matte.assetId !== "" ? matte : undefined;
    const stale = isGeneratedMatteStale(clip);
    const failureReport = useMemo(() => {
      const report: BugReportContext = {
        source: "job-failure",
        summary: t("pass3_25.timeline.inspector.maskMatte.clipCutoutFailed")
      };
      if (matte?.error) report.errorText = matte.error;
      return report;
    }, [matte?.error, t]);

    const run = useCallback(
      async (regenerate: boolean) => {
        const clipId = clipRef.current.id;
        if (subjectMatteRuns.has(clipId)) return;
        subjectMatteRuns.add(clipId);
        setPendingClipIds((ids) => new Set(ids).add(clipId));
        try {
          if (!model) return;
          await isolateSubject(clipId, {
            provider: model.provider,
            model: model.id,
            regenerate
          });
        } catch {
          // The store reports every failure it can as a notification; there is
          // nothing left for this button to say.
        } finally {
          subjectMatteRuns.delete(clipId);
          setPendingClipIds((ids) => {
            const next = new Set(ids);
            next.delete(clipId);
            return next;
          });
        }
      },
      [isolateSubject, model]
    );

    const handleModelChange = useCallback((value: string) => {
      setModelKey(value);
    }, []);
    const handleIsolate = useCallback(() => void run(false), [run]);
    const handleRegenerate = useCallback(() => void run(true), [run]);
    const handleRemove = useCallback(
      () => clearMatte(clipRef.current.id),
      [clearMatte]
    );
    const handleInvert = useCallback(
      (invert: boolean) => setKnobs(clipRef.current.id, { invert }),
      [setKnobs]
    );
    const handleStrength = useCallback(
      (strength: number) => setKnobs(clipRef.current.id, { strength }),
      [setKnobs]
    );
    const handleFeather = useCallback(
      (raw: string) => {
        const featherPx = Number(raw);
        if (!Number.isFinite(featherPx) || featherPx < 0) return;
        setKnobs(clipRef.current.id, { featherPx });
      },
      [setKnobs]
    );
    const handleVersion = useCallback(
      (assetId: string) => selectVersion(clipRef.current.id, assetId),
      [selectVersion]
    );

    const versionOptions = useMemo(() => {
      if (!result) return [];
      const stored = [...(result.versions ?? [])].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
      return [
        {
          value: result.assetId,
          label: t("pass3_25.timeline.inspector.maskMatte.current")
        },
        ...stored.map((version) => ({
          value: version.assetId,
          label: versionLabel(version.createdAt)
        }))
      ];
    }, [result, t]);

    return (
      <>
        <InspectorDivider />
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title={t("pass3_25.timeline.inspector.maskMatte.subjectMatte")}
              icon={<PersonOutlineOutlinedIcon />}
            />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn sx={INSPECTOR_SECTION_CONTENT_SX}>
            {model ? (
              <InspectorRow
                label={t("pass3_25.timeline.inspector.maskMatte.model")}
              >
                <InspectorSelect
                  label={t(
                    "pass3_25.timeline.inspector.maskMatte.subjectMatteModel"
                  )}
                  value={matteModelKey(model)}
                  options={modelOptions}
                  onChange={handleModelChange}
                  disabled={generating}
                  grow
                />
              </InspectorRow>
            ) : (
              <Caption color="muted" data-testid="subject-matte-no-models">
                {modelsLoading
                  ? t("pass3_25.timeline.inspector.maskMatte.checkingProviders")
                  : modelsError
                    ? t(
                        "pass3_25.timeline.inspector.maskMatte.modelListLoadError"
                      )
                    : t("pass3_25.timeline.inspector.maskMatte.noProvider")}
              </Caption>
            )}

            {generating && (
              <FlexRow gap={SPACING.sm} align="center" sx={{ px: SPACING.xs }}>
                <LoadingSpinner size="small" />
                <Caption color="muted">
                  {t("pass3_25.timeline.inspector.maskMatte.cuttingSubject")}
                </Caption>
              </FlexRow>
            )}

            {!result && !generating && (
              <>
                {status === "failed" && (
                  <ErrorBanner report={failureReport}>
                    {matte?.error
                      ? t(
                          "pass3_25.timeline.inspector.maskMatte.lastRunFailedWithError",
                          { error: matte.error }
                        )
                      : t(
                          "pass3_25.timeline.inspector.maskMatte.lastRunFailed"
                        )}
                  </ErrorBanner>
                )}
                <EditorButton
                  fullWidth
                  variant="contained"
                  color="primary"
                  startIcon={<AutoAwesomeOutlinedIcon />}
                  onClick={handleIsolate}
                  disabled={!model}
                  data-testid="isolate-subject"
                >
                  {t("pass3_25.timeline.inspector.maskMatte.isolateSubject")}
                </EditorButton>
                <Caption color="muted">
                  {t("pass3_25.timeline.inspector.maskMatte.isolateHelp")}
                </Caption>
              </>
            )}

            {result && (
              <>
                <InspectorToggleRow
                  label={t("pass3_25.timeline.inspector.maskMatte.invert")}
                  checked={result.invert === true}
                  onChange={handleInvert}
                  disabled={generating}
                />
                <InspectorSliderRow
                  label={t("pass3_25.timeline.inspector.maskMatte.strength")}
                  value={result.strength ?? 1}
                  display={(result.strength ?? 1).toFixed(2)}
                  min={0}
                  max={1}
                  step={0.01}
                  disabled={generating}
                  onChange={handleStrength}
                  resetValue={1}
                />
                <InspectorRow
                  label={t("pass3_25.timeline.inspector.maskMatte.feather")}
                >
                  <InspectorPillInput
                    value={String(result.featherPx ?? 0)}
                    unit="px"
                    scrub={SCRUB_PX}
                    disabled={generating}
                    onCommit={handleFeather}
                    ariaLabel={t(
                      "pass3_25.timeline.inspector.maskMatte.subjectMatteFeather"
                    )}
                  />
                </InspectorRow>
                <InspectorRow
                  label={t("pass3_25.timeline.inspector.maskMatte.version")}
                >
                  <InspectorSelect
                    label={t(
                      "pass3_25.timeline.inspector.maskMatte.subjectMatteVersion"
                    )}
                    value={result.assetId}
                    options={versionOptions}
                    onChange={handleVersion}
                    disabled={generating}
                    grow
                  />
                </InspectorRow>

                {status === "failed" && (
                  <ErrorBanner
                    report={{
                      source: "job-failure",
                      summary: t(
                        "pass3_25.timeline.inspector.maskMatte.clipCutoutRerunFailed"
                      )
                    }}
                  >
                    {t("pass3_25.timeline.inspector.maskMatte.rerunFailed")}
                  </ErrorBanner>
                )}
                {stale && status !== "failed" && (
                  <Caption color="warning">
                    {t("pass3_25.timeline.inspector.maskMatte.staleResult")}
                  </Caption>
                )}

                <FlexRow gap={SPACING.xs} sx={{ px: SPACING.xs }}>
                  <EditorButton
                    fullWidth
                    variant="outlined"
                    startIcon={<RestartAltOutlinedIcon />}
                    disabled={generating}
                    onClick={handleRegenerate}
                    data-testid="regenerate-subject-matte"
                  >
                    {t("pass3_25.timeline.inspector.maskMatte.regenerate")}
                  </EditorButton>
                  <EditorButton
                    fullWidth
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteOutlineOutlinedIcon />}
                    disabled={generating}
                    onClick={handleRemove}
                    data-testid="remove-subject-matte"
                  >
                    {t("pass3_25.timeline.inspector.maskMatte.remove")}
                  </EditorButton>
                </FlexRow>
                <Caption color="muted">
                  {t("pass3_25.timeline.inspector.maskMatte.regenerateHelp")}
                </Caption>
              </>
            )}
          </FlexColumn>
        </CollapsibleSection>
      </>
    );
  }
);
SubjectMatteSection.displayName = "SubjectMatteSection";

/** Commit a 0..1 field, ignoring anything that is not a number in range. */
function commitUnit(raw: string, apply: (value: number) => void): void {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  apply(Math.min(1, Math.max(0, value)));
}

ClipMaskMatte.displayName = "ClipMaskMatte";
