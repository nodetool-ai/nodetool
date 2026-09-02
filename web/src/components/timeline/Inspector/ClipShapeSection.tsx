/**
 * Shape section: everything `ClipShapeStyle` carries (T16).
 *
 * The geometry fields a shape shows depend on its kind — a line has two
 * endpoints and no size, a path has data, a polygon and a star have a point
 * count — so the section renders per kind rather than showing every field
 * greyed out. Coordinates are normalized 0..1 against the frame, the way the
 * rasterizer reads them.
 */

import React, { memo, useCallback, useRef } from "react";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import type {
  ClipShapeKind,
  ClipShapeStyle,
  ShapeFill,
  TimelineClip
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  Caption,
  CollapsibleSection,
  FlexColumn,
  SPACING,
  TextInput
} from "../../ui_primitives";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSelect,
  InspectorSliderRow
} from "./InspectorPrimitives";
import { FillFields, TextCommitField } from "./InspectorMotionFields";
import {
  formatNumberList,
  parseNumberList
} from "./InspectorPrimitives.helpers";

const SHAPE_KINDS = [
  { value: "rect", label: "Rectangle" },
  { value: "ellipse", label: "Ellipse" },
  { value: "line", label: "Line" },
  { value: "path", label: "Path" },
  { value: "polygon", label: "Polygon" },
  { value: "star", label: "Star" }
] as const;

const LINE_CAPS = [
  { value: "butt", label: "Butt" },
  { value: "round", label: "Round" },
  { value: "square", label: "Square" }
] as const;

const LINE_JOINS = [
  { value: "miter", label: "Miter" },
  { value: "round", label: "Round" },
  { value: "bevel", label: "Bevel" }
] as const;

const SCRUB_UNIT = { step: 0.01 };
const SCRUB_PX = { step: 1, min: 0 };
const SCRUB_COUNT = { step: 1, min: 3 };

interface ClipShapeSectionProps {
  clip: TimelineClip;
  shapeStyle: ClipShapeStyle;
}

