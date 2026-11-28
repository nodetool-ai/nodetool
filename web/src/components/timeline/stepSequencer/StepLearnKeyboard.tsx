/**
 * The on-screen keyboard for Learn (SQ38, F23): each key sends its note to
 * Learn as a played note followed by its release, the same as hardware MIDI.
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";

import { EditorButton, FlexRow, SPACING } from "../../ui_primitives";
import { pitchName } from "../pianoRoll/pianoRollGeometry";

/** Two octaves from C2, the General MIDI drum range. */
const LOW_PITCH = 36;
const KEY_COUNT = 24;
const KEY_VELOCITY = 100;

interface Props {
  onNote: (pitch: number, velocity: number) => void;
  onRelease: () => void;
}

export const StepLearnKeyboard: React.FC<Props> = memo(({ onNote, onRelease }) => {
  const { t } = useTranslation();
  return (
    <FlexRow
      gap={SPACING.none}
      role="group"
      aria-label={t("stepSequencer.learnKeyboard")}
      data-testid="learn-keyboard"
      sx={{ px: SPACING.sm, py: SPACING.xs, overflowX: "auto", flexShrink: 0 }}
    >
      {Array.from({ length: KEY_COUNT }, (_, i) => {
        const pitch = LOW_PITCH + i;
        const name = pitchName(pitch);
        const black = name.includes("#");
        return (
          <EditorButton
            key={pitch}
            density="compact"
            variant={black ? "contained" : "outlined"}
            color="inherit"
            aria-label={name}
            onClick={() => {
              onNote(pitch, KEY_VELOCITY);
              onRelease();
            }}
          >
            {name}
          </EditorButton>
        );
      })}
    </FlexRow>
  );
});
StepLearnKeyboard.displayName = "StepLearnKeyboard";
