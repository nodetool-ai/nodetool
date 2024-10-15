import { Select, MenuItem, TextField, Button } from "@mui/material";
import { ColumnDef } from "../../stores/ApiTypes";
import CloseIcon from "@mui/icons-material/Close";
import { isEqual } from "lodash";
import { memo } from "react";

interface ColumnProps {
  index: number;
  field: ColumnDef;
  inputRef: (el: HTMLInputElement | null) => void;
  handleNameChange: (index: number, newName: string) => void;
  handleDataTypeChange: (index: number, newType: string) => void;
  handleDescriptionChange: (index: number, newDescription: string) => void;
  removeColumn: (index: number) => void;
  validDataTypes: string[];
}

const Column: React.FC<ColumnProps> = ({
  index,
  field,
  inputRef,
  handleNameChange,
  handleDataTypeChange,
  handleDescriptionChange,
  removeColumn,
  validDataTypes
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
    <div className="item-description">
      <TextField
        className="textfield"
        margin="dense"
        value={field.description}
        onChange={(e) => handleDescriptionChange(index, e.target.value)}
      />
    </div>

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

      <Button className="delete" onClick={() => removeColumn(index)}>
        <CloseIcon />
      </Button>
    </div>
  </div>
);

export default memo(Column, isEqual);
