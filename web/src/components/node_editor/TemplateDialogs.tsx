import React from "react";
import { useTemplateDialogStore } from "../../stores/TemplateDialogStore";
import SaveTemplateDialog from "../dialogs/SaveTemplateDialog";
import ApplyTemplateDialog from "../dialogs/ApplyTemplateDialog";

export const TemplateDialogs: React.FC = () => {
  const { saveDialogOpen, applyDialogOpen, closeSaveDialog, closeApplyDialog } = useTemplateDialogStore();

  return (
    <>
      <SaveTemplateDialog
        open={saveDialogOpen}
        onClose={closeSaveDialog}
      />
      <ApplyTemplateDialog
        open={applyDialogOpen}
        onClose={closeApplyDialog}
      />
    </>
  );
};

export default TemplateDialogs;
