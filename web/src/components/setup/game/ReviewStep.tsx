/**
 * Step 2 of the Game flow, second half — the design.
 *
 * Everything the designer wrote, as editable text: the title and premise, how
 * it plays, the level, how it is won and lost, each character's look, and the
 * subject of every piece of art. Nothing is generated here. Every edit writes
 * straight back to `settings.game.design`, because the document is the draft;
 * the build reads exactly what is on screen.
 *
 * A line the designer left out and the parser filled from the template's own
 * words is marked, so the creator knows it is a placeholder and not the
 * designer's idea.
 */

import React, { memo, useMemo } from "react";
import type { GameSlotSpec } from "@nodetool-ai/protocol";
import type { GameDesign } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import {
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  Text
} from "../../ui_primitives";
import { PlanReview } from "../PlanReview";
import type { PlanReviewField, PlanReviewSection } from "../PlanReview";
import ReportBugButton from "../../support/ReportBugButton";
import { describeGameSlot } from "./gameSetupModel";

export interface GameReviewStepProps {
  workflowId: string;
  design: GameDesign;
  slots: readonly GameSlotSpec[];
  /** Slot keys the parser filled, as `slot_prompts.<id>` and `cast.<id>`. */
  filled: readonly string[];
  onDesignChange: (design: GameDesign) => void;
  onRedesign: () => void;
  redesignPending: boolean;
  onCancelRedesign: () => void;
  error: string | null;
  readOnly?: boolean;
}

const FILLED_HINT =
  "The designer left this out, so it is the template's own words. Write your own.";

const ReviewStepInternal: React.FC<GameReviewStepProps> = ({
  workflowId,
  design,
  slots,
  filled,
  onDesignChange,
  onRedesign,
  redesignPending,
  onCancelRedesign,
  error,
  readOnly = false
}) => {
  const locked = readOnly || redesignPending;

  const sections = useMemo<PlanReviewSection[]>(() => {
    const field = (
      id: keyof GameDesign & string,
      label: string,
      multiline = false
    ): PlanReviewField => ({
      id,
      label,
      value: String(design[id] ?? ""),
      multiline,
      readOnly: locked,
      onChange: (value: string) => onDesignChange({ ...design, [id]: value })
    });

    const cast: PlanReviewField[] = design.cast.flatMap((member, index) => [
      {
        id: `cast-${member.slot_id}-name`,
        label: `${member.slot_id} name`,
        value: member.name,
        compact: true,
        readOnly: locked,
        onChange: (value: string) =>
          onDesignChange({
            ...design,
            cast: design.cast.map((entry, position) =>
              position === index ? { ...entry, name: value } : entry
            )
          })
      },
      {
        id: `cast-${member.slot_id}-descriptor`,
        label: `How ${member.name.trim() || member.slot_id} looks`,
        value: member.descriptor,
        multiline: true,
        readOnly: locked,
        hint: filled.includes(`cast.${member.slot_id}`)
          ? FILLED_HINT
          : undefined,
        onChange: (value: string) =>
          onDesignChange({
            ...design,
            cast: design.cast.map((entry, position) =>
              position === index ? { ...entry, descriptor: value } : entry
            )
          })
      }
    ]);

    const art: PlanReviewField[] = slots.map((slot) => {
      const sound = slot.kind === "sfx" || slot.kind === "music";
      const current =
        design.slot_prompts.find((entry) => entry.slot_id === slot.id)
          ?.prompt ?? "";
      return {
        id: `slot-${slot.id}`,
        label: describeGameSlot(slot),
        value: current,
        multiline: true,
        readOnly: locked || sound,
        hint: sound
          ? "Sounds keep the template's built-in effect for now."
          : filled.includes(`slot_prompts.${slot.id}`)
            ? FILLED_HINT
            : undefined,
        onChange: (value: string) => {
          const exists = design.slot_prompts.some(
            (entry) => entry.slot_id === slot.id
          );
          onDesignChange({
            ...design,
            slot_prompts: exists
              ? design.slot_prompts.map((entry) =>
                  entry.slot_id === slot.id
                    ? { ...entry, prompt: value }
                    : entry
                )
              : [...design.slot_prompts, { slot_id: slot.id, prompt: value }]
          });
        }
      };
    });

    return [
      {
        id: "game",
        header: "The game",
        rows: [
          field("title", "Title"),
          field("premise", "Premise", true),
          field("core_loop", "How it plays", true),
          field("level", "The level", true),
          field("win", "How you win"),
          field("lose", "How you lose")
        ]
      },
      {
        id: "cast",
        header: "Characters",
        subheader:
          "Each look is pasted into its sprite's prompt, so the art matches it.",
        rows: cast
      },
      {
        id: "art",
        header: "Art",
        subheader: "What each piece of art shows. The style is added next.",
        rows: art
      }
    ];
  }, [design, filled, locked, onDesignChange, slots]);

  return (
    <FlexColumn gap={GAP.comfortable}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Review the design
        </Text>
        <Text size="normal" color="secondary">
          Edit anything before the art is drawn. Nothing has been generated
          yet.
        </Text>
      </FlexColumn>

      <PlanReview sections={sections} />

      {error ? (
        <FlexRow gap={GAP.normal} align="center" wrap>
          <Text size="small" color="error" role="alert">
            {error}
          </Text>
          <ReportBugButton
            context={{
              source: "operation-failure",
              summary: "Designing a game failed",
              errorText: error,
              workflowId
            }}
          />
        </FlexRow>
      ) : null}

      <FlexRow gap={GAP.normal} align="center" wrap>
        <EditorButton
          variant="outlined"
          size="small"
          onClick={onRedesign}
          disabled={locked}
        >
          {redesignPending ? "Re-designing" : "Re-design"}
        </EditorButton>
        {redesignPending && !readOnly ? (
          <EditorButton variant="text" size="small" onClick={onCancelRedesign}>
            Cancel
          </EditorButton>
        ) : null}
      </FlexRow>
    </FlexColumn>
  );
};

export const GameReviewStep = memo(ReviewStepInternal);
GameReviewStep.displayName = "GameReviewStep";

export default GameReviewStep;