export const ClipShapeSection: React.FC<ClipShapeSectionProps> = memo(
  ({ clip, shapeStyle }) => {
    const patchClip = useTimelineStore((s) => s.patchClip);
    const [open, setOpen] = usePersistedFold("shape");

    const styleRef = useRef(shapeStyle);
    styleRef.current = shapeStyle;
    const clipIdRef = useRef(clip.id);
    clipIdRef.current = clip.id;

    const patchShape = useCallback(
      (patch: Partial<ClipShapeStyle>) => {
        patchClip(clipIdRef.current, {
          shapeStyle: { ...styleRef.current, ...patch }
        });
      },
      [patchClip]
    );

    const handleFillStyleChange = useCallback(
      (fillStyle: ShapeFill | undefined) => patchShape({ fillStyle }),
      [patchShape]
    );

    const kind = shapeStyle.kind;
    const isLine = kind === "line";
    const isPath = kind === "path";
    const hasSides = kind === "polygon" || kind === "star";
    const hasBounds = !isLine && !isPath;

    return (
      <>
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title="Shape"
              icon={<CategoryOutlinedIcon />}
            />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn gap={SPACING.xs} sx={{ py: SPACING.xs }}>
            <InspectorRow label="Kind">
              <InspectorSelect
                label="Shape kind"
                value={kind}
                options={SHAPE_KINDS}
                onChange={(value) =>
                  patchShape({ kind: value as ClipShapeKind })
                }
              />
            </InspectorRow>

            {hasBounds && (
              <>
                <InspectorRow label="Position">
                  <InspectorPillInput
                    value={(shapeStyle.x ?? 0).toFixed(2)}
                    minWidth={64}
                    scrub={SCRUB_UNIT}
                    onCommit={(raw) =>
                      commitNumber(raw, (x) => patchShape({ x }))
                    }
                    ariaLabel="Shape X"
                  />
                  <InspectorPillInput
                    value={(shapeStyle.y ?? 0).toFixed(2)}
                    minWidth={64}
                    scrub={SCRUB_UNIT}
                    onCommit={(raw) =>
                      commitNumber(raw, (y) => patchShape({ y }))
                    }
                    ariaLabel="Shape Y"
                  />
                </InspectorRow>
                <InspectorRow label="Size">
                  <InspectorPillInput
                    value={(shapeStyle.width ?? 0).toFixed(2)}
                    minWidth={64}
                    scrub={SCRUB_UNIT}
                    onCommit={(raw) =>
                      commitNumber(raw, (width) => patchShape({ width }))
                    }
                    ariaLabel="Shape width"
                  />
                  <InspectorPillInput
                    value={(shapeStyle.height ?? 0).toFixed(2)}
                    minWidth={64}
                    scrub={SCRUB_UNIT}
                    onCommit={(raw) =>
                      commitNumber(raw, (height) => patchShape({ height }))
                    }
                    ariaLabel="Shape height"
                  />
                </InspectorRow>
              </>
            )}

            {isLine && (
              <>
                <InspectorRow label="Start">
                  <InspectorPillInput
                    value={(shapeStyle.x ?? 0).toFixed(2)}
                    minWidth={64}
                    scrub={SCRUB_UNIT}
                    onCommit={(raw) =>
                      commitNumber(raw, (x) => patchShape({ x }))
                    }
                    ariaLabel="Line start X"
                  />
                  <InspectorPillInput
                    value={(shapeStyle.y ?? 0).toFixed(2)}
                    minWidth={64}
                    scrub={SCRUB_UNIT}
                    onCommit={(raw) =>
                      commitNumber(raw, (y) => patchShape({ y }))
                    }
                    ariaLabel="Line start Y"
                  />
                </InspectorRow>
                <InspectorRow label="End">
                  <InspectorPillInput
                    value={(shapeStyle.x2 ?? 0).toFixed(2)}
                    minWidth={64}
                    scrub={SCRUB_UNIT}
                    onCommit={(raw) =>
                      commitNumber(raw, (x2) => patchShape({ x2 }))
                    }
                    ariaLabel="Line end X"
                  />
                  <InspectorPillInput
                    value={(shapeStyle.y2 ?? 0).toFixed(2)}
                    minWidth={64}
                    scrub={SCRUB_UNIT}
                    onCommit={(raw) =>
                      commitNumber(raw, (y2) => patchShape({ y2 }))
                    }
                    ariaLabel="Line end Y"
                  />
                </InspectorRow>
              </>
            )}

            {isPath && (
              <>
                <InspectorRow label="Path">
                  <TextCommitField
                    value={shapeStyle.d ?? ""}
                    ariaLabel="Shape path data"
                    placeholder="M 0 0 L 1 0 L 1 1 Z"
                    onCommit={(d) => patchShape({ d: d.trim() || undefined })}
                  />
                </InspectorRow>
                <Caption color="muted">
                  SVG path data in normalized 0..1 space. M, L, C, Q and Z.
                </Caption>
              </>
            )}

            {hasSides && (
              <InspectorRow label="Points">
                <InspectorPillInput
                  value={String(shapeStyle.sides ?? 5)}
                  scrub={SCRUB_COUNT}
                  onCommit={(raw) => {
                    const sides = Math.round(Number(raw));
                    if (!Number.isFinite(sides) || sides < 3) return;
                    patchShape({ sides });
                  }}
                  ariaLabel="Shape point count"
                />
              </InspectorRow>
            )}

            {kind === "star" && (
              <InspectorSliderRow
                label="Inner radius"
                min={0}
                max={1}
                step={0.01}
                value={shapeStyle.innerRadius ?? 0.5}
                display={(shapeStyle.innerRadius ?? 0.5).toFixed(2)}
                onChange={(innerRadius) => patchShape({ innerRadius })}
              />
            )}

            {kind === "rect" && (
              <InspectorRow label="Corner radius">
                <InspectorPillInput
                  value={(shapeStyle.cornerRadius ?? 0).toFixed(3)}
                  scrub={SCRUB_UNIT}
                  onCommit={(raw) =>
                    commitNumber(raw, (cornerRadius) =>
                      patchShape({ cornerRadius })
                    )
                  }
                  ariaLabel="Shape corner radius"
                />
              </InspectorRow>
            )}

            <InspectorRow label="Fill color">
              <TextInput
                type="color"
                value={shapeStyle.fill ?? "#ffffff"}
                onChange={(event) => patchShape({ fill: event.target.value })}
                inputProps={{ "aria-label": "Shape fill color" }}
              />
            </InspectorRow>
            <FillFields
              fill={shapeStyle.fillStyle}
              labelPrefix="Shape fill"
              onChange={handleFillStyleChange}
            />

            <InspectorRow label="Stroke color">
              <TextInput
                type="color"
                value={shapeStyle.stroke ?? "#000000"}
                onChange={(event) => patchShape({ stroke: event.target.value })}
                inputProps={{ "aria-label": "Shape stroke color" }}
              />
            </InspectorRow>
            <InspectorRow label="Stroke width">
              <InspectorPillInput
                value={String(shapeStyle.strokeWidthPx ?? 0)}
                unit="px"
                scrub={SCRUB_PX}
                onCommit={(raw) => {
                  const strokeWidthPx = Number(raw);
                  if (!Number.isFinite(strokeWidthPx) || strokeWidthPx < 0) {
                    return;
                  }
                  patchShape({ strokeWidthPx });
                }}
                ariaLabel="Shape stroke width"
              />
            </InspectorRow>
            <InspectorRow label="Dash">
              <TextCommitField
                value={formatNumberList(shapeStyle.dash)}
                ariaLabel="Shape dash pattern"
                placeholder="0.02, 0.01"
                onCommit={(raw) => {
                  const dash = parseNumberList(raw);
                  if (dash === null) return;
                  patchShape({ dash: dash.length === 0 ? undefined : dash });
                }}
              />
            </InspectorRow>
            <InspectorRow label="Cap">
              <InspectorSelect
                label="Shape line cap"
                value={shapeStyle.lineCap ?? "butt"}
                options={LINE_CAPS}
                onChange={(lineCap) => patchShape({ lineCap })}
              />
            </InspectorRow>
            <InspectorRow label="Join">
              <InspectorSelect
                label="Shape line join"
                value={shapeStyle.lineJoin ?? "miter"}
                options={LINE_JOINS}
                onChange={(lineJoin) => patchShape({ lineJoin })}
              />
            </InspectorRow>
            <InspectorSliderRow
              label="Trim start"
              min={0}
              max={1}
              step={0.01}
              value={shapeStyle.trimStart ?? 0}
              display={(shapeStyle.trimStart ?? 0).toFixed(2)}
              onChange={(trimStart) => patchShape({ trimStart })}
            />
            <InspectorSliderRow
              label="Trim end"
              min={0}
              max={1}
              step={0.01}
              value={shapeStyle.trimEnd ?? 1}
              display={(shapeStyle.trimEnd ?? 1).toFixed(2)}
              onChange={(trimEnd) => patchShape({ trimEnd })}
            />
          </FlexColumn>
        </CollapsibleSection>
        <InspectorDivider />
      </>
    );
  }
);

/** Commit a numeric field, ignoring anything that does not parse. */
function commitNumber(raw: string, apply: (value: number) => void): void {
  const value = Number(raw);
  if (Number.isFinite(value)) apply(value);
}

ClipShapeSection.displayName = "ClipShapeSection";
