import React, { memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import PsychologyIcon from "@mui/icons-material/PsychologyOutlined";
import {
  reasoningEffortLevels,
  type ReasoningEffort
} from "@nodetool-ai/protocol";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import MediaControlChip from "./MediaControlChip";
import {
  ContextMenu,
  ListSubheader,
  MenuItemPrimitive
} from "../../ui_primitives";

interface LevelItem {
  id: ReasoningEffort | null;
  label: string;
  description: string;
}

const LEVEL_IDS: Array<{ id: ReasoningEffort | null; key: string; descriptionKey: string }> = [
  {
    id: null,
    key: "default",
    descriptionKey: "defaultDescription"
  },
  {
    id: "low",
    key: "low",
    descriptionKey: "lowDescription"
  },
  {
    id: "medium",
    key: "medium",
    descriptionKey: "mediumDescription"
  },
  {
    id: "high",
    key: "high",
    descriptionKey: "highDescription"
  },
  {
    id: "xhigh",
    key: "xhigh",
    descriptionKey: "xhighDescription"
  }
];

interface ReasoningSelectorProps {
  /** The chat model the next turn runs on. */
  provider?: string | null;
  model?: string | null;
  /** Icon only, no label. The composer sets it from its own width. */
  compact?: boolean;
}

/**
 * Composer-footer dropdown for the chat reasoning level. Lists only the
 * levels the picked model accepts and renders nothing for a model that takes
 * none, so the select appears only where the provider will act on it.
 */
const ReasoningSelector: React.FC<ReasoningSelectorProps> = ({
  provider,
  model,
  compact = false
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const effort = useGlobalChatStore((s) => s.reasoningEffort);
  const setReasoningEffort = useGlobalChatStore((s) => s.setReasoningEffort);
  const { t } = useTranslation();
  const accepted = reasoningEffortLevels(provider, model);
  const levels: LevelItem[] = LEVEL_IDS.filter(
    (level) => level.id === null || accepted.includes(level.id)
  ).map((level) => ({
    id: level.id,
    label: t(`i18n-next54.composer.reasoning.${level.key}`),
    description: t(`i18n-next54.composer.reasoning.${level.descriptionKey}`)
  }));

  const handleSelect = useCallback(
    (next: ReasoningEffort | null) => {
      setReasoningEffort(next);
      setOpen(false);
    },
    [setReasoningEffort]
  );

  if (accepted.length === 0) {
    return null;
  }

  const active = levels.find((level) => level.id === effort) ?? levels[0];

  return (
    <>
      <MediaControlChip
        ref={buttonRef}
        className="reasoning-selector-trigger"
        icon={<PsychologyIcon fontSize="small" />}
        label={compact ? undefined : active.label}
        title={t("i18n-next54.composer.reasoning.titleWithLevel", { level: active.label })}
        active={open}
        showChevron
        onClick={() => setOpen(true)}
      />
      <ContextMenu
        open={open}
        anchorEl={buttonRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
        minWidth={240}
        paperSx={{ maxWidth: 320 }}
        slotProps={{ list: { "aria-label": t("i18n-next54.composer.reasoning.level") } }}
      >
        <ListSubheader>{t("i18n-next54.composer.reasoning.title")}</ListSubheader>
        {levels.map((level) => (
          <MenuItemPrimitive
            key={level.label}
            label={level.label}
            secondary={level.description}
            checkable="radio"
            checked={level.id === effort}
            onClick={() => handleSelect(level.id)}
          />
        ))}
      </ContextMenu>
    </>
  );
};

export default memo(ReasoningSelector);
