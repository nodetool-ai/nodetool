import React, { memo, useCallback, useState } from "react";
import { DynamicInputButton } from "../ui_primitives";
import { useDynamicOutput } from "../../hooks/nodes/useDynamicOutput";
import { TypeMetadata } from "../../stores/ApiTypes";
import AddDynamicOutputDialog from "./AddDynamicOutputDialog";

interface AddDynamicOutputButtonProps {
  id: string;
  dynamicOutputs: Record<string, TypeMetadata>;
}

/**
 * Footer affordance for adding a dynamic output to content-card nodes (Agent,
 * Extractor, Structured Output Generator, …). The generic node body surfaces
 * "Add output" via NodePropertyForm; content-card nodes route through
 * ContentCardBody, which renders this instead. Both share
 * AddDynamicOutputDialog and the useDynamicOutput store flow.
 */
const AddDynamicOutputButton: React.FC<AddDynamicOutputButtonProps> = ({
  id,
  dynamicOutputs
}) => {
  const [open, setOpen] = useState(false);
  const { handleAddOutput } = useDynamicOutput(id, dynamicOutputs);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <DynamicInputButton label="Add output" onAdd={handleOpen} />
      <AddDynamicOutputDialog
        open={open}
        onClose={handleClose}
        onAdd={handleAddOutput}
      />
    </>
  );
};

export default memo(AddDynamicOutputButton);
