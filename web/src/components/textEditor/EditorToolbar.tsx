import { memo } from "react";
import { useTranslation } from "react-i18next";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import WrapTextIcon from "@mui/icons-material/WrapText";
import SearchIcon from "@mui/icons-material/Search";
import CodeIcon from "@mui/icons-material/Code";
import TitleIcon from "@mui/icons-material/Title";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import {
  Toolbar,
  ToolbarDivider,
  ToolbarGroup,
  ToolbarIconButton
} from "../ui_primitives";

interface EditorToolbarProps {
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleWordWrap?: () => void;
  onToggleFind?: () => void;
  onFormatCodeBlock?: () => void;
  /** Markdown formatting; the group renders only when these are provided. */
  onHeading?: () => void;
  onBold?: () => void;
  onBulletList?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  wordWrapEnabled?: boolean;
  isCodeBlock?: boolean;
  readOnly?: boolean;
}

const EditorToolbar = ({
  onUndo,
  onRedo,
  onToggleWordWrap,
  onToggleFind,
  onFormatCodeBlock,
  onHeading,
  onBold,
  onBulletList,
  canUndo = false,
  canRedo = false,
  wordWrapEnabled = true,
  isCodeBlock = false,
  readOnly = false
}: EditorToolbarProps) => {
  const { t } = useTranslation("translation", { keyPrefix: "screen_scripts_text" });

  return (
    <Toolbar className="editor-toolbar" density="compact">
      {!readOnly && (
        <ToolbarGroup>
          <ToolbarIconButton
            icon={<UndoIcon />}
            tooltip={t("textEditor.undo")}
            onClick={onUndo}
            disabled={!canUndo}
          />
          <ToolbarIconButton
            icon={<RedoIcon />}
            tooltip={t("textEditor.redo")}
            onClick={onRedo}
            disabled={!canRedo}
          />
        </ToolbarGroup>
      )}
      {!readOnly && <ToolbarDivider />}

      {!readOnly && onHeading && onBold && onBulletList && (
        <>
          <ToolbarGroup>
            <ToolbarIconButton
              icon={<TitleIcon />}
              tooltip={t("textEditor.heading")}
              onClick={onHeading}
            />
            <ToolbarIconButton
              icon={<FormatBoldIcon />}
              tooltip={t("textEditor.bold")}
              onClick={onBold}
            />
            <ToolbarIconButton
              icon={<FormatListBulletedIcon />}
              tooltip={t("textEditor.bulletedList")}
              onClick={onBulletList}
            />
          </ToolbarGroup>
          <ToolbarDivider />
        </>
      )}

      <ToolbarGroup>
        <ToolbarIconButton
          icon={<SearchIcon />}
          tooltip={t("textEditor.findReplace")}
          onClick={onToggleFind}
        />
      </ToolbarGroup>
      <ToolbarDivider />

      <ToolbarGroup>
        <ToolbarIconButton
          icon={<WrapTextIcon />}
          tooltip={t("textEditor.toggleWordWrap")}
          active={wordWrapEnabled}
          onClick={onToggleWordWrap}
        />
        <ToolbarIconButton
          icon={<CodeIcon />}
          tooltip={t("textEditor.formatCodeBlock")}
          active={isCodeBlock}
          onClick={onFormatCodeBlock}
        />
      </ToolbarGroup>
    </Toolbar>
  );
};

export default memo(EditorToolbar);
