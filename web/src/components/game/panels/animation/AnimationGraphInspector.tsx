import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { GameAnimationCondition3D, GameAnimationGraph3D, GameAnimationGraphNode3D, GameAnimationMotion3D, GameAnimationTransition3D } from "@nodetool-ai/protocol";

import { AddButton, FieldGroup, RowAction } from "../../inspector/InspectorParts";
import {
  Caption, EditorButton, FlexColumn, FlexRow, InspectorFieldRow, InspectorSelect, InspectorToggleRow, InspectorValueInput, Label, SPACING
} from "../../../ui_primitives";
import {
  addAnimationParameter, ANY_ANIMATION_STATE, conditionOpsFor, convertAnimationMotion, defaultCondition, removeAnimationParameter,
  renameAnimationParameter, setAnimationParameterDefault, setAnimationParameterKind, uniqueAnimationName, type AnimationParameterKind
} from "./animationGraphEdits";

/** Applies a graph edit and returns whether it was applied. The edit may throw an `AnimationGraphEditError` to refuse itself. */
export type AnimationGraphCommit = (edit: (graph: GameAnimationGraph3D) => GameAnimationGraph3D, label: string) => boolean;

const PARAMETER_KINDS = ["float", "bool", "trigger"] as const;
const MOTION_KINDS = ["clip", "blend1d", "blend2d"] as const;

function finiteNumber(raw: string): number | null {
  const value = Number(raw.trim());
  return raw.trim() !== "" && Number.isFinite(value) ? value : null;
}

function NumberRow({ label, value, onCommit, allowEmpty = false }: {
  readonly label: string; readonly value: number | undefined; readonly onCommit: (value: number | undefined) => void; readonly allowEmpty?: boolean;
}) {
  const { t } = useTranslation();
  return <InspectorFieldRow label={label}>
    <InspectorValueInput grow ariaLabel={label} value={value === undefined ? "" : String(value)} allowEmpty={allowEmpty} placeholder={allowEmpty ? t("i18n-cont-game-06.common.none") : undefined}
      onCommit={(raw) => {
        if (allowEmpty && raw.trim() === "") { onCommit(undefined); return; }
        const parsed = finiteNumber(raw);
        if (parsed !== null) { onCommit(parsed); }
      }} />
  </InspectorFieldRow>;
}

function ClipField({ label, value, clips, onChange }: {
  readonly label: string; readonly value: string; readonly clips: readonly string[]; readonly onChange: (clip: string) => void;
}) {
  if (clips.length === 0) {
    return <InspectorValueInput grow ariaLabel={label} value={value} onCommit={(raw) => { if (raw.trim()) { onChange(raw.trim()); } }} />;
  }
  const options = (clips.includes(value) ? clips : [value, ...clips]).map((clip) => ({ value: clip, label: clip }));
  return <InspectorSelect grow label={label} value={value} options={options} onChange={onChange} />;
}

interface ParameterListProps {
  readonly graph: GameAnimationGraph3D;
  readonly live: Readonly<Record<string, number | boolean>> | null;
  readonly commit: AnimationGraphCommit;
  /** Called after a rename was applied. */
  readonly onRenamed: (from: string, to: string) => void;
}

