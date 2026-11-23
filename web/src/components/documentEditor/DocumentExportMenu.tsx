/**
 * The document bar's export menu (document editor PRD R18, R19): write the
 * document as a PDF or HTML file next to it, or as a new Google Doc.
 */
import { useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";

import {
  useTextDocumentExport,
  type DocumentExportFormat
} from "../../serverState/useTextDocumentTransfer";
import { EditorMenu, MenuItemPrimitive, ToolbarIconButton } from "../ui_primitives";

interface DocumentExportMenuProps {
  assetId: string;
  /** Saves the open draft, so the export holds what the user sees. */
  flush: () => Promise<void>;
}

const DocumentExportMenu = ({ assetId, flush }: DocumentExportMenuProps) => {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { exportDocument, exporting } = useTextDocumentExport(assetId, flush);

  const choose = (format: DocumentExportFormat) => {
    setAnchor(null);
    void exportDocument(format);
  };

  return (
    <>
      <ToolbarIconButton
        icon={<FileDownloadOutlinedIcon />}
        tooltip={t("documentEditor.export.label")}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        loading={exporting !== null}
        active={anchor !== null}
        onClick={(event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget)}
      />
      <EditorMenu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItemPrimitive
          label={t("documentEditor.export.pdf")}
          icon={<PictureAsPdfOutlinedIcon />}
          onClick={() => choose("pdf")}
        />
        <MenuItemPrimitive
          label={t("documentEditor.export.html")}
          icon={<CodeOutlinedIcon />}
          onClick={() => choose("html")}
        />
        <MenuItemPrimitive
          label={t("documentEditor.export.googleDoc")}
          icon={<DescriptionOutlinedIcon />}
          onClick={() => choose("google_doc")}
        />
      </EditorMenu>
    </>
  );
};

export default DocumentExportMenu;
