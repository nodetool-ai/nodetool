/** @jsxImportSource @emotion/react */
import React, { useCallback } from "react";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import EditIcon from "@mui/icons-material/Edit";
import VisibilityIcon from "@mui/icons-material/Visibility";

import { Workflow } from "../../stores/ApiTypes";
import { useAppBuilderStore } from "../../stores/AppBuilderStore";
import WidgetPalette from "./editor/WidgetPalette";
import AppCanvas from "./editor/AppCanvas";
import Inspector from "./editor/Inspector";
import AppRuntimeView from "./AppRuntimeView";
import {
  Box,
  FlexRow,
  FlexColumn,
  Text,
  TextInput,
  EditorButton,
  ToolbarIconButton,
  CloseButton,
  Divider
} from "../ui_primitives";

interface AppBuilderProps {
  workflow: Workflow;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
}

const PANEL_BORDER = "1px solid";

const AppBuilder: React.FC<AppBuilderProps> = ({
  workflow,
  onClose,
  onSave,
  saving = false
}) => {
  const spec = useAppBuilderStore((s) => s.spec);
  const mode = useAppBuilderStore((s) => s.mode);
  const setMode = useAppBuilderStore((s) => s.setMode);
  const setTitle = useAppBuilderStore((s) => s.setTitle);
  const undo = useAppBuilderStore((s) => s.undo);
  const redo = useAppBuilderStore((s) => s.redo);
  const canUndo = useAppBuilderStore((s) => s.past.length > 0);
  const canRedo = useAppBuilderStore((s) => s.future.length > 0);

  const toggleMode = useCallback(() => {
    setMode(mode === "design" ? "preview" : "design");
  }, [mode, setMode]);

  return (
    <FlexColumn sx={{ width: "100%", height: "100%" }} gap={0}>
      {/* Toolbar */}
      <FlexRow
        align="center"
        justify="space-between"
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: PANEL_BORDER,
          borderColor: "divider",
          gap: 1
        }}
      >
        <FlexRow align="center" gap={1} sx={{ flex: 1, minWidth: 0 }}>
          <Text size="small" weight={600} sx={{ whiteSpace: "nowrap" }}>
            App Builder
          </Text>
          <TextInput
            size="small"
            placeholder="App title"
            value={spec.title ?? ""}
            onChange={(e) => setTitle(e.target.value)}
            sx={{ maxWidth: 280 }}
          />
        </FlexRow>
        <FlexRow align="center" gap={0.5}>
          <ToolbarIconButton
            icon={<UndoIcon fontSize="small" />}
            tooltip="Undo"
            onClick={undo}
            disabled={!canUndo}
          />
          <ToolbarIconButton
            icon={<RedoIcon fontSize="small" />}
            tooltip="Redo"
            onClick={redo}
            disabled={!canRedo}
          />
          <EditorButton
            size="small"
            variant="outlined"
            startIcon={
              mode === "design" ? (
                <VisibilityIcon sx={{ fontSize: 16 }} />
              ) : (
                <EditIcon sx={{ fontSize: 16 }} />
              )
            }
            onClick={toggleMode}
          >
            {mode === "design" ? "Preview" : "Design"}
          </EditorButton>
          <EditorButton
            size="small"
            variant="contained"
            color="primary"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </EditorButton>
          <CloseButton onClick={onClose} />
        </FlexRow>
      </FlexRow>

      {/* Body */}
      <FlexRow sx={{ flex: 1, minHeight: 0 }} gap={0}>
        {mode === "design" && (
          <Box
            sx={{
              width: 200,
              flexShrink: 0,
              borderRight: PANEL_BORDER,
              borderColor: "divider",
              overflow: "hidden"
            }}
          >
            <WidgetPalette />
          </Box>
        )}

        <Box sx={{ flex: 1, minWidth: 0, position: "relative" }}>
          {mode === "design" ? (
            <AppCanvas workflow={workflow} />
          ) : (
            <AppRuntimeView workflow={workflow} spec={spec} />
          )}
        </Box>

        {mode === "design" && (
          <Box
            sx={{
              width: 300,
              flexShrink: 0,
              borderLeft: PANEL_BORDER,
              borderColor: "divider",
              overflow: "hidden"
            }}
          >
            <Inspector workflow={workflow} />
          </Box>
        )}
      </FlexRow>
      <Divider />
    </FlexColumn>
  );
};

export default AppBuilder;
