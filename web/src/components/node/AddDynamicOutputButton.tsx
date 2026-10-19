import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DynamicInputButton } from "../ui_primitives";
import useMetadataStore from "../../stores/MetadataStore";
import { useDynamicOutput } from "../../hooks/nodes/useDynamicOutput";
import { TypeMetadata } from "../../stores/ApiTypes";
import AddDynamicOutputDialog from "./AddDynamicOutputDialog";

interface AddDynamicOutputButtonProps {
  id: string;
  nodeType: string;
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
  nodeType,
  dynamicOutputs
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { handleAddOutput } = useDynamicOutput(id, dynamicOutputs);
  const staticOutputs = useMetadataStore(
    (state) => state.metadata[nodeType]?.outputs
  );
  const takenNames = useMemo(
    () => [
      ...(staticOutputs ?? []).map((output) => output.name),
      ...Object.keys(dynamicOutputs)
    ],
    [staticOutputs, dynamicOutputs]
  );

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <DynamicInputButton label={t("screen_nodes.addOutput")} onAdd={handleOpen} />
      <AddDynamicOutputDialog
        open={open}
        onClose={handleClose}
        onAdd={handleAddOutput}
        takenNames={takenNames}
      />
    </>
  );
};

export default memo(AddDynamicOutputButton);
