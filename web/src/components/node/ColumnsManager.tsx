import { Grid, TextField, Select, MenuItem, InputLabel } from '@mui/material'
import { ColumnDef } from '../../stores/ApiTypes';

interface ColumnsManagerProps {
  columns: ColumnDef[];
  onChange: (columns: ColumnDef[]) => void;
}

const ColumnsManager = ({ columns, onChange }: ColumnsManagerProps) => {
  const handleNameChange = (index: number, value: string) => {
    onChange(columns.map((col, i) => (i === index ? { ...col, name: value } : col)));
  };

  const handleDataTypeChange = (index: number, value: string) => {
    if (value === "int" || value === "float" || value === "object") {
      onChange(columns.map((col, i) => (i === index ? { ...col, data_type: value } : col)));
    }
  };

  return (
    <Grid container spacing={0}>
      {columns.map((field, index) => (
        <>
          <Grid item xs={6} key={index}>
            <InputLabel id={`${field}-${index}-name`}>Column Name</InputLabel>
            <TextField
              margin="dense"
              value={field.name}
              onChange={(e) => handleNameChange(index, e.target.value)}
            />
          </Grid>
          <Grid item xs={6}>
            <InputLabel id={`${field}-${index}-type`}>Data Type</InputLabel>
            <Select
              labelId={`${field}-${index}-type`}
              value={field.data_type}
              onChange={(e) => handleDataTypeChange(index, e.target.value)}
            >
              <MenuItem value="object">object</MenuItem>
              <MenuItem value="float">float</MenuItem>
              <MenuItem value="int">int</MenuItem>
            </Select>
          </Grid>
        </>
      ))}
    </Grid>
  );
};

export default ColumnsManager;