/**
 * The start page's studios: one tile per studio in the preset catalogue, named
 * for the outcome. A tile opens the studio's target with its presets chosen
 * (see `openStudio`), so this list is data, not a set of hand-wired cards.
 */

import { memo, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import MovieCreationOutlinedIcon from "@mui/icons-material/MovieCreationOutlined";
import MusicNoteOutlinedIcon from "@mui/icons-material/MusicNoteOutlined";
import RecordVoiceOverOutlinedIcon from "@mui/icons-material/RecordVoiceOverOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import ViewDayOutlinedIcon from "@mui/icons-material/ViewDayOutlined";
import WebOutlinedIcon from "@mui/icons-material/WebOutlined";
import type { Studio } from "@nodetool-ai/presets";

import StartSection from "./StartSection";
import { CardRow, type CreationTypeCard } from "./StartCreationTypes";
import { openStudio, type StudioHosts } from "./openStudio";
import { STUDIOS } from "../../lib/presets/catalog";
import { presetText } from "../../utils/presetText";

/** Skill studios share a target type, so the outcome picks their icon. */
const STUDIO_ICONS: Readonly<Record<string, ReactNode>> = {
  "studio.music-video": <MusicNoteOutlinedIcon />
};

const iconOf = (studio: Studio): ReactNode => {
  const icon = STUDIO_ICONS[studio.id];
  if (icon) {
    return icon;
  }
  switch (studio.target.type) {
    case "create":
      return studio.target.mode === "image" ? <ImageOutlinedIcon /> : <VideocamOutlinedIcon />;
    case "effects":
      return <AutoAwesomeOutlinedIcon />;
    case "lipsync":
      return <RecordVoiceOverOutlinedIcon />;
    case "flow":
      return <ViewDayOutlinedIcon />;
    case "app":
      return <WebOutlinedIcon />;
    case "skill":
      return <MovieCreationOutlinedIcon />;
  }
};

const ACCENTS: Record<Studio["target"]["type"], string> = {
  create: "var(--palette-error-main)",
  effects: "var(--palette-secondary-main)",
  lipsync: "var(--palette-info-main)",
  flow: "var(--palette-secondary-main)",
  app: "var(--palette-success-main)",
  skill: "var(--palette-warning-main)"
};

interface StartStudiosProps extends StudioHosts {
  /** Overrides the catalogue, for tests. */
  studios?: readonly Studio[];
}

const StartStudios = ({ studios = STUDIOS, onSkill, onFlow }: StartStudiosProps) => {
  const { t } = useTranslation();
  const cards = useMemo<CreationTypeCard[]>(
    () =>
      studios.map((studio) => {
        const text = presetText(t, studio);
        return {
          id: studio.id,
          title: text.name,
          description: text.description,
          icon: iconOf(studio),
          accent: ACCENTS[studio.target.type]
        };
      }),
    [studios, t]
  );
  const handleSelect = (id: string): void => {
    const studio = studios.find((entry) => entry.id === id);
    if (studio) {
      openStudio(studio, presetText(t, studio).name, { onSkill, onFlow });
    }
  };
  if (cards.length === 0) {
    return null;
  }
  return (
    <StartSection
      id="studios"
      title={t("startStudios.title")}
      subtitle={t("startStudios.subtitle")}
    >
      <CardRow cards={cards} onSelect={handleSelect} />
    </StartSection>
  );
};

export default memo(StartStudios);
