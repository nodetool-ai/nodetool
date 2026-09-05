import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import type { Theme } from "@mui/material/styles";
import AnimationOutlinedIcon from "@mui/icons-material/AnimationOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import {
  ANIMATION_PRESETS,
  type AnimationPreset,
  type AnimationRole,
  type ClipAnimation,
  type CustomClipAnimation,
  type EasingId,
  type PresetParamSpec,
  type TimelineClip
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  Button,
  Caption,
  CollapsibleSection,
  DeleteButton,
  FlexColumn,
  FlexRow,
  SPACING,
  Text
} from "../../ui_primitives";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSelect,
  InspectorSliderRow,
  InspectorToggleRow
} from "./InspectorPrimitives";
import { usePersistedFold } from "./usePersistedFold";
import { ClipCustomCurves, makeCustomAnimation } from "./ClipCustomCurves";
import { EasingField } from "./InspectorMotionFields";
import { isNumber } from "../../../utils/typePredicates";

const ROLES: AnimationRole[] = ["in", "out", "emphasis", "loop"];
const EASINGS: EasingId[] = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "easeOutBack",
  "easeOutElastic",
  "easeOutBounce"
];
const EMPTY_ANIMATIONS: ClipAnimation[] = [];

/**
 * Keyframes written directly rather than picked from the catalog (D2). It is
 * not a preset — the catalog never lists it — so the add row and the preset
 * select carry it as an extra option and the editor swaps the preset knobs for
 * a curve list.
 */
const CUSTOM_PRESET = "custom";
const CUSTOM_OPTION = { value: CUSTOM_PRESET, label: "custom (keyframes)" };
const CUSTOM_DEFAULT_DURATION_MS = 800;

const ROLE_LABELS: Record<AnimationRole, string> = {
  in: "In",
  out: "Out",
  emphasis: "Emphasis",
  loop: "Loop"
};

const EASING_OPTIONS = EASINGS.map((easing) => ({
  value: easing,
  label: easing
}));
const ROLE_OPTIONS = ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role]
}));

/** The catalog is static, so both the per-role split and the select's option
 *  list are built once instead of re-filtered and re-mapped on every render. */
const PRESETS_BY_ROLE: Record<AnimationRole, AnimationPreset[]> = {
  in: [],
  out: [],
  emphasis: [],
  loop: []
};
const PRESET_OPTIONS_BY_ROLE: Record<
  AnimationRole,
  { value: string; label: string }[]
> = { in: [], out: [], emphasis: [], loop: [] };

for (const role of ROLES) {
  PRESETS_BY_ROLE[role] = ANIMATION_PRESETS.filter((preset) =>
    preset.roles.includes(role)
  );
  PRESET_OPTIONS_BY_ROLE[role] = [
    ...PRESETS_BY_ROLE[role].map((preset) => ({
      value: preset.id,
      label: preset.id
    })),
    CUSTOM_OPTION
  ];
}

function presetsForRole(role: AnimationRole): readonly AnimationPreset[] {
  return PRESETS_BY_ROLE[role];
}

function defaultParams(
  preset: AnimationPreset
): Record<string, number | string | boolean> | undefined {
  if (preset.params.length === 0) return undefined;
  return Object.fromEntries(
    preset.params.map((param) => [param.name, param.default])
  );
}

function makeCustom(role: AnimationRole): ClipAnimation {
  return {
    id: crypto.randomUUID(),
    role,
    preset: CUSTOM_PRESET,
    durationMs: CUSTOM_DEFAULT_DURATION_MS,
    enabled: true,
    custom: makeCustomAnimation()
  };
}

function makeAnimation(
  role: AnimationRole,
  preset: AnimationPreset
): ClipAnimation {
  return {
    id: crypto.randomUUID(),
    role,
    preset: preset.id,
    durationMs: preset.defaultDurationMs,
    easing: preset.defaultEasing,
    enabled: true,
    params: defaultParams(preset)
  };
}

interface AnimationParamControlProps {
  animation: ClipAnimation;
  spec: PresetParamSpec;
  onChange: (name: string, value: number | string | boolean) => void;
}

