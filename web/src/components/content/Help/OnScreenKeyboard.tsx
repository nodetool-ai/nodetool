import React, { useCallback, useMemo } from "react";

export interface KeyboardButtonTheme {
  /** CSS class applied to each button listed in `buttons`. */
  class: string;
  /** Space-separated button ids. */
  buttons: string;
}

interface OnScreenKeyboardProps {
  /** Named layouts; each layout is a list of rows, each row a space-separated key list. */
  layout: Record<string, string[]>;
  /** Which layout from `layout` to render. */
  layoutName: string;
  /** Optional per-key display labels (e.g. `{ backspace: "⌫" }`). */
  display?: Record<string, string>;
  buttonTheme?: KeyboardButtonTheme[];
  onKeyPress?: (button: string) => void;
  onKeyReleased?: (button: string) => void;
  onButtonMouseEnter?: (
    button: string,
    event: React.MouseEvent<HTMLElement>
  ) => void;
  onButtonMouseLeave?: () => void;
}

/**
 * Display-only on-screen keyboard — replaces `react-simple-keyboard`, keeping
 * its DOM contract (`.hg-row`, `.hg-button`, `data-skbtn`) so the styling in
 * `styles/keyboard.css` and imperative highlighting (`hg-pressed`) keep working.
 */
const OnScreenKeyboard: React.FC<OnScreenKeyboardProps> = ({
  layout,
  layoutName,
  display,
  buttonTheme,
  onKeyPress,
  onKeyReleased,
  onButtonMouseEnter,
  onButtonMouseLeave
}) => {
  const rows = layout[layoutName] ?? [];

  // Route the press to the originating key via pointer capture, so its release
  // (or cancel) always lands back on the same element — even when the pointer
  // is lifted outside the key. Without this a drag-off leaves the key stuck
  // pressed (lingering `hg-pressed`, tooltip, and `isKeyPressedRef`).
  const handlePointerDown = useCallback(
    (button: string) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      onKeyPress?.(button);
    },
    [onKeyPress]
  );

  const handlePointerRelease = useCallback(
    (button: string) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onKeyReleased?.(button);
    },
    [onKeyReleased]
  );

  const themeClassMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    (buttonTheme ?? []).forEach(({ class: cls, buttons }) => {
      buttons
        .split(" ")
        .filter(Boolean)
        .forEach((button) => {
          if (!map[button]) {
            map[button] = [];
          }
          map[button].push(cls);
        });
    });
    return map;
  }, [buttonTheme]);

  return (
    <div className="simple-keyboard hg-theme-default" role="presentation">
      {rows.map((row, rowIndex) => (
        <div className="hg-row" key={rowIndex}>
          {row.split(" ").map((button, buttonIndex) => (
            <div
              key={`${button}-${buttonIndex}`}
              className={["hg-button", ...(themeClassMap[button] ?? [])].join(
                " "
              )}
              data-skbtn={button}
              onPointerDown={handlePointerDown(button)}
              onPointerUp={handlePointerRelease(button)}
              onPointerCancel={handlePointerRelease(button)}
              onMouseEnter={(event) => onButtonMouseEnter?.(button, event)}
              onMouseLeave={() => onButtonMouseLeave?.()}
            >
              <span>{display?.[button] ?? button}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default OnScreenKeyboard;
