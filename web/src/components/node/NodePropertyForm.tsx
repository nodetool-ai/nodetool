/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { FlexRow, EditorButton, Dialog, TextInput } from "../ui_primitives";
import Add from "@mui/icons-material/AddOutlined";
import { useState, useCallback, memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      setInputNameError(
        validation.error === "Name cannot be empty"
          ? t("i18n-next39.nodeEditor.propertyForm.nameCannotBeEmpty")
          : t("i18n-next39.nodeEditor.propertyForm.nameCannotStartWithNumber")
      );
      return;
    }

    onAddProperty(name);
    setNewInputName("");
    setInputNameError(undefined);
    setShowInputDialog(false);
  }, [newInputName, onAddProperty, t]);

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
            {t("i18n-next39.nodeEditor.propertyForm.addInput")}
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
              {t("i18n-next39.nodeEditor.propertyForm.addOutput")}
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
        title={t("i18n-next39.nodeEditor.propertyForm.addInput")}
        onConfirm={handleAddInputProperty}
        confirmText={t("i18n-next39.nodeEditor.propertyForm.addInput")}
      >
        <TextInput
          autoFocus
          label={t("i18n-next39.nodeEditor.propertyForm.name")}
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
          helperText={t("i18n-next39.nodeEditor.propertyForm.nameCannotStartWithNumberShort")}
        />
      </Dialog>
    </div>
  );
};

export default memo(NodePropertyForm, isEqual);