/** The graph's parameters with their kinds and defaults, and their live values while a session plays. */
export function AnimationParameterList({ graph, live, commit, onRenamed }: ParameterListProps) {
  const { t } = useTranslation();
  const kindOptions = PARAMETER_KINDS.map((value) => ({ value, label: t(`i18n-cont-game-06.animation.parameterKinds.${value}`) }));
  const add = (kind: AnimationParameterKind): void => {
    const name = uniqueAnimationName(Object.keys(graph.parameters), kind === "float" ? "speed" : kind === "bool" ? "flag" : "trigger");
    commit((current) => addAnimationParameter(current, name, kind), t("i18n-cont-game-06.animation.edits.addParameter"));
  };
  return <FlexColumn gap={SPACING.xs} sx={{ minWidth: 0 }}>
    {Object.keys(graph.parameters).length === 0 && <Caption color="secondary">{t("i18n-cont-game-06.animation.emptyParameters")}</Caption>}
    {Object.entries(graph.parameters).map(([name, parameter]) => {
      const value = live?.[name];
      return <FieldGroup key={name} title={value === undefined ? name : `${name} = ${String(value)}`}
        actions={<RowAction icon={<DeleteOutlineIcon />} label={t("i18n-cont-game-06.animation.removeParameter", { name })}
          onClick={() => commit((current) => removeAnimationParameter(current, name), t("i18n-cont-game-06.animation.edits.removeParameter"))} />}>
        <InspectorFieldRow label={t("i18n-cont-game-06.common.name")}>
          <InspectorValueInput grow ariaLabel={t("i18n-cont-game-06.animation.parameterName", { name })} value={name}
            onCommit={(raw) => {
              if (raw.trim() !== name && commit((current) => renameAnimationParameter(current, name, raw), t("i18n-cont-game-06.animation.edits.renameParameter"))) { onRenamed(name, raw.trim()); }
            }} />
        </InspectorFieldRow>
        <InspectorFieldRow label={t("i18n-cont-game-06.common.kind")}>
          <InspectorSelect grow label={t("i18n-cont-game-06.animation.parameterKind", { name })} value={parameter.kind} options={kindOptions}
            onChange={(kind) => commit((current) => setAnimationParameterKind(current, name, kind as AnimationParameterKind), t("i18n-cont-game-06.animation.edits.changeParameter"))} />
        </InspectorFieldRow>
        {parameter.kind === "float" && <NumberRow label={t("i18n-cont-game-06.common.default")} value={parameter.default}
          onCommit={(next) => commit((current) => setAnimationParameterDefault(current, name, next ?? 0), t("i18n-cont-game-06.animation.edits.changeParameter"))} />}
        {parameter.kind === "bool" && <InspectorToggleRow label={t("i18n-cont-game-06.common.default")} checked={parameter.default}
          onChange={(next) => commit((current) => setAnimationParameterDefault(current, name, next), t("i18n-cont-game-06.animation.edits.changeParameter"))} />}
      </FieldGroup>;
    })}
    <FlexRow gap={SPACING.micro} wrap>
      <AddButton onClick={() => add("float")}>{t("i18n-cont-game-06.animation.parameterKinds.float")}</AddButton>
      <AddButton onClick={() => add("bool")}>{t("i18n-cont-game-06.animation.parameterKinds.bool")}</AddButton>
      <AddButton onClick={() => add("trigger")}>{t("i18n-cont-game-06.animation.parameterKinds.trigger")}</AddButton>
    </FlexRow>
  </FlexColumn>;
}

interface TransitionAdderProps {
  readonly label: string;
  readonly targets: readonly string[];
  readonly onAdd: (to: string) => void;
}

/** Keyboard path for adding a transition: pick the target state, then add. */
export function AnimationTransitionAdder({ label, targets, onAdd }: TransitionAdderProps) {
  const { t } = useTranslation();
  const [target, setTarget] = useState("");
  const value = targets.includes(target) ? target : targets[0];
  if (value === undefined) { return null; }
  return <InspectorFieldRow label={label}>
    <InspectorSelect grow label={label} value={value} options={targets.map((id) => ({ value: id, label: id }))} onChange={setTarget} />
    <EditorButton variant="outlined" aria-label={t("i18n-cont-game-06.animation.addTransitionTo", { label, target: value })} onClick={() => onAdd(value)}>{t("i18n-cont-game-06.common.add")}</EditorButton>
  </InspectorFieldRow>;
}

interface StateInspectorProps {
  readonly graph: GameAnimationGraph3D;
  readonly stateId: string;
  readonly node: GameAnimationGraphNode3D;
  readonly initial: boolean;
  readonly clips: readonly string[];
  readonly onRename: (name: string) => void;
  readonly onChange: (node: GameAnimationGraphNode3D, label: string) => void;
  readonly onMakeInitial: () => void;
  readonly onRemove: () => void;
  readonly onError: (message: string) => void;
  readonly transitionTargets: readonly string[];
  readonly onAddTransition: (to: string) => void;
}

function floatOptions(graph: GameAnimationGraph3D, current: string): { value: string; label: string }[] {
  const names = Object.entries(graph.parameters).filter(([, parameter]) => parameter.kind === "float").map(([name]) => name);
  return (names.includes(current) ? names : [current, ...names]).map((name) => ({ value: name, label: name }));
}

