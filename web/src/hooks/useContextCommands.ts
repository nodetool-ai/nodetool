import { useEffect } from "react";
import {
  useCommandMenuStore,
  type ContextCommand
} from "../stores/CommandMenuStore";

/**
 * List a view's commands in the command menu while `active` holds. Every open
 * workspace tab stays mounted, so a view passes whether its tab is the one on
 * screen. Pass a memoized `commands` array: a new array re-registers.
 */
export const useContextCommands = (
  heading: string,
  commands: readonly ContextCommand[],
  active: boolean
): void => {
  const registerContextGroup = useCommandMenuStore(
    (state) => state.registerContextGroup
  );
  useEffect(() => {
    if (!active || commands.length === 0) {
      return;
    }
    return registerContextGroup(heading, commands);
  }, [active, commands, heading, registerContextGroup]);
};
