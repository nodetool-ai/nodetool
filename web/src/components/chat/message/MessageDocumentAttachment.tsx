/** @jsxImportSource @emotion/react */
/**
 * MessageDocumentAttachment — the card a chat message shows for an attached
 * file that is not media (a PDF, a Word or spreadsheet file).
 *
 * A type icon on a tinted tile, the file name, and a "PDF · 1.4 MB" detail
 * line. Clicking opens the file in a new tab once its URL is known.
 */

import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { SvgIconComponent } from "@mui/icons-material";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import SlideshowOutlinedIcon from "@mui/icons-material/SlideshowOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import {
  chatAttachmentDetail,
  describeChatAttachment,
  type MessageDocumentContent
} from "@nodetool-ai/protocol";

import {
  BORDER_RADIUS,
  Caption,
  FlexColumn,
  FlexRow,
  GAP,
  ICON_SIZE,
  MOTION,
  SPACING,
  TruncatedText,
  focusRing,
  reducedMotion
} from "../../ui_primitives";
import { useResolvedMediaUri } from "../../../hooks/useResolvedMediaUri";

const ICON_TILE_SIZE = 36;
const CARD_MAX_WIDTH = 320;

type IconTone = "error" | "info" | "success" | "warning" | "neutral";

const TYPE_VISUALS: Record<string, { Icon: SvgIconComponent; tone: IconTone }> = {
  PDF: { Icon: PictureAsPdfOutlinedIcon, tone: "error" },
  DOC: { Icon: DescriptionOutlinedIcon, tone: "info" },
  DOCX: { Icon: DescriptionOutlinedIcon, tone: "info" },
  PAGES: { Icon: DescriptionOutlinedIcon, tone: "info" },
  RTF: { Icon: DescriptionOutlinedIcon, tone: "info" },
  TXT: { Icon: DescriptionOutlinedIcon, tone: "neutral" },
  MD: { Icon: DescriptionOutlinedIcon, tone: "neutral" },
  XLS: { Icon: TableChartOutlinedIcon, tone: "success" },
  XLSX: { Icon: TableChartOutlinedIcon, tone: "success" },
  CSV: { Icon: TableChartOutlinedIcon, tone: "success" },
  NUMBERS: { Icon: TableChartOutlinedIcon, tone: "success" },
  PPT: { Icon: SlideshowOutlinedIcon, tone: "warning" },
  PPTX: { Icon: SlideshowOutlinedIcon, tone: "warning" },
  KEY: { Icon: SlideshowOutlinedIcon, tone: "warning" }
};

const FALLBACK_VISUAL = { Icon: InsertDriveFileOutlinedIcon, tone: "neutral" as const };

/**
 * A browser refuses to navigate a new tab to a `data:` URL, so an inline file
 * opens through a blob URL. The blob is released once the tab has had time to
 * load it.
 */
const BLOB_URL_LIFETIME_MS = 60_000;

const openInNewTab = (url: string): void => {
  if (!url.startsWith("data:")) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  const comma = url.indexOf(",");
  const header = url.slice(5, comma);
  const mime = header.split(";")[0] || "application/octet-stream";
  const payload = url.slice(comma + 1);
  const bytes = header.includes(";base64")
    ? Uint8Array.from(atob(payload), (char) => char.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  window.open(blobUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), BLOB_URL_LIFETIME_MS);
};

interface MessageDocumentAttachmentProps {
  document: MessageDocumentContent["document"];
}

export const MessageDocumentAttachment: React.FC<MessageDocumentAttachmentProps> = ({
  document
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const cardStyles = useMemo(
    () =>
      css({
        appearance: "none",
        font: "inherit",
        color: theme.vars.palette.text.primary,
        textAlign: "left",
        width: "100%",
        maxWidth: CARD_MAX_WIDTH,
        padding: theme.spacing(SPACING.sm),
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: theme.vars.palette.background.paper,
        cursor: "pointer",
        transition: `${MOTION.border}, ${MOTION.background}`,
        ...reducedMotion({ transition: MOTION.none }),
        "&:hover:not(:disabled)": {
          borderColor: theme.vars.palette.text.disabled,
          backgroundColor: theme.vars.palette.action.hover
        },
        "&:disabled": { cursor: "default" },
        "&:focus-visible": focusRing(theme, 2)
      }),
    [theme]
  );
  const url = useResolvedMediaUri(document);
  const info = useMemo(() => describeChatAttachment(document), [document]);
  const name = info.name || t("i18n-next54.message.document");
  const detail = chatAttachmentDetail(info);
  const { Icon, tone } = TYPE_VISUALS[info.typeLabel] ?? FALLBACK_VISUAL;

  const handleOpen = useCallback(() => {
    if (url) {
      openInNewTab(url);
    }
  }, [url]);

  return (
    <button
      type="button"
      disabled={!url}
      onClick={handleOpen}
      title={name}
      data-testid="message-document-attachment"
      css={cardStyles}
    >
      <FlexRow gap={GAP.comfortable} align="center" sx={{ minWidth: 0 }}>
        <FlexRow
          align="center"
          justify="center"
          aria-hidden
          sx={(theme) => ({
            flexShrink: 0,
            width: ICON_TILE_SIZE,
            height: ICON_TILE_SIZE,
            borderRadius: BORDER_RADIUS.md,
            color:
              tone === "neutral"
                ? theme.vars.palette.text.secondary
                : theme.vars.palette[tone].main,
            backgroundColor:
              tone === "neutral"
                ? theme.vars.palette.action.hover
                : `rgb(${theme.vars.palette[tone].mainChannel} / 0.12)`
          })}
        >
          <Icon sx={{ fontSize: ICON_SIZE.lg }} />
        </FlexRow>
        <FlexColumn gap={GAP.micro} sx={{ minWidth: 0, flex: 1 }}>
          <TruncatedText variant="body2">{name}</TruncatedText>
          {detail ? <Caption color="muted">{detail}</Caption> : null}
        </FlexColumn>
      </FlexRow>
    </button>
  );
};

MessageDocumentAttachment.displayName = "MessageDocumentAttachment";