const AnimationParamControl: React.FC<AnimationParamControlProps> = memo(
  ({ animation, spec, onChange }) => {
  const value = animation.params?.[spec.name] ?? spec.default;
  const handleChange = useCallback(
    (next: number | string | boolean) => onChange(spec.name, next),
    [onChange, spec.name]
  );
  const options = useMemo(
    () =>
      spec.options?.map((option) => ({ value: option, label: option })) ?? [],
    [spec.options]
  );
  if (spec.options) {
    return (
      <InspectorRow label={spec.name}>
        <InspectorSelect
          label={`${animation.role} ${spec.name}`}
          value={String(value)}
          options={options}
          onChange={handleChange}
        />
      </InspectorRow>
    );
  }

  if (
    isNumber(value) &&
    spec.min !== undefined &&
    spec.max !== undefined
  ) {
    const integerRange =
      Number.isInteger(spec.min) && Number.isInteger(spec.max);
    const step = integerRange
      ? 1
      : Math.max((spec.max - spec.min) / 100, 0.001);
    return (
      <InspectorSliderRow
        label={spec.name}
        value={value}
        display={Number.isInteger(value) ? String(value) : value.toFixed(3)}
        min={spec.min}
        max={spec.max}
        step={step}
        origin={isNumber(spec.default) ? spec.default : undefined}
        onChange={handleChange}
      />
    );
  }

  return null;
  }
);
AnimationParamControl.displayName = "AnimationParamControl";

const DEFAULT_STAGGER_OFFSET_MS = 120;

const EDITOR_SX = {
  borderTop: (theme: Theme) => `1px solid ${theme.vars.palette.divider}`,
  pt: SPACING.md
};
const DELETE_SX = { width: 24, height: 24 };

interface ClipAnimationEditorProps {
  animation: ClipAnimation;
  /** True on text clips — the only place per-word stagger applies. */
  staggerAvailable: boolean;
  onPatch: (id: string, patch: Partial<ClipAnimation>) => void;
  onDelete: (id: string) => void;
}

/**
 * One animation's controls. Bound to its own id so a sibling's edit leaves
 * these callbacks identical and the memoized fields below skip the render.
 */
