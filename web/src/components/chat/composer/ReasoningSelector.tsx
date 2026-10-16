import React, { memo, useCallback, useRef, useState } from "react";
import PsychologyIcon from "@mui/icons-material/PsychologyOutlined";
import {
  supportsReasoningEffort,
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

const LEVELS: LevelItem[] = [
  {
    id: null,
    label: "Default",
    description: "The model's own setting."
  },
  {
    id: "low",
    label: "Low",
    description: "Answers fast with little reasoning."
  },
  {
    id: "medium",
    label: "Medium",
    description: "Balances speed and depth."
  },
  {
    id: "high",
    label: "High",
    description: "Reasons longest. Slower and costs more."
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
 * Composer-footer dropdown for the chat reasoning level. Renders nothing for
 * a model that takes no reasoning level, so the select appears only where
 * the provider will act on it.
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

  const handleSelect = useCallback(
    (next: ReasoningEffort | null) => {
      setReasoningEffort(next);
      setOpen(false);
    },
    [setReasoningEffort]
  );

  if (!supportsReasoningEffort(provider, model)) {
    return null;
  }

  const active = LEVELS.find((level) => level.id === effort) ?? LEVELS[0];

  return (
    <>
      <MediaControlChip
        ref={buttonRef}
        className="reasoning-selector-trigger"
        icon={<PsychologyIcon fontSize="small" />}
        label={compact ? undefined : active.label}
        title={`Reasoning: ${active.label}`}
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
        slotProps={{ list: { "aria-label": "Reasoning level" } }}
      >
        <ListSubheader>Reasoning</ListSubheader>
        {LEVELS.map((level) => (
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
