import React, { useCallback, useState } from "react";
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

function presetsForRole(role: AnimationRole): readonly AnimationPreset[] {
  return ANIMATION_PRESETS.filter((preset) => preset.roles.includes(role));
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
  onChange: (value: number | string | boolean) => void;
}

const AnimationParamControl: React.FC<AnimationParamControlProps> = ({
  animation,
  spec,
  onChange
}) => {
  const value = animation.params?.[spec.name] ?? spec.default;
  if (spec.options) {
    return (
      <InspectorRow label={spec.name}>
        <InspectorSelect
          label={`${animation.role} ${spec.name}`}
          value={String(value)}
          options={spec.options.map((option) => ({
            value: option,
            label: option
          }))}
          onChange={onChange}
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
        onChange={onChange}
      />
    );
  }

  return null;
};

const DEFAULT_STAGGER_OFFSET_MS = 120;

interface ClipAnimationEditorProps {
  animation: ClipAnimation;
  /** True on text clips — the only place per-word stagger applies. */
  staggerAvailable: boolean;
  onPatch: (patch: Partial<ClipAnimation>) => void;
  onDelete: () => void;
}

const ClipAnimationEditor: React.FC<ClipAnimationEditorProps> = ({
  animation,
  staggerAvailable,
  onPatch,
  onDelete
}) => {
  const rolePresets = presetsForRole(animation.role);
  const preset = ANIMATION_PRESETS.find(
    (candidate) => candidate.id === animation.preset
  );
  const isCustom = animation.preset === CUSTOM_PRESET;
  const handlePresetChange = useCallback(
    (value: string) => {
      if (value === CUSTOM_PRESET) {
        onPatch({
          preset: CUSTOM_PRESET,
          params: undefined,
          custom: makeCustomAnimation()
        });
        return;
      }
      const next = presetsForRole(animation.role).find(
        (candidate) => candidate.id === value
      );
      if (!next) return;
      onPatch({
        preset: next.id,
        durationMs: next.defaultDurationMs,
        easing: next.defaultEasing,
        params: defaultParams(next),
        custom: undefined
      });
    },
    [animation.role, onPatch]
  );

  const handleCustomChange = useCallback(
    (custom: CustomClipAnimation) => onPatch({ custom }),
    [onPatch]
  );

  const patchParam = (name: string, value: number | string | boolean) => {
    onPatch({
      params: { ...animation.params, [name]: value }
    });
  };

  return (
    <FlexColumn
      gap={SPACING.md}
      sx={{
        borderTop: (theme) => `1px solid ${theme.vars.palette.divider}`,
        pt: SPACING.md
      }}
    >
      <FlexRow align="center" justify="space-between" gap={SPACING.md}>
        <Text size="small">{ROLE_LABELS[animation.role]}</Text>
        <DeleteButton
          onClick={onDelete}
          tooltip={`Remove ${ROLE_LABELS[animation.role]} animation`}
          ariaLabel={`Remove ${ROLE_LABELS[animation.role]} animation`}
          iconVariant="clear"
          sx={{ width: 24, height: 24 }}
        />
      </FlexRow>

      <InspectorToggleRow
        label="Enabled"
        checked={animation.enabled !== false}
        onChange={(enabled) => onPatch({ enabled })}
      />

      <InspectorRow label="Preset">
        <InspectorSelect
          label={`${animation.role} animation preset`}
          value={animation.preset}
          options={[
            ...rolePresets.map((candidate) => ({
              value: candidate.id,
              label: candidate.id
            })),
            CUSTOM_OPTION
          ]}
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
              onCommit={(raw) => {
                const durationMs = Number(raw);
                if (Number.isFinite(durationMs) && durationMs > 0) {
                  onPatch({ durationMs });
                }
              }}
              ariaLabel={`${animation.role} animation duration`}
            />
          </InspectorRow>
          <InspectorRow label="Delay">
            <InspectorPillInput
              value={String(animation.delayMs ?? 0)}
              unit="ms"
              onCommit={(raw) => {
                const delayMs = Number(raw);
                if (Number.isFinite(delayMs) && delayMs >= 0) {
                  onPatch({ delayMs });
                }
              }}
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
          onChange={(easing) => onPatch({ easing })}
        />
      ) : (
        <InspectorRow label="Easing">
          <InspectorSelect
            label={`${animation.role} animation easing`}
            value={animation.easing ?? preset?.defaultEasing ?? "linear"}
            options={EASING_OPTIONS}
            onChange={(value) => onPatch({ easing: value as EasingId })}
          />
        </InspectorRow>
      )}

      {staggerAvailable && !preset?.fullClip && (
        <>
          <InspectorToggleRow
            label="Stagger words"
            checked={animation.stagger !== undefined}
            onChange={(on) =>
              onPatch({
                stagger: on
                  ? { unit: "word", offsetMs: DEFAULT_STAGGER_OFFSET_MS }
                  : undefined
              })
            }
          />
          {animation.stagger !== undefined && (
            <InspectorRow label="Word offset">
              <InspectorPillInput
                value={String(animation.stagger.offsetMs)}
                unit="ms"
                onCommit={(raw) => {
                  const offsetMs = Number(raw);
                  if (Number.isFinite(offsetMs) && offsetMs > 0) {
                    onPatch({
                      stagger: { ...animation.stagger, unit: "word", offsetMs }
                    });
                  }
                }}
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
          onChange={(value) => patchParam(spec.name, value)}
        />
      ))}
      {preset && <Caption color="muted">{preset.describe}</Caption>}
    </FlexColumn>
  );
};

