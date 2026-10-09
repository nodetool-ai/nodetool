import { useState, type KeyboardEvent, type ReactNode } from "react";

import { Caption, Dialog, EmptyState, FlexColumn, SearchInput, SelectableListItem, ShortcutHint, SPACING, Text } from "../../ui_primitives";
import { isMac } from "../../../utils/platform";
import { formatGameBinding, GAME_COMMANDS, type GameBindings, type GameCommandDefinition, type GameCommandHandler } from "./gameCommands";
import type { GameDimension } from "./panelRegistry";

interface GameCommandPaletteProps {
  readonly open: boolean;
  readonly dimension: GameDimension;
  readonly playing: boolean;
  readonly bindings: GameBindings;
  readonly handler: (commandId: string) => GameCommandHandler | undefined;
  readonly onClose: () => void;
}

/** Commands the palette offers right now: defined for this editor, handled, enabled, and allowed during play when playing. */
export function availableGameCommands(dimension: GameDimension, playing: boolean,
  handler: (commandId: string) => GameCommandHandler | undefined): GameCommandDefinition[] {
  return GAME_COMMANDS.filter((entry) => entry.id !== "editor.commandPalette" && entry.dimensions.includes(dimension)
    && (!playing || entry.whilePlaying) && handler(entry.id) !== undefined && handler(entry.id)?.enabled !== false);
}

function matches(entry: GameCommandDefinition, query: string): boolean {
  const text = `${entry.category} ${entry.title}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => text.includes(word));
}

function PaletteBody({ dimension, playing, bindings, handler, onClose }: Omit<GameCommandPaletteProps, "open">): ReactNode {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const commands = availableGameCommands(dimension, playing, handler);
  const visible = commands.filter((entry) => matches(entry, query));
  const active = Math.min(highlight, Math.max(visible.length - 1, 0));
  const run = (entry: GameCommandDefinition | undefined): void => {
    const target = entry ? handler(entry.id) : undefined;
    if (!target || target.enabled === false) { return; }
    onClose();
    target.run();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.defaultPrevented) { return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight(visible.length ? (active + step + visible.length) % visible.length : 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(visible[active]);
    }
  };
  const mac = isMac();
  return <FlexColumn gap={SPACING.sm} onKeyDown={onKeyDown}>
    <SearchInput value={query} onChange={(value) => { setQuery(value); setHighlight(0); }} autoFocus fullWidth
      placeholder="Search commands" ariaLabel="Search commands" />
    {visible.length === 0 ? <EmptyState title="No matching commands" size="small" /> :
      <FlexColumn gap={SPACING.micro}>
        {visible.map((entry, index) => {
          const binding = bindings.get(entry.id)?.[0];
          return <SelectableListItem key={entry.id} selected={index === active} onClick={() => run(entry)}
            onMouseEnter={() => setHighlight(index)} paddingX={SPACING.md} paddingY={SPACING.xs}>
            <Text sx={{ flex: 1, minWidth: 0 }}>{entry.title}</Text>
            <Caption>{entry.category}</Caption>
            {binding && <ShortcutHint shortcut={formatGameBinding(binding, mac)} />}
          </SelectableListItem>;
        })}
      </FlexColumn>}
  </FlexColumn>;
}

/** Ctrl/Cmd+K palette listing every available editor command and assistant action with its current shortcut. */
export default function GameCommandPalette({ open, onClose, ...rest }: GameCommandPaletteProps): ReactNode {
  return <Dialog open={open} onClose={onClose} title="Commands" maxWidth="sm" fullWidth>
    {open && <PaletteBody {...rest} onClose={onClose} />}
  </Dialog>;
}
