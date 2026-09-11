import { useState } from "react";

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

interface CopyProjectDocumentActionProps {
  readonly document: ProjectDocument;
  readonly sourceProjectId: string;
}

const CopyProjectDocumentAction = ({
  document,
  sourceProjectId
}: CopyProjectDocumentActionProps) => {
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
      void utils.projects.summaries.invalidate();
    },
    onError: (error) => {
      addNotification({ type: "error", alert: true, content: error.message });
    }
  });
  const destinations = projects.filter((project) => project.id !== sourceProjectId);
  const showDialog = () => {
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
        aria-label={`Copy ${document.name} to another project`}
      >
        Copy
      </EditorButton>
      <Dialog
        open={open}
        onClose={closeDialog}
        title={`Copy ${document.name}`}
        onConfirm={confirmCopy}
        confirmText="Copy"
        cancelText="Cancel"
        confirmDisabled={!destinationProjectId}
        isLoading={copy.isPending}
      >
        <FlexColumn gap={SPACING.lg}>
          <Caption color="secondary">
            Referenced assets, entities, and supported documents are copied into
            the destination. The source remains unchanged.
          </Caption>
          <SelectField
            label="Destination project"
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