function BlendPoints({ graph, motion, clips, onChange }: {
  readonly graph: GameAnimationGraph3D; readonly motion: Exclude<GameAnimationMotion3D, { kind: "clip" }>; readonly clips: readonly string[];
  readonly onChange: (motion: GameAnimationMotion3D) => void;
}) {
  const { t } = useTranslation();
  if (motion.kind === "blend1d") {
    const points = motion.points;
    return <FlexColumn gap={SPACING.xs}>
      <InspectorFieldRow label={t("i18n-cont-game-06.animation.parameter")}>
        <InspectorSelect grow label={t("i18n-cont-game-06.animation.blendParameter")} value={motion.parameter} options={floatOptions(graph, motion.parameter)}
          onChange={(parameter) => onChange({ ...motion, parameter })} />
      </InspectorFieldRow>
      {points.map((point, index) => <FieldGroup key={index} title={t("i18n-cont-game-06.animation.point", { number: index + 1 })} actions={<RowAction icon={<DeleteOutlineIcon />}
        label={t("i18n-cont-game-06.animation.removePoint", { number: index + 1 })} disabled={points.length <= 2}
        onClick={() => onChange({ ...motion, points: points.filter((_entry, position) => position !== index) })} />}>
        <NumberRow label={t("i18n-cont-game-06.common.value")} value={point.value} onCommit={(value) => onChange({ ...motion,
          points: points.map((entry, position) => position === index ? { ...entry, value: value ?? 0 } : entry) })} />
        <InspectorFieldRow label={t("i18n-cont-game-06.animation.clip")}><ClipField label={t("i18n-cont-game-06.animation.pointClip", { number: index + 1 })} value={point.clip} clips={clips}
          onChange={(clip) => onChange({ ...motion, points: points.map((entry, position) => position === index ? { ...entry, clip } : entry) })} /></InspectorFieldRow>
      </FieldGroup>)}
      <AddButton disabled={points.length >= 16} onClick={() => onChange({ ...motion,
        points: [...points, { value: (points.at(-1)?.value ?? 0) + 1, clip: points.at(-1)?.clip ?? clips[0] ?? "idle" }] })}>{t("i18n-cont-game-06.animation.addPoint")}</AddButton>
    </FlexColumn>;
  }
  const points = motion.points;
  return <FlexColumn gap={SPACING.xs}>
    <InspectorFieldRow label={t("i18n-cont-game-06.animation.parameterX")}>
      <InspectorSelect grow label={t("i18n-cont-game-06.animation.blendParameterX")} value={motion.parameterX} options={floatOptions(graph, motion.parameterX)}
        onChange={(parameterX) => onChange({ ...motion, parameterX })} />
    </InspectorFieldRow>
    <InspectorFieldRow label={t("i18n-cont-game-06.animation.parameterY")}>
      <InspectorSelect grow label={t("i18n-cont-game-06.animation.blendParameterY")} value={motion.parameterY} options={floatOptions(graph, motion.parameterY)}
        onChange={(parameterY) => onChange({ ...motion, parameterY })} />
    </InspectorFieldRow>
    {points.map((point, index) => <FieldGroup key={index} title={t("i18n-cont-game-06.animation.point", { number: index + 1 })} actions={<RowAction icon={<DeleteOutlineIcon />}
      label={t("i18n-cont-game-06.animation.removePoint", { number: index + 1 })} disabled={points.length <= 3}
      onClick={() => onChange({ ...motion, points: points.filter((_entry, position) => position !== index) })} />}>
      <NumberRow label="X" value={point.x} onCommit={(x) => onChange({ ...motion,
        points: points.map((entry, position) => position === index ? { ...entry, x: x ?? 0 } : entry) })} />
      <NumberRow label="Y" value={point.y} onCommit={(y) => onChange({ ...motion,
        points: points.map((entry, position) => position === index ? { ...entry, y: y ?? 0 } : entry) })} />
      <InspectorFieldRow label={t("i18n-cont-game-06.animation.clip")}><ClipField label={t("i18n-cont-game-06.animation.pointClip", { number: index + 1 })} value={point.clip} clips={clips}
        onChange={(clip) => onChange({ ...motion, points: points.map((entry, position) => position === index ? { ...entry, clip } : entry) })} /></InspectorFieldRow>
    </FieldGroup>)}
    <AddButton disabled={points.length >= 16} onClick={() => onChange({ ...motion,
      points: [...points, { x: (points.at(-1)?.x ?? 0) + 1, y: points.at(-1)?.y ?? 0, clip: points.at(-1)?.clip ?? clips[0] ?? "idle" }] })}>{t("i18n-cont-game-06.animation.addPoint")}</AddButton>
  </FlexColumn>;
}

