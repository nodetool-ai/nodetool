import { Select, MenuItem, TextField, IconButton } from "@mui/material";
import { ColumnDef } from "../../stores/ApiTypes";
import CloseIcon from "@mui/icons-material/Close";
import { isEqual } from "lodash";
import { memo } from "react";

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
      <TextField
        inputRef={inputRef}
        className="textfield"
        margin="dense"
        value={field.name}
        onChange={(e) => handleNameChange(index, e.target.value)}
      />
    </div>
    {showDescription && (
      <div className="item-description">
        <TextField
          className="textfield"
          margin="dense"
          value={field.description}
          onChange={(e) => handleDescriptionChange(index, e.target.value)}
        />
      </div>
    )}

    <div className="item-datatype">
      <Select
        labelId={`${field}-${index}-type`}
        value={field.data_type}
        onChange={(e) => handleDataTypeChange(index, e.target.value)}
        variant="standard"
        className="mui-select nodrag"
        disableUnderline={true}
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
          <MenuItem key={type} value={type}>
            {type}
          </MenuItem>
        ))}
      </Select>
    </div>
    <IconButton className="delete-button" onClick={onDelete} size="small">
      <CloseIcon fontSize="small" />
    </IconButton>
  </div>
);

export default memo(Column, isEqual);
