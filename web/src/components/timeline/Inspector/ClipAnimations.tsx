import React, { useCallback, useState } from "react";
import AnimationOutlinedIcon from "@mui/icons-material/AnimationOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import {
  ANIMATION_PRESETS,
  type AnimationPreset,
  type AnimationRole,
  type ClipAnimation,
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
  NodeMenuItem,
  NodeSelect,
  SPACING,
  Text,
  type SelectChangeEvent
} from "../../ui_primitives";
import {
  InspectorDivider,
  InspectorPillInput,
  InspectorRow,
  InspectorSectionTitle,
  InspectorSliderRow,
  InspectorToggleRow
} from "./InspectorPrimitives";
import { usePersistedFold } from "./usePersistedFold";

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

const ROLE_LABELS: Record<AnimationRole, string> = {
  in: "In",
  out: "Out",
  emphasis: "Emphasis",
  loop: "Loop"
};

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
        <NodeSelect
          value={String(value)}
          onChange={(event: SelectChangeEvent<unknown>) =>
            onChange(String(event.target.value))
          }
          inputProps={{
            "aria-label": `${animation.role} ${spec.name}`
          }}
          fullWidth
        >
          {spec.options.map((option) => (
            <NodeMenuItem key={option} value={option}>
              {option}
            </NodeMenuItem>
          ))}
        </NodeSelect>
      </InspectorRow>
    );
  }

  if (
    typeof value === "number" &&
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
        origin={typeof spec.default === "number" ? spec.default : undefined}
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
  const handlePresetChange = useCallback(
    (event: SelectChangeEvent<unknown>) => {
      const next = presetsForRole(animation.role).find(
        (candidate) => candidate.id === event.target.value
      );
      if (!next) return;
      onPatch({
        preset: next.id,
        durationMs: next.defaultDurationMs,
        easing: next.defaultEasing,
        params: defaultParams(next)
      });
    },
    [animation.role, onPatch]
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
        <NodeSelect
          value={animation.preset}
          onChange={handlePresetChange}
          inputProps={{
            "aria-label": `${animation.role} animation preset`
          }}
          fullWidth
        >
          {rolePresets.map((candidate) => (
            <NodeMenuItem key={candidate.id} value={candidate.id}>
              {candidate.id}
            </NodeMenuItem>
          ))}
        </NodeSelect>
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

      <InspectorRow label="Easing">
        <NodeSelect
          value={animation.easing ?? preset?.defaultEasing ?? "linear"}
          onChange={(event: SelectChangeEvent<unknown>) =>
            onPatch({ easing: event.target.value as EasingId })
          }
          inputProps={{
            "aria-label": `${animation.role} animation easing`
          }}
          fullWidth
        >
          {EASINGS.map((easing) => (
            <NodeMenuItem key={easing} value={easing}>
              {easing}
            </NodeMenuItem>
          ))}
        </NodeSelect>
      </InspectorRow>

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

export interface ClipAnimationsProps {
  clip: TimelineClip;
}

export const ClipAnimations: React.FC<ClipAnimationsProps> = ({ clip }) => {
  const [open, setOpen] = usePersistedFold("animate");
  const setClipAnimations = useTimelineStore(
    (state) => state.setClipAnimations
  );
  const [newRole, setNewRole] = useState<AnimationRole>("in");
  const rolePresets = presetsForRole(newRole);
  const [newPreset, setNewPreset] = useState<AnimationPreset["id"]>(
    rolePresets[0].id
  );
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

  const handleRoleChange = useCallback((event: SelectChangeEvent<unknown>) => {
    const role = event.target.value as AnimationRole;
    setNewRole(role);
    setNewPreset(presetsForRole(role)[0].id);
  }, []);

  const handleAdd = useCallback(() => {
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
            <NodeSelect
              value={newRole}
              onChange={handleRoleChange}
              inputProps={{ "aria-label": "New animation role" }}
              fullWidth
            >
              {ROLES.map((role) => (
                <NodeMenuItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </NodeMenuItem>
              ))}
            </NodeSelect>
            <NodeSelect
              value={newPreset}
              onChange={(event: SelectChangeEvent<unknown>) =>
                setNewPreset(event.target.value as AnimationPreset["id"])
              }
              inputProps={{ "aria-label": "New animation preset" }}
              fullWidth
            >
              {rolePresets.map((preset) => (
                <NodeMenuItem key={preset.id} value={preset.id}>
                  {preset.id}
                </NodeMenuItem>
              ))}
            </NodeSelect>
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
