import { useId, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useTheme, type Theme } from "@mui/material/styles";
import { useStore } from "zustand";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningRoundedIcon from "@mui/icons-material/WarningRounded";

import { getGameConsoleStore } from "../../../../stores/game/GameConsoleStore";
import DockPanelHeader from "../../../dock/DockPanelHeader";
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

function tickLabel(group: GameConsoleGroup, t: ReturnType<typeof useTranslation>["t"]): string | null {
  if (group.tick === undefined) { return null; }
  return group.firstTick !== undefined && group.firstTick !== group.tick
    ? t("screen_game.console.ticksRange", { start: group.firstTick, end: group.tick }) : t("screen_game.console.tick", { tick: group.tick });
}

/** Errors, warnings and script log lines from the play session, with filters, entity links and an assistant hand-off per line. */
export default function GameConsolePanel({ gameId, document, liveEntries = NO_ENTRIES, onSelectEntity, onAskAssistant }: GameConsolePanelProps): ReactElement {
  const { t } = useTranslation();
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
    <DockPanelHeader title={t("screen_game.console.title")} fill>
      <FieldDensityContext.Provider value="compact">
        <SearchInput value={query} onChange={setQuery} placeholder={t("screen_game.console.filterPlaceholder")} ariaLabel={t("screen_game.console.filterLabel")} size="small"
          sx={{ flex: 1, minWidth: 0 }} />
      </FieldDensityContext.Provider>
      <Divider orientation="vertical" flexItem sx={{ mx: SPACING.xs, my: SPACING.xs }} />
      {GAME_CONSOLE_LEVELS.map((level) => {
        const on = levels.has(level);
        const label = t(`screen_game.console.levels.${level}`);
        return <Tooltip key={level} title={on ? t("screen_game.console.hideLevel", { level: label }) : t("screen_game.console.showLevel", { level: label })}>
          <EditorButton aria-pressed={on} aria-label={t("screen_game.console.levelCount", { level: label, count: counts[level] })} onClick={() => toggle(level)}
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
        sx={{ height: CONTROL.height.sm, color: "text.secondary" }}>{t("screen_game.console.clear")}</EditorButton>
    </DockPanelHeader>
    <ScrollArea role="log" aria-label={t("screen_game.console.title")} sx={{ flex: 1, minHeight: 0 }}>
      {visible.length === 0
        ? <FlexColumn align="center" gap={SPACING.micro} sx={{ px: SPACING.lg, py: SPACING.xl, textAlign: "center" }}>
          <Caption size="small" color="secondary">{groups.length === 0 ? t("screen_game.console.noOutput") : t("screen_game.console.noMatches")}</Caption>
          {groups.length === 0 && <Caption color="muted">{t("screen_game.console.emptyDescription")}</Caption>}
        </FlexColumn>
        : <Box component="ul" aria-label={t("i18n-next101.game.console.linesAria")} sx={{ listStyle: "none", m: 0, p: 0 }}>
          {visible.map((group) => {
            const name = group.entityId ? entityNames.get(JSON.stringify([gameConsoleEntityScene(document, group.entityId, group.sceneId), group.entityId])) : undefined;
            const sceneId = group.entityId ? gameConsoleEntityScene(document, group.entityId, group.sceneId) : undefined;
            const ticks = tickLabel(group, t);
            return <FlexRow key={group.id} component="li" gap={SPACING.sm} align="flex-start" data-level={group.level}
              sx={{
                minHeight: CONTROL.height.sm, boxSizing: "border-box", px: SPACING.md, py: SPACING.xs,
                borderBottom: `1px solid ${theme.vars.palette.divider}`,
                "&:hover": { backgroundColor: theme.vars.palette.action.hover },
                "& .console-ask": { opacity: 0 },
                "&:hover .console-ask, &:focus-within .console-ask": { opacity: 1 }
              }}>
              <Box component="span" role="img" aria-label={t(`screen_game.console.levels.${group.level}`)}
                sx={{ display: "flex", alignItems: "center", height: "1.5em", ...TYPOGRAPHY.mono.code }}>
                <LevelIcon level={group.level} color={levelColor(theme, group.level)} />
              </Box>
              <Box component="span" id={`${lineId}-${group.id}`} sx={{
                ...TYPOGRAPHY.mono.code, flex: 1, minWidth: 0, color: "text.primary", overflowWrap: "anywhere", whiteSpace: "pre-wrap"
              }}>{group.message}</Box>
              <FlexRow gap={SPACING.sm} align="center" sx={{ flexShrink: 0, minHeight: "1.5em", ...TYPOGRAPHY.mono.code }}>
                {group.count > 1 && <Caption component="span" color="secondary" aria-label={t("screen_game.console.repeated", { count: group.count })} sx={{
                  px: SPACING.xs, borderRadius: BORDER_RADIUS.pill, backgroundColor: theme.vars.palette.action.selected,
                  fontVariantNumeric: "tabular-nums"
                }}>{`×${group.count}`}</Caption>}
                {group.entityId && (sceneId
                  ? <TextLink asButton onClick={() => onSelectEntity(sceneId, group.entityId ?? "")} aria-label={t("screen_game.console.selectEntity", { name: name || group.entityId })}>
                    <Caption component="span" color="inherit">{name || group.entityId}</Caption></TextLink>
                  : <Caption component="span" color="muted">{group.entityId}</Caption>)}
                {ticks && <Caption component="span" color="muted" sx={{ fontVariantNumeric: "tabular-nums" }}>{ticks}</Caption>}
                <ToolbarIconButton className="console-ask" icon={<AutoAwesomeOutlinedIcon sx={{ fontSize: FONT_SIZE_SANS.body }} />}
                  tooltip={t("screen_game.console.askAssistant")} aria-describedby={`${lineId}-${group.id}`}
                  onClick={() => onAskAssistant(gameConsolePrompt(group, name))}
                  sx={{ p: SPACING.micro, my: -SPACING.micro }} />
              </FlexRow>
            </FlexRow>;
          })}
        </Box>}
    </ScrollArea>
  </FlexColumn>;
}