const ClipAnimationEditor: React.FC<ClipAnimationEditorProps> = memo(({
  animation,
  staggerAvailable,
  onPatch,
  onDelete
}) => {
  const preset = ANIMATION_PRESETS.find(
    (candidate) => candidate.id === animation.preset
  );
  const isCustom = animation.preset === CUSTOM_PRESET;
  const animationId = animation.id;
  const onPatchThis = useCallback(
    (patch: Partial<ClipAnimation>) => onPatch(animationId, patch),
    [animationId, onPatch]
  );
  const handleDelete = useCallback(
    () => onDelete(animationId),
    [animationId, onDelete]
  );
  const animationRef = useRef(animation);
  animationRef.current = animation;

  const handlePresetChange = useCallback(
    (value: string) => {
      if (value === CUSTOM_PRESET) {
        onPatchThis({
          preset: CUSTOM_PRESET,
          params: undefined,
          custom: makeCustomAnimation()
        });
        return;
      }
      const next = presetsForRole(animationRef.current.role).find(
        (candidate) => candidate.id === value
      );
      if (!next) return;
      onPatchThis({
        preset: next.id,
        durationMs: next.defaultDurationMs,
        easing: next.defaultEasing,
        params: defaultParams(next),
        custom: undefined
      });
    },
    [onPatchThis]
  );

  const handleCustomChange = useCallback(
    (custom: CustomClipAnimation) => onPatchThis({ custom }),
    [onPatchThis]
  );

  const patchParam = useCallback(
    (name: string, value: number | string | boolean) => {
      onPatchThis({
        params: { ...animationRef.current.params, [name]: value }
      });
    },
    [onPatchThis]
  );

  const handleEnabledChange = useCallback(
    (enabled: boolean) => onPatchThis({ enabled }),
    [onPatchThis]
  );

  const handleDurationCommit = useCallback(
    (raw: string) => {
      const durationMs = Number(raw);
      if (Number.isFinite(durationMs) && durationMs > 0) {
        onPatchThis({ durationMs });
      }
    },
    [onPatchThis]
  );

  const handleDelayCommit = useCallback(
    (raw: string) => {
      const delayMs = Number(raw);
      if (Number.isFinite(delayMs) && delayMs >= 0) {
        onPatchThis({ delayMs });
      }
    },
    [onPatchThis]
  );

  const handleEasingChange = useCallback(
    (easing: string | undefined) => onPatchThis({ easing: easing as EasingId }),
    [onPatchThis]
  );

  const handleStaggerToggle = useCallback(
    (on: boolean) =>
      onPatchThis({
        stagger: on
          ? { unit: "word", offsetMs: DEFAULT_STAGGER_OFFSET_MS }
          : undefined
      }),
    [onPatchThis]
  );

  const handleStaggerOffsetCommit = useCallback(
    (raw: string) => {
      const offsetMs = Number(raw);
      if (Number.isFinite(offsetMs) && offsetMs > 0) {
        onPatchThis({
          stagger: { ...animationRef.current.stagger, unit: "word", offsetMs }
        });
      }
    },
    [onPatchThis]
  );

  return (
    <FlexColumn gap={SPACING.md} sx={EDITOR_SX}>
      <FlexRow align="center" justify="space-between" gap={SPACING.md}>
        <Text size="small">{ROLE_LABELS[animation.role]}</Text>
        <DeleteButton
          onClick={handleDelete}
          tooltip={`Remove ${ROLE_LABELS[animation.role]} animation`}
          ariaLabel={`Remove ${ROLE_LABELS[animation.role]} animation`}
          iconVariant="clear"
          sx={DELETE_SX}
        />
      </FlexRow>

      <InspectorToggleRow
        label="Enabled"
        checked={animation.enabled !== false}
        onChange={handleEnabledChange}
      />

      <InspectorRow label="Preset">
        <InspectorSelect
          label={`${animation.role} animation preset`}
          value={animation.preset}
          options={PRESET_OPTIONS_BY_ROLE[animation.role]}
          onChange={handlePresetChange}
        />
      </InspectorRow>

      {!preset?.fullClip && (
        <>
          <InspectorRow
            label={animation.role === "loop" ? "Period" : "Duration"}
          >
            <InspectorPillInput
              value={String(animation.durationMs)}
              unit="ms"
              onCommit={handleDurationCommit}
              ariaLabel={`${animation.role} animation duration`}
            />
          </InspectorRow>
          <InspectorRow label="Delay">
            <InspectorPillInput
              value={String(animation.delayMs ?? 0)}
              unit="ms"
              onCommit={handleDelayCommit}
              ariaLabel={`${animation.role} animation delay`}
            />
          </InspectorRow>
        </>
      )}

      {isCustom ? (
        // A custom animation's easing carries the whole grammar (D3), which no
        // select can enumerate, so it is typed rather than picked.
        <EasingField
          value={animation.easing}
          ariaLabel={`${animation.role} animation easing`}
          onChange={handleEasingChange}
        />
      ) : (
        <InspectorRow label="Easing">
          <InspectorSelect
            label={`${animation.role} animation easing`}
            value={animation.easing ?? preset?.defaultEasing ?? "linear"}
            options={EASING_OPTIONS}
            onChange={handleEasingChange}
          />
        </InspectorRow>
      )}

      {staggerAvailable && !preset?.fullClip && (
        <>
          <InspectorToggleRow
            label="Stagger words"
            checked={animation.stagger !== undefined}
            onChange={handleStaggerToggle}
          />
          {animation.stagger !== undefined && (
            <InspectorRow label="Word offset">
              <InspectorPillInput
                value={String(animation.stagger.offsetMs)}
                unit="ms"
                onCommit={handleStaggerOffsetCommit}
                ariaLabel={`${animation.role} animation word stagger offset`}
              />
            </InspectorRow>
          )}
        </>
      )}

      {isCustom && (
        <ClipCustomCurves
          custom={animation.custom}
          labelPrefix={animation.role}
          onChange={handleCustomChange}
        />
      )}

      {preset?.params.map((spec) => (
        <AnimationParamControl
          key={spec.name}
          animation={animation}
          spec={spec}
          onChange={patchParam}
        />
      ))}
      {preset && <Caption color="muted">{preset.describe}</Caption>}
    </FlexColumn>
  );
});
ClipAnimationEditor.displayName = "ClipAnimationEditor";

