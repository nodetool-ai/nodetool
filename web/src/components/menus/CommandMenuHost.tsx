/**
 * Mounts the Cmd+K command menu at the app root and owns its shortcut, so the
 * menu opens on every view.
 *
 * An active node editor claims the menu (see CommandMenuStore) and renders it
 * with its workflow and canvas commands; this host renders it everywhere else.
 */
import { memo, useCallback } from "react";

import { useCommandMenuStore } from "../../stores/CommandMenuStore";
import { useGlobalCombo } from "../../stores/KeyPressedStore";
import useAuth from "../../stores/useAuth";
import { isAuthRequired } from "../../lib/runtimeConfig";
import { isMac } from "../../utils/platform";
import CommandPalette from "./CommandPalette";

/** Routes a visitor reaches without an account, where app commands mean nothing. */
const PUBLIC_PATH_PREFIXES = ["/login", "/a/", "/view/", "/oauth/"];

const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

/** Meta+K on Mac, Ctrl+K elsewhere, in the dispatcher's sorted combo form. */
export const COMMAND_MENU_COMBO = isMac() ? "k+meta" : "control+k";

const CommandMenuHost = () => {
  const open = useCommandMenuStore((state) => state.open);
  const editorClaimed = useCommandMenuStore((state) => state.editorClaims > 0);
  const toggle = useCommandMenuStore((state) => state.toggle);
  const authState = useAuth((state) => state.state);
  const signedIn = !isAuthRequired() || authState === "logged_in";

  const handleShortcut = useCallback(() => {
    if (isPublicPath(window.location.pathname)) {
      return;
    }
    toggle();
  }, [toggle]);

  // Global scope: the menu must open while a text field or editor has focus.
  useGlobalCombo(COMMAND_MENU_COMBO, handleShortcut, {
    active: signedIn,
    scope: "global"
  });

  if (!signedIn || editorClaimed || !open) {
    return null;
  }
  return <CommandPalette />;
};

export default memo(CommandMenuHost);
