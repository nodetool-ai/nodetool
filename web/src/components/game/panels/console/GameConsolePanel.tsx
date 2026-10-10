import { useId, useMemo, useState, type ReactElement } from "react";
import TerminalOutlinedIcon from "@mui/icons-material/TerminalOutlined";
import { useStore } from "zustand";

import { getGameConsoleStore } from "../../../../stores/game/GameConsoleStore";
import GamePanelHeader from "../../GamePanelHeader";
import { Box, Caption, Chip, EditorButton, EmptyState, FlexColumn, FlexRow, FONT_SIZE_SANS, ScrollArea, SearchInput, SPACING, TextLink } from "../../../ui_primitives";
import { gameConsolePrompt } from "../../gameAssistantPrompt";
import {
  countGameConsoleLevels, filterGameConsoleGroups, GAME_CONSOLE_LEVELS, gameConsoleEntityScene,
  type GameConsoleEntry, type GameConsoleGroup, type GameConsoleLevel
} from "./gameConsoleModel";

interface ConsoleDocument {
  readonly scenes: readonly { readonly id: string; readonly entities: readonly { readonly id: string; readonly name?: string }[] }[];
}

interface GameConsolePanelProps {
  readonly gameId: string;
  readonly document: ConsoleDocument;
  /** Lines that describe the current draft, such as validation errors. They are shown first and are not stored. */
  readonly liveEntries?: readonly GameConsoleEntry[];
  readonly onSelectEntity: (sceneId: string, entityId: string) => void;
  /** Writes a prompt into the editor's assistant panel without sending it. */
  readonly onAskAssistant: (prompt: string) => void;
}

const LEVEL_LABEL: Readonly<Record<GameConsoleLevel, { readonly one: string; readonly many: string; readonly color: "error" | "warning" | "muted" }>> = {
  error: { one: "Error", many: "Errors", color: "error" },
  warning: { one: "Warning", many: "Warnings", color: "warning" },
  log: { one: "Log", many: "Logs", color: "muted" }
};
const NO_ENTRIES: readonly GameConsoleEntry[] = [];

function tickLabel(group: GameConsoleGroup): string | null {
  if (group.tick === undefined) { return null; }
  return group.firstTick !== undefined && group.firstTick !== group.tick ? `Ticks ${group.firstTick}–${group.tick}` : `Tick ${group.tick}`;
}

/** Errors, warnings and script log lines from the play session, with filters, entity links and an assistant hand-off per line. */
export default function GameConsolePanel({ gameId, document, liveEntries = NO_ENTRIES, onSelectEntity, onAskAssistant }: GameConsolePanelProps): ReactElement {
  const store = getGameConsoleStore(gameId);
  const lineId = useId();
  const stored = useStore(store, (state) => state.groups);
  const [levels, setLevels] = useState<ReadonlySet<GameConsoleLevel>>(() => new Set(GAME_CONSOLE_LEVELS));
  const [query, setQuery] = useState("");
  const entityNames = useMemo(() => new Map(document.scenes.flatMap((scene) => scene.entities.map((entity) => [entity.id, entity.name] as const))), [document]);
  const groups = useMemo<readonly GameConsoleGroup[]>(() => [
    ...liveEntries.map((entry, index) => ({ ...entry, id: -(index + 1), count: 1, firstTick: entry.tick })),
    ...stored
  ], [liveEntries, stored]);
  const counts = useMemo(() => countGameConsoleLevels(groups), [groups]);
  const visible = useMemo(() => filterGameConsoleGroups(groups, { levels, query },
    (group) => group.entityId ? entityNames.get(group.entityId) : undefined), [groups, levels, query, entityNames]);
  const toggle = (level: GameConsoleLevel): void => {
    setLevels((current) => {
      const next = new Set(current);
      if (next.has(level)) { next.delete(level); } else { next.add(level); }
      return next;
    });
  };
  return <FlexColumn sx={{ height: "100%", minHeight: 0 }}>
    <GamePanelHeader title="Console" icon={<TerminalOutlinedIcon sx={{ fontSize: FONT_SIZE_SANS.body }} />}>
      <EditorButton disabled={stored.length === 0} onClick={() => store.getState().clear()}>Clear</EditorButton>
    </GamePanelHeader>
    <FlexRow gap={SPACING.xs} align="center" wrap sx={{ flexShrink: 0, px: SPACING.md, py: SPACING.xs, borderBottom: 1, borderColor: "divider" }}>
      {GAME_CONSOLE_LEVELS.map((level) => <Chip key={level} compact active={levels.has(level)} aria-pressed={levels.has(level)}
        color={levels.has(level) ? (level === "log" ? "default" : level) : "default"}
        label={`${LEVEL_LABEL[level].many} ${counts[level]}`} onClick={() => toggle(level)} />)}
      <SearchInput value={query} onChange={setQuery} placeholder="Filter messages and entities" ariaLabel="Filter console" size="small" sx={{ flex: 1, minWidth: 0 }} />
    </FlexRow>
    <ScrollArea role="log" aria-label="Console" sx={{ flex: 1, minHeight: 0 }}>
      {visible.length === 0
        ? <EmptyState title={groups.length === 0 ? "No console output" : "No lines match the filters"}
          description={groups.length === 0 ? "Script errors, warnings and log lines appear here while the game plays." : undefined} />
        : <Box component="ul" aria-label="Console lines" sx={{ listStyle: "none", m: 0, p: 0 }}>
          {visible.map((group) => {
            const name = group.entityId ? entityNames.get(group.entityId) : undefined;
            const sceneId = group.entityId ? gameConsoleEntityScene(document, group.entityId, group.sceneId) : undefined;
            const ticks = tickLabel(group);
            return <FlexRow key={group.id} component="li" gap={SPACING.sm} align="flex-start" data-level={group.level}
              sx={{ px: SPACING.md, py: SPACING.xs, borderBottom: 1, borderColor: "divider" }}>
              <Caption color={LEVEL_LABEL[group.level].color} sx={{ flexShrink: 0 }}>{LEVEL_LABEL[group.level].one}</Caption>
              {ticks && <Caption color="muted" sx={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{ticks}</Caption>}
              <Caption id={`${lineId}-${group.id}`} sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{group.message}</Caption>
              {group.count > 1 && <Chip compact label={`×${group.count}`} aria-label={`Repeated ${group.count} times`} />}
              {group.entityId && (sceneId
                ? <TextLink asButton onClick={() => onSelectEntity(sceneId, group.entityId ?? "")} aria-label={`Select ${name || group.entityId}`}>
                  <Caption component="span" color="inherit">{name || group.entityId}</Caption></TextLink>
                : <Caption color="muted">{group.entityId}</Caption>)}
              <EditorButton aria-describedby={`${lineId}-${group.id}`} onClick={() => onAskAssistant(gameConsolePrompt(group, name))}>Ask the assistant</EditorButton>
            </FlexRow>;
          })}
        </Box>}
    </ScrollArea>
  </FlexColumn>;
}
