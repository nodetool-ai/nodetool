/**
 * The formatting row of the document editor (PRD R2). Every control names
 * its shortcut in the tooltip and shows whether it applies to the caret.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { COMMAND_PRIORITY_LOW, SELECTION_CHANGE_COMMAND } from "lexical";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";
import CodeIcon from "@mui/icons-material/Code";
import LinkIcon from "@mui/icons-material/Link";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import ChecklistIcon from "@mui/icons-material/Checklist";
import FormatIndentDecreaseIcon from "@mui/icons-material/FormatIndentDecrease";
import FormatIndentIncreaseIcon from "@mui/icons-material/FormatIndentIncrease";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import DataObjectIcon from "@mui/icons-material/DataObject";
import TableChartIcon from "@mui/icons-material/TableChartOutlined";
import PermMediaIcon from "@mui/icons-material/PermMediaOutlined";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import LooksOneIcon from "@mui/icons-material/LooksOneOutlined";
import LooksTwoIcon from "@mui/icons-material/LooksTwoOutlined";
import Looks3Icon from "@mui/icons-material/Looks3Outlined";

import {
  Toolbar,
  ToolbarDivider,
  ToolbarGroup,
  ToolbarIconButton
} from "../ui_primitives";
import { isMac } from "../../utils/platform";
import {
  $readSelectionState,
  indentSelection,
  insertRule,
  insertTable,
  outdentSelection,
  setBlockType,
  toggleFormat,
  toggleList,
  type DocumentSelectionState
} from "./documentCommands";

const INITIAL_STATE: DocumentSelectionState = {
  block: "paragraph",
  formats: new Set(),
  link: false
};

/** The selection state of the editor, refreshed on every change. */
export function useDocumentSelectionState(): DocumentSelectionState {
  const [editor] = useLexicalComposerContext();
  const [state, setState] = useState(INITIAL_STATE);
  useEffect(() => {
    const refresh = () => {
      setState(editor.getEditorState().read($readSelectionState));
    };
    return mergeRegister(
      editor.registerUpdateListener(refresh),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          refresh();
          return false;
        },
        COMMAND_PRIORITY_LOW
      )
    );
  }, [editor]);
  return state;
}

interface DocumentToolbarProps {
  /** Open the link field over the selection. */
  onLink: () => void;
  /** Open the media dialog for the caret. */
  onEmbed: () => void;
}

const DocumentToolbar = ({ onLink, onEmbed }: DocumentToolbarProps) => {
  const { t } = useTranslation();
  const [editor] = useLexicalComposerContext();
  const { block, formats, link } = useDocumentSelectionState();
  const mod = isMac() ? "⌘" : "Ctrl";
  const alt = isMac() ? "⌥" : "Alt";
  const shift = isMac() ? "⇧" : "Shift";

  const heading = (level: 1 | 2 | 3, icon: ReactNode) => {
    const tag = `h${level}` as const;
    return (
      <ToolbarIconButton
        icon={icon}
        tooltip={t(`documentEditor.toolbar.heading${level}`)}
        shortcut={[mod, alt, String(level)]}
        active={block === tag}
        onClick={() => setBlockType(editor, tag, block)}
      />
    );
  };

  return (
    <Toolbar className="doc-toolbar" sx={{ flexWrap: "wrap" }}>
      <ToolbarGroup>
        {heading(1, <LooksOneIcon fontSize="small" />)}
        {heading(2, <LooksTwoIcon fontSize="small" />)}
        {heading(3, <Looks3Icon fontSize="small" />)}
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <ToolbarIconButton
          icon={<FormatBoldIcon fontSize="small" />}
          tooltip={t("documentEditor.toolbar.bold")}
          shortcut={[mod, "B"]}
          active={formats.has("bold")}
          onClick={() => toggleFormat(editor, "bold")}
        />
        <ToolbarIconButton
          icon={<FormatItalicIcon fontSize="small" />}
          tooltip={t("documentEditor.toolbar.italic")}
          shortcut={[mod, "I"]}
          active={formats.has("italic")}
          onClick={() => toggleFormat(editor, "italic")}
        />
        <ToolbarIconButton
          icon={<StrikethroughSIcon fontSize="small" />}
          tooltip={t("documentEditor.toolbar.strikethrough")}
          shortcut={[mod, shift, "X"]}
          active={formats.has("strikethrough")}
          onClick={() => toggleFormat(editor, "strikethrough")}
        />
        <ToolbarIconButton
          icon={<CodeIcon fontSize="small" />}
          tooltip={t("documentEditor.toolbar.inlineCode")}
          shortcut={[mod, "E"]}
          active={formats.has("code")}
          onClick={() => toggleFormat(editor, "code")}
        />
        <ToolbarIconButton
          icon={<LinkIcon fontSize="small" />}
          tooltip={t("documentEditor.toolbar.link")}
          shortcut={[mod, "K"]}
          active={link}
          aria-haspopup="dialog"
          onClick={onLink}
        />
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <ToolbarIconButton
          icon={<FormatListBulletedIcon fontSize="small" />}
          tooltip={t("documentEditor.toolbar.bulletList")}
          shortcut={[mod, shift, "8"]}
          active={block === "bullet"}
          onClick={() => toggleList(editor, "bullet", block)}
        />
        <ToolbarIconButton
          icon={<FormatListNumberedIcon fontSize="small" />}
          tooltip={t("documentEditor.toolbar.numberedList")}
          shortcut={[mod, shift, "7"]}
          active={block === "number"}
          onClick={() => toggleList(editor, "number", block)}
        />
        <ToolbarIconButton
          icon={<ChecklistIcon fontSize="small" />}
          tooltip={t("documentEditor.toolbar.checkList")}
          shortcut={[mod, shift, "9"]}
          active={block === "check"}
          onClick={() => toggleList(editor, "check", block)}
        />
        <ToolbarIconButton
          icon={<FormatIndentDecreaseIcon fontSize="small" />}
          tooltip={t("documentEditor.toolbar.outdent", "Decrease list indentation")}
          shortcut={[shift, "Tab"]}
          onClick={() => outdentSelection(editor)}
        />
        <ToolbarIconButton
          icon={<FormatIndentIncreaseIcon fontSize="small" />}
          tooltip={t("documentEditor.toolbar.indent", "Increase list indentation")}
          shortcut={["Tab"]}
          onClick={() => indentSelection(editor)}
        />
        <ToolbarIconButton
          icon={<FormatQuoteIcon fontSize="small" />}
          tooltip={t("documentEditor.toolbar.quote")}
          active={block === "quote"}
          onClick={() => setBlockType(editor, "quote", block)}
        />
        <ToolbarIconButton
          icon={<DataObjectIcon fontSize="small" />}
          tooltip={t("documentEditor.toolbar.codeBlock")}
          active={block === "code"}
          onClick={() => setBlockType(editor, "code", block)}
        />
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup>
        <ToolbarIconButton
          icon={<TableChartIcon fontSize="small" />}
          tooltip={t("documentEditor.toolbar.table")}
          onClick={() => insertTable(editor)}
        />
        <ToolbarIconButton
          icon={<PermMediaIcon fontSize="small" />}
          tooltip={t("documentEditor.toolbar.media")}
          aria-haspopup="dialog"
          onClick={onEmbed}
        />
        <ToolbarIconButton
          icon={<HorizontalRuleIcon fontSize="small" />}
          tooltip={t("documentEditor.toolbar.rule")}
          onClick={() => insertRule(editor)}
        />
      </ToolbarGroup>
    </Toolbar>
  );
};

export default DocumentToolbar;
