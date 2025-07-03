import React, { useEffect, useRef, useState } from "react";
import Keyboard from "react-simple-keyboard";
import "react-simple-keyboard/build/css/index.css";
import { ToggleButtonGroup, ToggleButton } from "@mui/material";
import { Shortcut, expandShortcutsForOS } from "../../../config/shortcuts";
import { NODE_EDITOR_SHORTCUTS } from "../../../config/shortcuts";
import { isMac } from "../../../utils/platform";
import "../../../styles/keyboard.css";

interface KeyboardShortcutsViewProps {
  shortcuts?: Shortcut[];
}

/**
 * Renders an on-screen keyboard highlighting all keys involved in the provided shortcuts.
 * When hovering a key, browser-native `title` tooltips show the shortcut names.
 */
const KeyboardShortcutsView: React.FC<KeyboardShortcutsViewProps> = ({
  shortcuts = NODE_EDITOR_SHORTCUTS
}) => {
  const [os, setOs] = useState<"mac" | "win">(isMac() ? "mac" : "win");
  const containerRef = useRef<HTMLDivElement>(null);

  const activeShortcuts = expandShortcutsForOS(shortcuts, os === "mac");

  // Build mapping key -> titles for tooltip assignment
  const keyTitleMap: Record<string, string[]> = {};
  activeShortcuts.forEach((sc) => {
    const combo = sc.keyCombo.map((k) => k.toLowerCase());
    combo.forEach((key) => {
      if (!keyTitleMap[key]) keyTitleMap[key] = [];
      keyTitleMap[key].push(sc.title);
    });
  });

  const highlightButtons = Object.keys(keyTitleMap).join(" ");
  const buttonTheme = [
    {
      class: "has-shortcut",
      buttons: highlightButtons
    }
  ];

  // After render, attach title attributes to every button
  useEffect(() => {
    if (!containerRef.current) return;
    const btns =
      containerRef.current.querySelectorAll<HTMLButtonElement>(".hg-button");
    btns.forEach((btn) => {
      const key = btn.getAttribute("data-skbtn")?.toLowerCase();
      if (key && keyTitleMap[key]) {
        btn.setAttribute("title", keyTitleMap[key].join(", "));
      } else {
        btn.removeAttribute("title");
      }
    });
  }, [keyTitleMap, os]);

  const handleOsToggle = (_: any, value: "mac" | "win") => {
    if (value) setOs(value);
  };

  const layout = {
    default: [
      "escape 1 2 3 4 5 6 7 8 9 0 - = backspace",
      "tab q w e r t y u i o p [ ] \\",
      "capslock a s d f g h j k l ; ' enter",
      "shift z x c v b n m , . / shift",
      "control alt meta space alt control"
    ]
  };

  const display = {
    backspace: "⌫",
    capslock: "⇪",
    shift: "⇧",
    control: os === "mac" ? "⌃" : "Ctrl",
    meta: os === "mac" ? "⌘" : "Win",
    alt: os === "mac" ? "⌥" : "Alt",
    enter: "⏎",
    space: "Space"
  } as Record<string, string>;

  return (
    <div style={{ padding: "1em" }}>
      <ToggleButtonGroup
        value={os}
        exclusive
        onChange={handleOsToggle}
        size="small"
        sx={{ mb: 2 }}
      >
        <ToggleButton value="mac">macOS</ToggleButton>
        <ToggleButton value="win">Windows/Linux</ToggleButton>
      </ToggleButtonGroup>

      <div ref={containerRef}>
        <Keyboard layout={layout} display={display} buttonTheme={buttonTheme} />
      </div>
    </div>
  );
};

export default KeyboardShortcutsView;