interface ClipAnimationsProps {
  clip: TimelineClip;
}

export const ClipAnimations: React.FC<ClipAnimationsProps> = ({ clip }) => {
  const [open, setOpen] = usePersistedFold("animate");
  const setClipAnimations = useTimelineStore(
    (state) => state.setClipAnimations
  );
  const [newRole, setNewRole] = useState<AnimationRole>("in");
  const rolePresets = presetsForRole(newRole);
  // A preset id or CUSTOM_PRESET, which the catalog does not carry.
  const [newPreset, setNewPreset] = useState<string>(rolePresets[0].id);
  const animations = clip.animations ?? EMPTY_ANIMATIONS;
  const groupedAnimations = ROLES.flatMap((role) =>
    animations.filter((animation) => animation.role === role)
  );

  const patchAnimation = useCallback(
    (id: string, patch: Partial<ClipAnimation>) => {
      setClipAnimations(
        clip.id,
        animations.map((animation) =>
          animation.id === id ? { ...animation, ...patch } : animation
        )
      );
    },
    [animations, clip.id, setClipAnimations]
  );

  const removeAnimation = useCallback(
    (id: string) => {
      setClipAnimations(
        clip.id,
        animations.filter((animation) => animation.id !== id)
      );
    },
    [animations, clip.id, setClipAnimations]
  );

  const handleRoleChange = useCallback((value: string) => {
    const role = value as AnimationRole;
    setNewRole(role);
    setNewPreset(presetsForRole(role)[0].id);
  }, []);

  const handleAdd = useCallback(() => {
    if (newPreset === CUSTOM_PRESET) {
      setClipAnimations(clip.id, [...animations, makeCustom(newRole)]);
      return;
    }
    const preset = ANIMATION_PRESETS.find(
      (candidate) =>
        candidate.id === newPreset && candidate.roles.includes(newRole)
    );
    if (!preset) return;
    setClipAnimations(clip.id, [...animations, makeAnimation(newRole, preset)]);
  }, [animations, clip.id, newPreset, newRole, setClipAnimations]);

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
              options={[
                ...rolePresets.map((preset) => ({
                  value: preset.id,
                  label: preset.id
                })),
                CUSTOM_OPTION
              ]}
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
                onPatch={(patch) => patchAnimation(animation.id, patch)}
                onDelete={() => removeAnimation(animation.id)}
              />
            ))
          )}
        </FlexColumn>
      </CollapsibleSection>
    </>
  );
};
