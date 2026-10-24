/** @jsxImportSource @emotion/react */
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";

import type { RouterOutputs } from "../../../trpc/client";
import { useSkills } from "../../../hooks/skills/useSkills";
import { useTheme } from "@mui/material/styles";
import {
  SPACING,
  Text,
  menuItemStyles,
  menuListStyles,
  menuPaperStyles
} from "../../ui_primitives";
import {
  MENTION_MENU_MAX_HEIGHT,
  mentionMenuPosition
} from "./mentionMenuPosition";

type Skill = RouterOutputs["skills"]["list"][number];

/** A composer command the `/` menu offers above the skills, e.g. `/compact`. */
export interface SlashCommand {
  name: string;
  description: string;
}

/** One row of the `/` menu: a command or a skill, completed the same way. */
interface SlashEntry {
  key: string;
  name: string;
  description: string;
}

const NO_COMMANDS: readonly SlashCommand[] = [];

interface SkillTrigger {
  start: number;
  end: number;
  query: string;
}

const MAX_QUERY_LENGTH = 64;
const SKILL_MENU_ID = "media-chat-skill-mention-menu";

/** Find a slash command at the caret when it starts a whitespace-delimited word. */
export const findSkillTrigger = (
  value: string,
  caret: number
): SkillTrigger | null => {
  for (let index = caret - 1; index >= 0; index -= 1) {
    const character = value[index];
    if (character === "/") {
      const before = index > 0 ? value[index - 1] : "";
      if (before !== "" && !/\s/.test(before)) {
        return null;
      }
      const query = value.slice(index + 1, caret);
      if (query.length > MAX_QUERY_LENGTH || /\s/.test(query)) {
        return null;
      }
      return { start: index, end: caret, query };
    }
    if (/\s/.test(character)) {
      return null;
    }
  }
  return null;
};

const readCaret = (element: HTMLTextAreaElement, value: string): number =>
  element.selectionStart ?? value.length;


interface SkillMentionMenuProps {
  entries: readonly SlashEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onHighlight: (index: number) => void;
}

/**
 * The slash-command list under the composer. Focus stays in the textarea, so
 * this is a listbox rather than an MUI Menu; it borrows the shared menu
 * surface and row styles so it reads as one with every other menu.
 */
const SkillMentionMenu: React.FC<SkillMentionMenuProps> = ({
  entries,
  selectedIndex,
  onSelect,
  onHighlight
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <div
      role="listbox"
      aria-label={t("i18n-next54.composer.skills")}
      css={[
        menuPaperStyles(theme),
        menuListStyles(theme),
        {
          minWidth: 280,
          maxWidth: 420,
          maxHeight: MENTION_MENU_MAX_HEIGHT,
          overflowY: "auto"
        }
      ]}
    >
      {entries.map((entry, index) => (
        <div
          key={entry.key}
          role="option"
          className={index === selectedIndex ? "Mui-selected" : undefined}
          aria-selected={index === selectedIndex}
          data-testid={`skill-option-${entry.name}`}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onHighlight(index)}
          onClick={() => onSelect(index)}
          css={[menuItemStyles(theme), { display: "block", cursor: "pointer" }]}
        >
          <div>/{entry.name}</div>
          {entry.description && (
            <Text size="smaller" color="secondary" truncate component="div">
              {entry.description}
            </Text>
          )}
        </div>
      ))}
      {entries.length === 0 && (
        <Text
          size="small"
          color="secondary"
          sx={{ px: SPACING.lg, py: SPACING.xs }}
        >
          {t("i18n-next54.composer.noMatchingSkills")}
        </Text>
      )}
    </div>
  );
};

interface UseTextareaSkillMentionOptions {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  setValue: (next: string) => void;
  /** Commands listed above the skills. */
  commands?: readonly SlashCommand[];
}

interface UseTextareaSkillMention {
  skillMenu: React.ReactNode;
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  isOpen: boolean;
  menuId: string;
}