/** Name, motion, speed and looping of one state. */
export function AnimationStateInspector({ graph, stateId, node, initial, clips, onRename, onChange, onMakeInitial, onRemove, onError, transitionTargets, onAddTransition }: StateInspectorProps) {
  const { t } = useTranslation();
  const motion = node.motion;
  const motionOptions = MOTION_KINDS.map((value) => ({ value, label: t(`i18n-cont-game-06.animation.motionKinds.${value}`) }));
  return <FlexColumn gap={SPACING.xs}>
    <InspectorFieldRow label={t("i18n-cont-game-06.common.name")}>
      <InspectorValueInput grow ariaLabel={t("i18n-cont-game-06.animation.stateName")} value={stateId} onCommit={onRename} />
    </InspectorFieldRow>
    <InspectorFieldRow label={t("i18n-cont-game-06.animation.motion")}>
      <InspectorSelect grow label={t("i18n-cont-game-06.animation.motionKind")} value={motion.kind} options={motionOptions} onChange={(kind) => {
        try { onChange({ ...node, motion: convertAnimationMotion(graph, motion, kind as GameAnimationMotion3D["kind"]) }, t("i18n-cont-game-06.animation.edits.changeMotion")); }
        catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); }
      }} />
    </InspectorFieldRow>
    {motion.kind === "clip"
      ? <InspectorFieldRow label={t("i18n-cont-game-06.animation.clip")}><ClipField label={t("i18n-cont-game-06.animation.clip")} value={motion.clip} clips={clips}
        onChange={(clip) => onChange({ ...node, motion: { kind: "clip", clip } }, t("i18n-cont-game-06.animation.edits.changeClip"))} /></InspectorFieldRow>
      : <BlendPoints graph={graph} motion={motion} clips={clips} onChange={(next) => onChange({ ...node, motion: next }, t("i18n-cont-game-06.animation.edits.changeBlend"))} />}
    <NumberRow label={t("i18n-cont-game-06.common.speed")} value={node.speed} onCommit={(speed) => onChange({ ...node, speed: speed ?? 1 }, t("i18n-cont-game-06.animation.edits.changeState"))} />
    <InspectorToggleRow label={t("i18n-cont-game-06.common.loop")} checked={node.loop} onChange={(loop) => onChange({ ...node, loop }, t("i18n-cont-game-06.animation.edits.changeState"))} />
    <AnimationTransitionAdder label={t("i18n-cont-game-06.animation.transitionTo")} onAdd={onAddTransition} targets={transitionTargets} />
    <FlexRow gap={SPACING.xs} wrap sx={{ pt: SPACING.xs }}>
      <EditorButton variant="outlined" disabled={initial} onClick={onMakeInitial}>{initial ? t("i18n-cont-game-06.animation.initialState") : t("i18n-cont-game-06.animation.makeInitial")}</EditorButton>
      <EditorButton variant="outlined" color="error" onClick={onRemove}>{t("i18n-cont-game-06.animation.removeState")}</EditorButton>
    </FlexRow>
  </FlexColumn>;
}

interface TransitionInspectorProps {
  readonly graph: GameAnimationGraph3D;
  readonly stateIds: readonly string[];
  readonly transition: GameAnimationTransition3D;
  readonly onChange: (transition: GameAnimationTransition3D, label: string) => void;
  readonly onRemove: () => void;
}

