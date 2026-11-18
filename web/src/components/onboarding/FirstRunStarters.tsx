/**
 * First-run starters on Home, shown until the person sees a first result.
 *
 * One guided first task sends a short, filled-in prompt to chat, which
 * answers in seconds on the default text model. Below it, one card each for
 * the three things new people reached for: a game, a storyboard and a
 * template. Each card opens its document already filled in, on the step
 * whose button produces output.
 *
 * Mounting records `first_run_viewed`, which on Cloud is also when the
 * anonymous usage-statistics question is asked.
 */

import React, { memo, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import SportsEsportsOutlinedIcon from "@mui/icons-material/SportsEsportsOutlined";
import ViewDayOutlinedIcon from "@mui/icons-material/ViewDayOutlined";

import { CardRow, type CreationTypeCard } from "../projects/StartCreationTypes";
import {
  BORDER_RADIUS,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  PADDING,
  Text
} from "../ui_primitives";
import { noteFirstRunViewed, noteStarterSelected } from "../../lib/analytics";
import { useFirstRunStarters, type FirstRunCardId } from "./useFirstRunStarters";

export interface FirstRunStartersProps {
  /** Send this prompt to chat on the default model. */
  onTryFirstTask: (prompt: string) => void;
  /** The host is already starting something, so the first task waits. */
  busy?: boolean;
}

const CARD_IDS: readonly FirstRunCardId[] = ["game", "storyboard", "template"];

const CARD_ICONS: Record<FirstRunCardId, React.ReactNode> = {
  game: <SportsEsportsOutlinedIcon />,
  storyboard: <ViewDayOutlinedIcon />,
  template: <AccountTreeOutlinedIcon />
};

const CARD_ACCENTS: Record<FirstRunCardId, string> = {
  game: "var(--palette-warning-main)",
  storyboard: "var(--palette-secondary-main)",
  template: "var(--palette-success-main)"
};

/** Narrowest a card gets before the row drops a column, in px. */
const CARD_MIN_WIDTH = 240;

const FirstRunStarters: React.FC<FirstRunStartersProps> = ({ onTryFirstTask, busy = false }) => {
  const { t } = useTranslation();
  const { start, starting } = useFirstRunStarters();

  useEffect(() => {
    noteFirstRunViewed();
  }, []);

  const cards = useMemo<CreationTypeCard[]>(
    () =>
      CARD_IDS.map((id) => ({
        id,
        title: t(`firstRun.${id}.title`),
        description: t(`firstRun.${id}.description`),
        meta: starting === id ? t("firstRun.opening") : undefined,
        icon: CARD_ICONS[id],
        accent: CARD_ACCENTS[id],
        disabled: starting !== null && starting !== id
      })),
    [starting, t]
  );

  const firstPrompt = t("firstRun.firstTask.prompt");

  return (
    <FlexColumn
      component="section"
      aria-label={t("firstRun.ariaLabel")}
      gap={GAP.comfortable}
      sx={{ width: "100%" }}
    >
      <FlexColumn gap={GAP.micro}>
        <Text component="h2" size="big" weight={500}>
          {t("firstRun.heading")}
        </Text>
        <Caption color="secondary">{t("firstRun.subline")}</Caption>
      </FlexColumn>

      <FlexRow
        align="center"
        gap={GAP.comfortable}
        wrap
        sx={{
          p: PADDING.comfortable,
          border: "1px solid",
          borderColor: "primary.main",
          borderRadius: BORDER_RADIUS.lg,
          bgcolor: "background.paper"
        }}
      >
        <FlexColumn gap={GAP.micro} sx={{ flex: 1, minWidth: 0 }}>
          <Caption color="secondary">{t("firstRun.firstTask.label")}</Caption>
          <Text component="q">{firstPrompt}</Text>
          <Caption color="muted">{t("firstRun.firstTask.hint")}</Caption>
        </FlexColumn>
        <EditorButton
          variant="contained"
          disabled={busy || starting !== null}
          onClick={() => {
            noteStarterSelected("first_task");
            onTryFirstTask(firstPrompt);
          }}
          sx={{ flexShrink: 0 }}
        >
          {t("firstRun.firstTask.action")}
        </EditorButton>
      </FlexRow>

      <CardRow
        cards={cards}
        minItemWidth={CARD_MIN_WIDTH}
        onSelect={(id) => {
          if (id === "game" || id === "storyboard" || id === "template") {
            void start(id);
          }
        }}
      />
    </FlexColumn>
  );
};

export default memo(FirstRunStarters);
