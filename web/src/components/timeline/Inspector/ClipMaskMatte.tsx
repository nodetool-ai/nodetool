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
import {
  ISOLATE_SUBJECT_MODELS,
  type IsolateSubjectModel
} from "../../../utils/timelineIsolateSubject";
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
  InspectorToggleRow
} from "./InspectorPrimitives";
import { TextCommitField } from "./InspectorMotionFields";

const MASK_KINDS = [
  { value: "rect", label: "Rectangle" },
  { value: "ellipse", label: "Ellipse" },
  { value: "path", label: "Path" }
] as const;

const MATTE_MODES = [
  { value: "alpha", label: "Alpha" },
  { value: "luma", label: "Luma" }
] as const;

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

const SUBJECT_MODEL_OPTIONS = ISOLATE_SUBJECT_MODELS.map((model) => ({
  value: model,
  label: model
}));
const DEFAULT_SUBJECT_MODEL = ISOLATE_SUBJECT_MODELS[0];

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
        { value: NO_MATTE, label: "None" },
        ...clipNames.map((candidate) => ({
          value: candidate.id,
          label: candidate.name || candidate.id
        }))
      ],
      [clipNames]
    );

    const mask = clip.mask;
    const matte = clip.matte;

    return (
      <>
        <InspectorDivider />
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title="Mask"
              icon={<CropFreeOutlinedIcon />}
              checked={mask !== undefined}
              onCheckedChange={handleMaskEnabled}
            />
          }
          open={maskOpen}
          onToggle={setMaskOpen}
          unmountOnExit
        >
          <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
            {mask === undefined ? (
              <Caption color="muted">
                Enable the mask to cut this clip to a rectangle, an ellipse or
                an SVG path.
              </Caption>
            ) : (
              <>
                <InspectorRow label="Shape">
                  <InspectorSelect
                    label="Mask shape"
                    value={mask.kind}
                    options={MASK_KINDS}
                    onChange={handleMaskKindChange}
                  />
                </InspectorRow>
                {mask.kind === "path" ? (
                  <>
                    <InspectorRow label="Path">
                      <TextCommitField
                        value={mask.d ?? ""}
                        ariaLabel="Mask path data"
                        placeholder="M 0 0 L 1 0 L 1 1 Z"
                        onCommit={handleMaskPathCommit}
                      />
                    </InspectorRow>
                    <Caption color="muted">
                      SVG path data in normalized 0..1 space. M, L, C, Q and Z.
                    </Caption>
                  </>
                ) : (
                  <>
                    <InspectorRow label="Position">
                      <InspectorPillInput
                        value={(mask.x ?? 0).toFixed(2)}
                        minWidth={64}
                        scrub={SCRUB_UNIT}
                        onCommit={handleMaskXCommit}
                        ariaLabel="Mask X"
                      />
                      <InspectorPillInput
                        value={(mask.y ?? 0).toFixed(2)}
                        minWidth={64}
                        scrub={SCRUB_UNIT}
                        onCommit={handleMaskYCommit}
                        ariaLabel="Mask Y"
                      />
                    </InspectorRow>
                    <InspectorRow label="Size">
                      <InspectorPillInput
                        value={(mask.width ?? 1).toFixed(2)}
                        minWidth={64}
                        scrub={SCRUB_UNIT}
                        onCommit={handleMaskWidthCommit}
                        ariaLabel="Mask width"
                      />
                      <InspectorPillInput
                        value={(mask.height ?? 1).toFixed(2)}
                        minWidth={64}
                        scrub={SCRUB_UNIT}
                        onCommit={handleMaskHeightCommit}
                        ariaLabel="Mask height"
                      />
                    </InspectorRow>
                  </>
                )}
                <InspectorRow label="Feather">
                  <InspectorPillInput
                    value={String(mask.featherPx ?? 0)}
                    unit="px"
                    scrub={SCRUB_PX}
                    onCommit={handleMaskFeatherCommit}
                    ariaLabel="Mask feather"
                  />
                </InspectorRow>
                <InspectorToggleRow
                  label="Invert"
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
                  title="Matte"
                  icon={<FilterOutlinedIcon />}
                />
              }
              open={matteOpen}
              onToggle={setMatteOpen}
              unmountOnExit
            >
              <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
                <InspectorRow label="Source">
                  <InspectorSelect
                    label="Matte source clip"
                    value={matte?.sourceClipId ?? NO_MATTE}
                    options={sourceOptions}
                    onChange={handleMatteSourceChange}
                    grow
                  />
                </InspectorRow>
                {matte && (
                  <>
                    <InspectorRow label="Mode">
                      <InspectorSelect
                        label="Matte mode"
                        value={matte.mode}
                        options={MATTE_MODES}
                        onChange={handleMatteModeChange}
                      />
                    </InspectorRow>
                    <InspectorToggleRow
                      label="Invert"
                      checked={matte.invert === true}
                      onChange={handleMatteInvertChange}
                    />
                  </>
                )}
                <Caption color="muted">
                  The source clip drives this layer&apos;s alpha and stops
                  drawing itself.
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

/**
 * "Isolate subject": cut a matte from this clip's own source and dial in how
 * it reads. Four states — none, generating, ready and failed — because that is
 * what the clip's `generatedMatte.status` says, and each one offers only what
 * can be done in it.
 */
const SubjectMatteSection: React.FC<{ clip: TimelineClip }> = memo(
  ({ clip }) => {
    const [open, setOpen] = usePersistedFold("subjectMatte");
    const isolateSubject = useTimelineStore((s) => s.isolateSubject);
    const setKnobs = useTimelineStore((s) => s.setGeneratedMatteKnobs);
    const selectVersion = useTimelineStore(
      (s) => s.selectGeneratedMatteVersion
    );
    const clearMatte = useTimelineStore((s) => s.clearGeneratedMatte);

    const [model, setModel] = useState<IsolateSubjectModel>(
      DEFAULT_SUBJECT_MODEL
    );
    // Held between the click and the store's own `generating` mark, which only
    // lands after the document has been saved.
    const [pending, setPending] = useState(false);

    const clipRef = useRef(clip);
    clipRef.current = clip;

    const matte = clip.generatedMatte;
    const status = matte?.status ?? (matte ? "ready" : undefined);
    const generating = pending || status === "generating";
    // A failed first run leaves a marker carrying no mask, so there is a matte
    // record with nothing to dial in. Everything after this reads "is there a
    // result", not "is there a record".
    const result = matte && matte.assetId !== "" ? matte : undefined;
    const stale = isGeneratedMatteStale(clip);

    const run = useCallback(
      async (regenerate: boolean) => {
        setPending(true);
        try {
          await isolateSubject(clipRef.current.id, { model, regenerate });
        } catch {
          // The store reports every failure it can as a notification; there is
          // nothing left for this button to say.
        } finally {
          setPending(false);
        }
      },
      [isolateSubject, model]
    );

    const handleModelChange = useCallback((value: string) => {
      const picked = ISOLATE_SUBJECT_MODELS.find((name) => name === value);
      if (picked) setModel(picked);
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
        { value: result.assetId, label: "Current" },
        ...stored.map((version) => ({
          value: version.assetId,
          label: versionLabel(version.createdAt)
        }))
      ];
    }, [result]);

    return (
      <>
        <InspectorDivider />
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title="Subject matte"
              icon={<PersonOutlineOutlinedIcon />}
            />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
            <InspectorRow label="Model">
              <InspectorSelect
                label="Subject matte model"
                value={model}
                options={SUBJECT_MODEL_OPTIONS}
                onChange={handleModelChange}
                disabled={generating}
                grow
              />
            </InspectorRow>

            {generating && (
              <FlexRow gap={SPACING.sm} align="center" sx={{ px: SPACING.xs }}>
                <LoadingSpinner size="small" />
                <Caption color="muted">Cutting the subject out…</Caption>
              </FlexRow>
            )}

            {!result && !generating && (
              <>
                {status === "failed" && (
                  <Caption color="error">
                    The last run failed. Nothing was cut — try again.
                  </Caption>
                )}
                <EditorButton
                  fullWidth
                  variant="contained"
                  color="primary"
                  startIcon={<AutoAwesomeOutlinedIcon />}
                  onClick={handleIsolate}
                  data-testid="isolate-subject"
                >
                  Isolate subject
                </EditorButton>
                <Caption color="muted">
                  Cuts a mask from this clip&apos;s own source, so it stays
                  aligned through every trim and split.
                </Caption>
              </>
            )}

            {result && (
              <>
                <InspectorToggleRow
                  label="Invert"
                  checked={result.invert === true}
                  onChange={handleInvert}
                  disabled={generating}
                />
                <InspectorSliderRow
                  label="Strength"
                  value={result.strength ?? 1}
                  display={(result.strength ?? 1).toFixed(2)}
                  min={0}
                  max={1}
                  step={0.01}
                  disabled={generating}
                  onChange={handleStrength}
                />
                <InspectorRow label="Feather">
                  <InspectorPillInput
                    value={String(result.featherPx ?? 0)}
                    unit="px"
                    scrub={SCRUB_PX}
                    disabled={generating}
                    onCommit={handleFeather}
                    ariaLabel="Subject matte feather"
                  />
                </InspectorRow>
                <InspectorRow label="Version">
                  <InspectorSelect
                    label="Subject matte version"
                    value={result.assetId}
                    options={versionOptions}
                    onChange={handleVersion}
                    disabled={generating}
                    grow
                  />
                </InspectorRow>

                {status === "failed" && (
                  <Caption color="error">
                    The last run failed. The result before it is still in use.
                  </Caption>
                )}
                {stale && status !== "failed" && (
                  <Caption color="warning">
                    The clip has moved past what this matte covers. Regenerate
                    to cut it again.
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
                    Regenerate
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
                    Remove
                  </EditorButton>
                </FlexRow>
                <Caption color="muted">
                  Regenerate runs the model again and keeps this result as a
                  version.
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
