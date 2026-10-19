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
import { useTranslation } from "react-i18next";
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
  BatchedColorInput
} from "../../ui_primitives";
import { usePersistedFold } from "./usePersistedFold";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSelect,
  InspectorSliderRow,
  INSPECTOR_SECTION_CONTENT_SX
} from "./InspectorPrimitives";
import { FillFields, TextCommitField } from "./InspectorMotionFields";
import {
  formatNumberList,
  parseFiniteNumber,
  parseNumberList
} from "./InspectorPrimitives.helpers";

const SCRUB_UNIT = { step: 0.01 };
const SCRUB_PX = { step: 1, min: 0 };
const SCRUB_COUNT = { step: 1, min: 3 };


interface ClipShapeSectionProps {
  clip: TimelineClip;
  shapeStyle: ClipShapeStyle;
}

export const ClipShapeSection: React.FC<ClipShapeSectionProps> = memo(
  ({ clip, shapeStyle }) => {
    const { t } = useTranslation();
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

    // A stable callback per field, so an edit re-renders only the field whose
    // value changed rather than every memoized control in the section.
    const handleKindChange = useCallback(
      (value: string) => patchShape({ kind: value as ClipShapeKind }),
      [patchShape]
    );
    const handleXCommit = useCallback(
      (raw: string) => commitNumber(raw, (x) => patchShape({ x })),
      [patchShape]
    );
    const handleYCommit = useCallback(
      (raw: string) => commitNumber(raw, (y) => patchShape({ y })),
      [patchShape]
    );
    const handleWidthCommit = useCallback(
      (raw: string) => commitNumber(raw, (width) => patchShape({ width }), 0),
      [patchShape]
    );
    const handleHeightCommit = useCallback(
      (raw: string) => commitNumber(raw, (height) => patchShape({ height }), 0),
      [patchShape]
    );
    const handleX2Commit = useCallback(
      (raw: string) => commitNumber(raw, (x2) => patchShape({ x2 })),
      [patchShape]
    );
    const handleY2Commit = useCallback(
      (raw: string) => commitNumber(raw, (y2) => patchShape({ y2 })),
      [patchShape]
    );
    const handlePathCommit = useCallback(
      (d: string) => patchShape({ d: d.trim() || undefined }),
      [patchShape]
    );
    const handleSidesCommit = useCallback(
      (raw: string) => {
        const parsed = parseFiniteNumber(raw);
        if (parsed === null) return;
        const sides = Math.round(parsed);
        if (sides < 3) return;
        patchShape({ sides });
      },
      [patchShape]
    );
    const handleInnerRadiusChange = useCallback(
      (innerRadius: number) => patchShape({ innerRadius }),
      [patchShape]
    );
    const handleCornerRadiusCommit = useCallback(
      (raw: string) =>
        commitNumber(raw, (cornerRadius) => patchShape({ cornerRadius }), 0),
      [patchShape]
    );
    const handleFillColorChange = useCallback(
      (fill: string) => patchShape({ fill }),
      [patchShape]
    );
    const handleStrokeColorChange = useCallback(
      (stroke: string) => patchShape({ stroke }),
      [patchShape]
    );
    const handleStrokeWidthCommit = useCallback(
      (raw: string) => {
        const strokeWidthPx = parseFiniteNumber(raw);
        if (strokeWidthPx === null || strokeWidthPx < 0) return;
        patchShape({ strokeWidthPx });
      },
      [patchShape]
    );
    const handleDashCommit = useCallback(
      (raw: string) => {
        const dash = parseNumberList(raw);
        if (dash === null) return;
        patchShape({ dash: dash.length === 0 ? undefined : dash });
      },
      [patchShape]
    );
    const handleLineCapChange = useCallback(
      (lineCap: string) =>
        patchShape({ lineCap: lineCap as ClipShapeStyle["lineCap"] }),
      [patchShape]
    );
    const handleLineJoinChange = useCallback(
      (lineJoin: string) =>
        patchShape({ lineJoin: lineJoin as ClipShapeStyle["lineJoin"] }),
      [patchShape]
    );
    const handleTrimStartChange = useCallback(
      (trimStart: number) => patchShape({ trimStart }),
      [patchShape]
    );
    const handleTrimEndChange = useCallback(
      (trimEnd: number) => patchShape({ trimEnd }),
      [patchShape]
    );

    const kind = shapeStyle.kind;
    const isLine = kind === "line";
    const isPath = kind === "path";
    const hasSides = kind === "polygon" || kind === "star";
    const hasBounds = !isLine && !isPath;
    const shapeKinds = [
      { value: "rect", label: t("pass3_26.timelineInspector.shape.kinds.rectangle") },
      { value: "ellipse", label: t("pass3_26.timelineInspector.shape.kinds.ellipse") },
      { value: "line", label: t("pass3_26.timelineInspector.shape.kinds.line") },
      { value: "path", label: t("pass3_26.timelineInspector.shape.kinds.path") },
      { value: "polygon", label: t("pass3_26.timelineInspector.shape.kinds.polygon") },
      { value: "star", label: t("pass3_26.timelineInspector.shape.kinds.star") }
    ];
    const lineCaps = [
      { value: "butt", label: t("pass3_26.timelineInspector.shape.lineCaps.butt") },
      { value: "round", label: t("pass3_26.timelineInspector.shape.lineCaps.round") },
      { value: "square", label: t("pass3_26.timelineInspector.shape.lineCaps.square") }
    ];
    const lineJoins = [
      { value: "miter", label: t("pass3_26.timelineInspector.shape.lineJoins.miter") },
      { value: "round", label: t("pass3_26.timelineInspector.shape.lineJoins.round") },
      { value: "bevel", label: t("pass3_26.timelineInspector.shape.lineJoins.bevel") }
    ];

    return (
      <>
        <CollapsibleSection
          title={
            <InspectorSectionTitle
              title={t("pass3_26.timelineInspector.shape.title")}
              icon={<CategoryOutlinedIcon />}
            />
          }
          open={open}
          onToggle={setOpen}
          unmountOnExit
        >
          <FlexColumn sx={INSPECTOR_SECTION_CONTENT_SX}>
            <InspectorRow label={t("pass3_26.timelineInspector.shape.kind")}>
              <InspectorSelect
                label={t("pass3_26.timelineInspector.shape.kindLabel")}
                value={kind}
                options={shapeKinds}
                onChange={handleKindChange}
              />
            </InspectorRow>

            {hasBounds && (
              <>
                <InspectorRow label={t("pass3_26.timelineInspector.shape.position")}>
                  <InspectorPillInput
                    value={(shapeStyle.x ?? 0).toFixed(2)}
                    minWidth={64}
                    scrub={SCRUB_UNIT}
                    onCommit={handleXCommit}
                    ariaLabel={t("pass3_26.timelineInspector.shape.x")}
                  />
                  <InspectorPillInput
                    value={(shapeStyle.y ?? 0).toFixed(2)}
                    minWidth={64}
                    scrub={SCRUB_UNIT}
                    onCommit={handleYCommit}
                    ariaLabel={t("pass3_26.timelineInspector.shape.y")}
                  />
                </InspectorRow>
                <InspectorRow label={t("pass3_26.timelineInspector.shape.size")}>
                  <InspectorPillInput
                    value={(shapeStyle.width ?? 0).toFixed(2)}
                    minWidth={64}
                    scrub={SCRUB_UNIT}
                    onCommit={handleWidthCommit}
                    ariaLabel={t("pass3_26.timelineInspector.shape.width")}
                  />
                  <InspectorPillInput
                    value={(shapeStyle.height ?? 0).toFixed(2)}
                    minWidth={64}
                    scrub={SCRUB_UNIT}
                    onCommit={handleHeightCommit}
                    ariaLabel={t("pass3_26.timelineInspector.shape.height")}
                  />
                </InspectorRow>
              </>
            )}

            {isLine && (
              <>
                <InspectorRow label={t("pass3_26.timelineInspector.shape.start")}>
                  <InspectorPillInput
                    value={(shapeStyle.x ?? 0).toFixed(2)}
                    minWidth={64}
                    scrub={SCRUB_UNIT}
                    onCommit={handleXCommit}
                    ariaLabel={t("pass3_26.timelineInspector.shape.lineStartX")}
                  />
                  <InspectorPillInput
                    value={(shapeStyle.y ?? 0).toFixed(2)}
                    minWidth={64}
                    scrub={SCRUB_UNIT}
                    onCommit={handleYCommit}
                    ariaLabel={t("pass3_26.timelineInspector.shape.lineStartY")}
                  />
                </InspectorRow>
                <InspectorRow label={t("pass3_26.timelineInspector.shape.end")}>
                  <InspectorPillInput
                    value={(shapeStyle.x2 ?? 0).toFixed(2)}
                    minWidth={64}
                    scrub={SCRUB_UNIT}
                    onCommit={handleX2Commit}
                    ariaLabel={t("pass3_26.timelineInspector.shape.lineEndX")}
                  />
                  <InspectorPillInput
                    value={(shapeStyle.y2 ?? 0).toFixed(2)}
                    minWidth={64}
                    scrub={SCRUB_UNIT}
                    onCommit={handleY2Commit}
                    ariaLabel={t("pass3_26.timelineInspector.shape.lineEndY")}
                  />
                </InspectorRow>
              </>
            )}

            {isPath && (
              <>
                <InspectorRow label={t("pass3_26.timelineInspector.shape.path")}>
                  <TextCommitField
                    value={shapeStyle.d ?? ""}
                    ariaLabel={t("pass3_26.timelineInspector.shape.pathData")}
                    placeholder={t("pass3_26.timelineInspector.shape.pathPlaceholder")}
                    onCommit={handlePathCommit}
                  />
                </InspectorRow>
                <Caption color="muted">
                  {t("pass3_26.timelineInspector.shape.pathHelp")}
                </Caption>
              </>
            )}

            {hasSides && (
              <InspectorRow label={t("pass3_26.timelineInspector.shape.points")}>
                <InspectorPillInput
                  value={String(shapeStyle.sides ?? 5)}
                  scrub={SCRUB_COUNT}
                  onCommit={handleSidesCommit}
                  ariaLabel={t("pass3_26.timelineInspector.shape.pointCount")}
                />
              </InspectorRow>
            )}

            {kind === "star" && (
              <InspectorSliderRow
                label={t("pass3_26.timelineInspector.shape.innerRadius")}
                min={0}
                max={1}
                step={0.01}
                value={shapeStyle.innerRadius ?? 0.5}
                display={(shapeStyle.innerRadius ?? 0.5).toFixed(2)}
                onChange={handleInnerRadiusChange}
                resetValue={0.5}
              />
            )}

            {kind === "rect" && (
              <InspectorRow label={t("pass3_26.timelineInspector.shape.cornerRadius")}>
                <InspectorPillInput
                  value={(shapeStyle.cornerRadius ?? 0).toFixed(3)}
                  scrub={SCRUB_UNIT}
                  onCommit={handleCornerRadiusCommit}
                  ariaLabel={t("pass3_26.timelineInspector.shape.cornerRadius")}
                />
              </InspectorRow>
            )}

            <InspectorRow label={t("pass3_26.timelineInspector.shape.fillColor")}>
              <BatchedColorInput
                value={typeof shapeStyle.fill === "string" ? shapeStyle.fill : "#ffffff"}
                onChange={handleFillColorChange}
                ariaLabel={t("pass3_26.timelineInspector.shape.fillColor")}
              />
            </InspectorRow>
            <FillFields
              fill={shapeStyle.fillStyle}
              labelPrefix={t("pass3_26.timelineInspector.shape.fill")}
              onChange={handleFillStyleChange}
            />

            <InspectorRow label={t("pass3_26.timelineInspector.shape.strokeColor")}>
              <BatchedColorInput
                value={shapeStyle.stroke ?? "#000000"}
                onChange={handleStrokeColorChange}
                ariaLabel={t("pass3_26.timelineInspector.shape.strokeColor")}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_26.timelineInspector.shape.strokeWidth")}>
              <InspectorPillInput
                value={String(shapeStyle.strokeWidthPx ?? 0)}
                unit="px"
                scrub={SCRUB_PX}
                onCommit={handleStrokeWidthCommit}
                ariaLabel={t("pass3_26.timelineInspector.shape.strokeWidth")}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_26.timelineInspector.shape.dash")}>
              <TextCommitField
                value={formatNumberList(shapeStyle.dash)}
                ariaLabel={t("pass3_26.timelineInspector.shape.dashPattern")}
                placeholder={t("pass3_26.timelineInspector.shape.dashPlaceholder")}
                onCommit={handleDashCommit}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_26.timelineInspector.shape.cap")}>
              <InspectorSelect
                label={t("pass3_26.timelineInspector.shape.lineCapLabel")}
                value={shapeStyle.lineCap ?? "butt"}
                options={lineCaps}
                onChange={handleLineCapChange}
              />
            </InspectorRow>
            <InspectorRow label={t("pass3_26.timelineInspector.shape.join")}>
              <InspectorSelect
                label={t("pass3_26.timelineInspector.shape.lineJoinLabel")}
                value={shapeStyle.lineJoin ?? "miter"}
                options={lineJoins}
                onChange={handleLineJoinChange}
              />
            </InspectorRow>
            <InspectorSliderRow
              label={t("pass3_26.timelineInspector.shape.trimStart")}
              min={0}
              max={1}
              step={0.01}
              value={shapeStyle.trimStart ?? 0}
              display={(shapeStyle.trimStart ?? 0).toFixed(2)}
              onChange={handleTrimStartChange}
              origin={0}
            />
            <InspectorSliderRow
              label={t("pass3_26.timelineInspector.shape.trimEnd")}
              min={0}
              max={1}
              step={0.01}
              value={shapeStyle.trimEnd ?? 1}
              display={(shapeStyle.trimEnd ?? 1).toFixed(2)}
              onChange={handleTrimEndChange}
              resetValue={1}
            />
          </FlexColumn>
        </CollapsibleSection>
        <InspectorDivider />
      </>
    );
  }
);

/** Commit a numeric field, ignoring blank, non-numeric or out-of-range input. */
function commitNumber(
  raw: string,
  apply: (value: number) => void,
  min?: number,
  exclusiveMin = false
): void {
  const value = parseFiniteNumber(raw);
  if (value === null) return;
  if (min !== undefined && (exclusiveMin ? value <= min : value < min)) return;
  apply(value);
}

ClipShapeSection.displayName = "ClipShapeSection";
