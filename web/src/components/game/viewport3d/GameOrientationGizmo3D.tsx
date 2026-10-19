import { useSyncExternalStore, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Quaternion, Vector3 } from "three";
import ThreeDRotationOutlinedIcon from "@mui/icons-material/ThreeDRotationOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import type { GameAxisView3D } from "../../../stores/game/gameGizmo3D";
import { BORDER_RADIUS, Box, CONTROL, FlexColumn, SPACING, ToolbarIconButton, TYPOGRAPHY } from "../../ui_primitives";

/** The editor camera's orientation, published outside React so orbiting does not re-render the viewport. */
export interface GameCameraOrientation3D {
  readonly subscribe: (listener: () => void) => () => void;
  readonly get: () => readonly [number, number, number, number];
  readonly set: (quaternion: Quaternion) => void;
}

export function createGameCameraOrientation3D(): GameCameraOrientation3D {
  let value: readonly [number, number, number, number] = [0, 0, 0, 1];
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    get: () => value,
    set(quaternion) {
      const next = [quaternion.x, quaternion.y, quaternion.z, quaternion.w] as const;
      if (next.every((component, index) => Math.abs(component - value[index]) < 1e-6)) { return; }
      value = next;
      for (const listener of listeners) { listener(); }
    }
  };
}

const RADIUS = 28;
const AXES: readonly { readonly view: GameAxisView3D; readonly opposite: GameAxisView3D; readonly label: string;
  readonly direction: readonly [number, number, number]; readonly className: string }[] = [
  { view: "right", opposite: "left", label: "X", direction: [1, 0, 0], className: "axis-x" },
  { view: "top", opposite: "bottom", label: "Y", direction: [0, 1, 0], className: "axis-y" },
  { view: "front", opposite: "back", label: "Z", direction: [0, 0, 1], className: "axis-z" }
];
const VIEW_NAMES: Readonly<Record<GameAxisView3D, string>> = {
  right: "right", left: "left", top: "top", bottom: "bottom", front: "front", back: "back"
};

interface GameOrientationGizmo3DProps {
  readonly orientation: GameCameraOrientation3D;
  readonly orthographic: boolean;
  readonly onView: (view: GameAxisView3D) => void;
  readonly onToggleProjection: () => void;
  readonly projectionShortcut?: string[];
}

/** Scene orientation gizmo: shows the world axes as the camera sees them. Each axis end selects the view along it. */
export default function GameOrientationGizmo3D({ orientation, orthographic, onView, onToggleProjection, projectionShortcut }: GameOrientationGizmo3DProps) {
  const { t } = useTranslation();
  const [x, y, z, w] = useSyncExternalStore(orientation.subscribe, orientation.get);
  const inverse = new Quaternion(x, y, z, w).invert();
  const ends = AXES.flatMap((axis) => {
    const projected = new Vector3(...axis.direction).applyQuaternion(inverse);
    return [
      { view: axis.view, label: axis.label, className: axis.className, positive: true, x: projected.x * RADIUS, y: -projected.y * RADIUS, depth: projected.z },
      { view: axis.opposite, label: axis.label, className: axis.className, positive: false, x: -projected.x * RADIUS, y: projected.y * RADIUS, depth: -projected.z }
    ];
  }).sort((left, right) => left.depth - right.depth);
  const activate = (view: GameAxisView3D) => (event: KeyboardEvent<SVGGElement>): void => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onView(view); }
  };
  const size = CONTROL.height.xl * 2;
  return <FlexColumn align="center" gap={SPACING.micro} sx={{ position: "absolute", top: SPACING.md, right: SPACING.md,
    p: SPACING.micro, borderRadius: BORDER_RADIUS.md, bgcolor: "background.paper" }}>
    <Box component="svg" role="group" aria-label={t("screen_game.viewport.sceneOrientation")} viewBox="-40 -40 80 80" width={size} height={size}
      sx={(theme) => ({ display: "block", overflow: "visible",
        "& text": { ...TYPOGRAPHY.sans.caption, pointerEvents: "none", userSelect: "none" },
        // Each label uses its palette colour's contrast text, so it stays readable on the axis colour in both themes.
        "& .axis-x": { color: theme.vars.palette.error.main, "& text": { fill: theme.vars.palette.error.contrastText } },
        "& .axis-y": { color: theme.vars.palette.success.main, "& text": { fill: theme.vars.palette.success.contrastText } },
        "& .axis-z": { color: theme.vars.palette.info.main, "& text": { fill: theme.vars.palette.info.contrastText } },
        "& [role=button]": { cursor: "pointer", outline: "none" },
        "& [role=button]:focus-visible circle": { stroke: theme.vars.palette.text.primary, strokeWidth: 2 } })}>
      {ends.map((end) => <g key={end.view} className={end.className} role="button" tabIndex={0} aria-label={t(`screen_game.viewport.views.${VIEW_NAMES[end.view]}`)}
        onClick={() => onView(end.view)} onKeyDown={activate(end.view)}>
        {end.positive && <line x1={0} y1={0} x2={end.x} y2={end.y} stroke="currentColor" strokeWidth={2} />}
        <circle cx={end.x} cy={end.y} r={end.positive ? 8 : 6} fill="currentColor" fillOpacity={end.positive ? 1 : 0.45}
          stroke="currentColor" strokeWidth={1} />
        {end.positive && <text x={end.x} y={end.y} textAnchor="middle" dominantBaseline="central">{end.label}</text>}
      </g>)}
    </Box>
    <ToolbarIconButton icon={orthographic ? <ViewInArOutlinedIcon fontSize="small" /> : <ThreeDRotationOutlinedIcon fontSize="small" />}
      tooltip={orthographic ? t("screen_game.viewport.orthographic") : t("screen_game.viewport.perspective")} ariaLabel={t("screen_game.viewport.orthographic")} shortcut={projectionShortcut}
      aria-pressed={orthographic} active={orthographic} onClick={onToggleProjection} />
  </FlexColumn>;
}
