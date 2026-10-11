/**
 * The commands the active view registered with `useContextCommands`, listed
 * right after the open tabs. Registrations that share a heading render as one
 * group, so a surface and a pane inside it can both add "Script" commands.
 */
import { memo, useMemo } from "react";
import { Command } from "cmdk";

import {
  runCommandAndClose,
  useCommandMenuStore,
  type ContextCommand
} from "../../stores/CommandMenuStore";

interface MergedGroup {
  heading: string;
  items: { key: string; command: ContextCommand }[];
}

const ContextCommandGroups = () => {
  const groups = useCommandMenuStore((state) => state.contextGroups);

  const merged = useMemo(() => {
    const byHeading = new Map<string, MergedGroup>();
    for (const group of groups) {
      let entry = byHeading.get(group.heading);
      if (!entry) {
        entry = { heading: group.heading, items: [] };
        byHeading.set(group.heading, entry);
      }
      for (const command of group.commands) {
        entry.items.push({ key: `${group.id}:${command.id}`, command });
      }
    }
    return [...byHeading.values()];
  }, [groups]);

  return (
    <>
      {merged.map((group) => (
        <Command.Group key={group.heading} heading={group.heading}>
          {group.items.map(({ key, command }) => (
            <Command.Item
              key={key}
              value={`${group.heading} ${command.label} ${key}`}
              keywords={command.keywords}
              onSelect={() => runCommandAndClose(command.run)}
            >
              {command.label}
              {command.shortcut && (
                <span className="command-menu-shortcut">{command.shortcut}</span>
              )}
            </Command.Item>
          ))}
        </Command.Group>
      ))}
    </>
  );
};

export default memo(ContextCommandGroups);
