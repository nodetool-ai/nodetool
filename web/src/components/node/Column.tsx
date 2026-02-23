import { ColumnDef } from "../../stores/ApiTypes";
import isEqual from "lodash/isEqual";
import { memo } from "react";
import { NodeTextField, NodeSelect, NodeMenuItem, DeleteButton } from "../ui_primitives";

interface ColumnProps {
  index: number;
  field: ColumnDef;
  inputRef: (el: HTMLInputElement | null) => void;
  handleNameChange: (index: number, name: string) => void;
  handleDataTypeChange: (index: number, type: string) => void;
  handleDescriptionChange: (index: number, description: string) => void;
  onDelete: () => void;
  validDataTypes: string[];
  showDescription?: boolean;
}

const Column: React.FC<ColumnProps> = ({
  index,
  field,
  inputRef,
  handleNameChange,
  handleDataTypeChange,
  handleDescriptionChange,
  onDelete,
  validDataTypes,
  showDescription = false
}: ColumnProps) => (
  <div className="column" key={index}>
    <div className="item-name">
      <NodeTextField
        inputRef={inputRef}
        className="textfield"
        margin="dense"
        value={field.name}
        onChange={(e) => handleNameChange(index, e.target.value)}
      />
    </div>
    {showDescription && (
      <div className="item-description">
        <NodeTextField
          className="textfield"
          margin="dense"
          value={field.description}
          onChange={(e) => handleDescriptionChange(index, e.target.value)}
        />
      </div>
    )}

    <div className="item-datatype">
      <NodeSelect
        labelId={`${field}-${index}-type`}
        value={field.data_type}
        onChange={(e) => handleDataTypeChange(index, e.target.value as string)}
        className="mui-select"
        MenuProps={{
          anchorOrigin: {
            vertical: "bottom",
            horizontal: "left"
          },
          transformOrigin: {
            vertical: "top",
            horizontal: "left"
          }
        }}
      >
        {validDataTypes.map((type) => (
          <NodeMenuItem key={type} value={type}>
            {type}
          </NodeMenuItem>
        ))}
      </NodeSelect>
    </div>
    <DeleteButton
      onClick={onDelete}
      buttonSize="small"
      tooltip="Delete column"
      className="delete-button"
      tabIndex={-1}
    />
  </div>
);

export default memo(Column, isEqual);