/** Source, target, timing and conditions of one transition. All conditions must hold for it to fire. */
export function AnimationTransitionInspector({ graph, stateIds, transition, onChange, onRemove }: TransitionInspectorProps) {
  const { t } = useTranslation();
  const stateOptions = stateIds.map((id) => ({ value: id, label: id }));
  const parameterNames = Object.keys(graph.parameters);
  const parameterOptions = parameterNames.map((name) => ({ value: name, label: name }));
  const conditions = transition.conditions;
  const setConditions = (next: GameAnimationTransition3D["conditions"]): void => onChange({ ...transition, conditions: next }, t("i18n-cont-game-06.animation.edits.changeCondition"));
  let conditionRows: ReactNode = <Caption color="secondary">{t("i18n-cont-game-06.animation.noConditions")}</Caption>;
  if (conditions.length > 0) {
    conditionRows = conditions.map((condition, index) => {
      const kind = graph.parameters[condition.parameter]?.kind;
      const ops = kind ? conditionOpsFor(kind) : [condition.op];
      const options = parameterNames.includes(condition.parameter) ? parameterOptions : [{ value: condition.parameter, label: condition.parameter }, ...parameterOptions];
      return <FieldGroup key={index} title={t("i18n-cont-game-06.animation.condition", { number: index + 1 })} actions={<RowAction icon={<DeleteOutlineIcon />} label={t("i18n-cont-game-06.animation.removeCondition", { number: index + 1 })}
        onClick={() => setConditions(conditions.filter((_entry, position) => position !== index))} />}>
        <InspectorFieldRow label={t("i18n-cont-game-06.animation.parameter")}>
          <InspectorSelect grow label={t("i18n-cont-game-06.animation.conditionParameter", { number: index + 1 })} value={condition.parameter} options={options} onChange={(parameter) => {
            const nextKind = graph.parameters[parameter]?.kind;
            if (nextKind) { setConditions(conditions.map((entry, position) => position === index ? defaultCondition(parameter, nextKind) : entry)); }
          }} />
        </InspectorFieldRow>
        <InspectorFieldRow label={t("i18n-cont-game-06.animation.test")}>
          <InspectorSelect grow label={t("i18n-cont-game-06.animation.conditionTest", { number: index + 1 })} value={condition.op} options={ops.map((op) => ({ value: op, label: t(`i18n-cont-game-06.animation.conditionOps.${op}`) }))}
            onChange={(op) => setConditions(conditions.map((entry, position) => {
              if (position !== index) { return entry; }
              const next: GameAnimationCondition3D = { parameter: entry.parameter, op: op as GameAnimationCondition3D["op"] };
              if (kind === "float") { next.value = entry.value ?? 0; }
              return next;
            }))} />
        </InspectorFieldRow>
        {kind === "float" && <NumberRow label={t("i18n-cont-game-06.common.value")} value={condition.value ?? 0}
          onCommit={(value) => setConditions(conditions.map((entry, position) => position === index ? { ...entry, value: value ?? 0 } : entry))} />}
      </FieldGroup>;
    });
  }
  const firstParameter = parameterNames[0];
  return <FlexColumn gap={SPACING.xs}>
    <InspectorFieldRow label={t("i18n-cont-game-06.animation.from")}>
      <InspectorSelect grow label={t("i18n-cont-game-06.animation.fromState")} value={transition.from} options={[{ value: ANY_ANIMATION_STATE, label: t("i18n-cont-game-06.animation.anyState") }, ...stateOptions]}
        onChange={(from) => onChange({ ...transition, from }, t("i18n-cont-game-06.animation.edits.changeTransition"))} />
    </InspectorFieldRow>
    <InspectorFieldRow label={t("i18n-cont-game-06.animation.to")}>
      <InspectorSelect grow label={t("i18n-cont-game-06.animation.toState")} value={transition.to} options={stateOptions} onChange={(to) => onChange({ ...transition, to }, t("i18n-cont-game-06.animation.edits.changeTransition"))} />
    </InspectorFieldRow>
    <NumberRow label={t("i18n-cont-game-06.animation.blendTicks")} value={transition.durationTicks}
      onCommit={(value) => onChange({ ...transition, durationTicks: Math.round(value ?? 0) }, t("i18n-cont-game-06.animation.edits.changeTransition"))} />
    <NumberRow label={t("i18n-cont-game-06.animation.exitAfterTicks")} value={transition.exitTicks} allowEmpty onCommit={(value) => {
      const { exitTicks: _previous, ...rest } = transition;
      onChange(value === undefined ? rest : { ...rest, exitTicks: Math.round(value) }, t("i18n-cont-game-06.animation.edits.changeTransition"));
    }} />
    <Label sx={{ mb: 0, pt: SPACING.xs }}>{t("i18n-cont-game-06.animation.conditions")}</Label>
    {conditionRows}
    <AddButton disabled={!firstParameter || conditions.length >= 8} onClick={() => {
      const kind = graph.parameters[firstParameter]?.kind;
      if (kind) { setConditions([...conditions, defaultCondition(firstParameter, kind)]); }
    }}>{t("i18n-cont-game-06.animation.addCondition")}</AddButton>
    <FlexRow sx={{ pt: SPACING.xs }}>
      <EditorButton variant="outlined" color="error" onClick={onRemove}>{t("i18n-cont-game-06.animation.removeTransition")}</EditorButton>
    </FlexRow>
  </FlexColumn>;
}
