import { useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import { trpc } from "../../trpc/client";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  SelectField,
  SPACING
} from "../ui_primitives";
import type { ProjectDocument } from "./projectStatus";

/**
 * A document the copy route covers. Workflows and text files are listed but
 * not copied.
 */
type CopyableDocument = ProjectDocument & {
  type: Exclude<ProjectDocument["type"], "workflow" | "text">;
};

export const isCopyableDocument = (
  document: ProjectDocument
): document is CopyableDocument =>
  document.type !== "workflow" && document.type !== "text";

interface CopyProjectDocumentActionProps {
  readonly document: CopyableDocument;
  readonly sourceProjectId: string;
}

const CopyProjectDocumentAction = ({
  document,
  sourceProjectId
}: CopyProjectDocumentActionProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [destinationProjectId, setDestinationProjectId] = useState("");
  const { data: projects = [] } = trpc.projects.list.useQuery(
    {},
    { staleTime: 30_000 }
  );
  const utils = trpc.useUtils();
  const addNotification = useNotificationStore((state) => state.addNotification);
  // A project summary carries server-derived status, spend, and thumbnails;
  // the copy response intentionally does not invent them, so an optimistic
  // card would be incomplete. Refetching supplies the authoritative summary.
  const copy = trpc.projects.copyDocument.useMutation({
    onSuccess: () => {
      setOpen(false);
      void utils.projects.get.invalidate();
      void utils.projects.documentPage.invalidate();
      void utils.projects.summaries.invalidate();
    },
    onError: (error) => {
      addNotification({ type: "error", alert: true, content: error.message });
    }
  });
  const destinations = projects.filter((project) => project.id !== sourceProjectId);
  const showDialog = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setDestinationProjectId(destinations[0]?.id ?? "");
    setOpen(true);
  };
  const closeDialog = () => {
    if (!copy.isPending) setOpen(false);
  };
  const confirmCopy = () => {
    if (!destinationProjectId) return;
    copy.mutate({
      type: document.type,
      ref: document.ref,
      destinationProjectId
    });
  };

  return (
    <>
      <EditorButton
        variant="text"
        density="compact"
        onClick={showDialog}
        aria-label={t("pass3_32.projects.copyDocument.actionLabel", { name: document.name })}
      >
        {t("pass3_32.projects.copyDocument.action")}
      </EditorButton>
      <Dialog
        open={open}
        onClose={closeDialog}
        title={t("pass3_32.projects.copyDocument.title", { name: document.name })}
        onConfirm={confirmCopy}
        confirmText={t("pass3_32.projects.copyDocument.confirm")}
        confirmDisabled={!destinationProjectId}
        cancelDisabled={copy.isPending}
        isLoading={copy.isPending}
      >
        <FlexColumn gap={SPACING.lg}>
          <Caption color="secondary">
            {t("pass3_32.projects.copyDocument.description")}
          </Caption>
          <SelectField
            label={t("pass3_32.projects.copyDocument.destinationProject")}
            value={destinationProjectId}
            onChange={setDestinationProjectId}
            options={destinations.map((project) => ({
              value: project.id,
              label: project.name
            }))}
            disabled={destinations.length === 0 || copy.isPending}
          />
        </FlexColumn>
      </Dialog>
    </>
  );
};

export default CopyProjectDocumentAction;