interface ClipAnimationsProps {
  clip: TimelineClip;
}

export const ClipAnimations: React.FC<ClipAnimationsProps> = ({ clip }) => {
  const [open, setOpen] = usePersistedFold("animate");
  const setClipAnimations = useTimelineStore(
    (state) => state.setClipAnimations
  );
  const [newRole, setNewRole] = useState<AnimationRole>("in");
  // A preset id or CUSTOM_PRESET, which the catalog does not carry.
  const [newPreset, setNewPreset] = useState<string>(
    () => presetsForRole("in")[0].id
  );
  const animations = clip.animations ?? EMPTY_ANIMATIONS;
  const groupedAnimations = useMemo(
    () =>
      ROLES.flatMap((role) =>
        animations.filter((animation) => animation.role === role)
      ),
    [animations]
  );

  // Read through a ref so editing one animation does not hand every other
  // editor a new callback and re-render its whole control set.
  const stateRef = useRef({ clipId: clip.id, animations });
  stateRef.current = { clipId: clip.id, animations };

  const patchAnimation = useCallback(
    (id: string, patch: Partial<ClipAnimation>) => {
      const { clipId, animations: current } = stateRef.current;
      setClipAnimations(
        clipId,
        current.map((animation) =>
          animation.id === id ? { ...animation, ...patch } : animation
        )
      );
    },
    [setClipAnimations]
  );

  const removeAnimation = useCallback(
    (id: string) => {
      const { clipId, animations: current } = stateRef.current;
      setClipAnimations(
        clipId,
        current.filter((animation) => animation.id !== id)
      );
    },
    [setClipAnimations]
  );

  const handleRoleChange = useCallback((value: string) => {
    const role = value as AnimationRole;
    setNewRole(role);
    setNewPreset(presetsForRole(role)[0].id);
  }, []);

  const handleAdd = useCallback(() => {
    const { clipId, animations: current } = stateRef.current;
    if (newPreset === CUSTOM_PRESET) {
      setClipAnimations(clipId, [...current, makeCustom(newRole)]);
      return;
    }
    const preset = ANIMATION_PRESETS.find(
      (candidate) =>
        candidate.id === newPreset && candidate.roles.includes(newRole)
    );
    if (!preset) return;
    setClipAnimations(clipId, [...current, makeAnimation(newRole, preset)]);
  }, [newPreset, newRole, setClipAnimations]);

  return (
    <>
      <InspectorDivider />
      <CollapsibleSection
        title={
          <InspectorSectionTitle
            title="Animate"
            icon={<AnimationOutlinedIcon />}
          />
        }
        open={open}
        onToggle={setOpen}
        unmountOnExit
      >
        <FlexColumn gap={SPACING.md} sx={{ py: SPACING.xs }}>
          <FlexRow gap={SPACING.md} align="center">
            <InspectorSelect
              label="New animation role"
              value={newRole}
              options={ROLE_OPTIONS}
              onChange={handleRoleChange}
              grow
            />
            <InspectorSelect
              label="New animation preset"
              value={newPreset}
              options={PRESET_OPTIONS_BY_ROLE[newRole]}
              onChange={setNewPreset}
              grow
            />
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddOutlinedIcon />}
              onClick={handleAdd}
            >
              Add
            </Button>
          </FlexRow>

          {animations.length === 0 ? (
            <Caption color="muted">
              Add an entrance, exit, emphasis, or loop preset.
            </Caption>
          ) : (
            groupedAnimations.map((animation) => (
              <ClipAnimationEditor
                key={animation.id}
                animation={animation}
                staggerAvailable={clip.mediaType === "text"}
                onPatch={patchAnimation}
                onDelete={removeAnimation}
              />
            ))
          )}
        </FlexColumn>
      </CollapsibleSection>
    </>
  );
};
