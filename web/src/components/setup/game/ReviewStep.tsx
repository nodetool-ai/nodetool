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
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
import ErrorBanner from "../../support/ErrorBanner";

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

const describeSlot = (slot: GameSlotSpec, t: TFunction): string => {
  switch (slot.kind) {
    case "spritesheet": {
      const animations = Object.entries(slot.animations)
        .map(([name, frames]) =>
          frames === 1
            ? name
            : t("pass3_6.game.review.animationFrames", { name, count: frames })
        )
        .join(", ");
      return t("pass3_6.game.review.slotSprite", {
        id: slot.id,
        width: slot.cell[0],
        height: slot.cell[1],
        animations
      });
    }
    case "tileset":
      return t("pass3_6.game.review.slotTile", {
        id: slot.id,
        width: slot.cell[0],
        height: slot.cell[1]
      });
    case "image":
      return t("pass3_6.game.review.slotImage", {
        id: slot.id,
        width: slot.size[0],
        height: slot.size[1]
      });
    case "sfx":
      return t("pass3_6.game.review.slotSound", { id: slot.id });
    case "music":
      return t("pass3_6.game.review.slotMusic", { id: slot.id });
  }
};

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
  const { t } = useTranslation();
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
        label: t("pass3_6.game.review.characterNameLabel", {
          slot: member.slot_id
        }),
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
        label: t("pass3_6.game.review.characterLookLabel", {
          name: member.name.trim() || member.slot_id
        }),
        value: member.descriptor,
        multiline: true,
        readOnly: locked,
        hint: filled.includes(`cast.${member.slot_id}`)
          ? t("pass3_6.game.review.filledHint")
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
        label: describeSlot(slot, t),
        value: current,
        multiline: true,
        readOnly: locked || sound,
        hint: sound
          ? t("pass3_6.game.review.soundHint")
          : filled.includes(`slot_prompts.${slot.id}`)
            ? t("pass3_6.game.review.filledHint")
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
        header: t("pass3_6.game.review.gameSection"),
        rows: [
          field("title", t("pass3_6.game.review.titleField")),
          field("premise", t("pass3_6.game.review.premiseField"), true),
          field("core_loop", t("pass3_6.game.review.coreLoopField"), true),
          field("level", t("pass3_6.game.review.levelField"), true),
          field("win", t("pass3_6.game.review.winField")),
          field("lose", t("pass3_6.game.review.loseField"))
        ]
      },
      {
        id: "cast",
        header: t("pass3_6.game.review.charactersSection"),
        subheader: t("pass3_6.game.review.charactersDescription"),
        rows: cast
      },
      {
        id: "art",
        header: t("pass3_6.game.review.artSection"),
        subheader: t("pass3_6.game.review.artDescription"),
        rows: art
      }
    ];
  }, [design, filled, locked, onDesignChange, slots, t]);

  return (
    <FlexColumn gap={GAP.comfortable}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          {t("pass3_6.game.review.heading")}
        </Text>
        <Text size="normal" color="secondary">
          {t("pass3_6.game.review.description")}
        </Text>
      </FlexColumn>

      <PlanReview sections={sections} />

      {error ? (
        <ErrorBanner
          report={{
            source: "operation-failure",
            summary: t("pass3_6.game.review.designFailed"),
            errorText: error,
            workflowId
          }}
        >
          {error}
        </ErrorBanner>
      ) : null}

      <FlexRow gap={GAP.normal} align="center" wrap>
        <EditorButton
          variant="outlined"
          size="small"
          onClick={onRedesign}
          disabled={locked}
        >
          {redesignPending
            ? t("pass3_6.game.review.redesigning")
            : t("pass3_6.game.review.redesign")}
        </EditorButton>
        {redesignPending && !readOnly ? (
          <EditorButton variant="text" size="small" onClick={onCancelRedesign}>
            {t("pass3_6.game.review.cancelRedesign")}
          </EditorButton>
        ) : null}
      </FlexRow>
    </FlexColumn>
  );
};

export const GameReviewStep = memo(ReviewStepInternal);
GameReviewStep.displayName = "GameReviewStep";

export default GameReviewStep;
