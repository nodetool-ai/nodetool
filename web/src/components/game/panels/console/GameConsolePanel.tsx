import { useId, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { useTheme, type Theme } from "@mui/material/styles";
import { useStore } from "zustand";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningRoundedIcon from "@mui/icons-material/WarningRounded";

import { getGameConsoleStore } from "../../../../stores/game/GameConsoleStore";
import GamePanelHeader from "../../GamePanelHeader";
import {
  Box, BORDER_RADIUS, Caption, CONTROL, Divider, EditorButton, FieldDensityContext, FlexColumn, FlexRow, FONT_SIZE_SANS, ScrollArea,
  SearchInput, SPACING, TextLink, Tooltip, ToolbarIconButton, TYPOGRAPHY
} from "../../../ui_primitives";
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

const LEVEL_LABEL: Readonly<Record<GameConsoleLevel, { readonly one: string; readonly many: string }>> = {
  error: { one: "Error", many: "Errors" },
  warning: { one: "Warning", many: "Warnings" },
  log: { one: "Log", many: "Logs" }
};
const NO_ENTRIES: readonly GameConsoleEntry[] = [];

function levelColor(theme: Theme, level: GameConsoleLevel): string {
  if (level === "error") { return theme.vars.palette.error.main; }
  if (level === "warning") { return theme.vars.palette.warning.main; }
  return theme.vars.palette.text.secondary;
}

function LevelIcon({ level, color }: { readonly level: GameConsoleLevel; readonly color: string }): ReactNode {
  const sx = { fontSize: FONT_SIZE_SANS.body, color, flexShrink: 0 };
  if (level === "error") { return <ErrorRoundedIcon aria-hidden sx={sx} />; }
  if (level === "warning") { return <WarningRoundedIcon aria-hidden sx={sx} />; }
  return <InfoOutlinedIcon aria-hidden sx={sx} />;
}

/** Width of the search field in the toolbar: seven control heights, on the 4px grid. */

function tickLabel(group: GameConsoleGroup): string | null {
  if (group.tick === undefined) { return null; }
  return group.firstTick !== undefined && group.firstTick !== group.tick ? `Ticks ${group.firstTick}–${group.tick}` : `Tick ${group.tick}`;
}

/** Errors, warnings and script log lines from the play session, with filters, entity links and an assistant hand-off per line. */
export default function GameConsolePanel({ gameId, document, liveEntries = NO_ENTRIES, onSelectEntity, onAskAssistant }: GameConsolePanelProps): ReactElement {
  const theme = useTheme();
  const store = getGameConsoleStore(gameId);
  const lineId = useId();
  const stored = useStore(store, (state) => state.groups);
  const [levels, setLevels] = useState<ReadonlySet<GameConsoleLevel>>(() => new Set(GAME_CONSOLE_LEVELS));
  const [query, setQuery] = useState("");
  const entityNames = useMemo(() => new Map(document.scenes.flatMap((scene) => scene.entities.map((entity) => [JSON.stringify([scene.id, entity.id]), entity.name] as const))), [document]);
  const groups = useMemo<readonly GameConsoleGroup[]>(() => [
    ...liveEntries.map((entry, index) => ({ ...entry, id: -(index + 1), count: 1, firstTick: entry.tick })),
    ...stored
  ], [liveEntries, stored]);
  const counts = useMemo(() => countGameConsoleLevels(groups), [groups]);
  const visible = useMemo(() => filterGameConsoleGroups(groups, { levels, query },
    (group) => group.entityId ? entityNames.get(JSON.stringify([gameConsoleEntityScene(document, group.entityId, group.sceneId), group.entityId])) : undefined), [groups, levels, query, entityNames, document]);
  const toggle = (level: GameConsoleLevel): void => {
    setLevels((current) => {
      const next = new Set(current);
      if (next.has(level)) { next.delete(level); } else { next.add(level); }
      return next;
    });
  };
  return <FlexColumn sx={{ height: "100%", minHeight: 0 }}>
    <GamePanelHeader title="Console" fill>
      <FieldDensityContext.Provider value="compact">
        <SearchInput value={query} onChange={setQuery} placeholder="Filter" ariaLabel="Filter console" size="small"
          sx={{ flex: 1, minWidth: 0 }} />
      </FieldDensityContext.Provider>
      <Divider orientation="vertical" flexItem sx={{ mx: SPACING.xs, my: SPACING.xs }} />
      {GAME_CONSOLE_LEVELS.map((level) => {
        const on = levels.has(level);
        return <Tooltip key={level} title={on ? `Hide ${LEVEL_LABEL[level].many.toLowerCase()}` : `Show ${LEVEL_LABEL[level].many.toLowerCase()}`}>
          <EditorButton aria-pressed={on} aria-label={`${LEVEL_LABEL[level].many} ${counts[level]}`} onClick={() => toggle(level)}
            startIcon={<LevelIcon level={level} color={on ? levelColor(theme, level) : theme.vars.palette.text.disabled} />}
            sx={{
              height: CONTROL.height.sm, px: SPACING.sm, gap: SPACING.xs, color: on ? "text.primary" : "text.disabled",
              backgroundColor: on ? theme.vars.palette.action.selected : "transparent", fontVariantNumeric: "tabular-nums",
              "& .MuiButton-startIcon": { m: 0 },
              "&:hover": { backgroundColor: on ? theme.vars.palette.action.selected : theme.vars.palette.action.hover }
            }}>{counts[level]}</EditorButton>
        </Tooltip>;
      })}
      <Divider orientation="vertical" flexItem sx={{ mx: SPACING.xs, my: SPACING.xs }} />
      <EditorButton disabled={stored.length === 0} onClick={() => store.getState().clear()}
        sx={{ height: CONTROL.height.sm, color: "text.secondary" }}>Clear</EditorButton>
    </GamePanelHeader>
    <ScrollArea role="log" aria-label="Console" sx={{ flex: 1, minHeight: 0 }}>
      {visible.length === 0
        ? <FlexColumn align="center" gap={SPACING.micro} sx={{ px: SPACING.lg, py: SPACING.xl, textAlign: "center" }}>
          <Caption size="small" color="secondary">{groups.length === 0 ? "No console output" : "No lines match the filters"}</Caption>
          {groups.length === 0 && <Caption color="muted">Script errors, warnings and log lines appear here while the game plays.</Caption>}
        </FlexColumn>
        : <Box component="ul" aria-label="Console lines" sx={{ listStyle: "none", m: 0, p: 0 }}>
          {visible.map((group) => {
            const name = group.entityId ? entityNames.get(JSON.stringify([gameConsoleEntityScene(document, group.entityId, group.sceneId), group.entityId])) : undefined;
            const sceneId = group.entityId ? gameConsoleEntityScene(document, group.entityId, group.sceneId) : undefined;
            const ticks = tickLabel(group);
            return <FlexRow key={group.id} component="li" gap={SPACING.sm} align="flex-start" data-level={group.level}
              sx={{
                minHeight: CONTROL.height.sm, boxSizing: "border-box", px: SPACING.md, py: SPACING.xs,
                borderBottom: `1px solid ${theme.vars.palette.divider}`,
                "&:hover": { backgroundColor: theme.vars.palette.action.hover },
                "& .console-ask": { opacity: 0 },
                "&:hover .console-ask, &:focus-within .console-ask": { opacity: 1 }
              }}>
              <Box component="span" role="img" aria-label={LEVEL_LABEL[group.level].one}
                sx={{ display: "flex", alignItems: "center", height: "1.5em", ...TYPOGRAPHY.mono.code }}>
                <LevelIcon level={group.level} color={levelColor(theme, group.level)} />
              </Box>
              <Box component="span" id={`${lineId}-${group.id}`} sx={{
                ...TYPOGRAPHY.mono.code, flex: 1, minWidth: 0, color: "text.primary", overflowWrap: "anywhere", whiteSpace: "pre-wrap"
              }}>{group.message}</Box>
              <FlexRow gap={SPACING.sm} align="center" sx={{ flexShrink: 0, minHeight: "1.5em", ...TYPOGRAPHY.mono.code }}>
                {group.count > 1 && <Caption component="span" color="secondary" aria-label={`Repeated ${group.count} times`} sx={{
                  px: SPACING.xs, borderRadius: BORDER_RADIUS.pill, backgroundColor: theme.vars.palette.action.selected,
                  fontVariantNumeric: "tabular-nums"
                }}>{`×${group.count}`}</Caption>}
                {group.entityId && (sceneId
                  ? <TextLink asButton onClick={() => onSelectEntity(sceneId, group.entityId ?? "")} aria-label={`Select ${name || group.entityId}`}>
                    <Caption component="span" color="inherit">{name || group.entityId}</Caption></TextLink>
                  : <Caption component="span" color="muted">{group.entityId}</Caption>)}
                {ticks && <Caption component="span" color="muted" sx={{ fontVariantNumeric: "tabular-nums" }}>{ticks}</Caption>}
                <ToolbarIconButton className="console-ask" icon={<AutoAwesomeOutlinedIcon sx={{ fontSize: FONT_SIZE_SANS.body }} />}
                  tooltip="Ask the assistant" aria-describedby={`${lineId}-${group.id}`}
                  onClick={() => onAskAssistant(gameConsolePrompt(group, name))}
                  sx={{ p: SPACING.micro, my: -SPACING.micro }} />
              </FlexRow>
            </FlexRow>;
          })}
        </Box>}
    </ScrollArea>
  </FlexColumn>;
}
