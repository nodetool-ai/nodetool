/**
 * Step 2 of the Game flow, second half — the design review (game-prd § 4.2).
 *
 * The whole design as editable text: one section per row of the PRD's table,
 * every field written straight back onto the document as it is typed, because
 * the document is the draft. Nothing here places a node, generates an asset or
 * spends anything; the one model call it can make is `Re-design`.
 *
 * The slot rows carry the id, kind and exact pixel size the generator will be
 * asked for as read-only meta, so a creator editing a prompt can see what it is
 * a prompt for. A slot the parser had to fill from the manifest says so — that
 * line is the template's words, not the designer's.
 */

import React, { memo, useMemo } from "react";
import { gameSlotPrompt, type GameSlotSpec } from "@nodetool-ai/protocol";
import type {
  GameCastMember,
  GameDesign,
  GameEnemy
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import {
  AlertBanner,
  Caption,
  FlexColumn,
  GAP,
  Text
} from "../../ui_primitives";
import { PlanReview } from "../PlanReview";
import type { PlanReviewSection } from "../PlanReview";
import { REVIEW_CONTENT_WIDTH } from "../reviewStyles";

export interface GameReviewStepProps {
  design: GameDesign;
  /** The chosen template's slots, in manifest order. */
  slots: readonly GameSlotSpec[];
  /** Replaces the whole design; the document is the draft. */
  onDesignChange: (design: GameDesign) => void;
  onRedesign: () => void;
  redesignPending?: boolean;
  /** Slot ids the parser filled from the manifest on the last design run. */
  filled?: readonly string[];
  /** The reason the last designer run was refused, if it was. */
  error?: string | null;
}

/** "spritesheet · 128×64 px", off the slot spec the generator will be given. */
export const slotMeta = (slot: GameSlotSpec): string => {
  if (slot.kind === "sfx" || slot.kind === "music") {
    return `${slot.kind} · ${slot.seconds}s`;
  }
  const built = gameSlotPrompt(slot, "", null, []);
  return `${slot.kind} · ${built.width}×${built.height} px`;
};

const ReviewStepInternal: React.FC<GameReviewStepProps> = ({
  design,
  slots,
  onDesignChange,
  onRedesign,
  redesignPending = false,
  filled = [],
  error = null
}) => {
  const patch = useMemo(
    () => (fields: Partial<GameDesign>) =>
      onDesignChange({ ...design, ...fields }),
    [design, onDesignChange]
  );

  const patchCast = useMemo(
    () => (slotId: string, fields: Partial<GameCastMember>) =>
      onDesignChange({
        ...design,
        cast: design.cast.map((entry) =>
          entry.slot_id === slotId ? { ...entry, ...fields } : entry
        )
      }),
    [design, onDesignChange]
  );

  const patchEnemy = useMemo(
    () => (slotId: string, fields: Partial<GameEnemy>) =>
      onDesignChange({
        ...design,
        enemies: design.enemies.map((entry) =>
          entry.slot_id === slotId ? { ...entry, ...fields } : entry
        )
      }),
    [design, onDesignChange]
  );

  const patchPrompt = useMemo(
    () => (slotId: string, prompt: string) =>
      onDesignChange({
        ...design,
        slot_prompts: design.slot_prompts.some(
          (entry) => entry.slot_id === slotId
        )
          ? design.slot_prompts.map((entry) =>
              entry.slot_id === slotId ? { ...entry, prompt } : entry
            )
          : [...design.slot_prompts, { slot_id: slotId, prompt }]
      }),
    [design, onDesignChange]
  );

  const sections = useMemo<PlanReviewSection[]>(() => {
    const promptOf = (slotId: string) =>
      design.slot_prompts.find((entry) => entry.slot_id === slotId)?.prompt ??
      "";
    return [
      {
        id: "design",
        header: "Your game",
        rows: [
          {
            id: "title",
            label: "Title",
            value: design.title,
            onChange: (value: string) => patch({ title: value })
          },
          {
            id: "premise",
            label: "Premise",
            value: design.premise,
            multiline: true,
            onChange: (value: string) => patch({ premise: value })
          },
          {
            id: "core_loop",
            label: "Core loop",
            value: design.core_loop,
            multiline: true,
            onChange: (value: string) => patch({ core_loop: value })
          },
          {
            id: "player_verbs",
            label: "Player verbs",
            value: design.player_verbs.join(", "),
            placeholder: "move, jump, shoot",
            onChange: (value: string) =>
              patch({
                player_verbs: value
                  .split(",")
                  .map((verb) => verb.trim())
                  .filter((verb) => verb.length > 0)
              })
          },
          {
            id: "level",
            label: "Level",
            value: design.level,
            multiline: true,
            onChange: (value: string) => patch({ level: value })
          },
          {
            id: "win",
            label: "Win",
            value: design.win,
            onChange: (value: string) => patch({ win: value })
          },
          {
            id: "lose",
            label: "Lose",
            value: design.lose,
            onChange: (value: string) => patch({ lose: value })
          }
        ]
      },
      ...(design.enemies.length > 0
        ? [
            {
              id: "enemies",
              header: "Enemies",
              subheader: "What each one does in the loop.",
              rows: [],
              groups: design.enemies.map((enemy) => ({
                id: `enemy-${enemy.slot_id}`,
                header: enemy.name || enemy.slot_id,
                meta: enemy.slot_id,
                rows: [
                  {
                    id: `enemy-${enemy.slot_id}-name`,
                    label: "Name",
                    value: enemy.name,
                    onChange: (value: string) =>
                      patchEnemy(enemy.slot_id, { name: value })
                  },
                  {
                    id: `enemy-${enemy.slot_id}-behaviour`,
                    label: "Behaviour",
                    value: enemy.behaviour,
                    multiline: true,
                    onChange: (value: string) =>
                      patchEnemy(enemy.slot_id, { behaviour: value })
                  }
                ]
              }))
            }
          ]
        : []),
      {
        id: "cast",
        header: "Cast",
        subheader:
          "Silhouette, colours and proportions — no pose. Every frame of this character's sheet carries it.",
        rows: [],
        groups: design.cast.map((member) => ({
          id: `cast-${member.slot_id}`,
          header: member.name || member.slot_id,
          meta: member.slot_id,
          rows: [
            {
              id: `cast-${member.slot_id}-name`,
              label: "Name",
              value: member.name,
              onChange: (value: string) =>
                patchCast(member.slot_id, { name: value })
            },
            {
              id: `cast-${member.slot_id}-descriptor`,
              label: "Descriptor",
              value: member.descriptor,
              multiline: true,
              onChange: (value: string) =>
                patchCast(member.slot_id, { descriptor: value })
            }
          ]
        }))
      },
      {
        id: "slots",
        header: "Asset prompts",
        subheader:
          "The subject of each asset. The style, the pixel size and the sheet layout are added when it is generated.",
        rows: [],
        groups: slots.map((slot) => ({
          id: `slot-${slot.id}`,
          header: slot.id,
          meta: slotMeta(slot),
          rows: [
            {
              id: `slot-${slot.id}-prompt`,
              label: `${slot.id} prompt`,
              hideLabel: true,
              value: promptOf(slot.id),
              multiline: true,
              placeholder: "What this asset shows",
              onChange: (value: string) => patchPrompt(slot.id, value)
            }
          ]
        }))
      }
    ];
  }, [design, patch, patchCast, patchEnemy, patchPrompt, slots]);

  return (
    <FlexColumn
      gap={GAP.spacious}
      sx={{ width: "100%", maxWidth: REVIEW_CONTENT_WIDTH }}
    >
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Your design
        </Text>
        <Text size="normal" color="secondary">
          Read it, change anything, then choose the look. Nothing is generated
          yet.
        </Text>
      </FlexColumn>

      {error ? (
        <AlertBanner severity="error" role="alert">
          {error}
        </AlertBanner>
      ) : null}

      {filled.length > 0 ? (
        <Caption color="secondary" component="p">
          {`The designer skipped ${filled.length} field${
            filled.length === 1 ? "" : "s"
          }, filled from the template: ${filled.join(", ")}. Rewrite them in your own words.`}
        </Caption>
      ) : null}

      <PlanReview
        sections={sections}
        replanLabel="Re-design"
        onReplan={onRedesign}
        replanPending={redesignPending}
      />
    </FlexColumn>
  );
};

export const GameReviewStep = memo(ReviewStepInternal);
GameReviewStep.displayName = "GameReviewStep";

export default GameReviewStep;
