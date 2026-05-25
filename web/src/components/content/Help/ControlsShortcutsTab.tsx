import React from "react";
import { FlexColumn } from "../../ui_primitives";
import { NODE_EDITOR_SHORTCUTS } from "../../../config/shortcuts";
import { ShortcutsSearchableList } from "./ShortcutsSearchableList";

const ControlsShortcutsTab: React.FC = () => {
  return (
    <FlexColumn
      fullHeight
      sx={{
        minHeight: 0
      }}
    >
      <ShortcutsSearchableList
        shortcuts={NODE_EDITOR_SHORTCUTS}
        rootSx={{ flex: 1, minHeight: 0 }}
        scrollSx={{ flex: 1, minHeight: 0 }}
      />
    </FlexColumn>
  );
};

export default ControlsShortcutsTab;
