import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback
} from "react";
import Keyboard from "react-simple-keyboard";
import "react-simple-keyboard/build/css/index.css";
import { ToggleButtonGroup, ToggleButton, Tooltip } from "@mui/material";
import {
  Shortcut,
  expandShortcutsForOS,
  getShortcutTooltip
} from "../../../config/shortcuts";
import { NODE_EDITOR_SHORTCUTS } from "../../../config/shortcuts";
import { isMac } from "../../../utils/platform";
import "../../../styles/keyboard.css";
import { useTheme } from "@mui/material/styles";
import { keyboardLayouts } from "./keyboard_layouts";

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
  const theme = useTheme();
  const [os, setOs] = useState<"mac" | "win">(isMac() ? "mac" : "win");
  const [layoutName, setLayoutName] = useState<"english" | "german">(() => {
    if (typeof navigator !== "undefined") {
      return navigator.language.startsWith("de") ? "german" : "english";
    }
    return "english";
  });
  const [categoryFilter, setCategoryFilter] = useState<
    "all" | "editor" | "panel" | "assets" | "workflow"
  >("all");
  const containerRef = useRef<HTMLDivElement>(null);
  const isKeyPressedRef = useRef(false);
  const [hoverSlugs, setHoverSlugs] = useState<string[] | null>(null);
  const [tooltipAnchorEl, setTooltipAnchorEl] = useState<HTMLElement | null>(
    null
  );
  const [keyboardHoverSlugs, setKeyboardHoverSlugs] = useState<string[] | null>(
    null
  );
  const [keyboardTooltipAnchorEl, setKeyboardTooltipAnchorEl] =
    useState<HTMLElement | null>(null);

  const filtered = useMemo(() => {
    if (categoryFilter === "all") return shortcuts;
    if (categoryFilter === "assets")
      return shortcuts.filter((s) => s.category === "assets");
    return shortcuts.filter((s) => s.category === categoryFilter);
  }, [shortcuts, categoryFilter]);

  const activeShortcuts = expandShortcutsForOS(filtered, os === "mac");

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

  // Build a map of all shortcut keys (unfiltered, for inactive highlighting)
  const allShortcuts = useMemo(
    () => expandShortcutsForOS(shortcuts, os === "mac"),
    [shortcuts, os]
  );
  const allKeyMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    allShortcuts.forEach((sc) => {
      sc.keyCombo.forEach((k) => {
        const key = k.toLowerCase() === " " ? "space" : k.toLowerCase();
        map[key] = true;
      });
    });
    return map;
  }, [allShortcuts]);

  // Determine inactive shortcut keys
  const activeKeys = useMemo(
    () => new Set(Object.keys(keyTitleMap)),
    [keyTitleMap]
  );
  const inactiveKeys = useMemo(
    () => Object.keys(allKeyMap).filter((key) => !activeKeys.has(key)),
    [allKeyMap, activeKeys]
  );

  const highlightButtons = Object.keys(keyTitleMap).join(" ");
  const inactiveButtons = inactiveKeys.join(" ");

  const handleOsToggle = (_: any, value: "mac" | "win") => {
    if (value) setOs(value);
  };

  const handleLayoutToggle = (_: any, value: "english" | "german") => {
    if (value) setLayoutName(value);
  };

  const layout = keyboardLayouts;

  // 1. Get all keys in the layout
  const allLayoutKeys = useMemo(() => {
    return Array.from(
      new Set(
        layout.english
          .concat(layout.german)
          .join(" ")
          .split(" ")
          .map((k) => k.toLowerCase())
      )
    );
  }, [layout]);

  // 2. Get never-shortcut keys
  const neverShortcutKeys = useMemo(
    () => allLayoutKeys.filter((key) => !allKeyMap[key]),
    [allLayoutKeys, allKeyMap]
  );
  const neverShortcutButtons = neverShortcutKeys.join(" ");

  // 3. Compose buttonTheme
  const buttonTheme = [
    {
      class: "has-shortcut",
      buttons: highlightButtons
    },
    ...(inactiveButtons
      ? [
          {
            class: "has-shortcut-inactive",
            buttons: inactiveButtons
          }
        ]
      : []),
    ...(neverShortcutButtons
      ? [
          {
            class: "never-shortcut",
            buttons: neverShortcutButtons
          }
        ]
      : [])
  ];

  const keySlugMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    activeShortcuts.forEach((s) => {
      s.keyCombo.forEach((k) => {
        const lowKey = k.toLowerCase() === " " ? "space" : k.toLowerCase();
        if (!m[lowKey]) m[lowKey] = [];
        m[lowKey].push(s.slug);
      });
    });
    // For ctrl/meta, group switchToTab shortcuts into one
    if (os === "mac") {
      if (!m["meta"]) m["meta"] = [];
      m["meta"] = m["meta"].filter((slug) => !/^switchToTab\d+$/.test(slug));
      m["meta"].push("switchToTabGroup");
    } else {
      if (!m["control"]) m["control"] = [];
      m["control"] = m["control"].filter(
        (slug) => !/^switchToTab\d+$/.test(slug)
      );
      m["control"].push("switchToTabGroup");
    }
    return m;
  }, [activeShortcuts, os]);

  // After render, attach title attributes to every button
  useEffect(() => {
    if (!containerRef.current) return;
    const btns =
      containerRef.current.querySelectorAll<HTMLButtonElement>(".hg-button");
    btns.forEach((btn) => {
      const key = btn.getAttribute("data-skbtn")?.toLowerCase();
      if (key && keyTitleMap[key]) {
        // add hover listeners once
        const handleEnter = (event: MouseEvent) => {
          if (isKeyPressedRef.current) return;
          setHoverSlugs(keySlugMap[key]);
          setTooltipAnchorEl(event.currentTarget as HTMLElement);
        };
        const handleLeave = () => {
          setHoverSlugs(null);
          setTooltipAnchorEl(null);
        };
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

  const onKeyPress = useCallback(
    (button: string) => {
      isKeyPressedRef.current = true;
      const targetButton = containerRef.current?.querySelector(
        `.hg-button[data-skbtn="${button.toLowerCase()}"]`
      );
      if (targetButton) {
        targetButton.classList.add("hg-pressed");
        if (keySlugMap[button.toLowerCase()]) {
          setKeyboardHoverSlugs(keySlugMap[button.toLowerCase()]);
          setKeyboardTooltipAnchorEl(targetButton as HTMLElement);
        }
      }
    },
    [keySlugMap]
  );

  const onKeyReleased = useCallback((button: string) => {
    isKeyPressedRef.current = false;
    const targetButton = containerRef.current?.querySelector(
      `.hg-button[data-skbtn="${button.toLowerCase()}"]`
    );
    if (targetButton) {
      targetButton.classList.remove("hg-pressed");
    }
    setKeyboardHoverSlugs(null);
    setKeyboardTooltipAnchorEl(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const button = event.key === " " ? "space" : event.key;
      onKeyPress(button);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const button = event.key === " " ? "space" : event.key;
      onKeyReleased(button);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [onKeyPress, onKeyReleased]);

  const currentHoverSlugs = keyboardHoverSlugs || hoverSlugs;
  const currentTooltipAnchorEl = keyboardTooltipAnchorEl || tooltipAnchorEl;

  return (
    <div>
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

      <ToggleButtonGroup
        value={layoutName}
        exclusive
        onChange={handleLayoutToggle}
        size="small"
        sx={{ mb: 2, ml: 2 }}
      >
        <ToggleButton value="english">EN</ToggleButton>
        <ToggleButton value="german">DE</ToggleButton>
      </ToggleButtonGroup>

      <ToggleButtonGroup
        value={categoryFilter}
        exclusive
        onChange={(_, v) => v && setCategoryFilter(v)}
        size="small"
        sx={{ mb: 2, ml: 8 }}
      >
        <ToggleButton value="all">All</ToggleButton>
        <ToggleButton value="editor">Editor</ToggleButton>
        <ToggleButton value="workflow">Workflow</ToggleButton>
        <ToggleButton value="panel">Panels</ToggleButton>
        <ToggleButton value="assets">Assets</ToggleButton>
      </ToggleButtonGroup>

      <div ref={containerRef} className="keyboard-view">
        <Keyboard
          layout={layout}
          layoutName={layoutName}
          display={display}
          buttonTheme={buttonTheme}
          onKeyPress={onKeyPress}
          onKeyReleased={onKeyReleased}
        />
      </div>
      {currentHoverSlugs && ( // Only render Tooltip when there are hoverSlugs
        <Tooltip
          open={!!currentHoverSlugs}
          placement="bottom"
          title={
            <div
              style={{
                backgroundColor: "transparent",
                borderRadius: ".5em",
                padding: ".5em",
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                gap: "2em"
              }}
            >
              {currentHoverSlugs?.map((slug, idx) => (
                <React.Fragment key={idx}>
                  {slug === "switchToTabGroup" ? (
                    <div className="tooltip-span">
                      <div className="tooltip-title">Switch to Tab</div>
                      <div className="tooltip-key">
                        <kbd>{os === "mac" ? "⌘" : "CTRL"}</kbd>+<kbd>1-9</kbd>
                      </div>
                      <div className="tooltip-description">
                        Activate workflow tab 1-9
                      </div>
                    </div>
                  ) : (
                    getShortcutTooltip(slug, os, "full", true)
                  )}
                </React.Fragment>
              ))}
            </div>
          }
          arrow
          slotProps={{
            popper: {
              style: {
                backgroundColor: "transparent"
              },
              anchorEl: currentTooltipAnchorEl,
              modifiers: [
                {
                  name: "offset",
                  options: {
                    offset: [0, -12]
                  }
                }
              ]
            },
            tooltip: {
              style: {
                maxWidth: "none"
              }
            }
          }}
        >
          <div />
        </Tooltip>
      )}
    </div>
  );
};

export default KeyboardShortcutsView;
