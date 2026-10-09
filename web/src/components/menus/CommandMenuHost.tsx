/**
 * Mounts the Cmd+K command menu at the app root and owns its shortcut, so the
 * menu opens on every view.
 *
 * An active node editor claims the menu (see CommandMenuStore) and renders it
 * with its workflow and canvas commands; this host renders it everywhere else.
 */
import { memo } from "react";

import { useCommandMenuStore } from "../../stores/CommandMenuStore";
import { useGlobalCombo } from "../../stores/KeyPressedStore";
import useAuth from "../../stores/useAuth";
import { isAuthRequired } from "../../lib/runtimeConfig";
import CommandPalette from "./CommandPalette";
import {
  COMMAND_MENU_COMBO,
  toggleCommandMenuFromShortcut
} from "./commandMenuShortcut";

const CommandMenuHost = () => {
  const open = useCommandMenuStore((state) => state.open);
  const editorClaimed = useCommandMenuStore((state) => state.editorClaims > 0);
  const authState = useAuth((state) => state.state);
  const signedIn = !isAuthRequired() || authState === "logged_in";

  // Global scope: the menu must open while a text field or editor has focus.
  useGlobalCombo(COMMAND_MENU_COMBO, toggleCommandMenuFromShortcut, {
    active: signedIn,
    scope: "global"
  });

  if (!signedIn || editorClaimed || !open) {
    return null;
  }
  return <CommandPalette />;
};

export default memo(CommandMenuHost);
