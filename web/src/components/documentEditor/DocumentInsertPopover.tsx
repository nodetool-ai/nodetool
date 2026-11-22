/**
 * The small form that asks for a link address, or an image path and its
 * description. It opens over the selection; Enter applies, Escape closes.
 */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  PADDING,
  Popover,
  TextInput
} from "../ui_primitives";

export type DocumentInsertKind = "link" | "image";

export interface DocumentInsertRequest {
  kind: DocumentInsertKind;
  /** Screen position to open at, the selection's lower left corner. */
  top: number;
  left: number;
  /** The link the selection already has, to edit it. */
  initialUrl?: string;
}

interface DocumentInsertPopoverProps {
  request: DocumentInsertRequest | null;
  onClose: () => void;
  onLink: (url: string) => void;
  onImage: (src: string, alt: string) => void;
}

const InsertForm = ({
  request,
  onClose,
  onLink,
  onImage
}: DocumentInsertPopoverProps & { request: DocumentInsertRequest }) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState(request.initialUrl ?? "");
  const [alt, setAlt] = useState("");
  const isLink = request.kind === "link";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isLink) {
      onLink(url);
    } else {
      onImage(url, alt);
    }
    onClose();
  };

  return (
    <form onSubmit={submit}>
      <FlexColumn gap={GAP.normal} sx={{ p: PADDING.comfortable, width: "20rem" }}>
        <TextInput
          autoFocus
          compact
          label={
            isLink
              ? t("documentEditor.insert.linkAddress")
              : t("documentEditor.insert.imagePath")
          }
          placeholder={
            isLink
              ? "https://"
              : t("documentEditor.insert.imagePathPlaceholder")
          }
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        {!isLink && (
          <TextInput
            compact
            label={t("documentEditor.insert.imageAlt")}
            value={alt}
            onChange={(event) => setAlt(event.target.value)}
          />
        )}
        <FlexRow gap={GAP.tight} sx={{ justifyContent: "flex-end" }}>
          {isLink && request.initialUrl && (
            <EditorButton
              variant="text"
              onClick={() => {
                onLink("");
                onClose();
              }}
            >
              {t("documentEditor.insert.removeLink")}
            </EditorButton>
          )}
          <EditorButton variant="text" onClick={onClose}>
            {t("common.cancel")}
          </EditorButton>
          <EditorButton type="submit" variant="contained" disabled={url.trim() === ""}>
            {isLink
              ? t("documentEditor.insert.applyLink")
              : t("documentEditor.insert.insertImage")}
          </EditorButton>
        </FlexRow>
      </FlexColumn>
    </form>
  );
};

const DocumentInsertPopover = (props: DocumentInsertPopoverProps) => {
  const { request, onClose } = props;
  return (
    <Popover
      open={request !== null}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={request ? { top: request.top, left: request.left } : undefined}
    >
      {request && <InsertForm {...props} request={request} />}
    </Popover>
  );
};

export default DocumentInsertPopover;
