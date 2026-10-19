/**
 * ShotInsertPoint — the `+` that appears between two cards on hover and adds a
 * shot there (PRD § 7.4).
 *
 * It sits in the grid's gap, on the trailing edge of the card it follows, so
 * the click reads as "insert here" rather than "add to the end". The insert
 * itself is `insertShot(afterShotId)`: the store places the new shot in that
 * shot's scene and reindexes the board, so nothing here has to know the order.
 *
 * Hidden by opacity rather than removed from the DOM, so it stays reachable by
 * keyboard: tabbing to it makes it visible through `:focus-within` on the card
 * wrapper.
 */

import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/AddOutlined";

import {
  FlexRow,
  MOTION,
  SPACING_PX,
  ToolbarIconButton
} from "../ui_primitives";

export interface ShotInsertPointProps {
  /** The new shot lands directly after this one. */
  afterShotId: string;
  /** Position after this shot, including its caption. */
  label: string;
  onInsert: (afterShotId: string) => void;
}

/** The class the card wrapper's hover and focus rules target. */
export const SHOT_INSERT_POINT_CLASS = "shot-insert-point";

const slotSx = {
  position: "absolute",
  top: 0,
  bottom: 0,
  // Half the grid's gap (SPACING.xl, 16px) out, so the button is centred on
  // the seam between two cards rather than sitting inside either one.
  right: `-${SPACING_PX.md}px`,
  opacity: 0,
  transition: MOTION.opacity
} as const;

const ShotInsertPointInner: React.FC<ShotInsertPointProps> = ({
  afterShotId,
  label,
  onInsert
}) => {
  const { t } = useTranslation();
  const handleClick = useCallback(() => {
    onInsert(afterShotId);
  }, [onInsert, afterShotId]);
  const position = label.trim();
  const insertLabel = position
    ? t("screens4_17.storyboard.shotInsertPoint.insertAfter", {
        label: position
      })
    : t("screens4_17.storyboard.shotInsertPoint.insert");

  return (
    <FlexRow className={SHOT_INSERT_POINT_CLASS} align="center" sx={slotSx}>
      <ToolbarIconButton
        size="small"
        icon={<AddIcon fontSize="small" />}
        tooltip={insertLabel}
        aria-label={insertLabel}
        onClick={handleClick}
      />
    </FlexRow>
  );
};

export const ShotInsertPoint = memo(ShotInsertPointInner);
ShotInsertPoint.displayName = "ShotInsertPoint";

export default ShotInsertPoint;
