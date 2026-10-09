import { useCommandMenuStore } from "../../stores/CommandMenuStore";
import { isMac } from "../../utils/platform";

/** Meta+K on Mac, Ctrl+K elsewhere, in the dispatcher's sorted combo form. */
export const COMMAND_MENU_COMBO = isMac() ? "k+meta" : "control+k";

/**
 * Whether a key press opens the command menu. A view that swallows keys in
 * its own capture-phase listener lets this one through, so the menu opens
 * there too.
 */
export const isCommandMenuShortcut = (event: KeyboardEvent): boolean =>
  (event.key.toLowerCase() === "k" || event.code === "KeyK") &&
  !event.shiftKey &&
  !event.altKey &&
  (isMac()
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey);

/** Routes a visitor reaches without an account, where app commands mean nothing. */
const PUBLIC_PATH_PREFIXES = ["/login", "/a/", "/view/", "/oauth/"];

/**
 * Open or close the menu from its shortcut. Code editors that consume the key
 * themselves (Monaco) call this from their own keybinding.
 */
export const toggleCommandMenuFromShortcut = (): void => {
  const { pathname } = window.location;
  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return;
  }
  useCommandMenuStore.getState().toggle();
};
