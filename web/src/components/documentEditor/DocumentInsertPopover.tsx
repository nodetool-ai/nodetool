/**
 * The small form that asks for a link address. It opens over the selection;
 * Enter applies, Escape closes. Media goes through `DocumentEmbedDialog`.
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

export type DocumentInsertKind = "link";

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
}

const InsertForm = ({
  request,
  onClose,
  onLink
}: DocumentInsertPopoverProps & { request: DocumentInsertRequest }) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState(request.initialUrl ?? "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onLink(url);
    onClose();
  };

  return (
    <form onSubmit={submit}>
      <FlexColumn gap={GAP.normal} sx={{ p: PADDING.comfortable, width: "20rem" }}>
        <TextInput
          autoFocus
          compact
          label={t("documentEditor.insert.linkAddress")}
          placeholder="https://"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <FlexRow gap={GAP.tight} sx={{ justifyContent: "flex-end" }}>
          {request.initialUrl && (
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
            {t("documentEditor.insert.applyLink")}
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
