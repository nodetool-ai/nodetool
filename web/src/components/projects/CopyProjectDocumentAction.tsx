import { useCallback, useState } from "react";

import {
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  SelectField,
  SPACING
} from "../ui_primitives";
import { trpc } from "../../trpc/client";
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
  const copy = trpc.projects.copyDocument.useMutation({
    onSuccess: () => {
      setOpen(false);
      void utils.projects.get.invalidate();
      void utils.projects.summaries.invalidate();
    }
  });
  const destinations = projects.filter((project) => project.id !== sourceProjectId);

  const showDialog = useCallback(() => {
    setDestinationProjectId(destinations[0]?.id ?? "");
    setOpen(true);
  }, [destinations]);
  const closeDialog = useCallback(() => {
    if (!copy.isPending) setOpen(false);
  }, [copy.isPending]);
  const confirmCopy = useCallback(() => {
    if (!destinationProjectId) return;
    copy.mutate({
      type: document.type,
      ref: document.ref,
      destinationProjectId
    });
  }, [copy, destinationProjectId, document.ref, document.type]);

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
          {copy.error && <Caption color="error">{copy.error.message}</Caption>}
        </FlexColumn>
      </Dialog>
    </>
  );
};

export default CopyProjectDocumentAction;
