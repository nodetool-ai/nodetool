import * as React from "react";
import { KeyboardShortcutCard, FlexColumn } from "nodetool";

const editorShortcuts = [
  { action: "Run workflow", keys: ["Cmd", "Enter"] },
  { action: "Save", keys: ["Cmd", "S"] },
  { action: "Duplicate node", keys: ["Cmd", "D"] },
  { action: "Delete selection", keys: ["Backspace"] }
];

export const Default = () => (
  <div style={{ width: 360 }}>
    <KeyboardShortcutCard title="Editor shortcuts" shortcuts={editorShortcuts} />
  </div>
);

export const WithDescriptions = () => (
  <div style={{ width: 360 }}>
    <KeyboardShortcutCard
      title="Canvas navigation"
      shortcuts={[
        {
          action: "Pan canvas",
          keys: ["Space", "Drag"],
          description: "Hold space and drag to move around"
        },
        {
          action: "Zoom to fit",
          keys: ["Shift", "1"],
          description: "Frame all nodes in the viewport"
        },
        {
          action: "Add node",
          keys: ["Tab"],
          description: "Open the node search menu"
        }
      ]}
    />
  </div>
);

export const Truncated = () => (
  <div style={{ width: 360 }}>
    <KeyboardShortcutCard
      title="More commands"
      maxVisible={2}
      shortcuts={editorShortcuts}
    />
  </div>
);