/** Wire caret-aware `/skill` autocomplete into a plain textarea. */
export const useTextareaSkillMention = ({
  textareaRef,
  value,
  setValue,
  commands = NO_COMMANDS
}: UseTextareaSkillMentionOptions): UseTextareaSkillMention => {
  // The shipped skills answer to `/name` in a turn exactly as a user's own row
  // does, so the menu that completes that name offers both.
  const { data: skills = [] } = useSkills({ includeSystem: true });
  const [trigger, setTrigger] = useState<SkillTrigger | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const dismissedStartRef = useRef<number | null>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const matchingEntries = useMemo((): SlashEntry[] => {
    const query = trigger?.query.trim().toLocaleLowerCase() ?? "";
    if (!trigger) {
      return [];
    }
    const matches = (entry: { name: string; description: string }) =>
      `${entry.name} ${entry.description}`.toLocaleLowerCase().includes(query);
    return [
      ...commands
        .filter(matches)
        .map((command) => ({
          key: `command:${command.name}`,
          name: command.name,
          description: command.description
        })),
      ...skills.filter(matches).map((skill: Skill) => ({
        key: skill.id,
        name: skill.name,
        description: skill.description
      }))
    ];
  }, [commands, skills, trigger]);

  const measure = useCallback(() => {
    const element = textareaRef.current;
    if (element) {
      setRect(element.getBoundingClientRect());
    }
  }, [textareaRef]);

  const close = useCallback(() => {
    setTrigger(null);
    setSelectedIndex(0);
  }, []);

  const syncFromTextarea = useCallback(() => {
    const element = textareaRef.current;
    if (!element) {
      close();
      return;
    }
    const next = findSkillTrigger(value, readCaret(element, value));
    if (!next) {
      dismissedStartRef.current = null;
      close();
      return;
    }
    if (dismissedStartRef.current === next.start) {
      return;
    }
    dismissedStartRef.current = null;
    setTrigger((previous) => {
      if (!previous || previous.start !== next.start) {
        setSelectedIndex(0);
      }
      return next;
    });
    measure();
  }, [close, measure, textareaRef, value]);

  useEffect(() => {
    syncFromTextarea();
  }, [syncFromTextarea]);

  useEffect(() => {
    const onSelectionChange = () => {
      if (document.activeElement === textareaRef.current) {
        syncFromTextarea();
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [syncFromTextarea, textareaRef]);

  useEffect(() => {
    if (!trigger) {
      return;
    }
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [measure, trigger]);

  useEffect(() => {
    if (!trigger) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || textareaRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      dismissedStartRef.current = trigger.start;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [close, textareaRef, trigger]);

  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) {
      return;
    }
    pendingCaretRef.current = null;
    const element = textareaRef.current;
    if (element) {
      element.focus();
      element.setSelectionRange(caret, caret);
    }
  }, [textareaRef, value]);

  const selectEntry = useCallback(
    (entry: SlashEntry) => {
      if (trigger) {
        const inserted = `/${entry.name} `;
        pendingCaretRef.current = trigger.start + inserted.length;
        setValue(
          value.slice(0, trigger.start) + inserted + value.slice(trigger.end)
        );
      }
      close();
    },
    [close, setValue, trigger, value]
  );

  const selectIndex = useCallback(
    (index: number) => {
      const entry = matchingEntries[index];
      if (entry) {
        selectEntry(entry);
      }
    },
    [matchingEntries, selectEntry]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!trigger) {
        return false;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        dismissedStartRef.current = trigger.start;
        close();
        return true;
      }
      if (matchingEntries.length === 0) {
        return false;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => (index + 1) % matchingEntries.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex(
          (index) => (index - 1 + matchingEntries.length) % matchingEntries.length
        );
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        selectIndex(Math.min(selectedIndex, matchingEntries.length - 1));
        return true;
      }
      return false;
    },
    [close, matchingEntries.length, selectIndex, selectedIndex, trigger]
  );

  const skillMenu = useMemo(() => {
    if (!trigger || !rect) {
      return null;
    }
    return createPortal(
      <div id={SKILL_MENU_ID} ref={menuRef} style={mentionMenuPosition(rect)}>
        <SkillMentionMenu
          entries={matchingEntries}
          selectedIndex={selectedIndex}
          onSelect={selectIndex}
          onHighlight={setSelectedIndex}
        />
      </div>,
      document.body
    );
  }, [matchingEntries, rect, selectIndex, selectedIndex, trigger]);

  return {
    skillMenu,
    handleKeyDown,
    isOpen: trigger !== null,
    menuId: SKILL_MENU_ID
  };
};
