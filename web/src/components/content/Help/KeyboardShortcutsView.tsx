import React, { useEffect, useRef, useState, useMemo } from "react";
import Keyboard from "react-simple-keyboard";
import "react-simple-keyboard/build/css/index.css";
import { ToggleButtonGroup, ToggleButton, Divider } from "@mui/material";
import {
  Shortcut,
  expandShortcutsForOS,
  getShortcutTooltip
} from "../../../config/shortcuts";
import { NODE_EDITOR_SHORTCUTS } from "../../../config/shortcuts";
import { isMac } from "../../../utils/platform";
import "../../../styles/keyboard.css";
import KeyboardGrid from "./KeyboardGrid";

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
  const [hoverSlugs, setHoverSlugs] = useState<string[] | null>(null);

  const activeShortcuts = expandShortcutsForOS(shortcuts, os === "mac");

  // Build mapping key -> titles for tooltip assignment
  const keyTitleMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    activeShortcuts.forEach((sc) => {
      const combo = sc.keyCombo.map((k) => {
        const low = k.toLowerCase();
        return low === " " ? "space" : low;
      });
      combo.forEach((key) => {
        if (!map[key]) map[key] = [];
        map[key].push(sc.title);
      });
    });
    return map;
  }, [activeShortcuts]);

  const highlightButtons = Object.keys(keyTitleMap).join(" ");
  const buttonTheme = [
    {
      class: "has-shortcut",
      buttons: highlightButtons
    }
  ];

  // Map key -> slugs for hover usage (memoize)
  const keySlugMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    activeShortcuts.forEach((s) => {
      s.keyCombo.forEach((k) => {
        const lowKey = k.toLowerCase() === " " ? "space" : k.toLowerCase();
        if (!m[lowKey]) m[lowKey] = [];
        m[lowKey].push(s.slug);
      });
    });
    return m;
  }, [activeShortcuts]);

  // After render, attach title attributes to every button
  useEffect(() => {
    if (!containerRef.current) return;
    const btns =
      containerRef.current.querySelectorAll<HTMLButtonElement>(".hg-button");
    btns.forEach((btn) => {
      const key = btn.getAttribute("data-skbtn")?.toLowerCase();
      if (key && keyTitleMap[key]) {
        // add hover listeners once
        const handleEnter = () => setHoverSlugs(keySlugMap[key]);
        const handleLeave = () => setHoverSlugs(null);
        btn.addEventListener("mouseenter", handleEnter);
        btn.addEventListener("mouseleave", handleLeave);
        // store cleanup handler
        (btn as any)._hoverHandlers = { handleEnter, handleLeave };
      }
    });

    // cleanup on dependencies change
    return () => {
      btns.forEach((btn) => {
        const handlers = (btn as any)._hoverHandlers;
        if (handlers) {
          btn.removeEventListener("mouseenter", handlers.handleEnter);
          btn.removeEventListener("mouseleave", handlers.handleLeave);
        }
      });
    };
  }, [keyTitleMap, keySlugMap]);

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
    control: os === "mac" ? "⌃" : "CTRL",
    meta: os === "mac" ? "⌘" : "Win",
    alt: os === "mac" ? "⌥" : "Alt",
    enter: "⏎",
    space: "SPACE",
    escape: "ESC"
  } as Record<string, string>;

  return (
    <div>
      <ToggleButtonGroup
        value={os}
        exclusive
        onChange={handleOsToggle}
        size="small"
        sx={{ mb: 2 }}
      >
        <ToggleButton value="mac">mac</ToggleButton>
        <ToggleButton value="win">Windows / Linux</ToggleButton>
      </ToggleButtonGroup>

      <div ref={containerRef} className="keyboard-view">
        <Keyboard
          layout={layout}
          display={display}
          buttonTheme={buttonTheme}
          physicalKeyboardHighlight={true}
          physicalKeyboardHighlightPress={true}
          physicalKeyboardHighlightBgColor="var(--palette-primary-main)"
        />
      </div>

      {hoverSlugs && (
        <div
          style={{
            marginTop: ".5em",
            textAlign: "center",
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "flex-start",
            gap: ".2em",
            justifyContent: "center"
          }}
        >
          {hoverSlugs.map((slug, idx) => (
            <React.Fragment key={idx}>
              <div style={{ marginBottom: ".2em", minWidth: "200px" }}>
                {getShortcutTooltip(slug, os, true)}
              </div>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

export default KeyboardShortcutsView;
