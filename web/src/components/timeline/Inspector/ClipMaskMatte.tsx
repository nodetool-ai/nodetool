/**
 * Mask and matte sections (D6).
 *
 * A mask is a shape in the layer's own normalized 0..1 space, so it rotates
 * and scales with the clip. A matte names another clip whose pixels drive this
 * layer's alpha; that source stops drawing itself, which is why the picker
 * lists every other clip in the sequence rather than only the ones on
 * neighbouring tracks.
 *
 * Both fields are absent-or-present rather than enabled/disabled, so the
 * section header's activation checkbox adds the field with defaults and
 * removes it again.
 */

import React, { memo, useCallback, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import CropFreeOutlinedIcon from "@mui/icons-material/CropFreeOutlined";
import FilterOutlinedIcon from "@mui/icons-material/FilterOutlined";
import type { ClipMask, ClipMatte, TimelineClip } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  Caption,
  CollapsibleSection,
  FlexColumn,
  SPACING
} from "../../ui_primitives";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSelect,
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

interface ClipMaskMatteProps {
  clip: TimelineClip;
}

export const ClipMaskMatte: React.FC<ClipMaskMatteProps> = memo(({ clip }) => {
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
              Enable the mask to cut this clip to a rectangle, an ellipse or an
              SVG path.
            </Caption>
          ) : (
            <>
              <InspectorRow label="Shape">
                <InspectorSelect
                  label="Mask shape"
                  value={mask.kind}
                  options={MASK_KINDS}
                  onChange={(kind) => patchMask({ kind })}
                />
              </InspectorRow>
              {mask.kind === "path" ? (
                <>
                  <InspectorRow label="Path">
                    <TextCommitField
                      value={mask.d ?? ""}
                      ariaLabel="Mask path data"
                      placeholder="M 0 0 L 1 0 L 1 1 Z"
                      onCommit={(d) => patchMask({ d: d.trim() || undefined })}
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
                      onCommit={(raw) => commitUnit(raw, (x) => patchMask({ x }))}
                      ariaLabel="Mask X"
                    />
                    <InspectorPillInput
                      value={(mask.y ?? 0).toFixed(2)}
                      minWidth={64}
                      scrub={SCRUB_UNIT}
                      onCommit={(raw) => commitUnit(raw, (y) => patchMask({ y }))}
                      ariaLabel="Mask Y"
                    />
                  </InspectorRow>
                  <InspectorRow label="Size">
                    <InspectorPillInput
                      value={(mask.width ?? 1).toFixed(2)}
                      minWidth={64}
                      scrub={SCRUB_UNIT}
                      onCommit={(raw) =>
                        commitUnit(raw, (width) => patchMask({ width }))
                      }
                      ariaLabel="Mask width"
                    />
                    <InspectorPillInput
                      value={(mask.height ?? 1).toFixed(2)}
                      minWidth={64}
                      scrub={SCRUB_UNIT}
                      onCommit={(raw) =>
                        commitUnit(raw, (height) => patchMask({ height }))
                      }
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
                  onCommit={(raw) => {
                    const featherPx = Number(raw);
                    if (!Number.isFinite(featherPx) || featherPx < 0) return;
                    patchMask({ featherPx });
                  }}
                  ariaLabel="Mask feather"
                />
              </InspectorRow>
              <InspectorToggleRow
                label="Invert"
                checked={mask.invert === true}
                onChange={(invert) => patchMask({ invert })}
              />
            </>
          )}
        </FlexColumn>
      </CollapsibleSection>

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
                  onChange={(mode) => patchMatte({ mode })}
                />
              </InspectorRow>
              <InspectorToggleRow
                label="Invert"
                checked={matte.invert === true}
                onChange={(invert) => patchMatte({ invert })}
              />
            </>
          )}
          <Caption color="muted">
            The source clip drives this layer&apos;s alpha and stops drawing
            itself.
          </Caption>
        </FlexColumn>
      </CollapsibleSection>
    </>
  );
});

/** Commit a 0..1 field, ignoring anything that is not a number in range. */
function commitUnit(raw: string, apply: (value: number) => void): void {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  apply(Math.min(1, Math.max(0, value)));
}

ClipMaskMatte.displayName = "ClipMaskMatte";
