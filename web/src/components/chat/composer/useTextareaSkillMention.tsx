/** @jsxImportSource @emotion/react */
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";

import type { RouterOutputs } from "../../../trpc/client";
import { useSkills } from "../../../hooks/skills/useSkills";
import {
  BORDER_RADIUS,
  SelectableListItem,
  Surface,
  Text,
  Z_INDEX
} from "../../ui_primitives";

type Skill = RouterOutputs["skills"]["list"][number];

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

const menuWrapperStyles = (rect: DOMRect): React.CSSProperties => ({
  position: "fixed",
  left: Math.max(8, rect.left),
  bottom: Math.max(8, window.innerHeight - rect.top + 6),
  zIndex: Z_INDEX.tooltip
});

interface SkillMentionMenuProps {
  skills: readonly Skill[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onHighlight: (index: number) => void;
}

const SkillMentionMenu: React.FC<SkillMentionMenuProps> = ({
  skills,
  selectedIndex,
  onSelect,
  onHighlight
}) => (
  <Surface
    role="listbox"
    aria-label="Skills"
    elevation={2}
    rounded="medium"
    padding={1}
    sx={{
      minWidth: 280,
      maxWidth: 420,
      maxHeight: 320,
      overflowY: "auto",
      border: "1px solid",
      borderColor: "divider"
    }}
  >
    {skills.map((skill, index) => (
      <SelectableListItem
        key={skill.id}
        role="option"
        selected={index === selectedIndex}
        aria-selected={index === selectedIndex}
        data-testid={`skill-option-${skill.name}`}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => onHighlight(index)}
        onClick={() => onSelect(index)}
        paddingX={1}
        paddingY={0.5}
        gap={0}
        sx={{
          display: "block",
          borderRadius: BORDER_RADIUS.sm
        }}
      >
        <Text size="small" weight={500} component="div">
          /{skill.name}
        </Text>
        {skill.description && (
          <Text
            size="smaller"
            color="secondary"
            truncate
            component="div"
            sx={{ mt: 0.5 }}
          >
            {skill.description}
          </Text>
        )}
      </SelectableListItem>
    ))}
    {skills.length === 0 && (
      <Text size="small" color="secondary" sx={{ px: 1, py: 0.5 }}>
        No matching skills
      </Text>
    )}
  </Surface>
);

interface UseTextareaSkillMentionOptions {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  setValue: (next: string) => void;
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
  setValue
}: UseTextareaSkillMentionOptions): UseTextareaSkillMention => {
  const { data: skills = [] } = useSkills();
  const [trigger, setTrigger] = useState<SkillTrigger | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const dismissedStartRef = useRef<number | null>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const matchingSkills = useMemo(() => {
    const query = trigger?.query.trim().toLocaleLowerCase() ?? "";
    if (!trigger) {
      return [];
    }
    return skills.filter((skill) =>
      `${skill.name} ${skill.description}`.toLocaleLowerCase().includes(query)
    );
  }, [skills, trigger]);

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

  const selectSkill = useCallback(
    (skill: Skill) => {
      if (trigger) {
        const inserted = `/${skill.name} `;
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
      const skill = matchingSkills[index];
      if (skill) {
        selectSkill(skill);
      }
    },
    [matchingSkills, selectSkill]
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
      if (matchingSkills.length === 0) {
        return false;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => (index + 1) % matchingSkills.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex(
          (index) => (index - 1 + matchingSkills.length) % matchingSkills.length
        );
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        selectIndex(Math.min(selectedIndex, matchingSkills.length - 1));
        return true;
      }
      return false;
    },
    [close, matchingSkills.length, selectIndex, selectedIndex, trigger]
  );

  const skillMenu = useMemo(() => {
    if (!trigger || !rect) {
      return null;
    }
    return createPortal(
      <div id={SKILL_MENU_ID} ref={menuRef} style={menuWrapperStyles(rect)}>
        <SkillMentionMenu
          skills={matchingSkills}
          selectedIndex={selectedIndex}
          onSelect={selectIndex}
          onHighlight={setSelectedIndex}
        />
      </div>,
      document.body
    );
  }, [matchingSkills, rect, selectIndex, selectedIndex, trigger]);

  return {
    skillMenu,
    handleKeyDown,
    isOpen: trigger !== null,
    menuId: SKILL_MENU_ID
  };
};
