/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { FlexRow, EditorButton, Dialog, TextInput } from "../ui_primitives";
import Add from "@mui/icons-material/AddOutlined";
import { useState, useCallback, memo, useMemo } from "react";
import isEqual from "../../utils/isEqual";
import useMetadataStore from "../../stores/MetadataStore";
import { useDynamicOutput } from "../../hooks/nodes/useDynamicOutput";
import { TypeMetadata } from "../../stores/ApiTypes";
import { validateIdentifierName } from "../../utils/identifierValidation";
import AddDynamicOutputDialog from "./AddDynamicOutputDialog";

interface NodePropertyFormProps {
  id: string;
  isDynamic: boolean;
  supportsDynamicOutputs: boolean;
  dynamicOutputs: Record<string, TypeMetadata>;
  onAddProperty: (propertyName: string) => void;
  nodeType?: string;
}

const NodePropertyForm: React.FC<NodePropertyFormProps> = ({
  id,
  isDynamic,
  supportsDynamicOutputs,
  dynamicOutputs,
  onAddProperty,
  nodeType
}) => {
  const { handleAddOutput } = useDynamicOutput(id, dynamicOutputs);
  const staticOutputs = useMetadataStore((state) =>
    nodeType ? state.metadata[nodeType]?.outputs : undefined
  );
  const takenOutputNames = useMemo(
    () => [
      ...(staticOutputs ?? []).map((output) => output.name),
      ...Object.keys(dynamicOutputs)
    ],
    [staticOutputs, dynamicOutputs]
  );
  const [showOutputDialog, setShowOutputDialog] = useState(false);
  const [showInputDialog, setShowInputDialog] = useState(false);
  const [newInputName, setNewInputName] = useState("");
  const [inputNameError, setInputNameError] = useState<string | undefined>();

  const handleShowInputDialog = useCallback(() => {
    setShowInputDialog(true);
  }, []);

  const handleHideInputDialog = useCallback(() => {
    setShowInputDialog(false);
  }, []);

  const handleShowOutputDialog = useCallback(() => {
    setShowOutputDialog(true);
  }, []);

  const handleHideOutputDialog = useCallback(() => {
    setShowOutputDialog(false);
  }, []);

  const handleAddInputProperty = useCallback(() => {
    const name = newInputName.trim();
    const validation = validateIdentifierName(name);

    if (!validation.isValid) {
      setInputNameError(validation.error);
      return;
    }

    onAddProperty(name);
    setNewInputName("");
    setInputNameError(undefined);
    setShowInputDialog(false);
  }, [newInputName, onAddProperty]);

  return (
    <div
      className="node-property-form"
      css={css({
        width: "100%",
        position: "relative"
      })}
    >
      {isDynamic && (
        <FlexRow
          align="center"
          gap={1}
          justify="flex-start"
          fullWidth
          css={css({
            position: "relative"
          })}
        >
          <EditorButton
            density="normal"
            startIcon={<Add />}
            onClick={handleShowInputDialog}
          >
            Add input
          </EditorButton>
        </FlexRow>
      )}

      {supportsDynamicOutputs && (
        <>
          <FlexRow
            align="center"
            gap={1}
            justify="flex-end"
            fullWidth
            css={css({
              position: "relative",
              right: 0,
              top: 0
            })}
          >
            <EditorButton
              density="normal"
              startIcon={<Add />}
              onClick={handleShowOutputDialog}
            >
              Add output
            </EditorButton>
          </FlexRow>

          <AddDynamicOutputDialog
            open={showOutputDialog}
            onClose={handleHideOutputDialog}
            onAdd={handleAddOutput}
            takenNames={takenOutputNames}
          />
        </>
      )}

      <Dialog
        open={showInputDialog}
        onClose={handleHideInputDialog}
        maxWidth="xs"
        fullWidth
        title="Add input"
        onConfirm={handleAddInputProperty}
        confirmText="Add input"
      >
        <TextInput
          autoFocus
          label="Name"
          size="small"
          value={newInputName}
          onChange={(e) => {
            setNewInputName(e.target.value);
            if (inputNameError) {
              setInputNameError(undefined);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddInputProperty();
            }
          }}
          errorMessage={inputNameError}
          helperText="Cannot start with a number"
        />
      </Dialog>
    </div>
  );
};

export default memo(NodePropertyForm, isEqual);
